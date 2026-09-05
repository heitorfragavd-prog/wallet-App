import type { OpenAiFunctionDefinition } from "./openai-tools-definition.ts";
import type { LlmMessage, LlmResponse, LlmRunner, LlmUsage } from "./orchestrator-core.ts";

export {
  ALLOWED_MODELS,
  DEFAULT_CHAT_MODEL as DEFAULT_MODEL,
  type AllowedModel,
} from "./model-policy.ts";
export { calculateEstimatedCost } from "./cost-calculator.ts";
import {
  ALLOWED_MODELS,
  DEFAULT_CHAT_MODEL,
  type AllowedModel,
  validateAndResolveModel,
} from "./model-policy.ts";

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

    this.model = validateAndResolveModel(options.model, { task: "chat", fallbackToDefault: true });
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
