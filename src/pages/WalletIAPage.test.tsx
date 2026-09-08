import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-123" } } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [] }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.com" }, error: null }),
      }),
    },
  },
}));

vi.mock("@/core/logging/LoggerService", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: "ws-test-1", nome: "Workspace de Teste" },
    workspaces: [{ id: "ws-test-1", nome: "Workspace de Teste" }],
  }),
}));

vi.mock("@/shared/components/layouts/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ia/ConversasSidebar", () => ({
  ConversasSidebar: () => <div data-testid="conversas-sidebar">Sidebar de Conversas</div>,
}));

vi.mock("@/domains/finance/hooks/useReceitas", () => ({
  useReceitas: () => ({ receitas: [], loading: false }),
}));

vi.mock("@/domains/finance/hooks/useDespesas", () => ({
  useDespesas: () => ({ despesas: [], loading: false }),
}));

vi.mock("@/domains/finance/hooks/useEyemobileDashboard", () => ({
  useEyemobileDashboard: () => ({ data: { configured: true, kpis: { totalRevenue: 1000 } } }),
}));

import WalletIAPage from "./WalletIAPage";
import IAPage from "./IAPage";

describe("WalletIAPage Component", () => {
  it("renderiza a interface unificada com header, sidebar e estado vazio", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <WalletIAPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Wallet IA")).toBeInTheDocument();
    expect(screen.getByText(/Workspace de Teste/)).toBeInTheDocument();
    expect(screen.getByTestId("conversas-sidebar")).toBeInTheDocument();
    expect(screen.getByText("Como posso ajudar?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Pergunte ou envie imagem/i)).toBeInTheDocument();
  });

  it("exibe sugestões de perguntas rápidas", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <WalletIAPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Quanto vendi hoje?")).toBeInTheDocument();
    expect(screen.getByText("Qual meu lucro este mês?")).toBeInTheDocument();
  });

  it("regressão: IAPage legada continua renderizando normalmente para a rota /ia", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <IAPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Inteligência Artificial")).toBeInTheDocument();
    expect(screen.getByText("Agent V2")).toBeInTheDocument();
    expect(screen.getByText("Consulta Rápida")).toBeInTheDocument();
    expect(screen.getByText("IA Legada")).toBeInTheDocument();
  });
});
