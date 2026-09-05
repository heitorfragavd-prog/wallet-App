/**
 * Centralized Model Policy & Server-side Allowlist for Wallet AI
 * 
 * Regras:
 * - Não espalhar nomes de modelo hardcoded pelo sistema.
 * - Cliente não pode selecionar modelos arbitrários fora da allowlist.
 * - Routing simples por caso de uso (chat, complex, document, summary).
 */

export const ALLOWED_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "o3-mini",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const DEFAULT_CHAT_MODEL: AllowedModel = "gpt-4o-mini";
export const DEFAULT_COMPLEX_MODEL: AllowedModel = "gpt-4o";
export const DEFAULT_DOCUMENT_MODEL: AllowedModel = "gemini-1.5-flash";
export const DEFAULT_SUMMARY_MODEL: AllowedModel = "gpt-4o-mini";

export type ModelTaskType = "chat" | "complex" | "document" | "summary";

export class AiModelNotAllowedError extends Error {
  public readonly code = "WALLET_AI_MODEL_NOT_ALLOWED";
  public readonly status = 400;

  constructor(public readonly modelName: string) {
    super(`Modelo de IA não permitido: "${modelName}". Modelos permitidos: ${ALLOWED_MODELS.join(", ")}`);
    this.name = "AiModelNotAllowedError";
  }
}

export function isModelAllowed(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

export interface ResolveModelOptions {
  task?: ModelTaskType;
  fallbackToDefault?: boolean;
}

export function validateAndResolveModel(
  requestedModel?: string,
  options: ResolveModelOptions = {},
): AllowedModel {
  const { task = "chat", fallbackToDefault = true } = options;

  if (!requestedModel || requestedModel.trim() === "") {
    switch (task) {
      case "complex":
        return DEFAULT_COMPLEX_MODEL;
      case "document":
        return DEFAULT_DOCUMENT_MODEL;
      case "summary":
        return DEFAULT_SUMMARY_MODEL;
      case "chat":
      default:
        return DEFAULT_CHAT_MODEL;
    }
  }

  const trimmed = requestedModel.trim();
  if (isModelAllowed(trimmed)) {
    return trimmed;
  }

  if (fallbackToDefault) {
    switch (task) {
      case "complex":
        return DEFAULT_COMPLEX_MODEL;
      case "document":
        return DEFAULT_DOCUMENT_MODEL;
      case "summary":
        return DEFAULT_SUMMARY_MODEL;
      case "chat":
      default:
        return DEFAULT_CHAT_MODEL;
    }
  }

  throw new AiModelNotAllowedError(trimmed);
}
