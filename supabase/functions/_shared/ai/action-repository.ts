import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { ActionProposal, ActionProposalStatus, ActionRiskLevel } from "./action-types.ts";
import type { ActionErrorCode } from "./action-gateway.ts";
import type { AiExecutionContext } from "./auth.ts";

export interface ProposalRow {
  id: string;
  workspace_id: string;
  user_id: string;
  conversation_id: string | null;
  action_type: string;
  action_version: string;
  risk_level: string | null;
  summary: string;
  payload: Record<string, unknown>;
  previous_state: Record<string, unknown> | null;
  idempotency_hash: string;
  status: ActionProposalStatus;
  expires_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  created_at: string;
}

export function mapRowToProposal(row: ProposalRow): ActionProposal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    conversationId: row.conversation_id ?? undefined,
    actionType: row.action_type,
    actionVersion: row.action_version,
    riskLevel: (row.risk_level as ActionRiskLevel) ?? "MEDIUM",
    summary: row.summary,
    payload: row.payload ?? {},
    previousState: row.previous_state ?? null,
    idempotencyHash: row.idempotency_hash,
    status: row.status,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    executedAt: row.executed_at,
    createdAt: row.created_at,
  };
}

export interface IActionProposalRepository {
  saveProposal(proposal: ActionProposal): Promise<void>;
  getProposal(id: string): Promise<ActionProposal | null>;
  updateStatus(
    id: string,
    status: ActionProposalStatus,
    timestamps?: { confirmedAt?: string; executedAt?: string; errorMessage?: string },
  ): Promise<void>;
  confirmProposalAtomically(
    id: string,
    context: AiExecutionContext,
    userRole?: string,
  ): Promise<{ success: boolean; proposal?: ActionProposal; code?: ActionErrorCode; error?: string }>;
  executeProposalAtomically(id: string): Promise<boolean>;
  cancelProposalAtomically(id: string, context: AiExecutionContext): Promise<boolean>;
}

export class SupabaseActionProposalRepository implements IActionProposalRepository {
  constructor(private readonly client: SupabaseClient) {}

  async saveProposal(proposal: ActionProposal): Promise<void> {
    const row = {
      id: proposal.id,
      workspace_id: proposal.workspaceId,
      user_id: proposal.userId,
      conversation_id: proposal.conversationId ?? null,
      action_type: proposal.actionType,
      action_version: proposal.actionVersion,
      risk_level: proposal.riskLevel,
      summary: proposal.summary,
      payload: proposal.payload,
      previous_state: proposal.previousState ?? null,
      idempotency_hash: proposal.idempotencyHash,
      status: proposal.status,
      expires_at: proposal.expiresAt,
      confirmed_at: proposal.confirmedAt ?? null,
      executed_at: proposal.executedAt ?? null,
      created_at: proposal.createdAt,
    };

    const { error } = await this.client
      .from("wallet_ai_action_proposals")
      .upsert(row, { onConflict: "id" });

    if (error) {
      throw new Error(`[WALLET_AI_ACTION_REPOSITORY_ERROR] Falha ao persistir proposta: ${error.message}`);
    }
  }

  async getProposal(id: string): Promise<ActionProposal | null> {
    const { data, error } = await this.client
      .from("wallet_ai_action_proposals")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapRowToProposal(data as ProposalRow);
  }

  async updateStatus(
    id: string,
    status: ActionProposalStatus,
    timestamps?: { confirmedAt?: string; executedAt?: string; errorMessage?: string },
  ): Promise<void> {
    const updateData: Record<string, unknown> = { status };
    if (timestamps?.confirmedAt) updateData.confirmed_at = timestamps.confirmedAt;
    if (timestamps?.executedAt) updateData.executed_at = timestamps.executedAt;

    const { error } = await this.client
      .from("wallet_ai_action_proposals")
      .update(updateData)
      .eq("id", id);

    if (error) {
      throw new Error(`[WALLET_AI_ACTION_REPOSITORY_ERROR] Falha ao atualizar status: ${error.message}`);
    }
  }

  /**
   * Confirmação atômica condicional:
   * UPDATE WHERE id = ? AND status = 'prepared' AND workspace_id = ? AND user_id = ? AND expires_at > now()
   */
  async confirmProposalAtomically(
    id: string,
    context: AiExecutionContext,
    userRole?: string,
  ): Promise<{ success: boolean; proposal?: ActionProposal; code?: ActionErrorCode; error?: string }> {
    // 1. RBAC check
    if (userRole === "viewer" || userRole === "leitor") {
      return {
        success: false,
        code: "WALLET_AI_ACTION_FORBIDDEN",
        error: "Papel de somente leitura (viewer) não possui permissão para confirmar ações financeiras.",
      };
    }

    const currentProposal = await this.getProposal(id);
    if (!currentProposal) {
      return {
        success: false,
        code: "WALLET_AI_ACTION_INVALID",
        error: `Proposta não encontrada: ${id}`,
      };
    }

    // Cross-tenant check: strict workspace isolation
    if (currentProposal.workspaceId !== context.workspaceId) {
      return {
        success: false,
        code: "WALLET_AI_ACTION_FORBIDDEN",
        error: "Ação não autorizada para o workspace autenticado.",
      };
    }

    // RBAC Approval policy (Política B: RBAC WORKSPACE):
    // - owner & admin: podem aprovar propostas de qualquer membro do workspace
    // - member: só pode aprovar suas próprias propostas
    const isElevated = userRole === "owner" || userRole === "admin";

    if (!isElevated && currentProposal.userId !== context.userId) {
      return {
        success: false,
        code: "WALLET_AI_ACTION_FORBIDDEN",
        error: "Membros sem privilégios de administrador só podem aprovar suas próprias propostas de ação.",
      };
    }

    // Role check para HIGH risk: exige owner ou admin
    if (currentProposal.riskLevel === "HIGH" && !isElevated) {
      return {
        success: false,
        code: "WALLET_AI_ACTION_FORBIDDEN",
        error: "Ações de alto risco exigem permissão de proprietário ou administrador.",
      };
    }

    // Expiration check
    if (new Date(currentProposal.expiresAt).getTime() < Date.now()) {
      await this.updateStatus(id, "expired");
      return {
        success: false,
        code: "WALLET_AI_ACTION_EXPIRED",
        error: "A proposta de ação expirou.",
      };
    }

    // Replay / status check
    if (currentProposal.status !== "prepared") {
      return {
        success: false,
        code: "WALLET_AI_ACTION_ALREADY_PROCESSED",
        error: `A proposta já se encontra no status ${currentProposal.status} e não pode ser reconfirmada.`,
      };
    }

    // Transição atômica
    const confirmedAt = new Date().toISOString();
    const { data, error } = await this.client
      .from("wallet_ai_action_proposals")
      .update({
        status: "confirmed",
        confirmed_at: confirmedAt,
      })
      .eq("id", id)
      .eq("status", "prepared")
      .eq("workspace_id", context.workspaceId)
      .select()
      .maybeSingle();

    if (error || !data) {
      return {
        success: false,
        code: "WALLET_AI_ACTION_ALREADY_PROCESSED",
        error: "A proposta já foi confirmada concorrentemente por outra requisição (concorrência bloqueada).",
      };
    }

    return {
      success: true,
      proposal: mapRowToProposal(data as ProposalRow),
    };
  }

  async executeProposalAtomically(id: string): Promise<boolean> {
    const executedAt = new Date().toISOString();
    const { data, error } = await this.client
      .from("wallet_ai_action_proposals")
      .update({
        status: "executed",
        executed_at: executedAt,
      })
      .eq("id", id)
      .eq("status", "confirmed")
      .select()
      .maybeSingle();

    return !error && !!data;
  }

  async cancelProposalAtomically(id: string, context: AiExecutionContext): Promise<boolean> {
    const { data, error } = await this.client
      .from("wallet_ai_action_proposals")
      .update({
        status: "cancelled",
      })
      .eq("id", id)
      .eq("status", "prepared")
      .eq("workspace_id", context.workspaceId)
      .select()
      .maybeSingle();

    return !error && !!data;
  }
}
