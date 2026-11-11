import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeExecutiveReportWorkflow } from "../../supabase/functions/cron-relatorio-executivo/index";

describe("Gate 1 — Idempotência Real e Entrega Multicanal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockDb = (
    existingReport: Record<string, unknown> | null = null,
    dispatcherMock: unknown = null
  ) => {
    let currentReport: Record<string, unknown> | null = existingReport ? { ...existingReport } : null;

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "ceo_executive_reports") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: currentReport,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
              currentReport = { ...currentReport, ...data, id: currentReport?.id || "rep-uuid-1" };
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: currentReport.id },
                    error: null,
                  }),
                }),
              };
            }),
            update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
              currentReport = { ...currentReport, ...data };
              return {
                eq: vi.fn().mockResolvedValue({ data: currentReport, error: null }),
              };
            }),
          };
        }
        // Outras tabelas do coletor retornam builder encadeável com mockReturnThis
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
        };
        return builder;
      }),
      functions: {
        invoke: dispatcherMock || vi.fn().mockResolvedValue({
          data: {
            success: true,
            entregas: [
              { channel: "app", delivered: true },
              { channel: "push", delivered: true },
              { channel: "telegram", delivered: true },
            ],
          },
          error: null,
        }),
      },
    };

    return { mockAdmin, getCurrentReport: () => currentReport };
  };

  it("1. Não deve gerar novo relatório se já existir relatório com status 'completed' e entregue", async () => {
    const existing = {
      id: "rep-comp-1",
      workspace_id: "ws-1",
      reference_date: "2026-11-09",
      period_type: "daily",
      version: 1,
      status: "completed",
      dispatch_status: { app: true, telegram: true, attempts: 1 },
      financial_indicators: { faturamento: { faturamentoOntem: 1500 } },
      executive_summary: "Resumo executivo completo.",
    };

    const { mockAdmin } = createMockDb(existing);

    const result = await executeExecutiveReportWorkflow(mockAdmin, {
      workspaceId: "ws-1",
      ownerId: "owner-1",
      ownerName: "Restaurante",
      referenceDate: "2026-11-09",
    });

    expect(result.status).toBe("skipped_already_completed");
    expect(result.reportId).toBe("rep-comp-1");
    expect(result.notified).toBe(true);
    // Não deve chamar o dispatcher
    expect(mockAdmin.functions.invoke).not.toHaveBeenCalled();
  });

  it("2. Deve reconhecer status 'fallback_deterministic' como concluído e não reexecutar IA à toa", async () => {
    const existing = {
      id: "rep-fall-1",
      workspace_id: "ws-1",
      reference_date: "2026-11-09",
      period_type: "daily",
      version: 1,
      status: "fallback_deterministic",
      dispatch_status: { app: true, telegram: true, attempts: 1 },
      financial_indicators: { faturamento: { faturamentoOntem: 800 } },
      executive_summary: "Resumo determinístico consolidado.",
    };

    const { mockAdmin } = createMockDb(existing);

    const result = await executeExecutiveReportWorkflow(mockAdmin, {
      workspaceId: "ws-1",
      ownerId: "owner-1",
      ownerName: "Restaurante",
      referenceDate: "2026-11-09",
    });

    expect(result.status).toBe("skipped_already_completed");
    expect(result.reportId).toBe("rep-fall-1");
    expect(mockAdmin.functions.invoke).not.toHaveBeenCalled();
  });

  it("3. Se o relatório foi concluído mas a entrega falhou, deve retentar apenas o despacho", async () => {
    const existing = {
      id: "rep-pending-disp",
      workspace_id: "ws-1",
      reference_date: "2026-11-09",
      period_type: "daily",
      version: 1,
      status: "completed",
      dispatch_status: { app: true, telegram: false, attempts: 1 },
      financial_indicators: { faturamento: { faturamentoOntem: 1200 } },
      executive_summary: "Resumo existente.",
    };

    const mockDispatcher = vi.fn().mockResolvedValue({
      data: {
        success: true,
        entregas: [
          { channel: "app", delivered: true },
          { channel: "telegram", delivered: true },
        ],
      },
      error: null,
    });

    const { mockAdmin } = createMockDb(existing, mockDispatcher);

    const result = await executeExecutiveReportWorkflow(mockAdmin, {
      workspaceId: "ws-1",
      ownerId: "owner-1",
      ownerName: "Restaurante",
      referenceDate: "2026-11-09",
    });

    expect(result.reDispatched).toBe(true);
    expect(result.status).toBe("completed");
    expect(mockDispatcher).toHaveBeenCalledTimes(1);
    expect(result.dispatchDetails?.app).toBe(true);
    expect(result.dispatchDetails?.telegram).toBe(true);
    expect(result.dispatchDetails?.attempts).toBe(2);
  });

  it("4. Deve impedir condição de corrida quando status for 'generating' recente", async () => {
    const recentGenerating = {
      id: "rep-generating-1",
      workspace_id: "ws-1",
      reference_date: "2026-11-09",
      period_type: "daily",
      version: 1,
      status: "generating",
      updated_at: new Date(Date.now() - 30_000).toISOString(), // 30 segundos atrás
    };

    const { mockAdmin } = createMockDb(recentGenerating);

    const result = await executeExecutiveReportWorkflow(mockAdmin, {
      workspaceId: "ws-1",
      ownerId: "owner-1",
      ownerName: "Restaurante",
      referenceDate: "2026-11-09",
    });

    expect(result.status).toBe("in_progress_concurrent");
    expect(result.notified).toBe(false);
    expect(mockAdmin.functions.invoke).not.toHaveBeenCalled();
  });

  it("5. Deve auditar falha individual no Telegram e marcar 'pending_dispatch'", async () => {
    const mockDispatcherWithTgFail = vi.fn().mockResolvedValue({
      data: {
        success: true,
        entregas: [
          { channel: "app", delivered: true },
          { channel: "push", delivered: false, reason: "Sem token push" },
          { channel: "telegram", delivered: false, reason: "Chat ID não vinculado" },
        ],
      },
      error: null,
    });

    const { mockAdmin } = createMockDb(null, mockDispatcherWithTgFail);

    const result = await executeExecutiveReportWorkflow(mockAdmin, {
      workspaceId: "ws-1",
      ownerId: "owner-1",
      ownerName: "Restaurante",
      referenceDate: "2026-11-09",
    });

    expect(result.status).toBe("pending_dispatch");
    expect(result.dispatchDetails?.app).toBe(true);
    expect(result.dispatchDetails?.telegram).toBe(false);
    expect(result.dispatchDetails?.failures).toHaveLength(2);
    expect(result.dispatchDetails?.failures[1].channel).toBe("telegram");
  });
});
