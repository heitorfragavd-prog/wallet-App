import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePontoEquilibrio, classificarNaturezaEconomica } from "./usePontoEquilibrio";

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

vi.mock("./useColaboradores", () => ({
  useColaboradores: vi.fn(),
}));

import { useReceitas } from "./useReceitas";
import { useDespesas } from "./useDespesas";
import { useDividas } from "./useDividas";
import { useRecurringTransactions } from "./useRecurringTransactions";
import { useColaboradores } from "./useColaboradores";

describe("usePontoEquilibrio - Classificação Econômica e Homologação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useColaboradores).mockReturnValue({
      data: [
        { id: "c-1", nome: "Shuellen Pereira Santos", tipo: "funcionario", salario_bruto: 1621, vale_transporte: 0, vale_refeicao: 240, outros_beneficios: 0, status: "ativo", dias_experiencia: 90, carga_horaria_semanal: 44, created_at: "", cargo: "Atendente", data_admissao: null, data_demissao: null, foto_url: null },
        { id: "c-2", nome: "Luiz Fellipe Santos De Assis", tipo: "folguista", salario_bruto: 0, vale_transporte: 0, vale_refeicao: 0, outros_beneficios: 0, status: "ativo", dias_experiencia: 90, carga_horaria_semanal: 44, created_at: "", cargo: "Atendente", data_admissao: null, data_demissao: null, foto_url: null },
        { id: "c-3", nome: "Viviane Cristina Teotonio Siqueira", tipo: "socio", salario_bruto: 5000, vale_transporte: 0, vale_refeicao: 0, outros_beneficios: 0, status: "ativo", dias_experiencia: 90, carga_horaria_semanal: 44, created_at: "", cargo: "Dona", data_admissao: null, data_demissao: null, foto_url: null },
        { id: "c-4", nome: "Heitor Fraga de Oliveira", tipo: "socio", salario_bruto: 0, vale_transporte: 0, vale_refeicao: 0, outros_beneficios: 0, status: "ativo", dias_experiencia: 90, carga_horaria_semanal: 44, created_at: "", cargo: "Dono", data_admissao: null, data_demissao: null, foto_url: null },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useColaboradores>);
  });

  // =========================================================================
  // TESTES DE HOMOLOGAÇÃO OBRIGATÓRIOS (A até L)
  // =========================================================================

  it("A. Despesa com id divipay-* cujo texto ou categoria represente CUSTO FIXO LEGÍTIMO (internet R$ 99, água R$ 811,90) DEVE entrar em custos fixos", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-net", valor: 99.00, data: "2026-09-08", descricao: "internet", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-water", valor: 811.90, data: "2026-09-03", descricao: "Água", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // Custos fixos = 99.00 + 811.90 = 910.90
    // Custo fixo diário = 910.90 / 26 = 35.0346...
    // Ponto de equilíbrio = 35.0346 / 0.70 = 50.049... -> 50.05
    expect(Number(result.current.custoFixoDiario.toFixed(2))).toBe(35.03);
    expect(Number(result.current.pontoEquilibrio.toFixed(2))).toBe(50.05);
  });

  it("B. Despesa com id divipay-* referente a funcionária regular (Pagamento Suellen R$ 1.961,00) DEVE entrar em custos fixos de folha", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-suellen", valor: 1961.00, data: "2026-09-05", descricao: "Pagamento Suellen", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // Custo fixo diário = 1961 / 26 = 75.423...
    // Ponto de equilíbrio = 75.423 / 0.70 = 107.75
    expect(Number(result.current.custoFixoDiario.toFixed(2))).toBe(75.42);
    expect(Number(result.current.pontoEquilibrio.toFixed(2))).toBe(107.75);
  });

  it("C. Despesa com id divipay-* referente a folguista (Victor, Kenia, Luiz) NÃO DEVE entrar em custos fixos", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-vic1", valor: 80.00, data: "2026-09-01", descricao: "Victor folguista", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-kenia", valor: 200.00, data: "2026-09-07", descricao: "Kenia folguista", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-luiz", valor: 315.00, data: "2026-09-04", descricao: "Luiz folguista", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-vic2", valor: 80.00, data: "2026-09-10", descricao: "Victor", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.pontoEquilibrio).toBe(0);
  });

  it("D. Despesa com id divipay-* referente a metas, bonificações variáveis ou passagens NÃO DEVE entrar em custos fixos", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-meta1", valor: 329.70, data: "2026-09-14", descricao: "Meta mais passagem", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-meta2", valor: 309.50, data: "2026-09-07", descricao: "Passagem e meta", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.pontoEquilibrio).toBe(0);
  });

  it("E. Despesa com id divipay-* referente a CMV / mercadoria (salgados, ambev, kek bananinha, biscoito) NÃO DEVE entrar em custos fixos", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-salg1", valor: 2618.00, data: "2026-09-09", descricao: "salgados", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-salg2", valor: 1957.00, data: "2026-09-03", descricao: "Gerson salgados", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-ambev", valor: 1187.12, data: "2026-09-09", descricao: "ambev", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-banana", valor: 170.00, data: "2026-09-11", descricao: "Kek bananinha", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-osvaldo", valor: 82.50, data: "2026-09-08", descricao: "seu osvaldo", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.pontoEquilibrio).toBe(0);
  });

  it("F. Despesa com id divipay-* de retirada de sócio ou pagamento pessoal (Viviane, Heitor) NÃO DEVE entrar em custos fixos", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-viviane", valor: 3600.00, data: "2026-09-09", descricao: "Cartão e pagamento Viviane", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.pontoEquilibrio).toBe(0);
  });

  it("G. Despesa genérica como 'Pagamento de boleto' sem detalhamento NÃO DEVE ser assumida como custo fixo por padrão", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-bol1", valor: 7821.79, data: "2026-09-08", descricao: "Pagamento de boleto", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
        { id: "divipay-bol2", valor: 1396.46, data: "2026-09-14", descricao: "Pagamento de boleto", categorias: { nome: "Transferências e Saques Divipay" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.pontoEquilibrio).toBe(0);
  });

  it("H. Despesa local do banco com categoria de custo fixo continua entrando normalmente", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-moradia", valor: 1800.00, data: "2026-09-01", categorias: { nome: "Moradia" }, status: "pago" },
        { id: "dep-luz", valor: 800.00, data: "2026-09-05", categorias: { nome: "Luz / Energia" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // 1800 + 800 = 2600
    // 2600 / 26 = 100
    // 100 / 0.70 = 142.86
    expect(result.current.custoFixoDiario).toBe(100);
    expect(Number(result.current.pontoEquilibrio.toFixed(2))).toBe(142.86);
  });

  it("I. Despesa local do banco com categoria CMV/variável continua não entrando", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 500, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-salgados", valor: 500.00, data: "2026-09-02", categorias: { nome: "Salgados" }, status: "pago" },
        { id: "dep-ambev", valor: 800.00, data: "2026-09-03", categorias: { nome: "Ambev" }, status: "pago" },
        { id: "dep-folguista", valor: 300.00, data: "2026-09-04", categorias: { nome: "Folguista" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.pontoEquilibrio).toBe(0);
  });

  it("J. Recorrentes continuam funcionando como fallback/piso quando não há lançamentos correspondentes", () => {
    vi.mocked(useReceitas).mockReturnValue({ receitas: [], loading: false } as unknown as ReturnType<typeof useReceitas>);
    vi.mocked(useDespesas).mockReturnValue({ despesas: [], loading: false } as unknown as ReturnType<typeof useDespesas>);
    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);

    vi.mocked(useRecurringTransactions).mockReturnValue({
      recorrentes: [
        { id: "rec-aluguel", ativo: true, tipo_transacao: "despesa", valor: 2600 },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.custoFixoDiario).toBe(100);
    expect(Number(result.current.pontoEquilibrio.toFixed(2))).toBe(142.86);
  });

  it("K. Vendas superiores ao ponto de equilíbrio continuam limitadas a exatamente 100%", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 5000, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-1", valor: 2600, data: "2026-09-01", categorias: { nome: "Aluguel" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    vi.mocked(useDividas).mockReturnValue({ dividas: [], loading: false } as unknown as ReturnType<typeof useDividas>);
    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.percentual).toBe(100);
  });

  it("L. Se não houver nenhum custo fixo legítimo, o ponto de equilíbrio é 0 e não inventa meta artificial de dívida avulsa", () => {
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-1", valor: 1000, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "dep-cmv", valor: 3000, data: "2026-09-02", categorias: { nome: "Salgados" }, status: "pago" },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    // Dívida residual avulsa de comida (R$ 30,00 no mês)
    vi.mocked(useDividas).mockReturnValue({
      dividas: [
        { id: "div-comida", status: "vencida", data_vencimento: "2026-09-01", parcelas: 10, valor_total: 300, valor_restante: 300 },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    expect(result.current.pontoEquilibrio).toBe(0);
    expect(result.current.custoFixoDiario).toBe(0);
    expect(result.current.percentual).toBe(0);
  });

  // =========================================================================
  // TESTES DE CENÁRIO REAL — CONTA RODO POINT PJ (SETEMBRO 2026)
  // =========================================================================

  it("Cenário Real Setembro 2026: Consolidação de Custos Fixos (Internet 99 + Água 811,90 + Suellen 1.961 = R$ 2.871,90)", () => {
    // Vendas reais de hoje (15/09/2026): R$ 597,93
    vi.mocked(useReceitas).mockReturnValue({
      receitas: [{ id: "rec-pdv", valor: 597.93, data: "2026-09-15" }],
      loading: false,
    } as unknown as ReturnType<typeof useReceitas>);

    // Conjunto dos 31 saques da Divipay + 1 despesa local Nilko
    vi.mocked(useDespesas).mockReturnValue({
      despesas: [
        { id: "divipay-1", valor: 99.00, data: "2026-09-08", descricao: "internet", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        { id: "divipay-2", valor: 811.90, data: "2026-09-03", descricao: "Água", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        { id: "divipay-3", valor: 1961.00, data: "2026-09-05", descricao: "Pagamento Suellen", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        // Variáveis / CMV / Outros
        { id: "divipay-4", valor: 80.00, data: "2026-09-12", descricao: "Victor folguista", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        { id: "divipay-5", valor: 315.00, data: "2026-09-04", descricao: "Luiz folguista", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        { id: "divipay-6", valor: 2618.00, data: "2026-09-09", descricao: "salgados", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        { id: "divipay-7", valor: 1187.12, data: "2026-09-09", descricao: "ambev", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        { id: "divipay-8", valor: 3600.00, data: "2026-09-09", descricao: "Cartão e pagamento Viviane", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        { id: "divipay-9", valor: 7821.79, data: "2026-09-08", descricao: "Pagamento de boleto", status: "pago", categorias: { nome: "Transferências e Saques Divipay" } },
        { id: "dep-nilko", valor: 451.03, data: "2026-09-04", descricao: "NILKO TECNOL*Nilko 04/06 PINHAIS", status: "pago", categorias: { nome: "Serviços" } },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDespesas>);

    // Dívida residual comida R$ 30 (300/10)
    vi.mocked(useDividas).mockReturnValue({
      dividas: [
        { id: "div-comida", status: "vencida", data_vencimento: "2026-09-01", parcelas: 10, valor_total: 300, valor_restante: 300 },
      ],
      loading: false,
    } as unknown as ReturnType<typeof useDividas>);

    vi.mocked(useRecurringTransactions).mockReturnValue({ recorrentes: [], loading: false } as unknown as ReturnType<typeof useRecurringTransactions>);

    const { result } = renderHook(() => usePontoEquilibrio());

    // Custos Fixos Operacionais = 99 + 811.90 + 1961 = R$ 2.871,90
    // Parcela dívida = R$ 30,00
    // Total = 2.901,90
    // Custo fixo diário = 2.901,90 / 26 = R$ 111,61
    // Ponto de equilíbrio = 111,61 / 0.70 = R$ 159,45
    // Vendas hoje: R$ 597,93 >= R$ 159,45 -> percentual = 100%
    expect(Number(result.current.custoFixoDiario.toFixed(2))).toBe(111.61);
    expect(Number(result.current.pontoEquilibrio.toFixed(2))).toBe(159.45);
    expect(result.current.percentual).toBe(100);
  });

  // =========================================================================
  // TESTES DIRETOS DA FUNÇÃO PURA classificarNaturezaEconomica
  // =========================================================================

  describe("classificarNaturezaEconomica", () => {
    const colabs = [
      { nome: "Shuellen Pereira Santos", tipo: "funcionario" as const },
      { nome: "Luiz Fellipe Santos De Assis", tipo: "folguista" as const },
      { nome: "Viviane Cristina Teotonio Siqueira", tipo: "socio" as const },
      { nome: "Heitor Fraga de Oliveira", tipo: "socio" as const },
    ];

    it("identifica infraestrutura fixa (internet, água, aluguel, luz)", () => {
      expect(classificarNaturezaEconomica({ descricao: "internet" }, colabs)).toBe("custo_fixo");
      expect(classificarNaturezaEconomica({ descricao: "Água" }, colabs)).toBe("custo_fixo");
      expect(classificarNaturezaEconomica({ descricao: "conta de luz" }, colabs)).toBe("custo_fixo");
      expect(classificarNaturezaEconomica({ categorias: { nome: "Moradia" } }, colabs)).toBe("custo_fixo");
      expect(classificarNaturezaEconomica({ categorias: { nome: "Aluguel" } }, colabs)).toBe("custo_fixo");
    });

    it("identifica folha de funcionário regular como custo fixo", () => {
      expect(classificarNaturezaEconomica({ descricao: "Pagamento Suellen" }, colabs)).toBe("custo_fixo");
      expect(classificarNaturezaEconomica({ descricao: "Salário Shuellen" }, colabs)).toBe("custo_fixo");
      expect(classificarNaturezaEconomica({ descricao: "Adiantamento salarial" }, colabs)).toBe("custo_fixo");
    });

    it("identifica folguistas e variáveis operacionais como custo_variavel", () => {
      expect(classificarNaturezaEconomica({ descricao: "Victor folguista" }, colabs)).toBe("custo_variavel");
      expect(classificarNaturezaEconomica({ descricao: "Luiz folguista" }, colabs)).toBe("custo_variavel");
      expect(classificarNaturezaEconomica({ descricao: "Kenia folguista" }, colabs)).toBe("custo_variavel");
      expect(classificarNaturezaEconomica({ descricao: "Meta mais passagem" }, colabs)).toBe("custo_variavel");
      expect(classificarNaturezaEconomica({ descricao: "Passagem e meta" }, colabs)).toBe("custo_variavel");
      expect(classificarNaturezaEconomica({ categorias: { nome: "Folguista" } }, colabs)).toBe("custo_variavel");
    });

    it("identifica CMV de fornecedores e alimentos/bebidas para revenda", () => {
      expect(classificarNaturezaEconomica({ descricao: "salgados" }, colabs)).toBe("cmv");
      expect(classificarNaturezaEconomica({ descricao: "Gerson salgados" }, colabs)).toBe("cmv");
      expect(classificarNaturezaEconomica({ descricao: "ambev" }, colabs)).toBe("cmv");
      expect(classificarNaturezaEconomica({ descricao: "Kek bananinha" }, colabs)).toBe("cmv");
      expect(classificarNaturezaEconomica({ descricao: "seu osvaldo" }, colabs)).toBe("cmv");
      expect(classificarNaturezaEconomica({ categorias: { nome: "Salgados" } }, colabs)).toBe("cmv");
      expect(classificarNaturezaEconomica({ categorias: { nome: "Ambev" } }, colabs)).toBe("cmv");
      expect(classificarNaturezaEconomica({ categorias: { nome: "Coca-Cola" } }, colabs)).toBe("cmv");
      expect(classificarNaturezaEconomica({ categorias: { nome: "Cigarro" } }, colabs)).toBe("cmv");
    });

    it("identifica retiradas e cartões de sócios", () => {
      expect(classificarNaturezaEconomica({ descricao: "Cartão e pagamento Viviane" }, colabs)).toBe("retirada_socio");
      expect(classificarNaturezaEconomica({ descricao: "Pro-labore sócio" }, colabs)).toBe("retirada_socio");
    });

    it("classifica boletos genéricos como outros", () => {
      expect(classificarNaturezaEconomica({ descricao: "Pagamento de boleto" }, colabs)).toBe("outros");
      expect(classificarNaturezaEconomica({ descricao: "Boleto bancario" }, colabs)).toBe("outros");
    });
  });
});
