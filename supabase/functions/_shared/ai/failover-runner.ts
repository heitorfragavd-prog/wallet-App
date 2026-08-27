import type { OpenAiFunctionDefinition } from "./openai-tools-definition.ts";
import type { LlmMessage, LlmResponse, LlmRunner } from "./orchestrator-core.ts";

export type LlmProviderName = "openai" | "gemini";

export interface FailoverRunnerOptions {
  primaryRunner: LlmRunner;
  fallbackRunner?: LlmRunner | null;
  onFailover?: (reason: string, provider: LlmProviderName) => void;
}

export function isRecoverableOpenAiError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";

  if (
    msg === "openai_quota_exceeded" ||
    msg === "openai_invalid_key" ||
    msg === "openai_timeout" ||
    name === "AbortError" ||
    msg.includes("429") ||
    msg.includes("openai_api_error_429") ||
    msg.includes("openai_api_error_5") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.toLowerCase().includes("timeout") ||
    msg.toLowerCase().includes("fetch failed") ||
    msg.toLowerCase().includes("networkerror")
  ) {
    return true;
  }
  return false;
}

export class FailoverLlmRunner implements LlmRunner {
  private readonly primaryRunner: LlmRunner;
  private readonly fallbackRunner?: LlmRunner | null;
  private readonly onFailover?: (reason: string, provider: LlmProviderName) => void;

  public activeProvider: LlmProviderName = "openai";
  public fallbackUsed = false;
  public fallbackReason?: string;

  constructor(options: FailoverRunnerOptions) {
    this.primaryRunner = options.primaryRunner;
    this.fallbackRunner = options.fallbackRunner;
    this.onFailover = options.onFailover;
  }

  async generateCompletion(
    messages: LlmMessage[],
    tools: OpenAiFunctionDefinition[],
  ): Promise<LlmResponse> {
    // Se o failover já ocorreu nesta sessão/turno, continua no fallback
    if (this.activeProvider === "gemini" && this.fallbackRunner) {
      return this.fallbackRunner.generateCompletion(messages, tools);
    }

    try {
      return await this.primaryRunner.generateCompletion(messages, tools);
    } catch (primaryErr: unknown) {
      if (this.fallbackRunner && isRecoverableOpenAiError(primaryErr)) {
        const reason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        this.activeProvider = "gemini";
        this.fallbackUsed = true;
        this.fallbackReason = reason;

        if (this.onFailover) {
          this.onFailover(reason, "gemini");
        }

        try {
          return await this.fallbackRunner.generateCompletion(messages, tools);
        } catch (fallbackErr: unknown) {
          // Ambos falharam: repassa erro com contexto claro
          const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          throw new Error(`all_llm_providers_failed: primary(${reason}), fallback(${fallbackMsg})`);
        }
      }

      // Erro não recuperável ou sem fallback configurado
      throw primaryErr;
    }
  }
}
