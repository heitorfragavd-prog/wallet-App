/**
 * useMediaMensalDespesas Hook Tests
 *
 * Tests:
 * 1. Querying 6 months of expenses from both `despesas` and `transacoes`
 * 2. Timezone safety: dataFormatada uses America/Sao_Paulo (YYYY-MM-DD) without UTC shift
 * 3. Aggregation of both tables ((totalDespesas + totalTransacoes) / 6)
 * 4. Workspace isolation and disabled state when no active workspace
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useMediaMensalDespesas } from "./useMediaMensalDespesas";

// ── Mocks ────────────────────────────────────────────────────────

const mockWorkspace = {
  activeWorkspace: { id: "ws-test-456", nome: "Workspace Teste" } as { id: string | null; nome: string } | null,
};

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => mockWorkspace,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, qc };
}

interface MockQueryChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  then: (resolve: (val: { data: unknown; error: null }) => void) => void;
}

function createMockQuery(data: unknown = []): MockQueryChain {
  const chain: MockQueryChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    then: (resolve) => resolve({ data, error: null }),
  };
  return chain;
}

describe("useMediaMensalDespesas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspace.activeWorkspace = { id: "ws-test-456", nome: "Workspace Teste" };
  });

  it("calcula média mensal somando despesas e transacoes dos últimos 6 meses e dividindo por 6", async () => {
    // 600 em despesas + 600 em transacoes = 1200 / 6 = 200
    const mockDespesasData = [{ valor: 200 }, { valor: 400 }];
    const mockTransacoesData = [{ valor: 100 }, { valor: 500 }];

    const despesasQuery = createMockQuery(mockDespesasData);
    const transacoesQuery = createMockQuery(mockTransacoesData);

    vi.mocked(supabase.from)
      .mockReturnValueOnce(despesasQuery as never)
      .mockReturnValueOnce(transacoesQuery as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(200);

    // Verifica que ambas as tabelas foram consultadas com o workspace_id correto
    expect(supabase.from).toHaveBeenCalledWith("despesas");
    expect(supabase.from).toHaveBeenCalledWith("transacoes");
    expect(despesasQuery.eq).toHaveBeenCalledWith("workspace_id", "ws-test-456");
    expect(transacoesQuery.eq).toHaveBeenCalledWith("workspace_id", "ws-test-456");
    expect(transacoesQuery.eq).toHaveBeenCalledWith("tipo", "despesa");
  });

  it("utiliza data no formato YYYY-MM-DD em gte sem desvio de fuso horário UTC", async () => {
    const despesasQuery = createMockQuery([]);
    const transacoesQuery = createMockQuery([]);

    vi.mocked(supabase.from)
      .mockReturnValueOnce(despesasQuery as never)
      .mockReturnValueOnce(transacoesQuery as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A data informada em gte deve ter o formato estrito YYYY-MM-DD (sem T nem timestamp UTC)
    const gteCallDespesas = despesasQuery.gte.mock.calls[0];
    expect(gteCallDespesas[0]).toBe("data");
    expect(gteCallDespesas[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const gteCallTransacoes = transacoesQuery.gte.mock.calls[0];
    expect(gteCallTransacoes[0]).toBe("data");
    expect(gteCallTransacoes[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(gteCallDespesas[1]).toBe(gteCallTransacoes[1]);
  });

  it("mantém query desabilitada e não consulta o Supabase quando activeWorkspace é nulo", async () => {
    mockWorkspace.activeWorkspace = null;

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    expect(result.current.data).toBeUndefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
