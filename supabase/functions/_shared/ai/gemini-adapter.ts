import type { OpenAiFunctionDefinition } from "./openai-tools-definition.ts";
import type { LlmMessage, LlmResponse, LlmRunner, LlmUsage } from "./orchestrator-core.ts";

export const ALLOWED_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-3.6-flash",
] as const;

export type AllowedGeminiModel = (typeof ALLOWED_GEMINI_MODELS)[number];
export const DEFAULT_GEMINI_MODEL: AllowedGeminiModel = "gemini-2.5-flash";

export interface GeminiRunnerOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiLlmRunner implements LlmRunner {
  private readonly apiKey: string;
  public readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiRunnerOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || DEFAULT_GEMINI_MODEL;
    this.baseUrl =
      options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
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
      temperature: 0.1,
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
          throw new Error("gemini_rate_limit");
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error("gemini_invalid_key");
        }
        throw new Error(`gemini_api_error_${res.status}`);
      }

      const json = await res.json();
      const choice = json.choices?.[0];

      if (!choice || !choice.message) {
        throw new Error("gemini_empty_response");
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
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("gemini_timeout");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
