import { describe, it, expect, vi } from "vitest";
import {
  buildWalletCeoPrompt,
  buildWalletOperationalPrompt,
  buildSystemPrompt,
  WALLET_CEO_SYSTEM_PROMPT,
  WALLET_OPERATIONAL_SYSTEM_PROMPT,
  type LlmRunner,
  type LlmMessage,
} from "../../supabase/functions/_shared/ai/orchestrator-core";
import {
  canRoleAccessCeoBrain,
  type AuthorizationDependencies,
} from "../../supabase/functions/_shared/ai/auth";
import { handleOrchestratorHttpRequest } from "../../supabase/functions/wallet-ai-orchestrator/handler";
import { WalletAiOrchestratorClient } from "../../src/domains/ia/services/WalletAiOrchestratorClient";
import type { FinancialQueryRepository } from "../../supabase/functions/_shared/ai/query-tools";
import fs from "node:fs";
import path from "node:path";

describe("👑 WALLET CEO 3.0 — Governança e Hardening dos Dois Cérebros (Etapa 03)", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const validConversationId = "22222222-2222-4222-8222-222222222222";

  const createMockAuthDeps = (role: string): AuthorizationDependencies => ({
    getUser: vi.fn().mockResolvedValue({ id: "user-123", email: "user@test.com" }),
    findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, user_id: "user-123" }),
    verifyConversationOwnership: vi.fn().mockResolvedValue(true),
    getUserRole: vi.fn().mockResolvedValue(role),
  });

  const mockRepo: FinancialQueryRepository = {
    listRevenues: vi.fn().mockResolvedValue([]),
    listExpenses: vi.fn().mockResolvedValue([]),
    listTransactions: vi.fn().mockResolvedValue([]),
    listBalances: vi.fn().mockResolvedValue([]),
    listDebts: vi.fn().mockResolvedValue([]),
  };

  const createMockRunner = (capturedTurnMessages?: LlmMessage[]): LlmRunner => ({
    generateCompletion: vi.fn().mockImplementation(async (msgs: LlmMessage[]) => {
      if (capturedTurnMessages) {
        capturedTurnMessages.push(...msgs);
      }
      return {
        message: { role: "assistant", content: "Resposta executiva/operacional simulada" },
        usage: { promptTokens: 25, completionTokens: 10, totalTokens: 35 },
      };
    }),
  });

  // ─── GATE 0: AUTORIZAÇÃO EXECUTIVA SERVER-SIDE NO BACKEND ───────────────
  describe("Gate 0 — Autorização Executiva no Backend (Server-Side Guard)", () => {
    it("deve autorizar apenas papéis executivos com canRoleAccessCeoBrain", () => {
      expect(canRoleAccessCeoBrain("owner")).toBe(true);
      expect(canRoleAccessCeoBrain("proprietario")).toBe(true);
      expect(canRoleAccessCeoBrain("admin")).toBe(true);
      expect(canRoleAccessCeoBrain("administrador")).toBe(true);

      // Papéis operacionais e sócias sem papel executivo devem ser negados
      expect(canRoleAccessCeoBrain("member")).toBe(false);
      expect(canRoleAccessCeoBrain("socia_operacional")).toBe(false);
      expect(canRoleAccessCeoBrain("operador")).toBe(false);
      expect(canRoleAccessCeoBrain("atendente")).toBe(false);
      expect(canRoleAccessCeoBrain("caixa")).toBe(false);
      expect(canRoleAccessCeoBrain("delivery")).toBe(false);
      expect(canRoleAccessCeoBrain("")).toBe(false);
      expect(canRoleAccessCeoBrain(undefined)).toBe(false);
    });

    it("Proprietário autorizado enviando agent_type = 'ceo' deve receber 200 OK", async () => {
      const runnerMessages: LlmMessage[] = [];
      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Qual o diagnóstico executivo?" }],
          agent_type: "ceo",
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("owner"),
        repoFactory: () => mockRepo,
        runnerFactory: () => createMockRunner(runnerMessages),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; message: { content: string } };
      expect(data.success).toBe(true);
      expect(runnerMessages[0]?.role).toBe("system");
      expect(runnerMessages[0]?.content).toContain("WALLET CEO 3.0");
    });

    it("Sócia sem autorização executiva (role: 'member') com agent_type = 'ceo' deve ser rejeitada com 403 Forbidden", async () => {
      const runnerCalled = vi.fn();
      const mockAudit = { logEvent: vi.fn() };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token-member",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Analise o faturamento" }],
          agent_type: "ceo",
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("member"),
        repoFactory: () => mockRepo,
        runnerFactory: () => ({ generateCompletion: runnerCalled }) as unknown as LlmRunner,
        auditLogger: mockAudit,
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { success: boolean; code: string; error: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe("WALLET_AI_FORBIDDEN");
      expect(body.error).toBe("forbidden_ceo_access");
      // O modelo LLM NÃO deve ser chamado
      expect(runnerCalled).not.toHaveBeenCalled();
      // Deve registrar auditoria da tentativa de acesso indevido
      expect(mockAudit.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: "WALLET_AI_FORBIDDEN",
          toolName: "wallet_ai_ceo_access_denied",
        })
      );
    });

    it("Funcionário operacional (role: 'operador') com agent_type = 'ceo' deve ser rejeitado com 403 Forbidden", async () => {
      const runnerCalled = vi.fn();
      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token-operator",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Ver faturamento" }],
          agent_type: "ceo",
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("operador"),
        repoFactory: () => mockRepo,
        runnerFactory: () => ({ generateCompletion: runnerCalled }) as unknown as LlmRunner,
      });

      expect(res.status).toBe(403);
      expect(runnerCalled).not.toHaveBeenCalled();
    });

    it("Tentativa de escalonamento para modelo premium gpt-4o por usuário operacional é contida com segurança", async () => {
      let executedModel: string | undefined;

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token-operator",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quais boletos vencem hoje?" }],
          agent_type: "operational",
          model: "gpt-4o", // Tentativa de forçar modelo premium
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("operador"),
        repoFactory: () => mockRepo,
        runnerFactory: (model) => {
          executedModel = model;
          return createMockRunner();
        },
      });

      expect(res.status).toBe(200);
      // Para o cérebro operacional, deve sofrer fallback automático para o modelo econômico gpt-4o-mini
      expect(executedModel).toBe("gpt-4o-mini");
    });
  });

  // ─── GATE 1: PRIVACIDADE DAS CONVERSAS & RLS ────────────────────────────
  describe("Gate 1 — Privacidade das Conversas (Migration 78)", () => {
    it("deve conter a migration 78 com políticas estritas de isolamento por user_id e is_shared", () => {
      const migrationFile = path.resolve("supabase/migrations/78_privacidade_estrita_conversas_rls.sql");
      expect(fs.existsSync(migrationFile)).toBe(true);

      const migrationContent = fs.readFileSync(migrationFile, "utf8");
      expect(migrationContent).toContain("is_shared boolean NOT NULL DEFAULT false");
      expect(migrationContent).toContain("wallet_ai_conversations_select_strict");
      expect(migrationContent).toContain("wallet_ai_conversations_insert_strict");
      expect(migrationContent).toContain("wallet_ai_conversations_update_strict");
      expect(migrationContent).toContain("wallet_ai_conversations_delete_strict");
      expect(migrationContent).toContain("wallet_ai_messages_select_strict");
      expect(migrationContent).toContain("wallet_ai_messages_insert_strict");
      expect(migrationContent).toContain("wallet_ai_messages_update_strict");
      expect(migrationContent).toContain("wallet_ai_messages_delete_strict");
      // Conversas do CEO nunca são compartilhadas
      expect(migrationContent).toContain("agent_type = 'operational'");
    });
  });

  // ─── GATE 2: MEMÓRIA REAL DOS DOIS CÉREBROS ─────────────────────────────
  describe("Gate 2 — Memória Real dos Dois Cérebros", () => {
    it("deve gerar o System Prompt do CEO com foco executivo, 7 departamentos e métricas estratégicas", () => {
      const prompt = buildWalletCeoPrompt("2026-11-08");

      expect(prompt).toContain("WALLET CEO 3.0 — Cérebro Executivo e Estratégico");
      expect(prompt).toContain("Comercial & Crescimento");
      expect(prompt).toContain("CMV & Precificação");
      expect(prompt).toContain("Perdas & Desperdício");
      expect(prompt).toContain("Laboratório de Experimentos");
      expect(prompt).toContain("SEPARAÇÃO SEMÂNTICA CRÍTICA — VENDAS vs RECEITAS");
      expect(prompt).toContain("Status Honesto de CMV");
      expect(prompt).toContain("NUNCA invente números ou deduções contábeis");
    });

    it("WALLET_CEO_SYSTEM_PROMPT deve ser uma constante ativa no orquestrador", () => {
      expect(WALLET_CEO_SYSTEM_PROMPT).toBeDefined();
      expect(typeof WALLET_CEO_SYSTEM_PROMPT).toBe("string");
      expect(WALLET_CEO_SYSTEM_PROMPT.length).toBeGreaterThan(500);
    });

    it("deve gerar o System Prompt da Wallet IA com foco em rotinas, boletos e conciliações", () => {
      const prompt = buildWalletOperationalPrompt("2026-11-08");

      expect(prompt).toContain("WALLET IA — Cérebro Operacional e Administrativo");
      expect(prompt).toContain("Conferência e conciliação de boletos");
      expect(prompt).toContain("Leitura e processamento de notas fiscais (DANFE)");
      expect(prompt).toContain("Conferência de fechamento de turnos e caixas");
      expect(prompt).toContain("Action Proposal");
      expect(prompt).toContain("NUNCA confirme alterações financeiras diretamente sem a validação visual");
    });

    it("WALLET_OPERATIONAL_SYSTEM_PROMPT deve ser distinto do prompt do CEO", () => {
      expect(WALLET_OPERATIONAL_SYSTEM_PROMPT).not.toEqual(WALLET_CEO_SYSTEM_PROMPT);
      expect(buildSystemPrompt("ceo")).not.toEqual(buildSystemPrompt("operational"));
    });

    it("usuário não pode acessar histórico do CEO através de uma conversa protegida se não for executivo", async () => {
      const mockConvRepo = {
        getConversation: vi.fn().mockResolvedValue({
          id: validConversationId,
          workspace_id: validWorkspaceId,
          user_id: "user-123",
          agent_type: "ceo", // Conversa criada pelo CEO
          summary: "Resumo executivo confidencial",
        }),
        listRecentMessages: vi.fn().mockResolvedValue([]),
        appendMessage: vi.fn(),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token-member",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          conversation_id: validConversationId,
          messages: [{ role: "user", content: "Me mostre o resumo anterior" }],
          agent_type: "operational", // Tenta passar agent_type operacional para acessar conversa CEO
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("member"), // Sócia sem papel executivo
        repoFactory: () => mockRepo,
        runnerFactory: () => createMockRunner(),
        conversationRepo: mockConvRepo as unknown as Parameters<typeof handleOrchestratorHttpRequest>[1]["conversationRepo"],
      });

      // O backend deve impedir o acesso ao histórico do CEO
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string; error: string };
      expect(body.code).toBe("WALLET_AI_FORBIDDEN");
      expect(body.error).toBe("forbidden_ceo_access");
    });
  });

  // ─── GATE 3: TELEMETRIA POR CÉREBRO (agent_brain) ────────────────────────
  describe("Gate 3 — Telemetria de Custos e Registro de agent_brain", () => {
    it("deve registrar telemetria com agentBrain: 'ceo' para chamadas executivas", async () => {
      const mockTelemetry = {
        logTelemetry: vi.fn().mockResolvedValue(undefined),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Planejamento executivo" }],
          agent_type: "ceo",
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("owner"),
        repoFactory: () => mockRepo,
        runnerFactory: () => createMockRunner(),
        telemetryLogger: mockTelemetry,
      });

      expect(res.status).toBe(200);
      expect(mockTelemetry.logTelemetry).toHaveBeenCalledWith(
        expect.objectContaining({
          agentBrain: "ceo",
          workspaceId: validWorkspaceId,
        })
      );
    });

    it("deve registrar telemetria com agentBrain: 'operational' para chamadas operacionais", async () => {
      const mockTelemetry = {
        logTelemetry: vi.fn().mockResolvedValue(undefined),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quais boletos vencem hoje?" }],
          agent_type: "operational",
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("owner"),
        repoFactory: () => mockRepo,
        runnerFactory: () => createMockRunner(),
        telemetryLogger: mockTelemetry,
      });

      expect(res.status).toBe(200);
      expect(mockTelemetry.logTelemetry).toHaveBeenCalledWith(
        expect.objectContaining({
          agentBrain: "operational",
          workspaceId: validWorkspaceId,
        })
      );
    });
  });

  // ─── GATE 4: RBAC & PROTEÇÃO DE ROTAS NO FRONTEND ────────────────────────
  describe("Gate 4 — RBAC & Isolamento de Rota (/ceo vs /ia)", () => {
    it("deve ter o componente CeoRoleGuard implementado e protegendo as rotas /ceo no App.tsx", () => {
      const appContent = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
      expect(appContent).toContain("CeoRoleGuard");
      expect(appContent).toContain("<CeoRoleGuard><WalletCeoPage /></CeoRoleGuard>");
    });

    it("WalletAiOrchestratorClient deve aplicar fail-closed em caso de erro de rede para o CEO (sem fallback cego)", async () => {
      const client = new WalletAiOrchestratorClient({
        baseUrl: "https://invalid-host-offline.test/functions/v1/wallet-ai-orchestrator",
        getAccessToken: async () => "fake-jwt-token",
        fetchImpl: async () => {
          throw new Error("Network unreachable");
        },
      });

      await expect(
        client.sendMessage({
          workspaceId: validWorkspaceId,
          messages: [{ role: "user", content: "Diagnóstico executivo" }],
          agentType: "ceo",
        })
      ).rejects.toThrow("O serviço Wallet CEO está temporariamente inacessível");
    });
  });
});
