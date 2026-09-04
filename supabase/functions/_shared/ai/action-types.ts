export type ActionProposalStatus =
  | "prepared"
  | "confirmed"
  | "executed"
  | "cancelled"
  | "expired";

export type ActionRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type ActionExecutionPolicy = "proposal_only" | "blocked" | "executable";

export interface ActionDefinition {
  actionType: string;
  riskLevel: ActionRiskLevel;
  executionPolicy: ActionExecutionPolicy;
  blocked?: boolean;
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
    executionPolicy: "proposal_only",
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
    executionPolicy: "proposal_only",
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
    executionPolicy: "blocked",
    blocked: true,
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
    executionPolicy: "proposal_only",
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
    executionPolicy: "proposal_only",
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
    executionPolicy: "proposal_only",
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
    executionPolicy: "proposal_only",
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
    executionPolicy: "proposal_only",
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
    executionPolicy: "proposal_only",
    requiredPermission: "finance:accounts:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "financial_account",
    allowedFields: ["conta_id", "nome", "saldo"],
    requiredFields: ["conta_id"],
  },
  cadastrar_despesa_nf: {
    actionType: "cadastrar_despesa_nf",
    riskLevel: "MEDIUM",
    executionPolicy: "proposal_only",
    requiredPermission: "finance:invoices:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "fiscal_document",
    allowedFields: [
      "fornecedor",
      "cnpj_fornecedor",
      "numero_nf",
      "serie_nf",
      "data_emissao",
      "chave_acesso",
      "valor_total",
      "valor_produtos",
      "itens",
      "categoria_id",
      "categoria_nome",
      "conta_id",
      "observacoes",
    ],
    requiredFields: ["fornecedor", "numero_nf", "data_emissao", "valor_total"],
  },
  cadastrar_divida_boleto: {
    actionType: "cadastrar_divida_boleto",
    riskLevel: "MEDIUM",
    executionPolicy: "proposal_only",
    requiredPermission: "finance:debts:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "banking_document",
    allowedFields: [
      "beneficiario",
      "cnpj_cpf_beneficiario",
      "pagador",
      "valor",
      "valor_total",
      "data_vencimento",
      "linha_digitavel",
      "codigo_barras",
      "banco",
      "descricao",
      "categoria_id",
      "categoria_nome",
    ],
    requiredFields: ["beneficiario", "valor", "data_vencimento"],
  },
  cadastrar_boleto: {
    actionType: "cadastrar_boleto",
    riskLevel: "MEDIUM",
    executionPolicy: "proposal_only",
    requiredPermission: "finance:debts:write",
    requiresConfirmation: true,
    reversible: true,
    auditCategory: "banking_document",
    allowedFields: [
      "beneficiario",
      "cnpj_cpf_beneficiario",
      "pagador",
      "valor",
      "valor_total",
      "data_vencimento",
      "linha_digitavel",
      "codigo_barras",
      "banco",
      "descricao",
      "categoria_id",
      "categoria_nome",
    ],
    requiredFields: ["beneficiario", "valor", "data_vencimento"],
  },
};

/**
 * Mapeamento canônico de aliases de ações para evitar divergência entre
 * ferramentas legadas, orquestrador e frontend.
 */
export const ACTION_TYPE_ALIASES: Record<string, string> = {
  cadastrar_receita: "cadastrar_transacao",
  cadastrar_despesa: "cadastrar_transacao",
  atualizar_status_receita: "atualizar_transacao",
  atualizar_status_despesa: "atualizar_transacao",
  create_debt: "cadastrar_divida_boleto",
  import_invoice: "cadastrar_despesa_nf",
};

export type CanonicalActionType = keyof typeof CANONICAL_ACTIONS;

export function resolveActionType(actionType: string): CanonicalActionType {
  return (ACTION_TYPE_ALIASES[actionType] ?? actionType) as CanonicalActionType;
}

export function resolveActionTypeAndPayload(
  actionType: string,
  payload: Record<string, unknown> = {},
): { canonicalType: CanonicalActionType; resolvedPayload: Record<string, unknown> } {
  const canonicalType = resolveActionType(actionType);
  const resolvedPayload = { ...payload };

  if (actionType === "cadastrar_despesa" || actionType === "atualizar_status_despesa") {
    resolvedPayload.tipo = "despesa";
  } else if (actionType === "cadastrar_receita" || actionType === "atualizar_status_receita") {
    resolvedPayload.tipo = "receita";
  }

  return { canonicalType, resolvedPayload };
}

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

