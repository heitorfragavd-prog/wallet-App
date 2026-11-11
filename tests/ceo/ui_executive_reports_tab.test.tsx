import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutiveReportsTab } from "../../src/domains/ceo/components/ExecutiveReportsTab";
import * as useExecReportsHook from "../../src/domains/ceo/hooks/useExecutiveReports";
import { CeoExecutiveReport } from "../../src/domains/ceo/types/executive-report";

vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("Etapa 06 — Entrega E: Interface Visual dos Relatórios Executivos", () => {
  const mockReport: CeoExecutiveReport = {
    id: "rep-1",
    workspace_id: "ws-1",
    owner_id: "owner-1",
    reference_date: "2026-11-09",
    generated_at: "2026-11-10T13:00:00.000Z",
    period_type: "daily",
    period_start: "2026-11-09T00:00:00.000Z",
    period_end: "2026-11-09T23:59:59.999Z",
    financial_indicators: {
      faturamento: {
        faturamentoOntem: 1850.0,
        faturamentoMesAcumulado: 38200.0,
        pedidosOntem: 45,
        ticketMedioOntem: 41.11,
        mediaDiaSemanaOntem: 1600.0,
        diaSemanaOntemNome: "Segunda-feira",
        variacaoOntemVsMediaPercent: 15.6,
        pedidosMesAcumulado: 920,
        ticketMedioMes: 41.52,
        faturamentoMesAnterior: 35000.0,
        crescimentoMesPercent: 9.14,
        alertaQueda: false,
      },
      despesas: {
        despesasOntem: 320.0,
        despesasMesAcumulado: 14200.0,
        despesasPagasMes: 12000.0,
        despesasPendentesMes: 2200.0,
        contasVencidasQuantidade: 0,
        contasVencidasValor: 0,
        contasVencer7DiasQuantidade: 2,
        contasVencer7DiasValor: 1800.0,
        possiveisDuplicidadesQuantidade: 0,
        possiveisDuplicidadesValor: 0,
      },
      resultado: {
        receitaCompetencia: 38200.0,
        despesasCompetencia: 14200.0,
        resultadoOperacional: 24000.0,
        margemOperacionalPercent: 62.8,
        lucroBrutoConfirmado: 21000.0,
        margemBrutaConfirmadaPercent: 54.9,
        cmvTotal: 9500.0,
        cmvPercent: 24.8,
        coberturaFichasPercent: 88,
        statusConfiabilidadeLucro: "confirmado",
      },
      produtos: {
        top5Faturamento: [
          { id: "p1", nome: "X-Bacon Supremo", quantidade: 32, faturamento: 960.0, custoComprovadoNota: true },
        ],
        top5Quantidade: [
          { id: "p1", nome: "X-Bacon Supremo", quantidade: 32, faturamento: 960.0, custoComprovadoNota: true },
        ],
        produtosComCustoCadastrado: 44,
        totalProdutosCatalogo: 50,
        coberturaCustosPercent: 88,
        produtosSemCustoConhecido: 6,
        oportunidadesComerciais: [],
      },
      operacao: {
        atividadesAtrasadasQuantidade: 0,
        tarefasPendentesQuantidade: 1,
        alertasEstoqueQuantidade: 0,
        pendenciasFornecedoresQuantidade: 0,
        problemasConciliacaoQuantidade: 0,
        alertasOperacionais: [],
      },
      recomendaçõesResumo: [],
    },
    executive_summary: "Excelente desempenho na segunda-feira com crescimento de 15.6% acima da média.",
    recommendations: [
      {
        numero: 1,
        titulo: "Fortalecer Vendas do X-Bacon Supremo",
        problemaOuOportunidade: "O produto representa 51% do faturamento da noite de segunda-feira.",
        evidencia: "32 unidades vendidas a ticket médio elevado.",
        impactoEstimado: "+ R$ 600,00 na margem bruta semanal",
        grauConfianca: "alto",
        acaoRecomendada: "Criar promoção casada com bebida no PDV.",
      },
    ],
    status: "completed",
    sources_consulted: ["transacoes", "despesas"],
    data_quality_alerts: [],
    ai_model: "gemini-1.5-flash",
    ai_tokens_used: 480,
    ai_estimated_cost_usd: 0.0001,
    dispatch_status: { app: true, telegram: true },
    version: 1,
    created_at: "2026-11-10T13:00:00.000Z",
    updated_at: "2026-11-10T13:00:00.000Z",
  };

  it("deve renderizar a síntese executiva, indicadores e recomendações prioritárias", () => {
    vi.spyOn(useExecReportsHook, "useExecutiveReports").mockReturnValue({
      reports: [mockReport],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      generateReport: vi.fn(),
      isGenerating: false,
    });

    render(<ExecutiveReportsTab workspaceId="ws-1" />);

    expect(screen.getByText("Síntese Executiva do Wallet CEO")).toBeDefined();
    expect(screen.getByText(mockReport.executive_summary)).toBeDefined();
    expect(screen.getByText("Bloco 1: Faturamento")).toBeDefined();
    expect(screen.getByText("Bloco 2: Despesas")).toBeDefined();
    expect(screen.getByText("Bloco 3: Resultado Operacional")).toBeDefined();
    expect(screen.getByText("Fortalecer Vendas do X-Bacon Supremo")).toBeDefined();
    expect(screen.getByText("IA Executiva Ativa")).toBeDefined();
  });

  it("deve acionar a geração/atualização manual de relatório ao clicar no botão", () => {
    const mockGenerate = vi.fn();
    vi.spyOn(useExecReportsHook, "useExecutiveReports").mockReturnValue({
      reports: [mockReport],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      generateReport: mockGenerate,
      isGenerating: false,
    });

    render(<ExecutiveReportsTab workspaceId="ws-1" />);

    const btnAtualizar = screen.getByText("Atualizar Dados");
    fireEvent.click(btnAtualizar);

    expect(mockGenerate).toHaveBeenCalledWith("2026-11-09");
  });
});
