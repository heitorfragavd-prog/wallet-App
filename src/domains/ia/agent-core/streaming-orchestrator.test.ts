import { describe, expect, it, vi } from "vitest";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth";
import type { QueryToolCatalog } from "../../../../supabase/functions/_shared/ai/query-tools";
import type { LlmRunner } from "../../../../supabase/functions/_shared/ai/orchestrator-core";
import { runStreamingOrchestratorTurn } from "../../../../supabase/functions/_shared/ai/streaming-orchestrator";
import type { SseEventType } from "../../../../supabase/functions/_shared/ai/streaming-protocol";

const mockContext: AiExecutionContext = {
  userId: "user-123",
  workspaceId: "workspace-123",
  accessToken: "token-123",
};

describe("Streaming Orchestrator", () => {
  it("deve emitir a sequência correta de eventos SSE durante o ciclo", async () => {
    const mockCatalog: QueryToolCatalog = {
      consultar_saldos: vi.fn().mockResolvedValue({
        tool: "consultar_saldos",
        period: null,
        filters: { user_id: "user-123", workspace_id: "workspace-123" },
        data: [{ id: "acc-1", balance: 5000 }],
        sources: [],
        formulas: {},
        warnings: [],
      }),
    };

    const mockRunner: LlmRunner = {
      generateCompletion: vi
        .fn()
        .mockResolvedValueOnce({
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_saldo_1",
                type: "function",
                function: {
                  name: "consultar_saldos",
                  arguments: "{}",
                },
              },
            ],
          },
          usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        })
        .mockResolvedValueOnce({
          message: {
            role: "assistant",
            content: "Seu saldo disponível é de R$ 5.000,00.",
          },
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        }),
    };

    const emittedEvents: Array<{ event: SseEventType; data: unknown }> = [];
    const eventEmitter = {
      emit: (event: SseEventType, data: unknown) => {
        emittedEvents.push({ event, data });
      },
    };

    const result = await runStreamingOrchestratorTurn(
      [{ role: "user", content: "Qual meu saldo?" }],
      mockContext,
      mockCatalog,
      mockRunner,
      eventEmitter,
    );

    expect(result.finalMessage.content).toBe("Seu saldo disponível é de R$ 5.000,00.");

    const eventNames = emittedEvents.map((e) => e.event);
    expect(eventNames).toContain("response.started");
    expect(eventNames).toContain("agent.status");
    expect(eventNames).toContain("tool.started");
    expect(eventNames).toContain("tool.completed");
    expect(eventNames).toContain("text.delta");
    expect(eventNames).toContain("response.completed");
  });
});
