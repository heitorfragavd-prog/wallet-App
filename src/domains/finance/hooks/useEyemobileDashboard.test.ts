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

// Mock encadeável do query builder do Supabase para a tabela transacoes
function mockTransacoes(rows: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  vi.mocked(supabase.from).mockReturnValue(chain as never);
  return chain;
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
});

