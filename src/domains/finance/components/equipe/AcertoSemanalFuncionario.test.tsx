import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcertoSemanalFuncionario } from "./AcertoSemanalFuncionario";

let mockAcertosData: Record<string, unknown>[] = [];
let mockAjustesData: Record<string, unknown>[] = [];
let mockIsPending = false;
const mockGerar = vi.fn();

vi.mock("@/domains/finance/hooks/useEquipeAcertos", () => ({
  useEquipeAcertos: () => ({
    data: mockAcertosData,
    acertos: mockAcertosData,
    ajustes: mockAjustesData,
    isLoading: false,
    gerarAcerto: {
      mutateAsync: mockGerar,
      isPending: mockIsPending,
    },
  }),
}));

describe("AcertoSemanalFuncionario — Regra Oficial de Transporte e Ajuste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcertosData = [];
    mockAjustesData = [];
    mockIsPending = false;
    mockGerar.mockResolvedValue("acerto-uuid-123");
  });

  it("1. Renderiza Seção A, Seção B e Seção C com os dois períodos de referência", () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
        pixChave="31991423782"
        pixTipo="telefone"
      />
    );

    expect(screen.getByText(/Seção A/i)).toBeInTheDocument();
    expect(screen.getByText(/Transporte Antecipado — Semana Atual/i)).toBeInTheDocument();
    expect(screen.getAllByText(/02\/11 a 08\/11/i).length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/Seção B/i)).toBeInTheDocument();
    expect(screen.getByText(/Ajuste de Uber — Semana Anterior/i)).toBeInTheDocument();
    expect(screen.getAllByText(/26\/10 a 01\/11/i).length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/Seção C/i)).toBeInTheDocument();
    expect(screen.getByText(/Total a Transferir na 2ª Feira/i)).toBeInTheDocument();
    expect(screen.getByText(/PIX: 31991423782/i)).toBeInTheDocument();
  });

  it("2. Cenário 1: Seis dias de antecipação = R$ 109,50 (Uber real igual à base de R$ 12,00)", () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    // 6 dias x R$ 18,25 = R$ 109,50
    // Como os 6 dias da semana anterior têm Uber real default 12,00 (diferença zero), total = 109,50
    expect(screen.getByRole("button", { name: /gerar acerto pendente/i })).toHaveTextContent("R$ 109,50");
  });

  it("3. Cenário 2: Uber anterior de R$ 11,98 em um dia e R$ 12,00 nos demais -> R$ 109,48", async () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    // Altera Uber real de Segunda na semana anterior para 11.98 (-0,02 de diferença)
    const inputSegundaUber = screen.getByLabelText("Uber real de Segunda");
    fireEvent.change(inputSegundaUber, { target: { value: "11.98" } });

    // Total agora deve ser 109,50 - 0,02 = R$ 109,48
    expect(screen.getByRole("button", { name: /gerar acerto pendente/i })).toHaveTextContent("R$ 109,48");

    fireEvent.click(screen.getByRole("button", { name: /gerar acerto pendente/i }));

    await waitFor(() => expect(mockGerar).toHaveBeenCalledTimes(1));
    expect(mockGerar).toHaveBeenCalledWith(
      expect.objectContaining({
        colaboradorId: "colab-1",
        periodoInicio: "2026-11-02",
        periodoFim: "2026-11-08",
        itens: [
          expect.objectContaining({ natureza: "transporte", valor: 109.5 }),
          expect.objectContaining({ natureza: "ajuste", valor: -0.02 }),
        ],
      })
    );
  });

  it("4. Cenário 3: Uber anterior de R$ 15,00 em um dia e R$ 12,00 nos demais -> R$ 112,50", async () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    // Altera Uber real de Segunda para 15.00 (+3,00)
    const inputSegundaUber = screen.getByLabelText("Uber real de Segunda");
    fireEvent.change(inputSegundaUber, { target: { value: "15.00" } });

    // Total deve ser 109,50 + 3,00 = R$ 112,50
    expect(screen.getByRole("button", { name: /gerar acerto pendente/i })).toHaveTextContent("R$ 112,50");

    fireEvent.click(screen.getByRole("button", { name: /gerar acerto pendente/i }));

    await waitFor(() => expect(mockGerar).toHaveBeenCalledTimes(1));
    expect(mockGerar).toHaveBeenCalledWith(
      expect.objectContaining({
        colaboradorId: "colab-1",
        periodoInicio: "2026-11-02",
        periodoFim: "2026-11-08",
        itens: [
          expect.objectContaining({ natureza: "transporte", valor: 109.5 }),
          expect.objectContaining({ natureza: "ajuste", valor: 3 }),
        ],
      })
    );
  });

  it("5. Cenário 4: Vários ajustes positivos e negativos na mesma semana", async () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    // Seg: 15.00 (+3.00)
    fireEvent.change(screen.getByLabelText("Uber real de Segunda"), { target: { value: "15.00" } });
    // Ter: 11.98 (-0.02)
    fireEvent.change(screen.getByLabelText("Uber real de Terça"), { target: { value: "11.98" } });
    // Qua: 11.50 (-0.50)
    fireEvent.change(screen.getByLabelText("Uber real de Quarta"), { target: { value: "11.50" } });

    // Saldo ajuste: +3.00 - 0.02 - 0.50 = +2.48
    // Total transferência: 109.50 + 2.48 = 111.98
    expect(screen.getByRole("button", { name: /gerar acerto pendente/i })).toHaveTextContent("R$ 111,98");

    fireEvent.click(screen.getByRole("button", { name: /gerar acerto pendente/i }));

    await waitFor(() => expect(mockGerar).toHaveBeenCalledTimes(1));
    expect(mockGerar).toHaveBeenCalledWith(
      expect.objectContaining({
        colaboradorId: "colab-1",
        periodoInicio: "2026-11-02",
        periodoFim: "2026-11-08",
        itens: [
          expect.objectContaining({ natureza: "transporte", valor: 109.5 }),
          expect.objectContaining({ natureza: "ajuste", valor: 2.48 }),
        ],
      })
    );
  });

  it("6. Cenário 5: Ausência de trabalho e antecipações em dias específicos", async () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    // Desmarca Quarta na semana atual (não vai trabalhar -> 5 dias previstos = 5 * 18.25 = 91.25)
    fireEvent.click(screen.getByLabelText("Previsão de trabalho na Quarta"));
    expect(screen.getByRole("button", { name: /gerar acerto pendente/i })).toHaveTextContent("R$ 91,25");

    // Desmarca Terça na semana anterior (não recebeu antecipação -> não cria diferença artificial)
    fireEvent.click(screen.getByLabelText("Recebeu antecipação na Terça"));
    fireEvent.change(screen.getByLabelText("Uber real de Terça"), { target: { value: "" } });

    // Permanece R$ 91,25
    expect(screen.getByRole("button", { name: /gerar acerto pendente/i })).toHaveTextContent("R$ 91,25");
  });

  it("7. Cenário 7: Proteção contra duplo clique (isPending desabilita botão e mostra spinner)", () => {
    mockIsPending = true;

    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(screen.getByText(/Salvando acerto.../i)).toBeInTheDocument();
  });

  it("8. Cenário 8: Acerto já pago é bloqueado para edição (imutabilidade)", () => {
    mockAcertosData = [
      {
        id: "acerto-pago-1",
        periodo_inicio: "2026-11-02",
        periodo_fim: "2026-11-08",
        status: "pago",
        valor_total: 109.5,
      },
    ];

    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    expect(screen.getByText(/Acerto já pago em definitivo/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /acerto já pago/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/Acerto Pago \(Bloqueado\)/i);
  });

  it("9. Cenário 9: Exibe mensagem de erro estruturada quando a RPC falha", async () => {
    mockGerar.mockRejectedValue(new Error("PGRST202: Função não encontrada no catálogo"));

    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /gerar acerto pendente/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "PGRST202: Função não encontrada no catálogo"
    );
  });

  it("10. Restaura estado exato dos inputs a partir de acertoAtual.detalhes (reload de tela)", () => {
    mockAcertosData = [
      {
        id: "acerto-pendente-1",
        tipo: "semanal_funcionario",
        periodo_inicio: "2026-11-02",
        periodo_fim: "2026-11-08",
        status: "pendente",
        valor_total: 112.5,
        detalhes: {
          semana_atual: [
            { date: "2026-11-02", dayName: "Segunda", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-11-03", dayName: "Terça", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-11-04", dayName: "Quarta", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-11-05", dayName: "Quinta", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-11-06", dayName: "Sexta", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-11-07", dayName: "Sábado", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-11-08", dayName: "Domingo", previsaoTrabalho: false, uberFixo: 12, passagem: 6.25 },
          ],
          semana_anterior: [
            { date: "2026-10-26", dayName: "Segunda", recebeuAntecipacao: true, uberAntecipado: 12, uberReal: 15, meta: null },
            { date: "2026-10-27", dayName: "Terça", recebeuAntecipacao: true, uberAntecipado: 12, uberReal: 12, meta: null },
            { date: "2026-10-28", dayName: "Quarta", recebeuAntecipacao: true, uberAntecipado: 12, uberReal: 12, meta: null },
            { date: "2026-10-29", dayName: "Quinta", recebeuAntecipacao: true, uberAntecipado: 12, uberReal: 12, meta: null },
            { date: "2026-10-30", dayName: "Sexta", recebeuAntecipacao: true, uberAntecipado: 12, uberReal: 12, meta: null },
            { date: "2026-10-31", dayName: "Sábado", recebeuAntecipacao: true, uberAntecipado: 12, uberReal: 12, meta: null },
            { date: "2026-11-01", dayName: "Domingo", recebeuAntecipacao: false, uberAntecipado: 0, uberReal: null, meta: null },
          ],
        },
      },
    ];

    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    const inputSegundaUber = screen.getByLabelText("Uber real de Segunda") as HTMLInputElement;
    expect(inputSegundaUber.value).toBe("15");
    expect(screen.getByRole("button", { name: /atualizar acerto pendente/i })).toHaveTextContent("R$ 112,50");
  });

  it("11. Carrega histórico comprovado da semana anterior através de acertoAnterior.detalhes", () => {
    mockAcertosData = [
      {
        id: "acerto-semana-passada",
        tipo: "semanal_funcionario",
        periodo_inicio: "2026-10-26",
        periodo_fim: "2026-11-01",
        status: "pago",
        detalhes: {
          semana_atual: [
            { date: "2026-10-26", dayName: "Segunda", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-10-27", dayName: "Terça", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-10-28", dayName: "Quarta", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-10-29", dayName: "Quinta", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-10-30", dayName: "Sexta", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-10-31", dayName: "Sábado", previsaoTrabalho: true, uberFixo: 12, passagem: 6.25 },
            { date: "2026-11-01", dayName: "Domingo", previsaoTrabalho: false, uberFixo: 12, passagem: 6.25 },
          ],
        },
      },
    ];

    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    expect(screen.getByText(/Antecipações da semana anterior carregadas do histórico persistido/i)).toBeInTheDocument();
  });

  it("12. Reembolso de Uber elegível sem antecipação (recebeuAntecipacao=false, uberReal=20)", async () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    // Desmarca antecipação da Segunda e informa R$ 20,00 de Uber real elegível do próprio bolso
    fireEvent.click(screen.getByLabelText("Recebeu antecipação na Segunda"));
    fireEvent.change(screen.getByLabelText("Uber real de Segunda"), { target: { value: "20.00" } });

    // Total: 109,50 + 20,00 = 129,50
    expect(screen.getByRole("button", { name: /gerar acerto pendente/i })).toHaveTextContent("R$ 129,50");

    fireEvent.click(screen.getByRole("button", { name: /gerar acerto pendente/i }));

    await waitFor(() => expect(mockGerar).toHaveBeenCalledTimes(1));
    expect(mockGerar).toHaveBeenCalledWith(
      expect.objectContaining({
        ajustesDiarios: expect.arrayContaining([
          expect.objectContaining({
            data_gasto: "2026-10-26",
            valor_antecipado: 0,
            valor_real: 20,
            diferenca: 20,
          }),
        ]),
        detalhes: expect.objectContaining({
          origem: "AcertoSemanalFuncionario",
        }),
      })
    );
  });

  it("13. Desconto total quando recebeu antecipação mas não gastou nada (uberReal=0)", async () => {
    render(
      <AcertoSemanalFuncionario
        colaboradorId="colab-1"
        colaboradorNome="Shuellen Pereira Santos"
        valorPassagem={6.25}
        uberBase={12}
        weekStart="2026-11-02"
        previousWeekStart="2026-10-26"
      />
    );

    // Mantém antecipação na Segunda (R$ 12,00) e informa gasto zero (0.00)
    fireEvent.change(screen.getByLabelText("Uber real de Segunda"), { target: { value: "0" } });

    // Desconto de -12,00: 109,50 - 12,00 = 97,50
    expect(screen.getByRole("button", { name: /gerar acerto pendente/i })).toHaveTextContent("R$ 97,50");
  });
});
