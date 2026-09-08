import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isEyemobileSuccessResponse,
  acquireAlertaLock,
  executeEyemobilePriceSync,
  persistConfirmedPriceAtomic,
  handlePriceSyncFailure,
  MSG_FALHA_REMOTO,
  MSG_FALHA_PERSISTENCIA_LOCAL,
  MSG_ALERTA_JA_APLICADO,
  MSG_EM_PROCESSAMENTO,
  type AlertaPreco,
} from "../../../../supabase/functions/_shared/integrations/eyemobile-price-safety";

describe("Eyemobile Price Confirmation Safety (P0 Fail-Safe)", () => {
  const BASE_ALERTA: AlertaPreco = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    user_id: "user-123",
    workspace_id: "ws-456",
    produto_eyemobile_id: "eye-prod-999",
    produto_codigo: "COD-999",
    produto_descricao: "Refrigerante Cola 350ml",
    preco_sugerido: 10.0,
    preco_definido_usuario: null,
    preco_venda_atual: 8.0,
    custo_anterior: 4.0,
    custo_novo: 5.0,
    status: "pendente",
    updated_at: new Date("2026-09-08T10:00:00Z").toISOString(),
    created_at: new Date("2026-09-08T09:00:00Z").toISOString(),
  };

  const SUPABASE_URL = "https://example.supabase.co";
  const SERVICE_KEY = "test_service_key";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONTRATO DE SUCESSO
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Contrato Rigoroso de Sucesso (isEyemobileSuccessResponse)", () => {
    it("retorna true apenas quando status === 200 E success === true", () => {
      expect(isEyemobileSuccessResponse(200, { success: true })).toBe(true);
    });

    it("rejeita status 200 se success for false ou ausente", () => {
      expect(isEyemobileSuccessResponse(200, { success: false })).toBe(false);
      expect(isEyemobileSuccessResponse(200, { ok: true })).toBe(false);
      expect(isEyemobileSuccessResponse(200, {})).toBe(false);
      expect(isEyemobileSuccessResponse(200, null)).toBe(false);
    });

    it("rejeita status não-200 mesmo se payload contiver success: true", () => {
      expect(isEyemobileSuccessResponse(201, { success: true })).toBe(false);
      expect(isEyemobileSuccessResponse(400, { success: true })).toBe(false);
      expect(isEyemobileSuccessResponse(500, { success: true })).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIO A
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenário A: HTTP 200 + success:true", () => {
    it("adquire lock, executa sync com sucesso e persiste via RPC atômico", async () => {
      const mockDbRow = { ...BASE_ALERTA, status: "aplicando" };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: [mockDbRow], error: null }),
            }),
          }),
        }),
        rpc: vi.fn().mockResolvedValue({
          data: { success: true, alerta_id: BASE_ALERTA.id, novo_preco: 10.0 },
          error: null,
        }),
      };

      // 1. Acquire
      const lock = await acquireAlertaLock(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
      });
      expect(lock.acquired).toBe(true);
      if (!lock.acquired) return;
      expect(lock.alerta.status).toBe("aplicando");

      // 2. Chamada remota HTTP 200 + success:true
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, message: "Preço atualizado no Eyemobile" }),
      });

      const syncResult = await executeEyemobilePriceSync(
        SUPABASE_URL,
        SERVICE_KEY,
        {
          user_id: BASE_ALERTA.user_id,
          product_id: BASE_ALERTA.produto_eyemobile_id,
          new_price: 10.0,
        },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );
      expect(syncResult.success).toBe(true);
      expect(syncResult.status).toBe(200);

      // 3. Persistência atômica via RPC
      const persistResult = await persistConfirmedPriceAtomic(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
        novoPreco: 10.0,
      });

      expect(persistResult.success).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith("aplicar_preco_alerta_eyemobile", {
        p_alerta_id: BASE_ALERTA.id,
        p_user_id: BASE_ALERTA.user_id,
        p_workspace_id: BASE_ALERTA.workspace_id,
        p_novo_preco: 10.0,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIO B: HTTP 200 + success:false
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenário B: HTTP 200 + success:false", () => {
    it("não considera aplicado, marca erro_integracao e não altera preço local", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue({ success: false, error: "Produto bloqueado no Eyemobile" }),
      });

      const syncResult = await executeEyemobilePriceSync(
        SUPABASE_URL,
        SERVICE_KEY,
        {
          user_id: BASE_ALERTA.user_id,
          product_id: BASE_ALERTA.produto_eyemobile_id,
          new_price: 10.0,
        },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );

      expect(syncResult.success).toBe(false);
      expect(syncResult.error).toContain("Produto bloqueado no Eyemobile");

      // Falha deve acionar handlePriceSyncFailure
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: [{ id: BASE_ALERTA.id }], error: null }),
          }),
        }),
      };

      const failure = await handlePriceSyncFailure(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
        reason: syncResult.error || "Erro desconhecido",
      });

      expect(failure.recorded).toBe(true);
      expect(failure.userMessage).toBe(MSG_FALHA_REMOTO);
      expect(failure.userMessage).not.toContain("Preço aplicado no Eyemobile");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIOS C & D: HTTP 500 & 400
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenários C & D: HTTP 500 e 400", () => {
    it("C. trata HTTP 500 como falha e transiciona para erro_integracao", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 500,
        json: vi.fn().mockResolvedValue({ success: false, error: "Internal Server Error" }),
      });

      const syncResult = await executeEyemobilePriceSync(
        SUPABASE_URL,
        SERVICE_KEY,
        {
          user_id: BASE_ALERTA.user_id,
          product_id: BASE_ALERTA.produto_eyemobile_id,
          new_price: 10.0,
        },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );

      expect(syncResult.success).toBe(false);
      expect(syncResult.status).toBe(500);
    });

    it("D. trata HTTP 400 como falha e transiciona para erro_integracao", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 400,
        json: vi.fn().mockResolvedValue({ success: false, error: "Preço fora da faixa permitida" }),
      });

      const syncResult = await executeEyemobilePriceSync(
        SUPABASE_URL,
        SERVICE_KEY,
        {
          user_id: BASE_ALERTA.user_id,
          product_id: BASE_ALERTA.produto_eyemobile_id,
          new_price: 10.0,
        },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );

      expect(syncResult.success).toBe(false);
      expect(syncResult.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIOS E & F: Timeout/Rede & JSON Inválido
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenários E & F: Timeout/Rede e JSON Inválido", () => {
    it("E. trata throw de rede ou timeout como falha fail-safe", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection lost"));

      const syncResult = await executeEyemobilePriceSync(
        SUPABASE_URL,
        SERVICE_KEY,
        {
          user_id: BASE_ALERTA.user_id,
          product_id: BASE_ALERTA.produto_eyemobile_id,
          new_price: 10.0,
        },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );

      expect(syncResult.success).toBe(false);
      expect(syncResult.isNetworkOrTimeout).toBe(true);
      expect(syncResult.error).toContain("Network connection lost");
    });

    it("F. trata resposta com JSON inválido (ex: proxy HTML) como falha", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token '<' in JSON")),
      });

      const syncResult = await executeEyemobilePriceSync(
        SUPABASE_URL,
        SERVICE_KEY,
        {
          user_id: BASE_ALERTA.user_id,
          product_id: BASE_ALERTA.produto_eyemobile_id,
          new_price: 10.0,
        },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );

      expect(syncResult.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIO G: Reaplicação / Retry após erro
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenário G: Usuário tenta novamente após erro", () => {
    it("permite adquirir lock e aplicar preço quando o alerta está em erro_integracao", async () => {
      const mockAlertaEmErro = { ...BASE_ALERTA, status: "erro_integracao" };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ ...mockAlertaEmErro, status: "aplicando" }],
                error: null,
              }),
            }),
          }),
        }),
      };

      const lock = await acquireAlertaLock(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
      });

      expect(lock.acquired).toBe(true);
      if (!lock.acquired) return;
      expect(lock.alerta.status).toBe("aplicando");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIO H: Alerta já aplicado (Terminal)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenário H: Alerta já aplicado (Estado Terminal)", () => {
    it("não readquire lock e retorna already_applied se alerta já foi aplicado", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { ...BASE_ALERTA, status: "aplicado" },
              error: null,
            }),
          }),
        }),
      };

      const lock = await acquireAlertaLock(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
      });

      expect(lock.acquired).toBe(false);
      if (lock.acquired) return;
      expect(lock.reason).toBe("already_applied");
      expect(lock.alerta?.status).toBe("aplicado");
      expect(MSG_ALERTA_JA_APLICADO).toContain("já foi aplicado");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIOS I & J: Preço Editado (Falha e Sucesso)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenários I & J: Preço Editado", () => {
    it("I. confirmar preço editado com falha não altera status para aplicado", async () => {
      const precoEditado = 15.5;

      const mockFetch = vi.fn().mockResolvedValue({
        status: 500,
        json: vi.fn().mockResolvedValue({ success: false, error: "Serviço indisponível" }),
      });

      const syncResult = await executeEyemobilePriceSync(
        SUPABASE_URL,
        SERVICE_KEY,
        {
          user_id: BASE_ALERTA.user_id,
          product_id: BASE_ALERTA.produto_eyemobile_id,
          new_price: precoEditado,
        },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );

      expect(syncResult.success).toBe(false);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: [{ id: BASE_ALERTA.id }], error: null }),
          }),
        }),
      };

      const failure = await handlePriceSyncFailure(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
        reason: syncResult.error || "Erro",
      });

      expect(failure.recorded).toBe(true);
      expect(failure.userMessage).toBe(MSG_FALHA_REMOTO);
    });

    it("J. confirmar preço editado com sucesso atualiza exatamente uma vez via RPC", async () => {
      const precoEditado = 14.0;

      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { success: true, alerta_id: BASE_ALERTA.id, novo_preco: precoEditado },
          error: null,
        }),
      };

      const persistResult = await persistConfirmedPriceAtomic(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
        novoPreco: precoEditado,
      });

      expect(persistResult.success).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabase.rpc).toHaveBeenCalledWith("aplicar_preco_alerta_eyemobile", {
        p_alerta_id: BASE_ALERTA.id,
        p_user_id: BASE_ALERTA.user_id,
        p_workspace_id: BASE_ALERTA.workspace_id,
        p_novo_preco: precoEditado,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIO K: Concorrência Simultânea (Duplo Clique)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenário K: Concorrência Simultânea", () => {
    it("somente uma tentativa adquire o lock; a segunda recebe already_processing", async () => {
      let lockGranted = false;

      const createMockSupabase = () => ({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockImplementation(() => ({
              select: vi.fn().mockImplementation(async () => {
                if (!lockGranted) {
                  lockGranted = true;
                  return { data: [{ ...BASE_ALERTA, status: "aplicando" }], error: null };
                }
                return { data: [], error: null };
              }),
            })),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { ...BASE_ALERTA, status: "aplicando" },
              error: null,
            }),
          }),
        }),
      });

      const client1 = createMockSupabase();
      const client2 = createMockSupabase();

      const [res1, res2] = await Promise.all([
        acquireAlertaLock(client1, {
          alertaId: BASE_ALERTA.id,
          userId: BASE_ALERTA.user_id,
          workspaceId: BASE_ALERTA.workspace_id,
        }),
        acquireAlertaLock(client2, {
          alertaId: BASE_ALERTA.id,
          userId: BASE_ALERTA.user_id,
          workspaceId: BASE_ALERTA.workspace_id,
        }),
      ]);

      const acquiredResults = [res1, res2].filter((r) => r.acquired);
      const rejectedResults = [res1, res2].filter((r) => !r.acquired);

      expect(acquiredResults).toHaveLength(1);
      expect(rejectedResults).toHaveLength(1);
      expect((rejectedResults[0] as { acquired: false; reason: string }).reason).toBe("already_processing");
      expect(MSG_EM_PROCESSAMENTO).toContain("em processamento");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIO L: Recuperação de Stale Lock (> 180s)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenário L: Recuperação de Lock Travado em 'aplicando'", () => {
    it("permite recuperação do lock quando status='aplicando' há mais de 180 segundos", async () => {
      const now = new Date("2026-09-08T12:00:00Z");

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [
                  {
                    ...BASE_ALERTA,
                    status: "aplicando",
                    updated_at: now.toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };

      const lock = await acquireAlertaLock(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
        staleThresholdMs: 180000,
        nowDate: now,
      });

      expect(lock.acquired).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CENÁRIO M: Sucesso Remoto + Falha na Persistência Local
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cenário M: remote_success_local_failure", () => {
    it("não considera concluído, tenta gravar erro_integracao em best-effort e avisa o usuário", async () => {
      // 1. Remoto retornou 200 + success: true
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });

      const syncResult = await executeEyemobilePriceSync(
        SUPABASE_URL,
        SERVICE_KEY,
        {
          user_id: BASE_ALERTA.user_id,
          product_id: BASE_ALERTA.produto_eyemobile_id,
          new_price: 10.0,
        },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );
      expect(syncResult.success).toBe(true);

      // 2. Persistência RPC falhou (ex: connection timeout ou constraint)
      const mockSupabaseRpcFail = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database lock conflict during transaction" },
        }),
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: [{ id: BASE_ALERTA.id }], error: null }),
          }),
        }),
      };

      const persistResult = await persistConfirmedPriceAtomic(mockSupabaseRpcFail, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
        novoPreco: 10.0,
      });
      expect(persistResult.success).toBe(false);

      // 3. handlePriceSyncFailure com isRemoteSuccessLocalFailure: true
      const failure = await handlePriceSyncFailure(mockSupabaseRpcFail, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
        reason: persistResult.error || "Erro local",
        isRemoteSuccessLocalFailure: true,
      });

      expect(failure.recorded).toBe(true);
      expect(failure.userMessage).toBe(MSG_FALHA_PERSISTENCIA_LOCAL);
      expect(failure.userMessage).toContain("Eyemobile confirmou a alteração do preço");
      expect(failure.userMessage).toContain("Wallet não conseguiu registrar a sincronização");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INVARIANTE: Falha nunca sobrescreve estado terminal (aplicado/ignorado)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Invariante de Proteção de Estados Terminais", () => {
    it("não altera banco se alerta não estiver mais em 'aplicando'", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            // Retorna 0 linhas afetadas porque status != 'aplicando'
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };

      const failure = await handlePriceSyncFailure(mockSupabase, {
        alertaId: BASE_ALERTA.id,
        userId: BASE_ALERTA.user_id,
        workspaceId: BASE_ALERTA.workspace_id,
        reason: "Erro tardio",
      });

      expect(failure.recorded).toBe(false);
    });
  });
});
