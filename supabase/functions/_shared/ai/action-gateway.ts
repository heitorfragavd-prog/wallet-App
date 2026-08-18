import type { ActionProposal, PrepareActionInput } from "./action-types.ts";

function generateSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Converte para integer 32bit
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

export function prepareActionProposal<TPayload = Record<string, unknown>>(
  input: PrepareActionInput<TPayload>,
): ActionProposal<TPayload> {
  const ttlMs = (input.ttlMinutes ?? 15) * 60 * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  const idempotencyHash = computeIdempotencyHash(
    input.workspaceId,
    input.actionType,
    input.payload as Record<string, unknown>,
  );

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `act_${Date.now()}`,
    workspaceId: input.workspaceId,
    userId: input.userId,
    actionType: input.actionType,
    actionVersion: "v1",
    summary: input.summary,
    payload: input.payload,
    previousState: input.previousState ?? null,
    idempotencyHash,
    status: "prepared",
    expiresAt,
    confirmedAt: null,
    executedAt: null,
    createdAt: now.toISOString(),
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateActionForExecution(
  proposal: ActionProposal,
  requestingUserId: string,
  requestingWorkspaceId: string,
): ValidationResult {
  if (proposal.userId !== requestingUserId || proposal.workspaceId !== requestingWorkspaceId) {
    return { valid: false, error: "action_forbidden_cross_tenant" };
  }

  if (proposal.status === "cancelled") {
    return { valid: false, error: "action_already_cancelled" };
  }

  if (proposal.status === "executed") {
    return { valid: false, error: "action_already_executed" };
  }

  const now = new Date().getTime();
  const expiresTime = new Date(proposal.expiresAt).getTime();
  if (now > expiresTime) {
    return { valid: false, error: "action_proposal_expired" };
  }

  return { valid: true };
}

export interface ActionRepository {
  saveProposal(proposal: ActionProposal): Promise<void>;
  getProposal(id: string): Promise<ActionProposal | null>;
  updateStatus(
    id: string,
    status: ActionProposal["status"],
    timestamps?: { confirmedAt?: string; executedAt?: string },
  ): Promise<void>;
}
