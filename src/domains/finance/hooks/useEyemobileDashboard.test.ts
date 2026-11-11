import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useEyemobileDashboard } from "./useEyemobileDashboard";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: "ws-test-123", nome: "Workspace Test" },
  }),
}));

import { supabase } from "@/integrations/supabase/client";

beforeEach(() => vi.clearAllMocks());

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

function mockTransacoes(
  rows: unknown[],
  configs: unknown[] = [{ id: "cfg-1" }],
  workspace: { id: string; tipo: string; user_id: string } | null = {
    id: "ws-test-123",
    tipo: "PJ",
    user_id: "user-test",
  },
) {
  const transacoesChain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockImplementation((from: number, to: number) => {
      const slice = rows.slice(from, to + 1);
      return Promise.resolve({ data: slice, error: null });
    }),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };

  const configChain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: configs, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: configs[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: configs, error: null }).then(resolve),
  };

  const workspaceChain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: workspace, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: workspace, error: null }).then(resolve),
  };

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === "eyemobile_config") {
      return configChain;
    }
    if (table === "workspaces") {
      return workspaceChain;
    }
    return transacoesChain;
  }) as never);

  return transacoesChain;
}

describe("useEyemobileDashboard", () => {
  it("sempre busca da API ao vivo para fidelidade de dados", async () => {
    mockTransacoes([]);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { configured: true, sales: [{ total: 100, time: "2026-07-10T12:00:00" }], products: [], stores: [] },
      error: null,
    } as never);

    const { result } = renderHook(() => useEyemobileDashboard({ startDate: "2026-07-01", endDate: "2026-07-31" }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    
    // Sempre chama a API ao vivo no modo DASHBOARD
    expect(supabase.functions.invoke).toHaveBeenCalledWith("eyemobile-sync",
      expect.objectContaining({ body: expect.objectContaining({ mode: "DASHBOARD" }) }));
    expect(result.current.data?.kpis.totalTransactions).toBe(1);
    expect(result.current.data?.kpis.totalRevenue).toBe(100);
  });

  it("consulta o painel remoto com os filtros de período e loja", async () => {
    mockTransacoes([]);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { configured: true, sales: [], products: [], stores: [{ id: "store-1", name: "Centro" }] },
      error: null,
    } as never);

    const { result } = renderHook(() => useEyemobileDashboard({ startDate: "2026-07-01", endDate: "2026-07-31", storeId: "store-1" }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(supabase.functions.invoke).toHaveBeenCalledWith("eyemobile-sync", {
      body: { mode: "DASHBOARD", start_date: "2026-07-01", end_date: "2026-07-31", store_id: "store-1", workspace_id: "ws-test-123" },
    });
    expect(result.current.data?.stores).toEqual([{ id: "store-1", name: "Centro" }]);
  });

  it("syncLive força busca ao vivo e atualiza o cache", async () => {
    mockTransacoes([]);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { configured: true, sales: [{ total: 999, time: "2026-07-10T13:00:00" }], products: [], stores: [] },
      error: null,
    } as never);

    const { result } = renderHook(() => useEyemobileDashboard({ startDate: "2026-07-01", endDate: "2026-07-31" }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(supabase.functions.invoke).toHaveBeenCalledWith("eyemobile-sync",
      expect.objectContaining({ body: expect.objectContaining({ mode: "DASHBOARD" }) }));

    const live = await result.current.syncLive();
    expect(supabase.functions.invoke).toHaveBeenCalledWith("eyemobile-sync", expect.objectContaining({
      body: expect.objectContaining({ mode: "DASHBOARD" }),
    }));
    expect(live.kpis.totalRevenue).toBe(999);
    await waitFor(() => expect(result.current.data?.kpis.totalRevenue).toBe(999));
  });

  it("Situação B: fallback local preserva configured: true quando integração existe mesmo com zero vendas no período", async () => {
    mockTransacoes([], [{ id: "cfg-1" }]);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error("Network timeout"),
    } as never);

    const { result } = renderHook(() => useEyemobileDashboard({ startDate: "2026-11-10", endDate: "2026-11-10" }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.configured).toBe(true);
    expect(result.current.data?.kpis.totalTransactions).toBe(0);
    expect(result.current.data?.kpis.totalRevenue).toBe(0);
  });

  it("Situação C: fallback local reporta configured: false quando eyemobile_config não existe", async () => {
    mockTransacoes([], []);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error("Network timeout"),
    } as never);

    const { result } = renderHook(() => useEyemobileDashboard({ startDate: "2026-11-10", endDate: "2026-11-10" }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.configured).toBe(false);
  });

  it("Situação A via Fallback: deduplica vendas históricas com mesmo ID", async () => {
    const rawSales = [
      { id: "row-1", valor: 15, data: "2026-11-10", descricao: "Venda Eyemobile #12345", observacoes: "Venda #12345" },
      { id: "row-2", valor: 15, data: "2026-11-10", descricao: "Venda Eyemobile #12345", observacoes: "Venda #12345" }, // dupe
      { id: "row-3", valor: 25, data: "2026-11-10", descricao: "Venda Eyemobile #67890", observacoes: "Venda #67890" },
    ];
    mockTransacoes(rawSales, [{ id: "cfg-1" }]);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error("Gateway 504"),
    } as never);

    const { result } = renderHook(() => useEyemobileDashboard({ startDate: "2026-11-10", endDate: "2026-11-10" }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.configured).toBe(true);
    // Deve conter apenas 2 transações após deduplicação, totalizando R$ 40
    expect(result.current.data?.kpis.totalTransactions).toBe(2);
    expect(result.current.data?.kpis.totalRevenue).toBe(40);
  });

  it("Isolamento de workspace: não considera configurado se o workspace for PF", async () => {
    // Workspace PF não deve ter acesso à integração PJ
    mockTransacoes([], [{ id: "cfg-1" }], {
      id: "ws-pf-123",
      tipo: "PF",
      user_id: "user-test",
    });
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error("Network timeout"),
    } as never);

    const { result } = renderHook(
      () => useEyemobileDashboard({ startDate: "2026-11-10", endDate: "2026-11-10" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.configured).toBe(false);
  });
});
