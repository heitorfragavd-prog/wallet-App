import type { LlmMessage, LlmUsage } from "./orchestrator-core.ts";

export type SseEventType =
  | "response.started"
  | "agent.status"
  | "tool.started"
  | "tool.completed"
  | "text.delta"
  | "response.completed"
  | "response.failed";

export interface SseResponseStartedPayload {
  conversationId?: string;
  model: string;
}

export interface SseAgentStatusPayload {
  status: "thinking" | "executing_tool" | "summarizing";
  message: string;
}

export interface SseToolStartedPayload {
  tool: string;
  arguments: Record<string, unknown>;
  toolCallId: string;
}

export interface SseToolCompletedPayload {
  tool: string;
  output: unknown;
  toolCallId: string;
}

export interface SseTextDeltaPayload {
  delta: string;
}

export interface SseResponseCompletedPayload {
  message: LlmMessage;
  usage: LlmUsage;
  estimatedCostUsd: number;
}

export interface SseResponseFailedPayload {
  error: string;
  message: string;
}

export function formatSseEvent(event: SseEventType, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function parseSseLine(chunk: string): { event?: string; data?: unknown } | null {
  const lines = chunk.split("\n");
  let event: string | undefined;
  let dataStr: string | undefined;

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.replace("event:", "").trim();
    } else if (line.startsWith("data:")) {
      dataStr = line.replace("data:", "").trim();
    }
  }

  if (!event || !dataStr) return null;

  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return { event, data: dataStr };
  }
}
