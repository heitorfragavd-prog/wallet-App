/**
 * Operations Agent — Canonical Agent Contract (Etapa 9.5B)
 * Fechamento de Caixa, Conferência Operacional, Reconciliação Eyemobile e Action Proposals.
 * 
 * Regra Arquitetural:
 * - READ: consultas determinísticas, reconciliação e detecção de furos/sobras
 * - WRITE: SEMPRE via Action Proposal (Action Gateway); NUNCA executa SQL direto
 */

import type { AiExecutionContext } from "./auth.ts";
import type { ActionProposal } from "./action-types.ts";
import { prepareActionProposal } from "./action-gateway.ts";
import type { AuditEventSink } from "./action-gateway.ts";
import {
  type CashClosingInput,
  type CashClosingResult,
  type EyemobileProductRecord,
  type EyemobileSalesQueryInput,
  type EyemobileSalesResult,
  type OperationalTransaction,
  type UpdateEyemobileCostInput,
  type PaymentMethod,
  OperationsError,
} from "./operations-types.ts";
import {
  reconcileCashClosing,
  normalizePaymentMethod,
  toCents,
  fromCents,
  roundToCents,
} from "./operations-core.ts";

export interface OperationsRepository {
  listOperationalSales(
    context: AiExecutionContext,
    date: string,
  ): Promise<OperationalTransaction[]>;

  listOperationalWithdrawals(
    context: AiExecutionContext,
    date: string,
  ): Promise<OperationalTransaction[]>;

  findEyemobileProduct(
    context: AiExecutionContext,
    criteria: { id?: string; produtoId?: string; codigoBarras?: string; nome?: string },
  ): Promise<EyemobileProductRecord | null>;

  getEyemobileConfig?(
    context: AiExecutionContext,
  ): Promise<{ hasConfig: boolean; storeId?: string } | null>;
}

export interface OperationsAgentDependencies {
  repository: OperationsRepository;
  auditSink?: AuditEventSink;
}

export class OperationsAgent {
  constructor(private readonly deps: OperationsAgentDependencies) {}

  private async logAudit(
    eventName: string,
    context: AiExecutionContext,
    durationMs: number,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.deps.auditSink) return;
    try {
      await this.deps.auditSink.logEvent({
        eventName,
        workspaceId: context.workspaceId,
        userId: context.userId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        details: {
          durationMs,
          ...extra,
        },
      } as Parameters<AuditEventSink["logEvent"]>[0]);
    } catch {
      // Falha no log de auditoria não aborta a operação analítica
    }
  }

  /**
   * READ / ANALYTICAL: Valida fechamento de caixa de forma 100% determinística.
   * Não executa nenhuma mutação no banco de dados.
   */
  public async validarFechamentoCaixa(
    input: CashClosingInput,
    context: AiExecutionContext,
  ): Promise<CashClosingResult> {
    const startTime = Date.now();
    const correlationId = input.correlationId || context.correlationId || `closing_${Date.now()}`;

    // Validação estrita de workspace (Fail-Closed)
    if (input.workspaceId && input.workspaceId !== context.workspaceId) {
      throw new OperationsError(
        "WALLET_AI_OPERATIONS_WORKSPACE_MISMATCH",
        `Workspace informado (${input.workspaceId}) diverge do contexto autenticado (${context.workspaceId}).`,
      );
    }

    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw new OperationsError(
        "WALLET_AI_OPERATIONS_INVALID_INPUT",
        `Data de fechamento inválida ou ausente: ${input.date}. Formato esperado: YYYY-MM-DD.`,
      );
    }

    await this.logAudit("closing_validation_started", context, 0, {
      date: input.date,
      shift: input.shift,
    });

    try {
      const [sales, withdrawals] = await Promise.all([
        this.deps.repository.listOperationalSales(context, input.date),
        this.deps.repository.listOperationalWithdrawals(context, input.date),
      ]);

      const result = reconcileCashClosing({
        workspaceId: context.workspaceId,
        userId: context.userId,
        date: input.date,
        shift: input.shift,
        sales,
        withdrawals,
        reportedByMethod: input.reportedByMethod,
        reportedTotal: input.reportedTotal,
        correlationId,
      });

      const durationMs = Date.now() - startTime;

      if (result.status !== "exato") {
        await this.logAudit("closing_divergence_detected", context, durationMs, {
          status: result.status,
          difference: result.difference,
        });
      }

      await this.logAudit("closing_validation_completed", context, durationMs, {
        status: result.status,
        expectedTotal: result.expectedTotal,
        reportedTotal: result.reportedTotal,
      });

      return result;
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.logAudit("operations_error", context, durationMs, {
        error: errMsg,
        operation: "validarFechamentoCaixa",
      });
      throw err;
    }
  }

  /**
   * READ: Consulta vendas operacionais do período (PDV Eyemobile e/ou banco local).
   * Não duplica contagem entre fontes.
   */
  public async consultarVendasOperacionais(
    input: EyemobileSalesQueryInput,
    context: AiExecutionContext,
  ): Promise<EyemobileSalesResult> {
    const startTime = Date.now();

    if (input.workspaceId && input.workspaceId !== context.workspaceId) {
      throw new OperationsError(
        "WALLET_AI_OPERATIONS_WORKSPACE_MISMATCH",
        `Workspace informado (${input.workspaceId}) diverge do contexto autenticado (${context.workspaceId}).`,
      );
    }

    await this.logAudit("operations_query_started", context, 0, {
      startDate: input.startDate,
      endDate: input.endDate,
    });

    try {
      const sales = await this.deps.repository.listOperationalSales(context, input.startDate);
      const period = {
        start: input.startDate,
        end: input.endDate || input.startDate,
      };

      const salesByMethod: Record<PaymentMethod, number> = {
        dinheiro: 0,
        debito: 0,
        credito: 0,
        pix: 0,
        voucher: 0,
        outros: 0,
      };

      let totalCents = 0;
      for (const s of sales) {
        const method = normalizePaymentMethod(s.paymentMethod);
        const cents = toCents(s.amount);
        salesByMethod[method] = fromCents(toCents(salesByMethod[method]) + cents);
        totalCents += cents;
      }

      const totalSales = fromCents(totalCents);
      const transactionsCount = sales.length;
      const averageTicket = transactionsCount > 0 ? fromCents(Math.round(totalCents / transactionsCount)) : 0;

      const durationMs = Date.now() - startTime;
      await this.logAudit("eyemobile_read_completed", context, durationMs, {
        totalSales,
        transactionsCount,
      });
      await this.logAudit("operations_query_completed", context, durationMs, {
        totalSales,
      });

      return {
        workspaceId: context.workspaceId,
        period,
        totalSales,
        transactionsCount,
        averageTicket,
        salesByMethod,
        source: sales.some((s) => s.source === "eyemobile") ? "eyemobile_api_realtime" : "banco_local",
        warnings: [],
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.logAudit("operations_error", context, durationMs, {
        error: errMsg,
        operation: "consultarVendasOperacionais",
      });
      throw err;
    }
  }

  /**
   * WRITE: Gera proposta de atualização de custo/estoque de produto Eyemobile.
   * NUNCA executa a mutação física diretamente; submete ao Action Gateway como Action Proposal
   * no modo proposal_only com risco MEDIUM e 0 executores físicos automáticos.
   */
  public async proporAtualizacaoCustoEyemobile(
    input: UpdateEyemobileCostInput,
    context: AiExecutionContext,
  ): Promise<ActionProposal> {
    const startTime = Date.now();

    // RBAC: viewer não tem permissão para submeter propostas de mutação operacional
    if (context.userRole === "viewer" || context.userRole === "leitor") {
      throw new OperationsError(
        "WALLET_AI_OPERATIONS_FORBIDDEN",
        "Usuários com perfil de apenas leitura não podem gerar propostas de alteração operacional.",
      );
    }

    if (input.novoCusto == null || isNaN(Number(input.novoCusto)) || Number(input.novoCusto) < 0) {
      throw new OperationsError(
        "WALLET_AI_OPERATIONS_INVALID_INPUT",
        "Novo custo inválido. Deve ser um número decimal não-negativo.",
      );
    }

    // Busca produto por critérios canônicos (ID, código de barras ou nome) no workspace
    const product = await this.deps.repository.findEyemobileProduct(context, {
      id: input.produtoId,
      produtoId: input.produtoId,
      codigoBarras: input.codigoBarras,
      nome: input.produtoNome,
    });

    if (!product) {
      throw new OperationsError(
        "WALLET_AI_OPERATIONS_DATA_UNAVAILABLE",
        `Produto não encontrado no cadastro do Eyemobile para o workspace ativo (${input.produtoNome || input.codigoBarras || input.produtoId}).`,
      );
    }

    const payload: Record<string, unknown> = {
      produto_id: product.produtoId || product.id,
      produto_uuid: product.id,
      produto_nome: product.nome,
      codigo_barras: product.codigoBarras,
      custo_anterior: product.custoAtual,
      novo_custo: roundToCents(Number(input.novoCusto)),
      quantidade_estoque: input.quantidadeEstoque != null ? Number(input.quantidadeEstoque) : product.estoqueAtual,
      motivo: input.motivo || "Atualização operacional via Wallet IA",
    };

    const summary = `Atualizar custo de "${product.nome}" de R$ ${product.custoAtual.toFixed(2)} para R$ ${Number(input.novoCusto).toFixed(2)}`;

    const proposal = prepareActionProposal({
      workspaceId: context.workspaceId,
      userId: context.userId,
      conversationId: context.conversationId,
      actionType: "atualizar_custo_produto_eyemobile",
      summary,
      payload,
      correlationId: context.correlationId,
    });

    const durationMs = Date.now() - startTime;
    await this.logAudit("operations_proposal_created", context, durationMs, {
      proposalId: proposal.id,
      actionType: proposal.actionType,
      riskLevel: proposal.riskLevel,
    });

    return proposal;
  }
}

/**
 * Cria repositório de operações utilizando cliente Supabase com isolamento de workspace.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSupabaseOperationsRepository(supabase: any): OperationsRepository {
  return {
    async listOperationalSales(context, date) {
      const { data, error } = await supabase
        .from("transacoes")
        .select("id, workspace_id, user_id, valor, tipo, data, metodo_pagamento, descricao, observacoes")
        .eq("workspace_id", context.workspaceId)
        .eq("tipo", "receita")
        .eq("data", date);

      if (error) {
        throw new OperationsError("WALLET_AI_OPERATIONS_DATA_UNAVAILABLE", `Erro ao listar vendas: ${error.message}`);
      }

      return (data || []).map((row: Record<string, unknown>) => ({
        id: String(row.id || ""),
        workspaceId: String(row.workspace_id || ""),
        userId: String(row.user_id || ""),
        date: String(row.data || ""),
        amount: Number(row.valor || 0),
        type: "receita" as const,
        paymentMethod: normalizePaymentMethod(String(row.metodo_pagamento || "")),
        description: String(row.descricao || ""),
        source: String(row.observacoes || "").includes("eyemobile") ? ("eyemobile" as const) : ("local" as const),
      }));
    },

    async listOperationalWithdrawals(context, date) {
      const { data, error } = await supabase
        .from("transacoes")
        .select("id, workspace_id, user_id, valor, tipo, data, metodo_pagamento, descricao, observacoes")
        .eq("workspace_id", context.workspaceId)
        .eq("tipo", "despesa")
        .eq("data", date);

      if (error) {
        throw new OperationsError("WALLET_AI_OPERATIONS_DATA_UNAVAILABLE", `Erro ao listar saídas: ${error.message}`);
      }

      // Filtra saídas operacionais e sangrias de caixa
      return (data || [])
        .filter((row: Record<string, unknown>) => {
          const desc = String(row.descricao || "").toLowerCase();
          const obs = String(row.observacoes || "").toLowerCase();
          const isCash = normalizePaymentMethod(String(row.metodo_pagamento || "")) === "dinheiro";
          const isSangria = desc.includes("sangria") || desc.includes("saque") || desc.includes("divipay") || obs.includes("sangria");
          return isCash || isSangria;
        })
        .map((row: Record<string, unknown>) => ({
          id: String(row.id || ""),
          workspaceId: String(row.workspace_id || ""),
          userId: String(row.user_id || ""),
          date: String(row.data || ""),
          amount: Number(row.valor || 0),
          type: "despesa" as const,
          paymentMethod: normalizePaymentMethod(String(row.metodo_pagamento || "")),
          description: String(row.descricao || ""),
          source: "local" as const,
        }));
    },

    async findEyemobileProduct(context, criteria) {
      // 1. Tenta buscar em eyemobile_produtos
      let q = supabase
        .from("eyemobile_produtos")
        .select("id, workspace_id, produto_id, nome, codigo_barras, custo, estoque")
        .eq("workspace_id", context.workspaceId);

      if (criteria.id) {
        q = q.eq("id", criteria.id);
      } else if (criteria.produtoId) {
        q = q.eq("produto_id", criteria.produtoId);
      } else if (criteria.codigoBarras) {
        q = q.eq("codigo_barras", criteria.codigoBarras);
      } else if (criteria.nome) {
        q = q.ilike("nome", `%${criteria.nome.trim()}%`).limit(1);
      }

      const { data: eyeData } = await q.maybeSingle();
      if (eyeData) {
        return {
          id: eyeData.id,
          workspaceId: eyeData.workspace_id,
          produtoId: eyeData.produto_id,
          codigoBarras: eyeData.codigo_barras,
          nome: eyeData.nome,
          custoAtual: Number(eyeData.custo || 0),
          estoqueAtual: Number(eyeData.estoque || 0),
        };
      }

      // 2. Fallback para produtos_eyemobile
      let q2 = supabase
        .from("produtos_eyemobile")
        .select("id, workspace_id, eyemobile_id, codigo, descricao, custo_atual, estoque_atual")
        .eq("workspace_id", context.workspaceId);

      if (criteria.id) {
        q2 = q2.eq("id", criteria.id);
      } else if (criteria.produtoId) {
        q2 = q2.eq("eyemobile_id", criteria.produtoId);
      } else if (criteria.codigoBarras) {
        q2 = q2.eq("codigo", criteria.codigoBarras);
      } else if (criteria.nome) {
        q2 = q2.ilike("descricao", `%${criteria.nome.trim()}%`).limit(1);
      }

      const { data: prodEyeData } = await q2.maybeSingle();
      if (prodEyeData) {
        return {
          id: prodEyeData.id,
          workspaceId: prodEyeData.workspace_id,
          produtoId: prodEyeData.eyemobile_id,
          codigoBarras: prodEyeData.codigo,
          nome: prodEyeData.descricao,
          custoAtual: Number(prodEyeData.custo_atual || 0),
          estoqueAtual: Number(prodEyeData.estoque_atual || 0),
        };
      }

      return null;
    },

    async getEyemobileConfig(context) {
      const { data } = await supabase
        .from("eyemobile_config")
        .select("store_id, access_key, secret_key")
        .eq("user_id", context.userId)
        .maybeSingle();

      return data ? { hasConfig: Boolean(data.access_key && data.secret_key), storeId: data.store_id } : null;
    },
  };
}
