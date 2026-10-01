import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePdvReconciliation } from "./usePdvReconciliation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock do supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// Mock do WorkspaceContext
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: "workspace-123", name: "Workspace Teste" },
  }),
}));

// Mock do toast
const mockToast = vi.fn();
vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("usePdvReconciliation Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "conc-1",
            workspace_id: "workspace-123",
            external_transaction_id: "tx-ext-001",
            wallet_id: "wallet-456",
            gross_amount_cents: 10000,
            fee_cents: 200,
            net_amount_cents: 9800,
            occurred_at: "2026-09-30T10:00:00Z",
            payment_method: "credit_card",
            metadata: {},
            status: "conciliada",
          },
        ],
        error: null,
      }),
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("chama a RPC reconcile_pdv_transaction com os parâmetros corretos", async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        status: "reconciled",
        idempotent: false,
        conciliacao_id: "conc-1",
        workspace_id: "workspace-123",
        external_id: "tx-ext-001",
        net_amount_cents: 9800,
      },
      error: null,
    });

    const { result } = renderHook(() => usePdvReconciliation(), { wrapper });

    await act(async () => {
      await result.current.reconcileTransaction({
        p_external_id: "tx-ext-001",
        p_wallet_id: "wallet-456",
        p_gross_amount_cents: 10000,
        p_fee_cents: 200,
        p_net_amount_cents: 9800,
        p_occurred_at: "2026-09-30T10:00:00Z",
        p_payment_method: "credit_card",
      });
    });

    expect(mockRpc).toHaveBeenCalledWith("reconcile_pdv_transaction", {
      p_external_id: "tx-ext-001",
      p_wallet_id: "wallet-456",
      p_gross_amount_cents: 10000,
      p_fee_cents: 200,
      p_net_amount_cents: 9800,
      p_occurred_at: "2026-09-30T10:00:00Z",
      p_payment_method: "credit_card",
      p_metadata: {},
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Conciliação realizada com sucesso!",
      })
    );
  });

  it("trata resposta idempotente already_reconciled informando status com clareza", async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        status: "already_reconciled",
        idempotent: true,
        conciliacao_id: "conc-1",
        workspace_id: "workspace-123",
        external_id: "tx-ext-001",
        net_amount_cents: 9800,
      },
      error: null,
    });

    const { result } = renderHook(() => usePdvReconciliation(), { wrapper });

    await act(async () => {
      await result.current.reconcileTransaction({
        p_external_id: "tx-ext-001",
        p_wallet_id: "wallet-456",
        p_gross_amount_cents: 10000,
        p_fee_cents: 200,
        p_net_amount_cents: 9800,
        p_occurred_at: "2026-09-30T10:00:00Z",
        p_payment_method: "credit_card",
      });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Transação já conciliada",
      })
    );
  });
});
