import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmployeeCostBreakdown } from "./EmployeeCostBreakdown";

describe("EmployeeCostBreakdown", () => {
  it("mostra encargos MEI e piso apenas como alerta", () => {
    render(
      <EmployeeCostBreakdown
        salarioCentavos={162_100}
        inssEmpresaCentavos={4_863}
        fgtsCentavos={12_968}
        decimoTerceiroCentavos={13_508}
        feriasCentavos={18_011}
        pisoCategoriaCentavos={168_118}
        convencaoMte="MR009846/2026"
        fonteUrl="https://mediador.trabalho.gov.br/exemplo"
      />,
    );

    expect(screen.getByText(/3%/)).toBeInTheDocument();
    expect(screen.getByText(/48,63/)).toBeInTheDocument();
    expect(screen.getByText(/diferença informativa de R\$\s*60,18/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.621,00/)).toBeInTheDocument();
  });
});
