import type { ActionAuditEvent } from "./action-types.ts";

export interface ActionAuditSink {
  recordEvent(event: ActionAuditEvent): Promise<void> | void;
}

export class ActionAuditLogger {
  constructor(private readonly sinks: ActionAuditSink[] = []) {}

  addSink(sink: ActionAuditSink): void {
    this.sinks.push(sink);
  }

  async logEvent(event: ActionAuditEvent): Promise<void> {
    const sanitizedEvent: ActionAuditEvent = {
      eventName: event.eventName,
      proposalId: event.proposalId,
      actionType: event.actionType,
      riskLevel: event.riskLevel,
      workspaceId: event.workspaceId,
      userId: event.userId,
      correlationId: event.correlationId,
      timestamp: event.timestamp || new Date().toISOString(),
      metadata: event.metadata,
    };

    for (const sink of this.sinks) {
      try {
        await sink.recordEvent(sanitizedEvent);
      } catch (err: unknown) {
        console.warn(`[WALLET_AI_AUDIT_WARNING] Falha ao registrar evento de auditoria: ${err}`);
      }
    }
  }
}

export const consoleActionAuditSink: ActionAuditSink = {
  recordEvent(event: ActionAuditEvent): void {
    console.log(
      JSON.stringify({
        level: "info",
        scope: "action_gateway_audit",
        event: event.eventName,
        proposal_id: event.proposalId,
        action_type: event.actionType,
        risk_level: event.riskLevel,
        workspace_id: event.workspaceId,
        user_id: event.userId,
        correlation_id: event.correlationId,
        timestamp: event.timestamp,
      }),
    );
  },
};
