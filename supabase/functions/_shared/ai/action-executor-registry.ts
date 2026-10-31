import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { AiExecutionContext } from "./auth.ts";
import { ActionGatewayError } from "./action-gateway.ts";
import {
  cleanDigits,
  validateLinhaDigitavel,
  validateCodigoBarras,
  normalizeDate,
} from "./boleto-validator.ts";

export type ActionExecutionHandler = (
  payload: Record<string, unknown>,
  context: AiExecutionContext,
  client: SupabaseClient,
) => Promise<{ recordId?: string; data?: unknown }>;

export class ActionExecutorRegistry {
  private handlers = new Map<string, ActionExecutionHandler>();

  register(actionType: string, handler: ActionExecutionHandler): void {
    this.handlers.set(actionType, handler);
  }

  has(actionType: string): boolean {
    return this.handlers.has(actionType);
  }

  get(actionType: string): ActionExecutionHandler | undefined {
    return this.handlers.get(actionType);
  }
}

/**
 * Registra manipuladores concretos para ações de metas.
 * 
 * NOTA ARQUITETURAL (CHECKPOINT 9.4A.1):
 * A tabela 'public.metas' possui apenas 'user_id' e NÃO possui coluna 'workspace_id'.
 * Portanto, o domínio de metas é puramente user-scoped no schema atual.
 * Se ativado, o executor opera no escopo da conta pessoal do usuário.
 */
export function registerMetaActionHandlers(registry: ActionExecutorRegistry): void {
  // ── LOW RISK: cadastrar_meta ──────────────────────────────────────────────
  registry.register("cadastrar_meta", async (payload, context, client) => {
    const titulo = String(payload.nome || payload.titulo || "").trim();
    const valorAlvo = Number(payload.valor_alvo);
    const valorAtual = Number(payload.valor_atual ?? 0);
    const dataLimite = String(payload.data_limite || "2026-12-31").trim();
    const tipo = String(payload.tipo || "economia").toLowerCase();
    const descricao = payload.descricao ? String(payload.descricao).trim() : null;

    if (!titulo || !Number.isFinite(valorAlvo) || valorAlvo <= 0) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Dados inválidos para cadastrar_meta: título e valor_alvo positivo são obrigatórios.",
      );
    }

    const { data, error } = await client
      .from("metas")
      .insert([
        {
          titulo,
          valor_alvo: valorAlvo,
          valor_atual: Number.isFinite(valorAtual) && valorAtual >= 0 ? valorAtual : 0,
          data_limite: dataLimite,
          tipo: ["economia", "receita", "despesa", "investimento"].includes(tipo) ? tipo : "economia",
          status: "ativa",
          descricao,
          user_id: context.userId,
        },
      ])
      .select("id")
      .single();

    if (error || !data) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao persistir meta no banco de dados: ${error?.message ?? "Falha na inserção"}`,
      );
    }

    return { recordId: data.id, data };
  });

  // ── LOW RISK: atualizar_meta ──────────────────────────────────────────────
  registry.register("atualizar_meta", async (payload, context, client) => {
    const metaId = String(payload.meta_id || "").trim();
    if (!metaId) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "meta_id obrigatório para atualização de meta.",
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.valor_atual !== undefined) {
      const vAtual = Number(payload.valor_atual);
      if (Number.isFinite(vAtual) && vAtual >= 0) {
        updates.valor_atual = vAtual;
      }
    }

    if (payload.status !== undefined) {
      const s = String(payload.status).toLowerCase();
      if (["ativa", "concluida", "pausada", "vencida"].includes(s)) {
        updates.status = s;
      }
    }

    if (payload.nome || payload.titulo) {
      updates.titulo = String(payload.nome || payload.titulo).trim();
    }

    const { data, error } = await client
      .from("metas")
      .update(updates)
      .eq("id", metaId)
      .eq("user_id", context.userId)
      .select("id")
      .single();

    if (error || !data) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao atualizar meta: ${error?.message ?? "Registro não encontrado ou não autorizado"}`,
      );
    }

    return { recordId: data.id, data };
  });
}

/**
 * Registra o manipulador de persistência para boletos validados após confirmação humana.
 * 
 * REGRAS DE SEGURANÇA E NEGÓCIO:
 * - workspace_id e user_id obtidos estritamente do contexto de execução autenticado server-side.
 * - Boleto é cadastrado estritamente com status: 'pendente' e valor_pago: 0 (NÃO pago, NÃO liquidado).
 * - Nenhuma despesa liquidada é gerada automaticamente.
 * - Validações numéricas e de formato obrigatórias.
 */
export function registerBoletoActionHandlers(registry: ActionExecutorRegistry): void {
  registry.register("cadastrar_divida_boleto", async (payload, context, client) => {
    if (!context.workspaceId || !context.userId) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "workspaceId e userId são obrigatórios no contexto de execução.",
      );
    }

    if (Boolean(payload.has_unresolved_material_divergence)) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Proposta de boleto contém divergência material não resolvida entre o documento e os dados digitáveis.",
      );
    }

    const valor = Number(payload.valor_total ?? payload.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Valor do boleto deve ser maior que zero.",
      );
    }

    const dataVencimento = String(payload.data_vencimento || "").trim();
    if (!dataVencimento) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Data de vencimento é obrigatória para cadastro de boleto.",
      );
    }

    const beneficiario = String(payload.beneficiario || payload.credor || "Beneficiário").trim();
    const descricao = String(payload.descricao || `Boleto ${beneficiario}`).trim();

    let finalLinha = payload.linha_digitavel ? String(payload.linha_digitavel).trim() : null;
    let finalCodigoBarras = payload.codigo_barras ? String(payload.codigo_barras).trim() : null;

    const valorPropostaCentavos = Math.round(valor * 100);

    if (finalLinha) {
      const validacaoLinha = validateLinhaDigitavel(finalLinha);
      if (validacaoLinha.valido && validacaoLinha.codigoBarrasDerivado) {
        // Verificação estrita de coerência entre proposta e linha digitável em CENTAVOS INTEIROS
        if (validacaoLinha.valorDerivado && validacaoLinha.valorDerivado > 0) {
          const valorLinhaCentavos = Math.round(validacaoLinha.valorDerivado * 100);
          if (valorPropostaCentavos !== valorLinhaCentavos) {
            throw new ActionGatewayError(
              "WALLET_AI_ACTION_INVALID",
              400,
              `Divergência de valor nominal: valor da proposta (R$ ${(valorPropostaCentavos / 100).toFixed(2)}) difere do valor da linha digitável (R$ ${(valorLinhaCentavos / 100).toFixed(2)}).`,
            );
          }
        }

        // Verificação estrita de vencimento derivado da linha (ISO YYYY-MM-DD)
        if (validacaoLinha.dataVencimentoDerivada) {
          const dataVencIso = normalizeDate(dataVencimento).iso || dataVencimento;
          if (dataVencIso !== validacaoLinha.dataVencimentoDerivada) {
            throw new ActionGatewayError(
              "WALLET_AI_ACTION_INVALID",
              400,
              `Divergência de vencimento: data da proposta (${dataVencimento}) difere do vencimento derivado da linha digitável (${validacaoLinha.dataVencimentoDerivada}).`,
            );
          }
        }

        const cbDerivado = validacaoLinha.codigoBarrasDerivado;
        if (!finalCodigoBarras || cleanDigits(finalCodigoBarras) !== cbDerivado) {
          const cbAtualClean = cleanDigits(finalCodigoBarras);
          const cbAtualValidacao = cbAtualClean ? validateCodigoBarras(cbAtualClean) : null;
          if (!cbAtualValidacao || !cbAtualValidacao.valido) {
            // OCR bruto com 48 dígitos, ruído ou checksum incorreto -> adotar canônico derivado de 44 dígitos
            finalCodigoBarras = cbDerivado;
          } else if (cbAtualClean !== cbDerivado) {
            // Código de barras fornecido é válido por si só mas contradiz a linha digitável válida
            throw new ActionGatewayError(
              "WALLET_AI_ACTION_INVALID",
              400,
              "Inconsistência irreconciliável: código de barras e linha digitável válidos apontam para documentos diferentes.",
            );
          }
        } else {
          finalCodigoBarras = cbDerivado;
        }
        finalLinha = finalLinha || validacaoLinha.linhaFormatada;
      } else {
        // Linha digitável informada é inválida
        if (finalCodigoBarras) {
          const cbClean = cleanDigits(finalCodigoBarras);
          const validacaoCb = validateCodigoBarras(cbClean);
          if (!validacaoCb.valido) {
            throw new ActionGatewayError(
              "WALLET_AI_ACTION_INVALID",
              400,
              `Linha digitável e código de barras inválidos: ${validacaoLinha.erros.join("; ")} | ${validacaoCb.erros.join("; ")}`,
            );
          }
          finalCodigoBarras = cbClean;
          finalLinha = null;
        } else {
          throw new ActionGatewayError(
            "WALLET_AI_ACTION_INVALID",
            400,
            `Linha digitável do boleto inválida: ${validacaoLinha.erros.join("; ")}`,
          );
        }
      }
    } else if (finalCodigoBarras) {
      const cbClean = cleanDigits(finalCodigoBarras);
      const validacaoCb = validateCodigoBarras(cbClean);
      if (!validacaoCb.valido) {
        throw new ActionGatewayError(
          "WALLET_AI_ACTION_INVALID",
          400,
          `Código de barras inválido: ${validacaoCb.erros.join(", ")}`,
        );
      }
      if (validacaoCb.valorDerivado && validacaoCb.valorDerivado > 0) {
        const cbValorCentavos = Math.round(validacaoCb.valorDerivado * 100);
        if (valorPropostaCentavos !== cbValorCentavos) {
          throw new ActionGatewayError(
            "WALLET_AI_ACTION_INVALID",
            400,
            `Divergência de valor nominal: valor da proposta (R$ ${(valorPropostaCentavos / 100).toFixed(2)}) difere do código de barras (R$ ${(cbValorCentavos / 100).toFixed(2)}).`,
          );
        }
      }
      // Verificação estrita de vencimento derivado do código de barras (ISO YYYY-MM-DD)
      if (validacaoCb.dataVencimentoDerivada) {
        const dataVencIso = normalizeDate(dataVencimento).iso || dataVencimento;
        if (dataVencIso !== validacaoCb.dataVencimentoDerivada) {
          throw new ActionGatewayError(
            "WALLET_AI_ACTION_INVALID",
            400,
            `Divergência de vencimento: data da proposta (${dataVencimento}) difere do vencimento derivado do código de barras (${validacaoCb.dataVencimentoDerivada}).`,
          );
        }
      }
      finalCodigoBarras = cbClean;
    }

    const insertRow = {
      user_id: context.userId,
      workspace_id: context.workspaceId,
      descricao,
      credor: beneficiario,
      documento_favorecido: payload.cnpj_cpf_beneficiario ? String(payload.cnpj_cpf_beneficiario).trim() : null,
      valor_total: valor,
      valor_pago: 0,
      valor_restante: valor,
      data_vencimento: dataVencimento,
      status: "pendente",
      metodo_pagamento_esperado: "boleto",
      linha_digitavel: finalLinha,
      codigo_barras: finalCodigoBarras,
      parcelas: 1,
      parcelas_pagas: 0,
      parcela_atual: 1,
      total_parcelas: 1,
    };

    const { data, error } = await client
      .from("dividas")
      .insert([insertRow])
      .select("id")
      .single();

    if (error || !data) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao persistir dívida de boleto no banco: ${error?.message ?? "Falha na inserção"}`,
      );
    }

    return { recordId: data.id, data };
  });
}

/**
 * Cria o ActionExecutorRegistry padrão canônico.
 * 
 * AUDITORIA DE SEGURANÇA & ROLLOUT:
 * - Metas: opera 100% Proposal-only por padrão por não ter workspace_id no schema legado.
 * - Boleto: executor ativo com isolamento multi-tenant garantido por workspace_id em public.dividas.
 */
export function createDefaultActionExecutorRegistry(options?: {
  enableUserScopedMetaExecutors?: boolean;
  disableBoletoExecutor?: boolean;
}): ActionExecutorRegistry {
  const registry = new ActionExecutorRegistry();

  if (options?.enableUserScopedMetaExecutors) {
    registerMetaActionHandlers(registry);
  }

  if (!options?.disableBoletoExecutor) {
    registerBoletoActionHandlers(registry);
  }

  return registry;
}

export class SupabaseActionDatabaseMutator {
  constructor(
    private readonly client: SupabaseClient,
    private readonly registry: ActionExecutorRegistry = createDefaultActionExecutorRegistry(),
  ) {}

  async executeMutation(
    actionType: string,
    payload: Record<string, unknown>,
    context: AiExecutionContext,
  ): Promise<{ success: boolean; recordId?: string; data?: unknown }> {
    // 1. Bloqueio incondicional de exclusão
    if (actionType === "deletar_transacao") {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_FORBIDDEN",
        403,
        "Operação de exclusão bloqueada por política de segurança de alto risco.",
      );
    }

    // 2. Localiza executor no registro
    const handler = this.registry.get(actionType);
    if (!handler) {
      // Se a ação for reconhecida no catálogo mas não possuir executor ativo (Proposal-only / Phase 2 e 3)
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_FORBIDDEN",
        403,
        `Ação "${actionType}" opera em modo Proposal-only nesta fase de rollout. Nenhuma mutação direta permitida.`,
      );
    }

    const result = await handler(payload, context, this.client);
    return {
      success: true,
      recordId: result.recordId,
      data: result.data,
    };
  }
}
