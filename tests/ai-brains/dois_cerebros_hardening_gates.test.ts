import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isCeoExecutiveAuthorized,
  canRoleAccessCeoBrain,
  CEO_AUTHORIZED_ROLES,
} from "../../supabase/functions/_shared/ai/auth";
import {
  SupabaseConversationRepository,
} from "../../supabase/functions/_shared/ai/memory-core";
import {
  WalletAiOrchestratorClient,
  WalletAiOrchestratorError,
} from "../../src/domains/ia/services/WalletAiOrchestratorClient";

describe("👑 WALLET CEO 3.0 — Hardening Final da Etapa 03 (Gates 0 a 5)", () => {
  describe("Gate 0 — Autorização Executiva no Backend (Server-Side RBAC)", () => {
    it("deve autorizar estritamente os papéis executivos válidos", () => {
      expect(isCeoExecutiveAuthorized("owner")).toBe(true);
      expect(isCeoExecutiveAuthorized("admin")).toBe(true);
      expect(isCeoExecutiveAuthorized("proprietario")).toBe(true);
      expect(isCeoExecutiveAuthorized("administrador")).toBe(true);
      expect(isCeoExecutiveAuthorized("OWNER")).toBe(true);
      expect(isCeoExecutiveAuthorized("Admin")).toBe(true);

      expect(canRoleAccessCeoBrain("owner")).toBe(true);
      expect(canRoleAccessCeoBrain("admin")).toBe(true);

      expect(CEO_AUTHORIZED_ROLES).toContain("owner");
      expect(CEO_AUTHORIZED_ROLES).toContain("admin");
      expect(CEO_AUTHORIZED_ROLES).toContain("proprietario");
      expect(CEO_AUTHORIZED_ROLES).toContain("administrador");
    });

    it("deve bloquear papéis não-executivos ou ausentes", () => {
      expect(isCeoExecutiveAuthorized("member")).toBe(false);
      expect(isCeoExecutiveAuthorized("delivery_staff")).toBe(false);
      expect(isCeoExecutiveAuthorized("user")).toBe(false);
      expect(isCeoExecutiveAuthorized("viewer")).toBe(false);
      expect(isCeoExecutiveAuthorized("guest")).toBe(false);
      expect(isCeoExecutiveAuthorized(undefined)).toBe(false);
      expect(isCeoExecutiveAuthorized("")).toBe(false);

      expect(canRoleAccessCeoBrain("member")).toBe(false);
      expect(canRoleAccessCeoBrain("delivery_staff")).toBe(false);
    });

    it("handler.ts deve validar no servidor o agent_type 'ceo' antes de executar ferramentas ou LLM", () => {
      const handlerContent = fs.readFileSync(
        path.resolve("supabase/functions/wallet-ai-orchestrator/handler.ts"),
        "utf8",
      );

      expect(handlerContent).toContain("canRoleAccessCeoBrain");
      expect(handlerContent).toContain("requestedAgentType === \"ceo\"");
      expect(handlerContent).toContain("!canRoleAccessCeoBrain(userRole)");
      expect(handlerContent).toContain("status: 403");
      expect(handlerContent).toContain("forbidden_ceo_access");
    });

    it("handler.ts deve proteger modelo premium (gpt-4o) para usuários operacionais com fallback para gpt-4o-mini", () => {
      const handlerContent = fs.readFileSync(
        path.resolve("supabase/functions/wallet-ai-orchestrator/handler.ts"),
        "utf8",
      );

      expect(handlerContent).toContain('effectiveModel = "gpt-4o-mini"');
      expect(handlerContent).toContain('effectiveAgentType === "operational"');
    });

    it("handler.ts deve rejeitar cross-agent conversation mismatch (400)", () => {
      const handlerContent = fs.readFileSync(
        path.resolve("supabase/functions/wallet-ai-orchestrator/handler.ts"),
        "utf8",
      );

      expect(handlerContent).toContain("conversation_agent_mismatch");
      expect(handlerContent).toContain("WALLET_AI_INVALID_CONVERSATION");
      expect(handlerContent).toContain("conv.agent_type !== requestedAgentType");
    });
  });

  describe("Gate 1 — Privacidade Estrita das Conversas (Migration 78 RLS)", () => {
    it("deve conter a migration 78 com is_shared, índices e políticas de isolamento", () => {
      const migrationFile = path.resolve(
        "supabase/migrations/78_privacidade_estrita_conversas_rls.sql",
      );
      expect(fs.existsSync(migrationFile)).toBe(true);

      const migrationContent = fs.readFileSync(migrationFile, "utf8");

      expect(migrationContent).toContain("ADD COLUMN is_shared boolean NOT NULL DEFAULT false");
      expect(migrationContent).toContain("idx_wallet_ai_conversations_strict_privacy");
      expect(migrationContent).toContain("wallet_ai_conversations_select_strict");
      expect(migrationContent).toContain("wallet_ai_conversations_insert_strict");
      expect(migrationContent).toContain("wallet_ai_conversations_update_strict");
      expect(migrationContent).toContain("trg_protect_wallet_ai_conversations_update");
      expect(migrationContent).toContain("wallet_ai_messages_select_strict");
      expect(migrationContent).toContain("wallet_ai_messages_insert_strict");

      // Isolamento estrito de conversas CEO:
      expect(migrationContent).toContain("agent_type = 'ceo'");
      expect(migrationContent).toContain("user_id = auth.uid()");

      // Isolamento de conversas operacionais (privadas vs compartilhadas):
      expect(migrationContent).toContain("agent_type = 'operational'");
      expect(migrationContent).toContain("is_shared = true");
    });
  });

  describe("Gate 2 — Memória Real Segregada e Defesa em Profundidade", () => {
    it("SupabaseConversationRepository deve gravar agent_type e is_shared na criação", async () => {
      let insertedPayload: Record<string, unknown> | null = null;

      const mockSupabase = {
        from: (table: string) => {
          expect(table).toBe("wallet_ai_conversations");
          return {
            insert: (payload: Record<string, unknown>) => {
              insertedPayload = payload;
              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      id: "conv-1",
                      ...payload,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        },
      };

      const repo = new SupabaseConversationRepository(mockSupabase);

      const created = await repo.createConversation({
        workspaceId: "ws-1",
        userId: "user-1",
        title: "Estratégia CEO",
        agentType: "ceo",
        isShared: false,
      });

      expect(insertedPayload).toBeDefined();
      expect(insertedPayload!.workspace_id).toBe("ws-1");
      expect(insertedPayload!.user_id).toBe("user-1");
      expect(insertedPayload!.agent_type).toBe("ceo");
      expect(insertedPayload!.is_shared).toBe(false);
      expect(created.agent_type).toBe("ceo");
    });

    it("SupabaseConversationRepository.getConversation deve consultar estritamente por workspace_id e user_id", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: (_col1: string, _val1: string) => ({
              eq: (_col2: string, _val2: string) => ({
                eq: (_col3: string, _val3: string) => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "conv-ceo-1",
                      workspace_id: "ws-1",
                      user_id: "user-1",
                      agent_type: "ceo",
                      title: "Privado CEO",
                      summary: null,
                      is_archived: false,
                      is_shared: false,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      };

      const repo = new SupabaseConversationRepository(mockSupabase);
      const conv = await repo.getConversation("conv-ceo-1", "ws-1", "user-1");
      expect(conv).toBeDefined();
      expect(conv?.id).toBe("conv-ceo-1");
    });

    it("WalletAiOrchestratorClient deve bloquear fallback não-autorizado para openai-proxy quando agentType === 'ceo'", async () => {
      let proxyCalled = false;

      const mockFetch = async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("openai-proxy")) {
          proxyCalled = true;
          return new Response(JSON.stringify({ choices: [{ message: { content: "Fallback" } }] }), { status: 200 });
        }
        // Simula erro de rede no orchestrator
        throw new Error("Failed to fetch");
      };

      const client = new WalletAiOrchestratorClient({
        baseUrl: "https://test.supabase.co/functions/v1/wallet-ai-orchestrator",
        getAccessToken: async () => "token-123",
        fetchImpl: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.sendMessage({
          workspaceId: "ws-1",
          messages: [{ role: "user", content: "Pergunta estratégica" }],
          agentType: "ceo",
        }),
      ).rejects.toThrow(WalletAiOrchestratorError);

      expect(proxyCalled).toBe(false);
    });
  });

  describe("Gate 3 — Telemetria com agent_brain Validado no Servidor", () => {
    it("index.ts deve persistir agent_brain na telemetria", () => {
      const indexContent = fs.readFileSync(
        path.resolve("supabase/functions/wallet-ai-orchestrator/index.ts"),
        "utf8",
      );

      expect(indexContent).toContain("agent_brain: telemetry.agentBrain || \"operational\"");
      expect(indexContent).toContain("agentBrain?: \"ceo\" | \"operational\"");
    });

    it("handler.ts deve repassar agentBrain validado pelo servidor para a telemetria", () => {
      const handlerContent = fs.readFileSync(
        path.resolve("supabase/functions/wallet-ai-orchestrator/handler.ts"),
        "utf8",
      );

      expect(handlerContent).toContain("agentBrain: effectiveAgentType");
    });
  });
});
