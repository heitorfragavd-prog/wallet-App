import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Colaborador } from "@/domains/finance/hooks/useColaboradores";
import { formatMonthInSaoPaulo, getSaoPauloDateParts } from "@/domains/finance/hooks/useEquipeResumo";
import { ColaboradorCard } from "./ColaboradorCard";
import { EquipeSummaryCards } from "./EquipeSummaryCards";

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ activeWorkspace: { id: "ws-1", regime_encargos: "geral" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    })),
  },
}));

describe("EquipeControleMensal — Auditoria e Conformidade Visual", () => {
  const colaboradorSemPix: Colaborador = {
    id: "colab-1",
    workspace_id: "ws-1",
    nome: "Viviane Cristina",
    tipo: "socio",
    cargo: "Dona",
    status: "ativo",
    salario_bruto: 5000,
    valor_pro_labore: 5000,
    dia_pagamento: 25,
    pix_chave: null,
    pix_tipo: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };

  const colaboradorComPix: Colaborador = {
    id: "colab-2",
    workspace_id: "ws-1",
    nome: "Heitor Fraga",
    tipo: "socio",
    cargo: "Dono",
    status: "ativo",
    salario_bruto: 5000,
    valor_pro_labore: 5000,
    dia_pagamento: 25,
    pix_chave: "11408578603",
    pix_tipo: "cpf",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };

  it("exibe 'Chave Pix não cadastrada' e NÃO confunde ausência de chave Pix com pagamento pendente", () => {
    render(
      <ColaboradorCard
        colaborador={colaboradorSemPix}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText(/Chave Pix não cadastrada/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pix pendente/i)).not.toBeInTheDocument();
  });

  it("exibe 'Pix cadastrado' quando colaborador possui chave Pix salva", () => {
    render(
      <ColaboradorCard
        colaborador={colaboradorComPix}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText(/Pix cadastrado/i)).toBeInTheDocument();
    expect(screen.queryByText(/Chave Pix não cadastrada/i)).not.toBeInTheDocument();
  });

  it("apresenta dados do resumo financeiro mensal no cartão do colaborador", () => {
    render(
      <ColaboradorCard
        colaborador={colaboradorComPix}
        monthlySummary={{
          totalPagoNoMes: 5000,
          qtdPagosNoMes: 1,
          totalPendenteCompetencia: 0,
          qtdPendentesCompetencia: 0,
          ultimoPagamento: {
            valor: 5000,
            data: "2026-10-30T15:00:00Z",
            origem: "manual",
          },
        }}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText("Pago no mês")).toBeInTheDocument();
    expect(screen.getByText("1 quitação(ões)")).toBeInTheDocument();
    expect(screen.getByText("Pendente competência")).toBeInTheDocument();
    expect(screen.getByText("Em dia")).toBeInTheDocument();
    expect(screen.getByText(/Último pagamento:/i)).toBeInTheDocument();
  });

  it("EquipeSummaryCards exibe Custo Mensal, Pago no Mês, Pendentes e Próximo Vencimento", () => {
    render(
      <EquipeSummaryCards
        custoMensal={10000}
        totalPagoNoMes={5000}
        pagosNoMes={1}
        totalPendente={7558.49}
        pendentes={4}
        proximoVencimento="2026-11-06"
        mesLabel="Novembro de 2026"
        explicacaoPendencias={[
          {
            acertoId: "ac-1",
            colaboradorId: "colab-1",
            colaboradorNome: "Viviane Cristina",
            tipo: "pro_labore",
            periodoInicio: "2026-11-01",
            periodoFim: "2026-11-30",
            vencimento: "2026-11-25",
            valor: 5000,
          },
          {
            acertoId: "ac-2",
            colaboradorId: "colab-3",
            colaboradorNome: "Shuellen Pereira",
            tipo: "salario",
            periodoInicio: "2026-11-01",
            periodoFim: "2026-11-30",
            vencimento: "2026-11-06",
            valor: 1621,
          },
        ]}
      />
    );

    expect(screen.getByText("Custo mensal estimado")).toBeInTheDocument();
    expect(screen.getByText("Pago no mês (Novembro de 2026)")).toBeInTheDocument();
    expect(screen.getByText("Obrigações pendentes")).toBeInTheDocument();
    expect(screen.getByText("Próximo vencimento")).toBeInTheDocument();

    // Clicar em Obrigações pendentes abre o modal explicativo
    const pendentesCard = screen.getByText("Obrigações pendentes").closest(".overflow-hidden");
    if (pendentesCard) {
      fireEvent.click(pendentesCard);
      expect(
        screen.getByText(/Composição das Obrigações Pendentes/i)
      ).toBeInTheDocument();
      expect(screen.getByText("Viviane Cristina")).toBeInTheDocument();
      expect(screen.getByText("Shuellen Pereira")).toBeInTheDocument();
    }
  });

  it("formatMonthInSaoPaulo converte timestamps UTC respeitando o fuso America/Sao_Paulo", () => {
    // 2026-10-31 23:30:00 UTC = 2026-10-31 20:30:00 em SP
    const monthSp = formatMonthInSaoPaulo("2026-10-31T23:30:00Z");
    expect(monthSp).toBe("2026-10");

    // 2026-11-01 02:30:00 UTC = 2026-10-31 23:30:00 em SP (ainda outubro em SP!)
    const endOfOctSp = formatMonthInSaoPaulo("2026-11-01T02:30:00Z");
    expect(endOfOctSp).toBe("2026-10");

    // 2026-11-01 04:00:00 UTC = 2026-11-01 01:00:00 em SP
    const novSp = formatMonthInSaoPaulo("2026-11-01T04:00:00Z");
    expect(novSp).toBe("2026-11");
  });

  it("getSaoPauloDateParts retorna ano, mês e dia no fuso America/Sao_Paulo", () => {
    const parts = getSaoPauloDateParts(new Date("2026-11-02T12:00:00Z"));
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(11);
    expect(parts.day).toBe(2);
    expect(parts.isoDate).toBe("2026-11-02");
    expect(parts.yearMonth).toBe("2026-11");
  });
});
