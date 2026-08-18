import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AgentVisualizationRenderer } from "./AgentVisualizationRenderer";
import { visualizationContractSchema } from "../types/visualization";

describe("Visualization Contract & Renderer", () => {
  it("deve validar contrato válido com Zod", () => {
    const validContract = {
      type: "bar",
      title: "Despesas por Categoria",
      xAxis: { key: "category" },
      yAxis: { format: "currency" },
      series: [{ key: "amount", label: "Gasto", color: "#ef4444" }],
      data: [
        { category: "Alimentação", amount: 1200 },
        { category: "Transporte", amount: 450 },
      ],
      insight: "Alimentação representou a maior parte dos gastos.",
    };

    const parsed = visualizationContractSchema.safeParse(validContract);
    expect(parsed.success).toBe(true);
  });

  it("deve renderizar mensagem de erro graciosa para contrato inválido", () => {
    const invalidContract = {
      type: "tipo_inexistente",
      title: 12345, // inválido
    };

    render(<AgentVisualizationRenderer contract={invalidContract} />);
    expect(screen.getByText("Visualização indisponível")).toBeDefined();
  });

  it("deve renderizar estado vazio quando o array de dados estiver vazio", () => {
    const emptyContract = {
      type: "line",
      title: "Evolução do Saldo",
      data: [],
    };

    render(<AgentVisualizationRenderer contract={emptyContract} />);
    expect(screen.getByText("Evolução do Saldo")).toBeDefined();
    expect(
      screen.getByText("Nenhum dado encontrado para o período especificado."),
    ).toBeDefined();
  });

  it("deve renderizar KPI cards corretamente", () => {
    const kpiContract = {
      type: "kpi",
      title: "Indicadores Principais",
      data: [
        { label: "Receita Total", value: 50000 },
        { label: "Despesa Total", value: 30000 },
      ],
    };

    render(<AgentVisualizationRenderer contract={kpiContract} />);
    expect(screen.getByText("Indicadores Principais")).toBeDefined();
    expect(screen.getByText("Receita Total")).toBeDefined();
    expect(screen.getByText("Despesa Total")).toBeDefined();
  });
});
