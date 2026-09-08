import { describe, expect, it, vi } from "vitest";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth";
import { OPENAI_FINANCIAL_TOOLS } from "../../../../supabase/functions/_shared/ai/openai-tools-definition";
import { dispatchOpenAiToolCall } from "../../../../supabase/functions/_shared/ai/tool-dispatcher";
import type { QueryToolCatalog } from "../../../../supabase/functions/_shared/ai/query-tools";

const mockContext: AiExecutionContext = {
  userId: "user-123",
  workspaceId: "workspace-abc",
  accessToken: "token-xyz",
};

describe("OpenAI Financial Tools Definitions", () => {
  it("deve conter exatamente as 7 ferramentas de leitura da camada canônica", () => {
    const toolNames = OPENAI_FINANCIAL_TOOLS.map((t) => t.function.name);
    expect(toolNames).toEqual([
      "buscar_receitas",
      "buscar_vendas_pdv",
      "buscar_despesas",
      "buscar_transacoes",
      "consultar_saldos",
      "consultar_dividas",
      "consultar_resumo_mensal",
    ]);
  });


  it("cada ferramenta deve conter description e parameters válidos", () => {
    for (const tool of OPENAI_FINANCIAL_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeDefined();
      expect(tool.function.parameters.type).toBe("object");
    }
  });
});

describe("dispatchOpenAiToolCall", () => {
  it("deve executar ferramenta válida com argumentos válidos", async () => {
    const mockCatalog: QueryToolCatalog = {
      buscar_receitas: vi.fn().mockResolvedValue({
        tool: "buscar_receitas",
        period: { start: "2026-08-01", end: "2026-08-15" },
        filters: { user_id: "user-123", workspace_id: "workspace-abc" },
        data: [{ id: "rec-1", amount: 1500 }],
        sources: [{ type: "receita", ids: ["rec-1"] }],
        formulas: {},
        warnings: [],
      }),
    };

    const toolCall = {
      id: "call_123",
      type: "function" as const,
      function: {
        name: "buscar_receitas",
        arguments: JSON.stringify({ start: "2026-08-01", end: "2026-08-15" }),
      },
    };

    const result = await dispatchOpenAiToolCall(toolCall, mockContext, mockCatalog);

    expect(result.tool_call_id).toBe("call_123");
    expect(result.name).toBe("buscar_receitas");
    const parsedContent = JSON.parse(result.content);
    expect(parsedContent.tool).toBe("buscar_receitas");
    expect(parsedContent.data).toEqual([{ id: "rec-1", amount: 1500 }]);
    expect(mockCatalog.buscar_receitas).toHaveBeenCalledWith(
      { start: "2026-08-01", end: "2026-08-15" },
      mockContext,
    );
  });

  it("deve tratar JSON inválido nos argumentos da tool call", async () => {
    const mockCatalog: QueryToolCatalog = {};
    const toolCall = {
      id: "call_invalid_json",
      type: "function" as const,
      function: {
        name: "buscar_receitas",
        arguments: "invalid json string {",
      },
    };

    const result = await dispatchOpenAiToolCall(toolCall, mockContext, mockCatalog);

    expect(result.tool_call_id).toBe("call_invalid_json");
    const parsedContent = JSON.parse(result.content);
    expect(parsedContent.error).toBe("invalid_tool_arguments");
  });

  it("deve retornar erro se a ferramenta não for permitida ou não existir", async () => {
    const mockCatalog: QueryToolCatalog = {};
    const toolCall = {
      id: "call_unknown",
      type: "function" as const,
      function: {
        name: "executar_pagamento_desconhecido",
        arguments: "{}",
      },
    };

    const result = await dispatchOpenAiToolCall(toolCall, mockContext, mockCatalog);

    expect(result.tool_call_id).toBe("call_unknown");
    const parsedContent = JSON.parse(result.content);
    expect(parsedContent.error).toBe("tool_not_allowed");
  });
});
