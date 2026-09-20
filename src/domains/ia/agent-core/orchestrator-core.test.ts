/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth";
import type { QueryToolCatalog } from "../../../../supabase/functions/_shared/ai/query-tools";
import {
  runOrchestratorTurn,
  type LlmRunner,
  type LlmMessage,
} from "../../../../supabase/functions/_shared/ai/orchestrator-core";

const mockContext: AiExecutionContext = {
  userId: "user-test",
  workspaceId: "workspace-test",
  accessToken: "token-test",
};

describe("Orchestrator Core", () => {
  it("deve responder diretamente quando o LLM não solicitar tool calls", async () => {
    const mockCatalog: QueryToolCatalog = {};
    const mockRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: {
          role: "assistant",
          content: "Olá! Como posso ajudar você hoje?",
        },
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      }),
    };

    const messages: LlmMessage[] = [{ role: "user", content: "Olá" }];

    const result = await runOrchestratorTurn(
      messages,
      mockContext,
      mockCatalog,
      mockRunner,
      { maxToolIterations: 5 },
    );

    expect(result.finalMessage.content).toBe("Olá! Como posso ajudar você hoje?");
    expect(result.toolCallsExecuted).toHaveLength(0);
    expect(result.iterations).toBe(1);
    expect(result.usage.totalTokens).toBe(120);
  });

  it("deve executar tool call, alimentar o histórico e retornar a resposta final enriquecida", async () => {
    const mockCatalog: QueryToolCatalog = {
      buscar_receitas: vi.fn().mockResolvedValue({
        tool: "buscar_receitas",
        period: { start: "2026-08-01", end: "2026-08-15" },
        filters: { user_id: "user-test", workspace_id: "workspace-test" },
        data: [{ id: "r1", amount: 5000, description: "Consultoria" }],
        sources: [{ type: "receita", ids: ["r1"] }],
        formulas: {},
        warnings: [],
      }),
    };

    const mockRunner: LlmRunner = {
      generateCompletion: vi
        .fn()
        // Iteração 1: LLM pede para chamar buscar_receitas
        .mockResolvedValueOnce({
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_rec",
                type: "function",
                function: {
                  name: "buscar_receitas",
                  arguments: JSON.stringify({ start: "2026-08-01", end: "2026-08-15" }),
                },
              },
            ],
          },
          usage: { promptTokens: 200, completionTokens: 30, totalTokens: 230 },
        })
        // Iteração 2: LLM recebe o resultado da ferramenta e gera a resposta final
        .mockResolvedValueOnce({
          message: {
            role: "assistant",
            content:
              "No período de 01/08/2026 a 15/08/2026, você teve R$ 5.000,00 em receitas provenientes de Consultoria.",
          },
          usage: { promptTokens: 350, completionTokens: 50, totalTokens: 400 },
        }),
    };

    const messages: LlmMessage[] = [
      { role: "user", content: "Quanto faturei no início de agosto de 2026?" },
    ];

    const result = await runOrchestratorTurn(
      messages,
      mockContext,
      mockCatalog,
      mockRunner,
      { maxToolIterations: 5 },
    );

    expect(result.finalMessage.content).toContain("R$ 5.000,00");
    expect(result.toolCallsExecuted).toHaveLength(1);
    expect(result.toolCallsExecuted[0].tool).toBe("buscar_receitas");
    expect(result.iterations).toBe(2);
    expect(result.usage.totalTokens).toBe(630);
    expect(mockCatalog.buscar_receitas).toHaveBeenCalledWith(
      { start: "2026-08-01", end: "2026-08-15" },
      mockContext,
    );
  });

  it("deve abortar e retornar mensagem de segurança se houver detecção de loop de ferramentas", async () => {
    const mockCatalog: QueryToolCatalog = {
      consultar_saldos: vi.fn().mockResolvedValue({
        tool: "consultar_saldos",
        period: null,
        filters: { user_id: "user-test", workspace_id: "workspace-test" },
        data: [],
        sources: [],
        formulas: {},
        warnings: [],
      }),
    };

    const duplicateToolCall = {
      id: "call_loop",
      type: "function" as const,
      function: {
        name: "consultar_saldos",
        arguments: "{}",
      },
    };

    // LLM fica chamando a mesma ferramenta indefinidamente
    const mockRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [duplicateToolCall],
        },
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      }),
    };

    const messages: LlmMessage[] = [{ role: "user", content: "Qual meu saldo?" }];

    const result = await runOrchestratorTurn(
      messages,
      mockContext,
      mockCatalog,
      mockRunner,
      { maxToolIterations: 5 },
    );

    expect(result.loopDetected).toBe(true);
    expect(result.finalMessage.content).toContain("loop");
  });

  it("deve respeitar o limite máximo de iterações (anti-runaway)", async () => {
    let callCounter = 0;
    const mockCatalog: QueryToolCatalog = {
      buscar_receitas: vi.fn().mockImplementation(() =>
        Promise.resolve({
          tool: "buscar_receitas",
          period: null,
          filters: { user_id: "user-test", workspace_id: "workspace-test" },
          data: [],
          sources: [],
          formulas: {},
          warnings: [],
        }),
      ),
    };

    // LLM sempre pede uma nova tool call diferente
    const mockRunner: LlmRunner = {
      generateCompletion: vi.fn().mockImplementation(() => {
        callCounter++;
        return Promise.resolve({
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `call_${callCounter}`,
                type: "function",
                function: {
                  name: "buscar_receitas",
                  arguments: JSON.stringify({ start: `2026-08-0${callCounter}`, end: "2026-08-30" }),
                },
              },
            ],
          },
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        });
      }),
    };

    const messages: LlmMessage[] = [{ role: "user", content: "Buscar tudo" }];

    const result = await runOrchestratorTurn(
      messages,
      mockContext,
      mockCatalog,
      mockRunner,
      { maxToolIterations: 3 },
    );

    expect(result.iterations).toBe(3);
    expect(result.maxIterationsReached).toBe(true);
    expect(result.errorCode).toBe("WALLET_AI_MAX_ITERATIONS_REACHED");
  });

  it("deve interromper execução com WALLET_AI_TOOL_LIMIT_REACHED quando limite de tool calls por turno é atingido", async () => {
    const mockCatalog: QueryToolCatalog = {
      buscar_receitas: vi.fn().mockImplementation(() =>
        Promise.resolve({
          tool: "buscar_receitas",
          period: null,
          filters: { user_id: "user-test", workspace_id: "workspace-test" },
          data: [],
          sources: [],
          formulas: {},
          warnings: [],
        }),
      ),
    };

    // LLM retorna 4 tool calls válidas distintas de uma vez, mas limite por turno é 2
    const mockRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "buscar_receitas", arguments: '{"page":1}' } },
            { id: "call_2", type: "function", function: { name: "buscar_receitas", arguments: '{"page":2}' } },
            { id: "call_3", type: "function", function: { name: "buscar_receitas", arguments: '{"page":3}' } },
            { id: "call_4", type: "function", function: { name: "buscar_receitas", arguments: '{"page":4}' } },
          ],
        },
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      }),
    };

    const messages: LlmMessage[] = [{ role: "user", content: "Buscar páginas" }];

    const result = await runOrchestratorTurn(
      messages,
      mockContext,
      mockCatalog,
      mockRunner,
      { maxToolIterations: 5, maxToolCallsPerTurn: 2 },
    );

    expect(result.toolCallsLimitReached).toBe(true);
    expect(result.errorCode).toBe("WALLET_AI_TOOL_LIMIT_REACHED");
    expect(result.toolCallsExecuted.length).toBe(2);
    expect(result.loopDetected).toBeFalsy();
    expect(result.maxIterationsReached).toBeFalsy();
    expect(result.finalMessage.content).toContain("limite de segurança de chamadas a ferramentas");
  });

  it("deve provar que os 3 limites (loop, tool calls, iterations) são mutuamente independentes", async () => {
    const testCatalog: QueryToolCatalog = {
      buscar_saldo: vi.fn().mockResolvedValue({
        tool: "buscar_saldo",
        period: null,
        filters: { user_id: "user-test", workspace_id: "workspace-test" },
        data: { saldo_total: 1000 },
        sources: [],
        formulas: {},
        warnings: [],
      }) as any,
    };

    // 1. Loop detection dispara imediatamente sem depender de maxIterations ou tool limit
    const loopRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_a", type: "function", function: { name: "buscar_saldo", arguments: "{}" } },
            { id: "call_b", type: "function", function: { name: "buscar_saldo", arguments: "{}" } },
          ],
        },
        usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      }),
    };

    const loopRes = await runOrchestratorTurn(
      [{ role: "user", content: "Saldo" }],
      mockContext,
      testCatalog,
      loopRunner,
      { maxToolIterations: 10, maxToolCallsPerTurn: 20 },
    );
    expect(loopRes.loopDetected).toBe(true);
    expect(loopRes.toolCallsLimitReached).toBeFalsy();
    expect(loopRes.maxIterationsReached).toBeFalsy();
    expect(loopRes.errorCode).toBe("WALLET_AI_LOOP_DETECTED");
  });
});
