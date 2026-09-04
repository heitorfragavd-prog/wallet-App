import {
  CANONICAL_ACTIONS,
  resolveActionType,
  type ActionProposal,
  type ActionRiskLevel,
  type PrepareActionInput,
} from "./action-types.ts";
import type { AiExecutionContext } from "./auth.ts";

export type ActionErrorCode =
  | "WALLET_AI_ACTION_INVALID"
  | "WALLET_AI_ACTION_NOT_FOUND"
  | "WALLET_AI_ACTION_FORBIDDEN"
  | "WALLET_AI_ACTION_EXPIRED"
  | "WALLET_AI_ACTION_ALREADY_PROCESSED"
  | "WALLET_AI_ACTION_EXECUTION_ERROR";

export class ActionGatewayError extends Error {
  constructor(
    public readonly code: ActionErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = "ActionGatewayError";
  }
}

function generateSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export function computeIdempotencyHash(
  workspaceId: string,
  actionType: string,
  payload: Record<string, unknown>,
): string {
  const serialized = JSON.stringify({
    workspaceId,
    actionType,
    payload,
  });
  return `idem_${generateSimpleHash(serialized)}`;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sanitiza o payload da proposta contra injeção e campos não permitidos.
 * Rejeita qualquer tentativa de sobrescrever user_id, workspace_id ou dados fora da whitelist.
 */
export function sanitizeActionPayload(
  actionType: string,
  rawPayload: Record<string, unknown>,
): Record<string, unknown> {
  const definition = CANONICAL_ACTIONS[actionType];
  if (!definition) {
    throw new ActionGatewayError(
      "WALLET_AI_ACTION_INVALID",
      400,
      `Tipo de ação não reconhecido ou não permitido: ${actionType}`,
    );
  }

  // Whitelist estrita de campos
  const sanitized: Record<string, unknown> = {};
  for (const field of definition.allowedFields) {
    if (rawPayload[field] !== undefined) {
      sanitized[field] = rawPayload[field];
    }
  }

  // Verifica campos obrigatórios
  for (const reqField of definition.requiredFields) {
    const val = sanitized[reqField];
    if (val === undefined || val === null || val === "") {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        `Campo obrigatório ausente no payload: ${reqField}`,
      );
    }
  }

  // Validação estrita de valores monetários
  const numericFields = ["valor", "valor_total", "valor_alvo", "valor_atual", "saldo", "valor_pago"];
  for (const numKey of numericFields) {
    if (sanitized[numKey] !== undefined) {
      const parsed = Number(sanitized[numKey]);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new ActionGatewayError(
          "WALLET_AI_ACTION_INVALID",
          400,
          `Valor numérico inválido para o campo ${numKey}: ${sanitized[numKey]}`,
        );
      }
      sanitized[numKey] = parsed;
    }
  }

  // Validação de datas
  const dateFields = ["data", "data_vencimento", "data_limite", "data_emissao"];
  for (const dateKey of dateFields) {
    if (sanitized[dateKey] !== undefined) {
      const dateStr = String(sanitized[dateKey]).trim();
      if (!ISO_DATE_PATTERN.test(dateStr)) {
        throw new ActionGatewayError(
          "WALLET_AI_ACTION_INVALID",
          400,
          `Data inválida para o campo ${dateKey}. Esperado formato YYYY-MM-DD: ${dateStr}`,
        );
      }
      sanitized[dateKey] = dateStr;
    }
  }

  return sanitized;
}

/**
 * Cria a proposta de ação em estado 'prepared' com classificação de risco server-side.
 * O modelo LLM nunca controla nem informa o riskLevel.
 */
export function prepareActionProposal<TPayload = Record<string, unknown>>(
  input: PrepareActionInput<TPayload>,
): ActionProposal<TPayload> {
  const canonicalType = resolveActionType(input.actionType);
  const definition = CANONICAL_ACTIONS[canonicalType];
  if (!definition) {
    throw new ActionGatewayError(
      "WALLET_AI_ACTION_NOT_FOUND",
      404,
      `Ação ou alias "${input.actionType}" não reconhecida no catálogo canônico de ações.`,
    );
  }
  const riskLevel: ActionRiskLevel = definition.riskLevel;

  const rawPayload = { ...(input.payload as Record<string, unknown>) };
  if (input.actionType === "cadastrar_despesa" || input.actionType === "atualizar_status_despesa") {
    rawPayload.tipo = "despesa";
  } else if (input.actionType === "cadastrar_receita" || input.actionType === "atualizar_status_receita") {
    rawPayload.tipo = "receita";
  }

  // Sanitiza o payload antes de criar a proposta
  const sanitizedPayload = sanitizeActionPayload(canonicalType, rawPayload) as TPayload;

  const ttlMs = (input.ttlMinutes ?? 30) * 60 * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  const idempotencyHash = computeIdempotencyHash(
    input.workspaceId,
    canonicalType,
    sanitizedPayload as Record<string, unknown>,
  );

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `act_${Date.now()}`,
    workspaceId: input.workspaceId,
    userId: input.userId,
    conversationId: input.conversationId,
    actionType: canonicalType,
    actionVersion: "v1",
    riskLevel,
    summary: input.summary,
    payload: sanitizedPayload,
    previousState: input.previousState ?? null,
    idempotencyHash,
    status: "prepared",
    expiresAt,
    confirmedAt: null,
    executedAt: null,
    createdAt: now.toISOString(),
    correlationId: input.correlationId,
  };
}

export interface ValidationResult {
  valid: boolean;
  code?: ActionErrorCode;
  error?: string;
}

/**
 * Revalidação server-side obrigatória antes de qualquer execução.
 * Valida workspace, ownership, status, TTL e permissão RBAC.
 */
export function validateActionForExecution(
  proposal: ActionProposal,
  requestingUserId: string,
  requestingWorkspaceId: string,
  userRole?: string,
): ValidationResult {
  // Cross-tenant check: strict workspace isolation
  if (proposal.workspaceId !== requestingWorkspaceId) {
    return {
      valid: false,
      code: "WALLET_AI_ACTION_FORBIDDEN",
      error: "Ação não autorizada para o workspace solicitante.",
    };
  }

  // RBAC check: role 'viewer' ou 'leitor' não pode executar ações
  if (userRole && (userRole === "viewer" || userRole === "leitor")) {
    return {
      valid: false,
      code: "WALLET_AI_ACTION_FORBIDDEN",
      error: "Papel de usuário somente leitura não possui permissão para executar ações financeiras.",
    };
  }

  // RBAC Approval policy (Política B: RBAC WORKSPACE):
  // - owner & admin: podem aprovar propostas de qualquer membro do workspace
  // - member: só pode aprovar suas próprias propostas
  const isElevated = userRole === "owner" || userRole === "admin";

  if (!isElevated && proposal.userId !== requestingUserId) {
    return {
      valid: false,
      code: "WALLET_AI_ACTION_FORBIDDEN",
      error: "Membros sem privilégios de administrador só podem aprovar suas próprias propostas de ação.",
    };
  }

  // Role check para HIGH risk: exige owner ou admin
  if (proposal.riskLevel === "HIGH" && !isElevated) {
    return {
      valid: false,
      code: "WALLET_AI_ACTION_FORBIDDEN",
      error: "Ações de alto risco exigem permissão de proprietário ou administrador.",
    };
  }

  // Status check
  if (proposal.status === "cancelled") {
    return {
      valid: false,
      code: "WALLET_AI_ACTION_ALREADY_PROCESSED",
      error: "Esta proposta de ação foi cancelada e não pode ser executada.",
    };
  }

  if (proposal.status === "executed") {
    return {
      valid: false,
      code: "WALLET_AI_ACTION_ALREADY_PROCESSED",
      error: "Esta proposta de ação já foi executada anteriormente (proteção contra replay).",
    };
  }

  if (proposal.status === "expired") {
    return {
      valid: false,
      code: "WALLET_AI_ACTION_EXPIRED",
      error: "A proposta de ação expirou. Gere uma nova proposta.",
    };
  }

  // TTL check
  const now = Date.now();
  const expiresTime = new Date(proposal.expiresAt).getTime();
  if (now > expiresTime) {
    return {
      valid: false,
      code: "WALLET_AI_ACTION_EXPIRED",
      error: "A proposta de ação expirou. Gere uma nova proposta.",
    };
  }

  return { valid: true };
}

export interface ActionRepository {
  saveProposal(proposal: ActionProposal): Promise<void>;
  getProposal(id: string): Promise<ActionProposal | null>;
  updateStatus(
    id: string,
    status: ActionProposal["status"],
    timestamps?: { confirmedAt?: string; executedAt?: string; errorMessage?: string },
  ): Promise<void>;
  confirmProposalAtomically?(
    id: string,
    context: AiExecutionContext,
    userRole?: string,
  ): Promise<{ success: boolean; proposal?: ActionProposal; code?: ActionErrorCode; error?: string }>;
  executeProposalAtomically?(id: string): Promise<boolean>;
}

export interface ActionDatabaseMutator {
  executeMutation(
    actionType: string,
    payload: Record<string, unknown>,
    context: AiExecutionContext,
  ): Promise<{ success: boolean; recordId?: string; data?: unknown }>;
}

export interface AuditEventSinkLike {
  logEvent(event: import("./action-types.ts").ActionAuditEvent): Promise<void> | void;
}

/**
 * Executa uma proposta de ação após confirmação explícita do usuário.
 * Aplica trava atômica de idempotência contra replay.
 */
export async function executeConfirmedProposal(
  proposalId: string,
  context: AiExecutionContext,
  repository: ActionRepository,
  mutator: ActionDatabaseMutator,
  userRole?: string,
  auditLogger?: AuditEventSinkLike,
): Promise<{ success: boolean; executedRecordId?: string; proposal: ActionProposal }> {
  let proposal: ActionProposal | null = null;

  // Se o repositório possuir confirmação atômica condicional nativa
  if (typeof repository.confirmProposalAtomically === "function") {
    const confirmResult = await repository.confirmProposalAtomically(proposalId, context, userRole);
    if (!confirmResult.success || !confirmResult.proposal) {
      throw new ActionGatewayError(
        confirmResult.code ?? "WALLET_AI_ACTION_FORBIDDEN",
        confirmResult.code === "WALLET_AI_ACTION_ALREADY_PROCESSED" ? 409 : 403,
        confirmResult.error ?? "Falha na confirmação atômica da proposta.",
      );
    }
    proposal = confirmResult.proposal;
  } else {
    // Fallback para repositórios genéricos/mockados em memória
    proposal = await repository.getProposal(proposalId);
    if (!proposal) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        404,
        `Proposta de ação não encontrada: ${proposalId}`,
      );
    }

    const validation = validateActionForExecution(
      proposal,
      context.userId,
      context.workspaceId,
      userRole,
    );

    if (!validation.valid) {
      if (validation.code === "WALLET_AI_ACTION_EXPIRED" && proposal.status === "prepared") {
        await repository.updateStatus(proposalId, "expired");
      }
      throw new ActionGatewayError(
        validation.code ?? "WALLET_AI_ACTION_FORBIDDEN",
        validation.code === "WALLET_AI_ACTION_ALREADY_PROCESSED" ? 409 : 403,
        validation.error ?? "Validação da proposta falhou.",
      );
    }

    const confirmedAt = new Date().toISOString();
    await repository.updateStatus(proposalId, "confirmed", { confirmedAt });
    proposal.status = "confirmed";
    proposal.confirmedAt = confirmedAt;
  }

  // Política estrita de alto risco: deleção bloqueada incondicionalmente
  if (proposal.actionType === "deletar_transacao") {
    throw new ActionGatewayError(
      "WALLET_AI_ACTION_FORBIDDEN",
      403,
      "Operação de exclusão bloqueada por política de segurança de alto risco. Realize exclusões exclusivamente através da interface financeira principal.",
    );
  }

  // Auditoria: Confirmação realizada
  if (auditLogger) {
    await auditLogger.logEvent({
      eventName: "proposal_confirmed",
      proposalId: proposal.id,
      actionType: proposal.actionType,
      riskLevel: proposal.riskLevel,
      workspaceId: context.workspaceId,
      userId: context.userId,
      correlationId: context.correlationId,
      timestamp: new Date().toISOString(),
      metadata: {
        created_by: proposal.userId,
        confirmed_by: context.userId,
        approver_role: userRole ?? "unknown",
      },
    });
  }

  try {
    const mutationResult = await mutator.executeMutation(
      proposal.actionType,
      proposal.payload as Record<string, unknown>,
      context,
    );

    const executedAt = new Date().toISOString();
    if (typeof repository.executeProposalAtomically === "function") {
      await repository.executeProposalAtomically(proposalId);
    } else {
      await repository.updateStatus(proposalId, "executed", { executedAt });
    }

    // Auditoria: Execução com sucesso
    if (auditLogger) {
      await auditLogger.logEvent({
        eventName: "proposal_executed",
        proposalId: proposal.id,
        actionType: proposal.actionType,
        riskLevel: proposal.riskLevel,
        workspaceId: context.workspaceId,
        userId: context.userId,
        correlationId: context.correlationId,
        timestamp: executedAt,
        metadata: {
          created_by: proposal.userId,
          confirmed_by: context.userId,
          approver_role: userRole ?? "unknown",
        },
      });
    }

    return {
      success: true,
      executedRecordId: mutationResult.recordId,
      proposal: {
        ...proposal,
        status: "executed",
        executedAt,
      },
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "mutation_failed";
    await repository.updateStatus(proposalId, "prepared", { errorMessage });

    if (auditLogger) {
      await auditLogger.logEvent({
        eventName: "proposal_execution_failed",
        proposalId: proposal.id,
        actionType: proposal.actionType,
        riskLevel: proposal.riskLevel,
        workspaceId: context.workspaceId,
        userId: context.userId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        metadata: { error: errorMessage },
      });
    }

    if (err instanceof ActionGatewayError) {
      throw err;
    }

    throw new ActionGatewayError(
      "WALLET_AI_ACTION_EXECUTION_ERROR",
      500,
      `Falha na execução da transação no banco de dados: ${errorMessage}`,
    );
  }
}
