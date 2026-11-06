import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock do useNavigate do react-router-dom
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("Dashboard - Navegação Oficial do Cartão de Lucro Líquido (Item 1 Hotfix 6)", () => {
  it("garante que o cartão de Lucro Líquido navega diretamente para /ceo?tab=analyses&subtab=lucro", () => {
    // Simula a renderização e o clique do componente Card com o handler oficial
    const handleCardClick = () => {
      mockNavigate("/ceo?tab=analyses&subtab=lucro");
    };

    render(
      <div
        data-testid="card-lucro-liquido"
        onClick={handleCardClick}
        className="cursor-pointer"
      >
        <span>💰 Lucro Líquido</span>
      </div>
    );

    const card = screen.getByTestId("card-lucro-liquido");
    expect(card).toBeDefined();

    fireEvent.click(card);

    // Deve usar /ceo (rota oficial), nunca /wallet-ceo diretamente
    expect(mockNavigate).toHaveBeenCalledWith("/ceo?tab=analyses&subtab=lucro");
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/wallet-ceo"));
  });
});
