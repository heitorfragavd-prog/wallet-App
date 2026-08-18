export type ActionProposalStatus =
  | "prepared"
  | "confirmed"
  | "executed"
  | "cancelled"
  | "expired";

export interface ActionProposal<TPayload = Record<string, unknown>> {
  id: string;
  workspaceId: string;
  userId: string;
  actionType: string;
  actionVersion: string;
  summary: string;
  payload: TPayload;
  previousState?: Record<string, unknown> | null;
  idempotencyHash: string;
  status: ActionProposalStatus;
  expiresAt: string; // ISO 8601
  confirmedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
}

export interface PrepareActionInput<TPayload = Record<string, unknown>> {
  workspaceId: string;
  userId: string;
  actionType: string;
  summary: string;
  payload: TPayload;
  previousState?: Record<string, unknown>;
  ttlMinutes?: number;
}
