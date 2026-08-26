import type { OpenAiFunctionDefinition } from "./openai-tools-definition.ts";
import type { LlmMessage, LlmResponse, LlmRunner, LlmUsage } from "./orchestrator-core.ts";

export const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o", "o3-mini"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const DEFAULT_MODEL: AllowedModel = "gpt-4o-mini";

// Tabela de preços por 1.000.000 tokens (USD)
const MODEL_PRICING: Record<AllowedModel, { inputPerMillion: number; outputPerMillion: number }> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  "gpt-4o": { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  "o3-mini": { inputPerMillion: 1.10, outputPerMillion: 4.40 },
};

export function calculateEstimatedCost(model: AllowedModel, usage: LlmUsage): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];
  const inputCost = (usage.promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

export interface OpenAiRunnerOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OpenAiLlmRunner implements LlmRunner {
  private readonly apiKey: string;
  public readonly model: AllowedModel;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiRunnerOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1/chat/completions";
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;

    const requestedModel = options.model as AllowedModel;
    this.model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;
  }

  async generateCompletion(
    messages: LlmMessage[],
    tools: OpenAiFunctionDefinition[],
  ): Promise<LlmResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const payload = {
      model: this.model,
      messages: messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool",
            tool_call_id: m.tool_call_id,
            content: m.content,
          };
        }
        if (m.role === "assistant" && m.tool_calls) {
          return {
            role: "assistant",
            content: m.content,
            tool_calls: m.tool_calls,
          };
        }
        return {
          role: m.role,
          content: m.content,
        };
      }),
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0.1, // Determinístico para finanças
    };

    try {
      const res = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("openai_quota_exceeded");
        }
        if (res.status === 401) {
          throw new Error("openai_invalid_key");
        }
        throw new Error(`openai_api_error_${res.status}`);
      }

      const json = await res.json();
      const choice = json.choices?.[0];

      if (!choice || !choice.message) {
        throw new Error("openai_empty_response");
      }

      const rawMsg = choice.message;
      const usage: LlmUsage = {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      };

      return {
        message: {
          role: "assistant",
          content: rawMsg.content ?? null,
          tool_calls: rawMsg.tool_calls,
        },
        usage,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
