import { describe, it, expect, vi, beforeEach } from "vitest";
import { authorizeReportExecution } from "../../supabase/functions/cron-relatorio-executivo/index";

describe("Gate 0 — Autorização Executiva e Geração Manual de Relatórios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.CRON_SECRET;
  });

  const createMockSupabase = (opts: {
    user?: { id: string } | null;
    workspace?: { id: string; user_id: string; nome: string } | null;
    member?: { role: string; active?: boolean; ativo?: boolean } | null;
  }) => {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: opts.user || null },
          error: opts.user ? null : new Error("Invalid token"),
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "workspaces") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn((field: string, val: string) => {
                const found = opts.workspace?.id === val ? opts.workspace : null;
                return {
                  maybeSingle: vi.fn().mockResolvedValue({ data: found, error: null }),
                  single: vi.fn().mockResolvedValue({ data: found, error: null }),
                  data: found ? [found] : [],
                };
              }),
            }),
          };
        }
        if (table === "workspace_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: opts.member || null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
  };

  it("1. Deve autorizar proprietário legítimo direto do workspace", async () => {
    const ownerId = "user-owner-123";
    const wsId = "ws-restaurante-1";
    const mockSupabase = createMockSupabase({
      user: { id: ownerId },
      workspace: { id: wsId, user_id: ownerId, nome: "Restaurante Central" },
    });

    const req = new Request("https://mock.supabase.co/functions/v1/cron-relatorio-executivo", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-owner-jwt",
        "Content-Type": "application/json",
      },
    });

    const result = await authorizeReportExecution(req, mockSupabase, {
      workspace_id: wsId,
      reference_date: "2026-11-09",
    });

    expect(result.authorized).toBe(true);
    expect(result.status).toBe(200);
    expect(result.isCron).toBe(false);
    expect(result.authenticatedUserId).toBe(ownerId);
    expect(result.workspacesToProcess).toHaveLength(1);
    expect(result.workspacesToProcess![0].id).toBe(wsId);
  });

  it("2. Deve autorizar sócia/proprietária executiva via papel de 'owner' em workspace_members", async () => {
    const sociaId = "user-socia-456";
    const wsId = "ws-restaurante-1";
    const mockSupabase = createMockSupabase({
      user: { id: sociaId },
      workspace: { id: wsId, user_id: "other-user-primary", nome: "Restaurante Central" },
      member: { role: "owner", ativo: true },
    });

    const req = new Request("https://mock.supabase.co/functions/v1/cron-relatorio-executivo", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-socia-jwt",
        "Content-Type": "application/json",
      },
    });

    const result = await authorizeReportExecution(req, mockSupabase, {
      workspace_id: wsId,
      reference_date: "2026-11-09",
    });

    expect(result.authorized).toBe(true);
    expect(result.status).toBe(200);
    expect(result.workspacesToProcess).toHaveLength(1);
  });

  it("3. Deve negar acesso a colaboradora/sócia sem autorização executiva (role != owner)", async () => {
    const memberId = "user-member-789";
    const wsId = "ws-restaurante-1";
    const mockSupabase = createMockSupabase({
      user: { id: memberId },
      workspace: { id: wsId, user_id: "owner-real", nome: "Restaurante Central" },
      member: { role: "member", ativo: true },
    });

    const req = new Request("https://mock.supabase.co/functions/v1/cron-relatorio-executivo", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-member-jwt",
        "Content-Type": "application/json",
      },
    });

    const result = await authorizeReportExecution(req, mockSupabase, {
      workspace_id: wsId,
      reference_date: "2026-11-09",
    });

    expect(result.authorized).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain("Apenas o proprietário executivo pode gerar relatórios");
  });

  it("4. Deve negar acesso a funcionário ou usuário externo sem vínculo", async () => {
    const outsiderId = "user-outsider-999";
    const wsId = "ws-restaurante-1";
    const mockSupabase = createMockSupabase({
      user: { id: outsiderId },
      workspace: { id: wsId, user_id: "owner-real", nome: "Restaurante Central" },
      member: null,
    });

    const req = new Request("https://mock.supabase.co/functions/v1/cron-relatorio-executivo", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-outsider-jwt",
        "Content-Type": "application/json",
      },
    });

    const result = await authorizeReportExecution(req, mockSupabase, {
      workspace_id: wsId,
      reference_date: "2026-11-09",
    });

    expect(result.authorized).toBe(false);
    expect(result.status).toBe(403);
  });

  it("5. Deve impedir acesso entre workspaces diferentes (anti-IDOR)", async () => {
    const ownerId = "user-owner-123";
    const attackerTargetWs = "ws-alheio-999";
    const mockSupabase = createMockSupabase({
      user: { id: ownerId },
      workspace: { id: attackerTargetWs, user_id: "other-owner-555", nome: "Restaurante Alheio" },
      member: null,
    });

    const req = new Request("https://mock.supabase.co/functions/v1/cron-relatorio-executivo", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-jwt",
        "Content-Type": "application/json",
      },
    });

    const result = await authorizeReportExecution(req, mockSupabase, {
      workspace_id: attackerTargetWs,
      reference_date: "2026-11-09",
    });

    expect(result.authorized).toBe(false);
    expect(result.status).toBe(403);
  });

  it("6. Deve rejeitar chamada manual sem workspace_id (400 Bad Request)", async () => {
    const ownerId = "user-owner-123";
    const mockSupabase = createMockSupabase({
      user: { id: ownerId },
    });

    const req = new Request("https://mock.supabase.co/functions/v1/cron-relatorio-executivo", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-jwt",
        "Content-Type": "application/json",
      },
    });

    const result = await authorizeReportExecution(req, mockSupabase, {
      reference_date: "2026-11-09",
    });

    expect(result.authorized).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("workspace_id é obrigatório para execução manual");
  });

  it("7. Deve rejeitar data em formato inválido ou data futura (400 Bad Request)", async () => {
    const ownerId = "user-owner-123";
    const wsId = "ws-restaurante-1";
    const mockSupabase = createMockSupabase({
      user: { id: ownerId },
      workspace: { id: wsId, user_id: ownerId, nome: "Restaurante Central" },
    });

    const req1 = new Request("https://mock.supabase.co/functions/v1/cron-relatorio-executivo", {
      method: "POST",
      headers: { Authorization: "Bearer valid-jwt" },
    });

    const resultInvalidFormat = await authorizeReportExecution(req1, mockSupabase, {
      workspace_id: wsId,
      reference_date: "09-11-2026", // formato não-ISO
    });
    expect(resultInvalidFormat.authorized).toBe(false);
    expect(resultInvalidFormat.status).toBe(400);
    expect(resultInvalidFormat.error).toContain("Formato de data inválido");

    const resultFutureDate = await authorizeReportExecution(req1, mockSupabase, {
      workspace_id: wsId,
      reference_date: "2099-12-31", // futuro
    });
    expect(resultFutureDate.authorized).toBe(false);
    expect(resultFutureDate.status).toBe(400);
    expect(resultFutureDate.error).toContain("Data de referência não pode ser posterior à data atual");
  });

  it("8. Chamada manual nunca deve processar todos os workspaces por acidente", async () => {
    const ownerId = "user-owner-123";
    const wsId = "ws-restaurante-1";
    const mockSupabase = createMockSupabase({
      user: { id: ownerId },
      workspace: { id: wsId, user_id: ownerId, nome: "Restaurante Central" },
    });

    const req = new Request("https://mock.supabase.co/functions/v1/cron-relatorio-executivo", {
      method: "POST",
      headers: { Authorization: "Bearer valid-jwt" },
    });

    const result = await authorizeReportExecution(req, mockSupabase, {
      workspace_id: wsId,
    });

    expect(result.authorized).toBe(true);
    expect(result.workspacesToProcess).toHaveLength(1);
    expect(result.workspacesToProcess![0].id).toBe(wsId);
  });
});
