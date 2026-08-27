import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { WorkspaceSwitcher } from "../WorkspaceSwitcher";
import { useWorkspace, Workspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/shared/hooks/use-toast";

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: vi.fn(),
}));

vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: vi.fn(),
}));

const mockWorkspaces: Workspace[] = [
  {
    id: "ws-1",
    user_id: "u-1",
    nome: "Conta Rodo Point",
    tipo: "PJ",
    is_default: true,
  },
  {
    id: "ws-2",
    user_id: "u-1",
    nome: "Minha Conta Pessoal",
    tipo: "PF",
    is_default: false,
  },
];

describe("WorkspaceSwitcher Component", () => {
  const setActiveWorkspaceMock = vi.fn();
  const createWorkspaceMock = vi.fn();
  const toastMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as any).mockReturnValue({ toast: toastMock });
    (useWorkspace as any).mockReturnValue({
      workspaces: mockWorkspaces,
      activeWorkspace: mockWorkspaces[0],
      setActiveWorkspace: setActiveWorkspaceMock,
      createWorkspace: createWorkspaceMock,
    });
  });

  it("renders active workspace name and badge correctly", () => {
    render(<WorkspaceSwitcher />);

    expect(screen.getByText("Conta Rodo Point")).toBeInTheDocument();
    expect(screen.getByText("PJ")).toBeInTheDocument();
    expect(screen.getByText("Pessoa Jurídica")).toBeInTheDocument();
  });

  it("renders PF active workspace with correct badge and label", () => {
    (useWorkspace as any).mockReturnValue({
      workspaces: mockWorkspaces,
      activeWorkspace: mockWorkspaces[1],
      setActiveWorkspace: setActiveWorkspaceMock,
      createWorkspace: createWorkspaceMock,
    });

    render(<WorkspaceSwitcher />);

    expect(screen.getByText("Minha Conta Pessoal")).toBeInTheDocument();
    expect(screen.getByText("PF")).toBeInTheDocument();
    expect(screen.getByText("Pessoa Física")).toBeInTheDocument();
  });

  it("renders collapsed view with title attribute", () => {
    render(<WorkspaceSwitcher isCollapsed={true} />);

    const button = screen.getByTitle("Conta Rodo Point");
    expect(button).toBeInTheDocument();
    expect(screen.queryByText("Pessoa Jurídica")).not.toBeInTheDocument();
  });

  it("renders fallback state when no workspace is active", () => {
    (useWorkspace as any).mockReturnValue({
      workspaces: [],
      activeWorkspace: null,
      setActiveWorkspace: setActiveWorkspaceMock,
      createWorkspace: createWorkspaceMock,
    });

    render(<WorkspaceSwitcher />);

    expect(screen.getByText("Carregando...")).toBeInTheDocument();
  });
});