import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePontoEquilibrio } from "./usePontoEquilibrio";

vi.mock("./useReceitas", () => ({
  useReceitas: vi.fn(),
}));

vi.mock("./useDespesas", () => ({
  useDespesas: vi.fn(),
}));

vi.mock("./useDividas", () => ({
  useDividas: vi.fn(),
}));

vi.mock("./useRecurringTransactions", () => ({
  useRecurringTransactions: vi.fn(),
}));

import { useReceitas } from "./useReceitas";
import { useDespesas } from "./useDespesas";
import { useDividas } from "./useDividas";
import { useRecurringTransactions } from "./useRecurringTransactions";

describe("usePontoEquilibrio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. custos fixos de R$ 3.120 divididos por 26 dias = R$ 120/dia e margem 70% gerando ponto de equilibrio ~R$ 171,43", () => {
    // Vendas de hoje
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [
        { id: "rec-1", valor: 1961, data: "2026-09-05", descricao: "Vendas PDV" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    // Despesas do mês: Aluguel R$ 2.600 (fixa) + Saque Divipay R$ 1.500 (variável - ignorada)
    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-1", valor: 2600, data: "2026-09-01", categorias: { nome: "Aluguel" }, status: "pago" },
        { id: "dep-2", valor: 1500, data: "2026-09-02", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    // Dívidas: parcela de R$ 520 no mês
    vi.mocked(useDividas).mockReturnValue({
      dividas: [
        { id: "div-1", status: "pendente", data_vencimento: "2026-09-15", parcelas: 1, valor_restante: 520 },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    vi.mocked(useRecurringTransactions).mockReturnValue({
      recorrentes: [],
      loading: false,
    } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // Custos fixos totais = 2.600 + 520 = 3.120
    // Custo fixo diário = 3.120 / 26 = 120
    expect(result.current.custoFixoDiario).toBe(120);
    // Ponto de equilíbrio = 120 / 0.70 ≈ 171.4285...
    expect(Number(result.current.pontoEquilibrio.toFixed(2))).toBe(171.43);
    expect(result.current.vendasHoje).toBe(1961);
  });

  it("2. vendas acima da meta exibem exatamente 100%, nunca 79.592% ou valores absurdos", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [
        { id: "rec-1", valor: 1961, data: "2026-09-05", descricao: "Vendas PDV" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-1", valor: 2600, data: "2026-09-01", categorias: { nome: "Aluguel" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({
      dividas: [
        { id: "div-1", status: "pendente", data_vencimento: "2026-09-15", parcelas: 1, valor_restante: 520 },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    vi.mocked(useRecurringTransactions).mockReturnValue({
      recorrentes: [],
      loading: false,
    } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // 1961 > 171.43 -> percentual deve ser limitado a exatamente 100%
    expect(result.current.percentual).toBe(100);
  });

  it("3. vendas abaixo da meta exibem o percentual real proporcional", () => {
    // Vendas de hoje = R$ 85,714 (exatamente 50% de 171,4285)
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [
        { id: "rec-1", valor: 85.714, data: "2026-09-05", descricao: "Vendas Manhã" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-1", valor: 2600, data: "2026-09-01", categorias: { nome: "Aluguel" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({
      dividas: [
        { id: "div-1", status: "pendente", data_vencimento: "2026-09-15", parcelas: 1, valor_restante: 520 },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    vi.mocked(useRecurringTransactions).mockReturnValue({
      recorrentes: [],
      loading: false,
    } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // 85.714 / 171.4285... * 100 ≈ 50%
    expect(Math.round(result.current.percentual)).toBe(50);
  });

  it("4. ausência de custos fixos sem produzir meta artificial de R$ 1,65", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [
        { id: "rec-1", valor: 1312.23, data: "2026-09-05", descricao: "Vendas" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    // Nenhuma despesa fixa lançada no mês
    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-divipay", valor: 9828.80, data: "2026-09-02", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    // Dívida residual avulsa de comida (R$ 30)
    vi.mocked(useDividas).mockReturnValue({
      dividas: [
        { id: "div-comida", status: "vencida", data_vencimento: "2026-09-01", parcelas: 10, valor_total: 300, valor_restante: 300 },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    // Nenhuma recorrente fixa ativa
    vi.mocked(useRecurringTransactions).mockReturnValue({
      recorrentes: [],
      loading: false,
    } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // Não deve inventar meta de R$ 1,65
    expect(result.current.pontoEquilibrio).toBe(0);
    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.percentual).toBe(0);
    expect(result.current.vendasHoje).toBe(1312.23);
  });

  it("5. usa recorrentes como fallback para custos fixos se não houver despesas lançadas", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({
      dividas: [],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    // Recorrentes ativas de despesa (Luz: 650, Folha: 1950) = 2600
    vi.mocked(useRecurringTransactions).mockReturnValue({
      recorrentes: [
        { id: "rec-1", ativo: true, tipo_transacao: "despesa", valor: 650 },
        { id: "rec-2", ativo: true, tipo_transacao: "despesa", valor: 1950 },
        { id: "rec-inativa", ativo: false, tipo_transacao: "despesa", valor: 5000 },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // custoFixoDiario = 2600 / 26 = 100
    // pontoEquilibrio = 100 / 0.70 = 142.857...
    expect(result.current.custoFixoDiario).toBe(100);
    expect(Math.round(result.current.pontoEquilibrio)).toBe(143);
    expect(result.current.vendasHoje).toBe(0);
    expect(result.current.percentual).toBe(0);
  });

  it("6. reconhece categorias reais do banco (Moradia, Salário, Folguista) e trata acentuação", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 100, data: "2026-09-05" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    // Categorias reais do banco com acentos: Moradia (R$ 1.800) + Salário (R$ 800) = R$ 2.600
    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-moradia", valor: 1800, data: "2026-09-10", categorias: { nome: "Moradia" }, status: "pago" },
        { id: "dep-salario", valor: 800, data: "2026-09-05", categorias: { nome: "Salário" }, status: "pago" },
        { id: "dep-sorvete", valor: 500, data: "2026-09-02", categorias: { nome: "Sorvete" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({
      dividas: [],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    vi.mocked(useRecurringTransactions).mockReturnValue({
      recorrentes: [],
      loading: false,
    } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // Custos fixos = 1.800 + 800 = 2.600 (Sorvete ignorado)
    // Custo fixo diário = 2.600 / 26 = 100
    expect(result.current.custoFixoDiario).toBe(100);
    expect(Math.round(result.current.pontoEquilibrio)).toBe(143);
  });

  it("7. saques da Divipay nunca são classificados como custos fixos, mesmo com descrições como Água ou folguista", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-05" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    // Saques da Divipay que têm nomes parecidos mas são saques dinâmicos
    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-1", valor: 811.90, data: "2026-09-03", descricao: "Água - Favorecido Pix", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-2", valor: 315.00, data: "2026-09-04", descricao: "Luiz folguista", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({
      dividas: [],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    vi.mocked(useRecurringTransactions).mockReturnValue({
      recorrentes: [],
      loading: false,
    } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // Todos os saques da Divipay devem ser ignorados para custos fixos
    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.pontoEquilibrio).toBe(0);
    expect(result.current.percentual).toBe(0);
  });
});
