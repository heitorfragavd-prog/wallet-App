import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { AgentActionProposalCard } from "./AgentActionProposalCard";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";

describe("AgentActionProposalCard", () => {
  const mockProposal: ActionProposal = {
    id: "act-123",
    workspaceId: "ws-1",
    userId: "user-1",
    actionType: "criar_despesa",
    actionVersion: "v1",
    summary: "Cadastrar despesa de Aluguel no valor de R$ 2.500,00",
    payload: { amount: 2500, description: "Aluguel", category: "Moradia" },
    idempotencyHash: "hash-xyz",
    status: "prepared",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  it("deve renderizar o resumo da proposta e os botões de ação", () => {
    render(
      <AgentActionProposalCard
        proposal={mockProposal}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Cadastrar despesa de Aluguel no valor de R$ 2.500,00"),
    ).toBeDefined();
    expect(screen.getByText("Confirmar Operação")).toBeDefined();
    expect(screen.getByText("Cancelar")).toBeDefined();
  });

  it("deve disparar onConfirm quando o botão de confirmação for clicado", () => {
    const onConfirm = vi.fn();
    render(
      <AgentActionProposalCard
        proposal={mockProposal}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Confirmar Operação"));
    expect(onConfirm).toHaveBeenCalledWith("act-123");
  });

  it("deve disparar onCancel quando o botão de cancelar for clicado", () => {
    const onCancel = vi.fn();
    render(
      <AgentActionProposalCard
        proposal={mockProposal}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText("Cancelar"));
    expect(onCancel).toHaveBeenCalledWith("act-123");
  });
});
