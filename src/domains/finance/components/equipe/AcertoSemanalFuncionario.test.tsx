import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcertoSemanalFuncionario } from "./AcertoSemanalFuncionario";

const mocks = vi.hoisted(() => ({ gerar: vi.fn() }));

vi.mock("@/domains/finance/hooks/useEquipeAcertos", () => ({
  useEquipeAcertos: () => ({
    data: [],
    isLoading: false,
    gerarAcerto: { mutateAsync: mocks.gerar, isPending: false },
  }),
}));

describe("AcertoSemanalFuncionario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gerar.mockResolvedValue("acerto-1");
  });

  it("gera uma única obrigação pendente com transporte e meta separados", async () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colaborador-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        weekStart="2026-08-17"
      />,
    );

    fireEvent.change(screen.getByLabelText("Meta de Segunda"), { target: { value: "20" } });
    expect(screen.getByText("R$ 129,50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /gerar acerto pendente/i }));

    await waitFor(() => expect(mocks.gerar).toHaveBeenCalledTimes(1));
    expect(mocks.gerar).toHaveBeenCalledWith({
      colaboradorId: "colaborador-1",
      periodoInicio: "2026-08-17",
      periodoFim: "2026-08-23",
      itens: [
        expect.objectContaining({ natureza: "transporte", valor: 109.5 }),
        expect.objectContaining({ natureza: "meta", valor: 20 }),
      ],
    });
    expect(await screen.findByText(/acerto pendente criado/i)).toBeInTheDocument();
    expect(screen.queryByText(/pago com sucesso/i)).not.toBeInTheDocument();
  });

  it("mostra Uber base, passagem, diferenca e meta sem misturar o relatorio", () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colaborador-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-08-17"
      />,
    );

    fireEvent.change(screen.getByLabelText("Uber real de Segunda"), { target: { value: "13.92" } });
    expect(screen.getAllByText("Diferença").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,92/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Uber Fixo \(base\)|Uber base/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Passagem/i).length).toBeGreaterThan(0);
  });
});
