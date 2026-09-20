/**
 * Observability, Audit Events & Sensitive Log Redaction for Wallet AI
 * 
 * Regras:
 * - Nunca logar bot token, Authorization header, API keys, password, base64, PDFs, linha digitável.
 * - Taxonomia padronizada de eventos e erros.
 * - Propagação transparente de correlation_id e conversation_id.
 */

export const AI_AUDIT_EVENTS = {
  TURN_STARTED: "ai_turn_started",
  TURN_COMPLETED: "ai_turn_completed",
  TURN_FAILED: "ai_turn_failed",
  MODEL_CALLED: "ai_model_called",
  MODEL_COMPLETED: "ai_model_completed",
  MODEL_FAILED: "ai_model_failed",
  TOOL_CALLED: "ai_tool_called",
  TOOL_COMPLETED: "ai_tool_completed",
  TOOL_FAILED: "ai_tool_failed",
  SUMMARY_STARTED: "ai_summary_started",
  SUMMARY_COMPLETED: "ai_summary_completed",
  SUMMARY_FAILED: "ai_summary_failed",
  CONTEXT_TRUNCATED: "ai_context_truncated",
  COST_RECORDED: "ai_cost_recorded",
} as const;

export type AiAuditEventType = (typeof AI_AUDIT_EVENTS)[keyof typeof AI_AUDIT_EVENTS];

export const AI_ERROR_CODES = {
  CONTEXT_TOO_LARGE: "WALLET_AI_CONTEXT_TOO_LARGE",
  MODEL_NOT_ALLOWED: "WALLET_AI_MODEL_NOT_ALLOWED",
  MODEL_TIMEOUT: "WALLET_AI_MODEL_TIMEOUT",
  TOOL_LIMIT_REACHED: "WALLET_AI_TOOL_LIMIT_REACHED",
  LOOP_DETECTED: "WALLET_AI_LOOP_DETECTED",
  CONVERSATION_FORBIDDEN: "WALLET_AI_CONVERSATION_FORBIDDEN",
  MEMORY_ERROR: "WALLET_AI_MEMORY_ERROR",
  SUMMARY_ERROR: "WALLET_AI_SUMMARY_ERROR",
  AUTH_ERROR: "WALLET_AI_AUTH_ERROR",
  INVALID_WORKSPACE: "WALLET_AI_INVALID_WORKSPACE",
  TOOL_ERROR: "WALLET_AI_TOOL_ERROR",
} as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];

// Regex de detecção de dados altamente sensíveis
const BOT_TOKEN_REGEX = /\b(?:bot)?\d{6,12}:[A-Za-z0-9_-]{25,50}\b/gi;
const BEARER_AUTH_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]{15,}/gi;
const API_KEY_REGEX = /\b(?:sk-[A-Za-z0-9_-]{15,}|AIza[A-Za-z0-9_-]{20,})\b/gi;
const BASE64_DATA_URL_REGEX = /data:[a-zA-Z0-9/+-]+;base64,[A-Za-z0-9+/=]{20,}/gi;
const RAW_LONG_BASE64_REGEX = /\b[A-Za-z0-9+/]{80,}={0,2}\b/g;
const LINHA_DIGITAVEL_REGEX = /\b\d{5}\.?\d{5}\s?\d{5}\.?\d{6}\s?\d{5}\.?\d{6}\s?\d\s?\d{14}\b/g;
const CODIGO_BARRAS_REGEX = /\b\d{44}\b/g;

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /auth(orization)?/i,
  /bearer/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /private[_-]?key/i,
  /credit_card/i,
  /cvv/i,
  /bot_token/i,
];

export function redactString(text: string): string {
  if (!text || typeof text !== "string") return text;

  let out = text;
  out = out.replace(BOT_TOKEN_REGEX, "[REDACTED_BOT_TOKEN]");
  out = out.replace(BEARER_AUTH_REGEX, "Bearer [REDACTED_TOKEN]");
  out = out.replace(API_KEY_REGEX, "[REDACTED_API_KEY]");
  out = out.replace(BASE64_DATA_URL_REGEX, "[REDACTED_BASE64_DATA]");
  out = out.replace(RAW_LONG_BASE64_REGEX, "[REDACTED_BASE64_PAYLOAD]");
  out = out.replace(LINHA_DIGITAVEL_REGEX, "[REDACTED_LINHA_DIGITAVEL]");
  out = out.replace(CODIGO_BARRAS_REGEX, "[REDACTED_CODIGO_BARRAS]");
  return out;
}

export function isSensitiveKeyName(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}

export function redactSensitiveAiData(
  data: unknown,
  maxDepth = 6,
  seen = new WeakSet(),
): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    return redactString(data);
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (maxDepth <= 0) return "[MAX_DEPTH_REACHED]";

  if (typeof data === "object") {
    if (seen.has(data as object)) return "[CIRCULAR_REF]";
    seen.add(data as object);

    if (Array.isArray(data)) {
      return data.map((item) => redactSensitiveAiData(item, maxDepth - 1, seen));
    }

    if (data instanceof Error) {
      return {
        name: data.name,
        message: redactString(data.message),
      };
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (isSensitiveKeyName(key)) {
        sanitizedObj[key] = "[REDACTED_SECRET]";
      } else {
        sanitizedObj[key] = redactSensitiveAiData(value, maxDepth - 1, seen);
      }
    }
    return sanitizedObj;
  }

  return String(data);
}

/**
 * Detector de Runaway Loops para tool calls repetidas
 */
export class AiLoopDetector {
  private readonly executedSignatures = new Set<string>();
  private toolCallsCount = 0;

  constructor(public readonly maxToolCallsPerTurn: number = 8) {}

  public recordToolCall(
    toolName: string,
    args: unknown,
  ): { loopDetected: boolean; limitReached: boolean } {
    this.toolCallsCount++;

    if (this.toolCallsCount > this.maxToolCallsPerTurn) {
      return { loopDetected: false, limitReached: true };
    }

    let serializedArgs = "";
    try {
      serializedArgs = typeof args === "string" ? args : JSON.stringify(args);
    } catch {
      serializedArgs = String(args);
    }

    const signature = `${toolName}:${serializedArgs}`;
    if (this.executedSignatures.has(signature)) {
      return { loopDetected: true, limitReached: false };
    }

    this.executedSignatures.add(signature);
    return { loopDetected: false, limitReached: false };
  }

  public get count(): number {
    return this.toolCallsCount;
  }
}
