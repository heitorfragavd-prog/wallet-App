/**
 * Testes da Etapa 1.5 — Fallback Automático OpenAI -> Gemini
 *
 * Cenários obrigatórios:
 * A. OpenAI OK -> Gemini não chamado
 * B. OpenAI quota 429 -> Gemini chamado -> resposta válida
 * C. OpenAI timeout -> Gemini chamado
 * D. OpenAI 500 -> Gemini chamado
 * E. OpenAI tool error -> Gemini NÃO chamado por causa desse erro (continua com OpenAI)
 * F. OpenAI falha + Gemini falha -> erro explícito + correlation_id
 * G. contexto/workspace iguais nos dois providers
 * H. tools financeiras disponíveis no fallback Gemini
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmMessage, LlmRunner, LlmResponse } from "../../../../supabase/functions/_shared/ai/orchestrator-core";
import { runOrchestratorTurn } from "../../../../supabase/functions/_shared/ai/orchestrator-core";
import { FailoverLlmRunner } from "../../../../supabase/functions/_shared/ai/failover-runner";
import { createQueryToolCatalog } from "../../../../supabase/functions/_shared/ai/query-tools";
import type { FinancialQueryRepository } from "../../../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth";
import type { OpenAiFunctionDefinition } from "../../../../supabase/functions/_shared/ai/openai-tools-definition";
import { handleOrchestratorHttpRequest } from "../../../../supabase/functions/wallet-ai-orchestrator/handler";

const validContext: AiExecutionContext = {
  userId: "user-test-uuid",
  workspaceId: "ws-test-uuid",
};

function createMockRepository(): FinancialQueryRepository {
  return {
    listRevenues: vi.fn().mockResolvedValue([
      {
        id: "rev-1",
        sourceType: "receita",
        sourceId: "rev-1",
        workspaceId: "ws-test-uuid",
        userId: "user-test-uuid",
        kind: "income",
        amount: 1500,
        occurredOn: "2026-08-27",
        deduplicationKey: "receita:rev-1",
        description: "Receita de Venda",
      },
    ]),
    listExpenses: vi.fn().mockResolvedValue([]),
    listTransactions: vi.fn().mockResolvedValue([]),
    listBalances: vi.fn().mockResolvedValue([]),
    listDebts: vi.fn().mockResolvedValue([]),
    listSalesPDV: vi.fn().mockResolvedValue([
      {
        id: "sale-1",
        sourceType: "transacao",
        sourceId: "sale-1",
        workspaceId: "ws-test-uuid",
        userId: "user-test-uuid",
        kind: "income",
        amount: 2000,
        occurredOn: "2026-08-27",
        deduplicationKey: "transacao:sale-1",
        description: "Venda Eyemobile #123",
      },
    ]),
  };
}

describe("Etapa 1.5 — Fallback Automático OpenAI -> Gemini", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // A. OpenAI OK -> Gemini não chamado
  // ──────────────────────────────────────────────────────────────────────────
  it("A: OpenAI responde com sucesso -> Gemini NUNCA é chamado, provider='openai', fallback=false", async () => {
    const primaryRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "Saldo atual é R$ 5.000,00." },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      } satisfies LlmResponse),
    };

    const fallbackRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "Resposta Gemini" },
      } satisfies LlmResponse),
    };

    const runner = new FailoverLlmRunner({ primaryRunner, fallbackRunner });
    const catalog = createQueryToolCatalog(createMockRepository());

    const result = await runOrchestratorTurn(
      [{ role: "user", content: "Qual meu saldo?" }],
      validContext,
      catalog,
      runner,
    );

    expect(primaryRunner.generateCompletion).toHaveBeenCalledOnce();
    expect(fallbackRunner.generateCompletion).not.toHaveBeenCalled();
    expect(result.finalMessage.content).toBe("Saldo atual é R$ 5.000,00.");
    expect(result.provider).toBe("openai");
    expect(result.fallback).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // B. OpenAI quota 429 -> Gemini chamado -> resposta válida
  // ──────────────────────────────────────────────────────────────────────────
  it("B: OpenAI falha com 429/quota -> Gemini é chamado e responde com sucesso, provider='gemini', fallback=true", async () => {
    const primaryRunner: LlmRunner = {
      generateCompletion: vi.fn().mockRejectedValue(new Error("openai_quota_exceeded")),
    };

    const fallbackRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "Seu faturamento hoje foi R$ 2.000,00." },
        usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
      } satisfies LlmResponse),
    };

    let failoverEventReason = "";
    const runner = new FailoverLlmRunner({
      primaryRunner,
      fallbackRunner,
      onFailover: (reason) => {
        failoverEventReason = reason;
      },
    });

    const catalog = createQueryToolCatalog(createMockRepository());

    const result = await runOrchestratorTurn(
      [{ role: "user", content: "Quanto vendi hoje?" }],
      validContext,
      catalog,
      runner,
    );

    expect(primaryRunner.generateCompletion).toHaveBeenCalledOnce();
    expect(fallbackRunner.generateCompletion).toHaveBeenCalledOnce();
    expect(result.finalMessage.content).toBe("Seu faturamento hoje foi R$ 2.000,00.");
    expect(result.provider).toBe("gemini");
    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toBe("openai_quota_exceeded");
    expect(failoverEventReason).toBe("openai_quota_exceeded");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // C. OpenAI timeout -> Gemini chamado
  // ──────────────────────────────────────────────────────────────────────────
  it("C: OpenAI sofre timeout -> Gemini é chamado como fallback", async () => {
    const primaryRunner: LlmRunner = {
      generateCompletion: vi.fn().mockRejectedValue(new Error("openai_timeout")),
    };

    const fallbackRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "Resposta recuperada via Gemini após timeout." },
      } satisfies LlmResponse),
    };

    const runner = new FailoverLlmRunner({ primaryRunner, fallbackRunner });
    const catalog = createQueryToolCatalog(createMockRepository());

    const result = await runOrchestratorTurn(
      [{ role: "user", content: "Explique minhas finanças" }],
      validContext,
      catalog,
      runner,
    );

    expect(fallbackRunner.generateCompletion).toHaveBeenCalledOnce();
    expect(result.provider).toBe("gemini");
    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toBe("openai_timeout");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // D. OpenAI 500 -> Gemini chamado
  // ──────────────────────────────────────────────────────────────────────────
  it("D: OpenAI retorna erro 500 transitório -> Gemini é chamado como fallback", async () => {
    const primaryRunner: LlmRunner = {
      generateCompletion: vi.fn().mockRejectedValue(new Error("openai_api_error_500")),
    };

    const fallbackRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "Resposta Gemini pós erro 500." },
      } satisfies LlmResponse),
    };

    const runner = new FailoverLlmRunner({ primaryRunner, fallbackRunner });
    const catalog = createQueryToolCatalog(createMockRepository());

    const result = await runOrchestratorTurn(
      [{ role: "user", content: "Relatório de receitas" }],
      validContext,
      catalog,
      runner,
    );

    expect(fallbackRunner.generateCompletion).toHaveBeenCalledOnce();
    expect(result.provider).toBe("gemini");
    expect(result.fallback).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E. OpenAI tool error -> Gemini NÃO chamado por causa desse erro
  // ──────────────────────────────────────────────────────────────────────────
  it("E: Erro na execução de tool financeira -> Gemini NÃO é chamado; OpenAI lida com o output de erro da tool", async () => {
    const failingRepo = createMockRepository();
    // Força a tool a falhar no repository
    failingRepo.listRevenues = vi.fn().mockRejectedValue(new Error("financial_query_failed"));

    const primaryRunner: LlmRunner = {
      // 1ª chamada: OpenAI decide chamar a tool buscar_receitas
      // 2ª chamada: OpenAI recebe a mensagem de erro da tool e responde ao usuário
      generateCompletion: vi
        .fn()
        .mockResolvedValueOnce({
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "buscar_receitas",
                  arguments: JSON.stringify({ start: "2026-08-01", end: "2026-08-27" }),
                },
              },
            ],
          },
        } satisfies LlmResponse)
        .mockResolvedValueOnce({
          message: {
            role: "assistant",
            content: "Não foi possível consultar as receitas no momento devido a uma instabilidade no banco de dados.",
          },
        } satisfies LlmResponse),
    };

    const fallbackRunner: LlmRunner = {
      generateCompletion: vi.fn(),
    };

    const runner = new FailoverLlmRunner({ primaryRunner, fallbackRunner });
    const catalog = createQueryToolCatalog(failingRepo);

    const result = await runOrchestratorTurn(
      [{ role: "user", content: "Quanto tive de receita este mês?" }],
      validContext,
      catalog,
      runner,
    );

    // OpenAI foi chamado 2 vezes (antes e após a tool)
    expect(primaryRunner.generateCompletion).toHaveBeenCalledTimes(2);
    // Gemini NUNCA foi chamado porque o provedor OpenAI não falhou
    expect(fallbackRunner.generateCompletion).not.toHaveBeenCalled();
    expect(result.provider).toBe("openai");
    expect(result.fallback).toBe(false);
    expect(result.finalMessage.content).toContain("Não foi possível consultar as receitas");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // F. OpenAI falha + Gemini falha -> erro explícito + correlation_id
  // ──────────────────────────────────────────────────────────────────────────
  it("F: Ambos OpenAI e Gemini falham -> lança erro com correlação sem crash silencioso", async () => {
    const primaryRunner: LlmRunner = {
      generateCompletion: vi.fn().mockRejectedValue(new Error("openai_quota_exceeded")),
    };

    const fallbackRunner: LlmRunner = {
      generateCompletion: vi.fn().mockRejectedValue(new Error("gemini_rate_limit")),
    };

    const runner = new FailoverLlmRunner({ primaryRunner, fallbackRunner });
    const catalog = createQueryToolCatalog(createMockRepository());

    await expect(
      runOrchestratorTurn(
        [{ role: "user", content: "Qual meu saldo?" }],
        validContext,
        catalog,
        runner,
      ),
    ).rejects.toThrow(/all_llm_providers_failed/);

    // Teste no HTTP Handler: garante correlation_id retornado no body HTTP 500
    const validWsUuid = "11111111-2222-3333-8444-555555555555";
    const authDeps = {
      getUser: vi.fn().mockResolvedValue({ id: "11111111-2222-3333-8444-111111111111" }),
      findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWsUuid }),
    };

    const req = new Request("http://localhost/wallet-ai-orchestrator", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: validWsUuid,
        messages: [{ role: "user", content: "Qual meu saldo?" }],
      }),
    });

    const resp = await handleOrchestratorHttpRequest(req, {
      authDeps,
      repoFactory: () => createMockRepository(),
      runnerFactory: () => runner,
    });

    expect(resp.status).toBe(500);

    const json = await resp.json();
    expect(json.success).toBe(false);
    expect(json.correlation_id).toBeDefined();
    expect(typeof json.correlation_id).toBe("string");
    expect(json.correlation_id.length).toBeGreaterThanOrEqual(6);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // G. Contexto e Workspace rigorosamente idênticos nos dois provedores
  // ──────────────────────────────────────────────────────────────────────────
  it("G: O Gemini recebe o mesmo contexto, mesmo workspaceId e mesmo histórico que a OpenAI", async () => {
    const primaryRunner: LlmRunner = {
      generateCompletion: vi.fn().mockRejectedValue(new Error("openai_quota_exceeded")),
    };

    let capturedMessages: LlmMessage[] = [];
    const fallbackRunner: LlmRunner = {
      generateCompletion: vi.fn().mockImplementation((msgs) => {
        capturedMessages = msgs;
        return Promise.resolve({
          message: { role: "assistant", content: "Resposta Gemini contextualizada." },
        } satisfies LlmResponse);
      }),
    };

    const runner = new FailoverLlmRunner({ primaryRunner, fallbackRunner });
    const catalog = createQueryToolCatalog(createMockRepository());

    const incomingMessages: LlmMessage[] = [
      { role: "user", content: "Primeira pergunta" },
      { role: "assistant", content: "Primeira resposta" },
      { role: "user", content: "Segunda pergunta" },
    ];

    await runOrchestratorTurn(incomingMessages, validContext, catalog, runner);

    // Verifica se o system prompt foi injetado como primeira mensagem no Gemini
    expect(capturedMessages[0].role).toBe("system");
    expect(capturedMessages[0].content).toContain("Wallet Finance Agent V2");
    // Verifica se o histórico completo foi repassado
    expect(capturedMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Primeira pergunta" }),
        expect.objectContaining({ role: "assistant", content: "Primeira resposta" }),
        expect.objectContaining({ role: "user", content: "Segunda pergunta" }),
      ]),
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // H. Tools financeiras disponíveis no fallback Gemini
  // ──────────────────────────────────────────────────────────────────────────
  it("H: Gemini consegue chamar tools financeiras (ex: buscar_vendas_pdv) normalmente", async () => {
    const repo = createMockRepository();

    const primaryRunner: LlmRunner = {
      generateCompletion: vi.fn().mockRejectedValue(new Error("openai_quota_exceeded")),
    };

    let toolsPassedToGemini: OpenAiFunctionDefinition[] = [];

    const fallbackRunner: LlmRunner = {
      // 1ª chamada Gemini: decide chamar buscar_vendas_pdv
      // 2ª chamada Gemini: consolida com o total bruto
      generateCompletion: vi
        .fn()
        .mockImplementationOnce((_msgs, tools) => {
          toolsPassedToGemini = tools;
          return Promise.resolve({
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "gemini-call-1",
                  type: "function",
                  function: {
                    name: "buscar_vendas_pdv",
                    arguments: JSON.stringify({ start: "2026-08-27", end: "2026-08-27" }),
                  },
                },
              ],
            },
          } satisfies LlmResponse);
        })
        .mockImplementationOnce((_msgs) => {
          return Promise.resolve({
            message: {
              role: "assistant",
              content: "Suas vendas brutas no PDV hoje totalizaram R$ 2.000,00.",
            },
          } satisfies LlmResponse);
        }),
    };

    const runner = new FailoverLlmRunner({ primaryRunner, fallbackRunner });
    const catalog = createQueryToolCatalog(repo);

    const result = await runOrchestratorTurn(
      [{ role: "user", content: "Quanto a loja vendeu hoje?" }],
      validContext,
      catalog,
      runner,
    );

    // Confirma que as tools financeiras foram passadas ao Gemini
    expect(toolsPassedToGemini.some((t) => t.function.name === "buscar_vendas_pdv")).toBe(true);
    expect(toolsPassedToGemini.some((t) => t.function.name === "buscar_receitas")).toBe(true);

    // Confirma que a tool foi de fato executada pelo catalog durante o turno do Gemini
    expect(repo.listSalesPDV).toHaveBeenCalledOnce();
    expect(result.toolCallsExecuted).toHaveLength(1);
    expect(result.toolCallsExecuted[0].tool).toBe("buscar_vendas_pdv");
    expect(result.provider).toBe("gemini");
    expect(result.fallback).toBe(true);
    expect(result.finalMessage.content).toContain("R$ 2.000,00");
  });
});
