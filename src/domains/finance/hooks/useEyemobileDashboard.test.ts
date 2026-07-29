import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useEyemobileDashboard } from "./useEyemobileDashboard";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from "@/integrations/supabase/client";

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

describe("useEyemobileDashboard", () => {
  it("consulta o painel remoto com os filtros de período e loja", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { configured: true, sales: [], products: [], stores: [{ id: "store-1", name: "Centro" }] },
      error: null,
    } as never);

    const { result } = renderHook(() => useEyemobileDashboard({ startDate: "2026-07-01", endDate: "2026-07-31", storeId: "store-1" }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(supabase.functions.invoke).toHaveBeenCalledWith("eyemobile-sync", {
      body: { mode: "DASHBOARD", start_date: "2026-07-01", end_date: "2026-07-31", store_id: "store-1" },
    });
    expect(result.current.data?.stores).toEqual([{ id: "store-1", name: "Centro" }]);
  });
});
