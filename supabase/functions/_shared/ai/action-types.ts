export type ActionProposalStatus =
  | "prepared"
  | "confirmed"
  | "executed"
  | "cancelled"
  | "expired";

export type ActionRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ActionDefinition {
  actionType: string;
  riskLevel: ActionRiskLevel;
  requiredPermission: string;
  requiresConfirmation: true;
  reversible: boolean;
  auditCategory: string;
  allowedFields: readonly string[];
  requiredFields: readonly string[];
}

export const CANONICAL_ACTIONS: Record<string, ActionDefinition> = {
  cadastrar_transacao: {
    actionType: "cadastrar_transacao",
    riskLevel: "MEDIUM",
    requiredPermission: "finance:transactions:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "financial_mutation",
    allowedFields: [
      "descricao",
      "valor",
      "tipo",
      "data",
      "categoria_id",
      "categoria_nome",
      "conta_id",
      "conta_nome",
      "metodo_pagamento",
      "observacoes",
    ],
    requiredFields: ["descricao", "valor", "tipo", "data"],
  },
  atualizar_transacao: {
    actionType: "atualizar_transacao",
    riskLevel: "HIGH",
    requiredPermission: "finance:transactions:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "financial_mutation",
    allowedFields: [
      "transacao_id",
      "descricao",
      "valor",
      "data",
      "categoria_id",
      "categoria_nome",
      "conta_id",
      "conta_nome",
      "metodo_pagamento",
      "observacoes",
    ],
    requiredFields: ["transacao_id"],
  },
  deletar_transacao: {
    actionType: "deletar_transacao",
    riskLevel: "HIGH",
    requiredPermission: "finance:transactions:delete",
    requiresConfirmation: true,
    reversible: false,
    auditCategory: "financial_deletion",
    allowedFields: ["transacao_id", "motivo"],
    requiredFields: ["transacao_id"],
  },
  cadastrar_divida: {
    actionType: "cadastrar_divida",
    riskLevel: "MEDIUM",
    requiredPermission: "finance:debts:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "financial_mutation",
    allowedFields: [
      "descricao",
      "valor_total",
      "credor",
      "data_vencimento",
      "parcelas",
      "categoria_id",
      "categoria_nome",
    ],
    requiredFields: ["descricao", "valor_total"],
  },
  atualizar_divida: {
    actionType: "atualizar_divida",
    riskLevel: "MEDIUM",
    requiredPermission: "finance:debts:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "financial_mutation",
    allowedFields: ["divida_id", "status", "valor_pago"],
    requiredFields: ["divida_id"],
  },
  cadastrar_meta: {
    actionType: "cadastrar_meta",
    riskLevel: "LOW",
    requiredPermission: "finance:goals:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "financial_goal",
    allowedFields: ["nome", "valor_alvo", "valor_atual", "data_limite", "descricao"],
    requiredFields: ["nome", "valor_alvo"],
  },
  atualizar_meta: {
    actionType: "atualizar_meta",
    riskLevel: "LOW",
    requiredPermission: "finance:goals:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "financial_goal",
    allowedFields: ["meta_id", "valor_atual", "status", "nome", "valor_alvo", "data_limite"],
    requiredFields: ["meta_id"],
  },
  criar_conta: {
    actionType: "criar_conta",
    riskLevel: "HIGH",
    requiredPermission: "finance:accounts:write",
    requiresConfirmation: true,
    reversible: false,
    auditCategory: "financial_account",
    allowedFields: ["nome", "tipo", "saldo"],
    requiredFields: ["nome", "tipo"],
  },
  atualizar_conta: {
    actionType: "atualizar_conta",
    riskLevel: "HIGH",
    requiredPermission: "finance:accounts:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "financial_account",
    allowedFields: ["conta_id", "nome", "saldo"],
    requiredFields: ["conta_id"],
  },
};

export interface ActionProposal<TPayload = Record<string, unknown>> {
  id: string;
  workspaceId: string;
  userId: string;
  conversationId?: string;
  actionType: string;
  actionVersion: string;
  riskLevel: ActionRiskLevel;
  summary: string;
  payload: TPayload;
  previousState?: Record<string, unknown> | null;
  idempotencyHash: string;
  status: ActionProposalStatus;
  expiresAt: string; // ISO 8601
  confirmedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
  correlationId?: string;
  errorMessage?: string | null;
}

export interface PrepareActionInput<TPayload = Record<string, unknown>> {
  workspaceId: string;
  userId: string;
  conversationId?: string;
  actionType: string;
  summary: string;
  payload: TPayload;
  previousState?: Record<string, unknown>;
  ttlMinutes?: number;
  correlationId?: string;
}

export type ActionAuditEventName =
  | "proposal_created"
  | "proposal_confirmed"
  | "proposal_cancelled"
  | "proposal_executed"
  | "proposal_expired"
  | "proposal_execution_failed";

export interface ActionAuditEvent {
  eventName: ActionAuditEventName;
  proposalId: string;
  actionType: string;
  riskLevel: ActionRiskLevel;
  workspaceId: string;
  userId: string;
  correlationId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

