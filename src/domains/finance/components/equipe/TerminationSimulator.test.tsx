import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TerminationSimulator } from "./TerminationSimulator";

describe("TerminationSimulator", () => {
  it("troca o cenário e nunca chama uma mutação", () => {
    render(
      <TerminationSimulator
        dataAdmissao="2026-02-23"
        salarioCentavos={162_100}
        fgtsHistoricoEstimadoCentavos={129_708}
        dataReferencia="2026-08-17"
      />,
    );

    expect(screen.getByText("Custo estimado para a empresa")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acordo" }));
    expect(screen.getByText(/multa de 20%/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /demitir|pagar|confirmar desligamento/i })).not.toBeInTheDocument();
  });
});
