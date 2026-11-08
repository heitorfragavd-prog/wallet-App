import { describe, it, expect } from "vitest";
import {
  buildWalletCeoPrompt,
  buildWalletOperationalPrompt,
  buildSystemPrompt,
  WALLET_CEO_SYSTEM_PROMPT,
  WALLET_OPERATIONAL_SYSTEM_PROMPT,
} from "../../supabase/functions/_shared/ai/orchestrator-core";
import { WalletAiOrchestratorClient } from "../../src/domains/ia/services/WalletAiOrchestratorClient";
import fs from "node:fs";
import path from "node:path";

describe("👑 WALLET CEO 3.0 — Governança dos Dois Cérebros (Etapa 03)", () => {
  describe("Gate 2 — Cérebro 1: WALLET CEO (Executivo e Estratégico)", () => {
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
  });

  describe("Gate 3 — Cérebro 2: WALLET IA (Operacional e Administrativo)", () => {
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
  });

  describe("Gate 4 — RBAC & Isolamento de Rota (/ceo vs /ia)", () => {
    it("deve ter o componente CeoRoleGuard implementado e protegendo as rotas /ceo no App.tsx", () => {
      const appContent = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
      expect(appContent).toContain("CeoRoleGuard");
      expect(appContent).toContain("<CeoRoleGuard><WalletCeoPage /></CeoRoleGuard>");
    });
  });

  describe("Gate 5 & 6 — Memória Segregada e Telemetria de Custos", () => {
    it("deve conter a migration 77 definindo agent_type e agent_brain com RLS e índices", () => {
      const migrationFile = path.resolve("supabase/migrations/77_segregacao_dois_cerebros_ia_ceo.sql");
      expect(fs.existsSync(migrationFile)).toBe(true);

      const migrationContent = fs.readFileSync(migrationFile, "utf8");
      expect(migrationContent).toContain("agent_type text NOT NULL DEFAULT 'operational'");
      expect(migrationContent).toContain("chk_wallet_ai_conversations_agent_type");
      expect(migrationContent).toContain("agent_brain text DEFAULT 'operational'");
      expect(migrationContent).toContain("idx_wallet_ai_conversations_agent_type");
      expect(migrationContent).toContain("idx_wallet_ai_telemetry_agent_brain");
      expect(migrationContent).toContain("wallet_ai_conversations_select_policy");
    });

    it("WalletAiOrchestratorClient deve serializar agent_type no payload da requisição", async () => {
      let capturedBody: Record<string, unknown> | null = null;

      const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            message: { role: "assistant", content: "Ok" },
            toolCalls: [],
            iterations: 1,
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            estimatedCostUsd: 0.0001,
            loopDetected: false,
            maxIterationsReached: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const client = new WalletAiOrchestratorClient({
        baseUrl: "https://test.supabase.co/functions/v1/wallet-ai-orchestrator",
        getAccessToken: async () => "fake-jwt-token",
        fetchImpl: mockFetch as unknown as typeof fetch,
      });

      await client.sendMessage({
        workspaceId: "ws-123",
        messages: [{ role: "user", content: "Diagnóstico executivo" }],
        agentType: "ceo",
      });

      expect(capturedBody).toBeDefined();
      expect(capturedBody.workspace_id).toBe("ws-123");
      expect(capturedBody.agent_type).toBe("ceo");
    });
  });
});
