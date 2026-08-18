import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcertoSemanalFolguista } from "./AcertoSemanalFolguista";

const mocks = vi.hoisted(() => ({
  gerar: vi.fn(),
  addEscala: vi.fn(),
}));

vi.mock("@/domains/finance/hooks/useEquipeAcertos", () => ({
  useEquipeAcertos: () => ({
    data: [],
    isLoading: false,
    gerarAcerto: { mutateAsync: mocks.gerar, isPending: false },
  }),
}));

vi.mock("@/domains/finance/hooks/useFolguistaEscalas", () => ({
  useFolguistaEscalas: () => ({
    data: [],
    addEscala: { mutateAsync: mocks.addEscala, isPending: false },
    deleteEscala: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

describe("AcertoSemanalFolguista", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addEscala.mockResolvedValue("escala-1");
    mocks.gerar.mockResolvedValue("acerto-1");
  });

  it("registra a escala e gera obrigação pendente com diária e bônus auditáveis", async () => {
    render(
      <AcertoSemanalFolguista
        colaboradorId="colaborador-1"
        colaboradorNome="Luiz Fellipe Santos De Assis"
        valorDiaria={100}
        weekStart="2026-08-17"
      />,
    );

    fireEvent.click(screen.getByLabelText("Trabalhou na Segunda"));
    fireEvent.change(screen.getByLabelText("Meta de Segunda"), { target: { value: "20" } });
    expect(screen.getByText("R$ 120,00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /gerar acerto pendente/i }));

    await waitFor(() => expect(mocks.addEscala).toHaveBeenCalledWith(expect.objectContaining({
      colaborador_id: "colaborador-1",
      data: "2026-08-17",
      valor_diaria: 100,
      bateu_meta: true,
      valor_meta: 20,
    })));
    expect(mocks.gerar).toHaveBeenCalledWith({
      colaboradorId: "colaborador-1",
      periodoInicio: "2026-08-17",
      periodoFim: "2026-08-23",
      itens: [
        expect.objectContaining({ natureza: "diaria", valor: 100, escala_id: "escala-1" }),
        expect.objectContaining({ natureza: "meta", valor: 20 }),
      ],
    });
    expect(await screen.findByText(/acerto pendente criado/i)).toBeInTheDocument();
  });
});
