/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  calculateEstimatedCost,
  createCostTelemetryRecord,
} from "../../../../supabase/functions/_shared/ai/cost-calculator";
import {
  ALLOWED_MODELS,
  validateAndResolveModel,
  AiModelNotAllowedError,
} from "../../../../supabase/functions/_shared/ai/model-policy";
import {
  AiLoopDetector,
  redactSensitiveAiData,
  redactString,
} from "../../../../supabase/functions/_shared/ai/audit-observability";
import { CANONICAL_ACTIONS } from "../../../../supabase/functions/_shared/ai/action-types";
import {
  runOrchestratorTurn,
  type LlmRunner,
} from "../../../../supabase/functions/_shared/ai/orchestrator-core";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth";
import type { QueryToolCatalog } from "../../../../supabase/functions/_shared/ai/query-tools";

const mockContext: AiExecutionContext = {
  userId: "user-cost-test",
  workspaceId: "ws-cost-test",
  accessToken: "token-test",
  correlationId: "corr-12345",
  conversationId: "conv-67890",
};

describe("ETAPA 9.6 - Cost Telemetry, Observability & Guardrails", () => {
  describe("1. Centralized Cost Calculator", () => {
    it("deve calcular o custo estimado exato para gpt-4o-mini", () => {
      // gpt-4o-mini: input = 0.15/M, output = 0.60/M
      const cost = calculateEstimatedCost("gpt-4o-mini", {
        promptTokens: 10_000, // 10k * 0.15 / 1M = 0.0015
        completionTokens: 2_000, // 2k * 0.60 / 1M = 0.0012
        totalTokens: 12_000,
      });

      expect(cost).toBe(0.0027);
    });

    it("deve calcular o custo estimado exato para gpt-4o", () => {
      // gpt-4o: input = 2.50/M, output = 10.00/M
      const cost = calculateEstimatedCost("gpt-4o", {
        promptTokens: 100_000, // 100k * 2.50 / 1M = 0.25
        completionTokens: 50_000, // 50k * 10.00 / 1M = 0.50
        totalTokens: 150_000,
      });

      expect(cost).toBe(0.75);
    });

    it("deve retornar zero quando usage for nulo, indefinido ou vazio", () => {
      expect(calculateEstimatedCost("gpt-4o-mini", null)).toBe(0);
      expect(calculateEstimatedCost("gpt-4o-mini", undefined)).toBe(0);
      expect(calculateEstimatedCost("gpt-4o-mini", {})).toBe(0);
      expect(calculateEstimatedCost("gpt-4o-mini", { promptTokens: 0, completionTokens: 0 })).toBe(0);
    });

    it("deve usar fallback seguro de precificação se modelo não for encontrado", () => {
      const cost = calculateEstimatedCost("modelo-desconhecido-xyz", {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      });

      // Fallback para gpt-4o-mini: 0.15 + 0.60 = 0.75
      expect(cost).toBe(0.75);
    });

    it("deve construir registro de telemetria completo sem campos vazios", () => {
      const record = createCostTelemetryRecord({
        model: "gemini-1.5-flash",
        usage: { promptTokens: 5000, completionTokens: 1000, totalTokens: 6000 },
        durationMs: 450,
        correlationId: "corr-telemetry",
        workspaceId: "ws-telemetry",
        conversationId: "conv-telemetry",
      });

      expect(record.provider).toBe("google");
      expect(record.model).toBe("gemini-1.5-flash");
      expect(record.prompt_tokens).toBe(5000);
      expect(record.completion_tokens).toBe(1000);
      expect(record.total_tokens).toBe(6000);
      expect(record.estimated_cost_usd).toBeGreaterThan(0);
      expect(record.duration_ms).toBe(450);
      expect(record.correlation_id).toBe("corr-telemetry");
      expect(record.workspace_id).toBe("ws-telemetry");
      expect(record.conversation_id).toBe("conv-telemetry");
    });
  });

  describe("2. Server-side Model Allowlist & Policy", () => {
    it("deve validar modelos permitidos na allowlist", () => {
      for (const model of ALLOWED_MODELS) {
        expect(validateAndResolveModel(model)).toBe(model);
      }
    });

    it("deve aplicar fallback para o modelo padrão quando solicitado vazio", () => {
      expect(validateAndResolveModel("", { task: "chat" })).toBe("gpt-4o-mini");
      expect(validateAndResolveModel(undefined, { task: "complex" })).toBe("gpt-4o");
      expect(validateAndResolveModel(undefined, { task: "document" })).toBe("gemini-1.5-flash");
      expect(validateAndResolveModel(undefined, { task: "summary" })).toBe("gpt-4o-mini");
    });

    it("deve lançar AiModelNotAllowedError em modo estrito para modelo inválido", () => {
      expect(() => {
        validateAndResolveModel("gpt-3.5-turbo-unauthorized", { fallbackToDefault: false });
      }).toThrow(AiModelNotAllowedError);
    });
  });

  describe("3. Runaway Loop & Tool Calls Budget Guardrails", () => {
    it("deve detectar chamada duplicada consecutiva de ferramenta com mesmos argumentos (loop detector)", () => {
      const detector = new AiLoopDetector(8);

      const r1 = detector.recordToolCall("consultar_saldos", { workspace_id: "ws-1" });
      expect(r1.loopDetected).toBe(false);

      const r2 = detector.recordToolCall("consultar_saldos", { workspace_id: "ws-1" });
      expect(r2.loopDetected).toBe(true);
    });

    it("deve respeitar MAX_TOOL_CALLS_PER_TURN (teto explícito de ferramentas)", () => {
      const detector = new AiLoopDetector(3);

      detector.recordToolCall("tool_1", { a: 1 });
      detector.recordToolCall("tool_2", { a: 2 });
      detector.recordToolCall("tool_3", { a: 3 });

      const r4 = detector.recordToolCall("tool_4", { a: 4 });
      expect(r4.limitReached).toBe(true);
    });

    it("deve encerrar o turno com status toolCallsLimitReached quando atingir maxToolCallsPerTurn", async () => {
      const mockCatalog: QueryToolCatalog = {
        buscar_receitas: vi.fn().mockResolvedValue({ data: [] }),
      };

      // LLM envia 5 tool calls de uma vez
      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn().mockResolvedValue({
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "buscar_receitas", arguments: '{"i":1}' } },
              { id: "call_2", type: "function", function: { name: "buscar_receitas", arguments: '{"i":2}' } },
              { id: "call_3", type: "function", function: { name: "buscar_receitas", arguments: '{"i":3}' } },
              { id: "call_4", type: "function", function: { name: "buscar_receitas", arguments: '{"i":4}' } },
            ],
          },
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        }),
      };

      const result = await runOrchestratorTurn(
        [{ role: "user", content: "Buscar lote" }],
        mockContext,
        mockCatalog,
        mockRunner,
        { maxToolCallsPerTurn: 2 }, // Limite restrito a 2
      );

      expect(result.toolCallsLimitReached).toBe(true);
      expect(result.toolCallsExecuted).toHaveLength(2);
      expect(result.finalMessage.content).toContain("limite de segurança");
    });
  });

  describe("4. Log Redaction (Zero Token Leaks in Audit)", () => {
    it("deve redigir bot tokens do Telegram", () => {
      const text = "Erro ao enviar com bot123456789:ABCDefGhIjKlmnOpQrStUvWxYz-123456 no chat 999";
      const redacted = redactString(text);
      expect(redacted).not.toContain("123456789:ABCDefGhIjKlmnOpQrStUvWxYz");
      expect(redacted).toContain("[REDACTED_BOT_TOKEN]");
    });

    it("deve redigir API keys da OpenAI e Google", () => {
      const text = "Usando key sk-proj-1234567890abcdefghijklmn e AIzaSyA1234567890abcdefghijklmn para chamada";
      const redacted = redactString(text);
      expect(redacted).not.toContain("sk-proj-1234567890abcdefghijklmn");
      expect(redacted).not.toContain("AIzaSyA1234567890abcdefghijklmn");
      expect(redacted).toContain("[REDACTED_API_KEY]");
    });

    it("deve redigir Authorization headers com Bearer token", () => {
      const text = "Request header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ";
      const redacted = redactString(text);
      expect(redacted).not.toContain("eyJhbGciOiJIUzI1Ni");
      expect(redacted).toContain("Bearer [REDACTED_TOKEN]");
    });

    it("deve redigir base64 data URLs e payloads extensos", () => {
      const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const redacted = redactString(dataUrl);
      expect(redacted).not.toContain("iVBORw0KGgoAAAANSUhEUg");
      expect(redacted).toContain("[REDACTED_BASE64_DATA]");
    });

    it("deve redigir linhas digitáveis de boletos bancários", () => {
      const linha = "Boleto emitido com sucesso: 34191.79001 01043.510047 91020.150008 5 99990000010000";
      const redacted = redactString(linha);
      expect(redacted).not.toContain("34191.79001");
      expect(redacted).toContain("[REDACTED_LINHA_DIGITAVEL]");
    });

    it("deve redigir recursivamente chaves de objetos com nomes sensíveis", () => {
      const sensitiveObj = {
        user: "admin",
        password: "SuperSecretPassword123",
        api_key: "sk-secret-123",
        metadata: {
          bot_token: "bot987654:ABC-DEF-GHI",
          nested: {
            auth_header: "Bearer secret-jwt",
          },
        },
      };

      const sanitized = redactSensitiveAiData(sensitiveObj) as any;
      expect(sanitized.password).toBe("[REDACTED_SECRET]");
      expect(sanitized.api_key).toBe("[REDACTED_SECRET]");
      expect(sanitized.metadata.bot_token).toBe("[REDACTED_SECRET]");
      expect(sanitized.metadata.nested.auth_header).toBe("[REDACTED_SECRET]");
      expect(sanitized.user).toBe("admin");
    });
  });

  describe("5. RequiredPermission Audit & Pure RBAC Integrity", () => {
    it("deve confirmar que atualizar_custo_produto_eyemobile não tem requiredPermission", () => {
      const action = CANONICAL_ACTIONS.atualizar_custo_produto_eyemobile;
      expect(action).toBeDefined();
      expect(action.actionType).toBe("atualizar_custo_produto_eyemobile");
      expect(action.executionPolicy).toBe("proposal_only");
      expect(action.requiredPermission).toBeUndefined();
    });

    it("deve manter exatamente os 13 Action Types canônicos", () => {
      const actionKeys = Object.keys(CANONICAL_ACTIONS);
      expect(actionKeys).toHaveLength(13);
      expect(actionKeys).toContain("atualizar_custo_produto_eyemobile");
      expect(actionKeys).toContain("deletar_transacao");
      expect(CANONICAL_ACTIONS.deletar_transacao.blocked).toBe(true);
    });
  });

  describe("6. Correlation & Conversation Propagation", () => {
    it("deve preservar correlation_id e conversation_id originais no contexto do turno", async () => {
      const mockCatalog: QueryToolCatalog = {};
      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn().mockResolvedValue({
          message: { role: "assistant", content: "Resposta rápida" },
          usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        }),
      };

      const result = await runOrchestratorTurn(
        [{ role: "user", content: "Olá" }],
        mockContext,
        mockCatalog,
        mockRunner,
      );

      expect(mockContext.correlationId).toBe("corr-12345");
      expect(mockContext.conversationId).toBe("conv-67890");
      expect(result.finalMessage.content).toBe("Resposta rápida");
    });
  });
});
