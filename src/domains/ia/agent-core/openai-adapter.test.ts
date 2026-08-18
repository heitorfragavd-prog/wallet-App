import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  OpenAiLlmRunner,
  calculateEstimatedCost,
  ALLOWED_MODELS,
} from "../../../../supabase/functions/_shared/ai/openai-adapter";
import type { LlmMessage } from "../../../../supabase/functions/_shared/ai/orchestrator-core";
import type { OpenAiFunctionDefinition } from "../../../../supabase/functions/_shared/ai/openai-tools-definition";

const mockTools: OpenAiFunctionDefinition[] = [
  {
    type: "function",
    function: {
      name: "buscar_receitas",
      description: "Buscar receitas",
      parameters: { type: "object", properties: {} },
    },
  },
];

describe("OpenAI Adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve mapear modelo não permitido para o padrão seguro gpt-4o-mini", () => {
    const runner = new OpenAiLlmRunner({
      apiKey: "test-key",
      model: "unauthorized-model-xyz",
    });

    expect(runner.model).toBe("gpt-4o-mini");
  });

  it("deve aceitar modelos da allowlist", () => {
    for (const m of ALLOWED_MODELS) {
      const runner = new OpenAiLlmRunner({
        apiKey: "test-key",
        model: m,
      });
      expect(runner.model).toBe(m);
    }
  });

  it("deve executar chamada bem-sucedida para a API OpenAI", async () => {
    const mockApiResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "Resposta do modelo",
            tool_calls: undefined,
          },
        },
      ],
      usage: {
        prompt_tokens: 150,
        completion_tokens: 45,
        total_tokens: 195,
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const runner = new OpenAiLlmRunner({
      apiKey: "test-api-key",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const messages: LlmMessage[] = [{ role: "user", content: "Qual meu saldo?" }];
    const result = await runner.generateCompletion(messages, mockTools);

    expect(result.message.content).toBe("Resposta do modelo");
    expect(result.usage).toEqual({
      promptTokens: 150,
      completionTokens: 45,
      totalTokens: 195,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("deve lançar erro se a resposta HTTP da OpenAI não for OK", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: () => Promise.resolve('{"error": {"message": "Rate limit exceeded"}}'),
    });

    const runner = new OpenAiLlmRunner({
      apiKey: "test-api-key",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const messages: LlmMessage[] = [{ role: "user", content: "Olá" }];
    await expect(runner.generateCompletion(messages, mockTools)).rejects.toThrow(
      "openai_api_error_429",
    );
  });

  it("deve calcular custos estimados corretamente para gpt-4o-mini e gpt-4o", () => {
    // 1M prompt gpt-4o-mini = $0.15 => 10k prompt = $0.0015
    // 1M completion gpt-4o-mini = $0.60 => 2k completion = $0.0012
    const costMini = calculateEstimatedCost("gpt-4o-mini", {
      promptTokens: 10000,
      completionTokens: 2000,
      totalTokens: 12000,
    });
    expect(costMini).toBeCloseTo(0.0027, 4);

    // 1M prompt gpt-4o = $2.50 => 10k prompt = $0.025
    // 1M completion gpt-4o = $10.00 => 2k completion = $0.020
    const cost4o = calculateEstimatedCost("gpt-4o", {
      promptTokens: 10000,
      completionTokens: 2000,
      totalTokens: 12000,
    });
    expect(cost4o).toBeCloseTo(0.045, 4);
  });
});
