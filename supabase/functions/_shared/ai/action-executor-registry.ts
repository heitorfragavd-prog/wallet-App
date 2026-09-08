import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { AiExecutionContext } from "./auth.ts";
import { ActionGatewayError } from "./action-gateway.ts";

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
 * Cria o ActionExecutorRegistry padrão canônico.
 * 
 * CHECKPOINT 9.4A.1 AUDIT & DECISION:
 * Em produção, 0 executores de banco permanecem ativos por padrão.
 * Como 'public.metas' não possui 'workspace_id', ativar executores diretos
 * permitiria que um usuário em múltiplos workspaces alterasse metas de outro contexto.
 * Portanto, para garantir risco ZERO de mutação cross-workspace ('NÃO deixar executor LOW ativo se houver risco cross-workspace'),
 * todos os 9 Action Types operam em modo PROPOSAL-ONLY até evolução do schema de metas.
 */
export function createDefaultActionExecutorRegistry(options?: {
  enableUserScopedMetaExecutors?: boolean;
}): ActionExecutorRegistry {
  const registry = new ActionExecutorRegistry();

  if (options?.enableUserScopedMetaExecutors) {
    registerMetaActionHandlers(registry);
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
