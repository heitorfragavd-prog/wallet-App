import { describe, it, expect, vi } from "vitest";
import { createQueryToolCatalog } from "../../supabase/functions/_shared/ai/query-tools";
import type {
  FinancialQueryRepository,
  SalesPdvDetailRecord,
  InventoryItemRecord,
  RecipeCardRecord,
} from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext } from "../../supabase/functions/_shared/ai/auth";

describe("Diretor Financeiro Wallet CEO — Consulta de Vendas PDV, CMV e Margens Reais", () => {
  const mockContext: AiExecutionContext = {
    userId: "user-ceo-rodo-point",
    workspaceId: "2af415b6-76aa-4134-8133-a9b405671c1c",
    correlationId: "corr-ceo-test-123",
  };

  // Vendas reais simuladas do Eyemobile PDV com itens discriminados
  const mockSalesDetails: SalesPdvDetailRecord[] = [
    {
      id: "sale-1",
      workspaceId: mockContext.workspaceId,
      date: "2026-11-19T14:30:00Z",
      amount: 15.0,
      status: "completed",
      items: [
        { productId: "2032416", productName: "TRIDENT", quantity: 2, price: 4.0, total: 8.0 },
        { productId: "2032404", productName: "Snickers", quantity: 1, price: 5.0, total: 5.0 },
        { productId: "9999999", productName: "Produto Novo Sem Custo", quantity: 1, price: 2.0, total: 2.0 },
      ],
    },
    {
      id: "sale-2",
      workspaceId: mockContext.workspaceId,
      date: "2026-11-19T16:00:00Z",
      amount: 25.0,
      status: "completed",
      items: [
        { productId: "2032416", productName: "TRIDENT", quantity: 3, price: 4.0, total: 12.0 },
        { productId: "2032412", productName: "TRENTO", quantity: 2, price: 3.5, total: 7.0 },
        { productId: "100001", productName: "Pão de Queijo", quantity: 2, price: 3.0, total: 6.0 },
      ],
    },
    {
      id: "sale-cancelled",
      workspaceId: mockContext.workspaceId,
      date: "2026-11-19T17:00:00Z",
      amount: 50.0,
      status: "cancelada", // canceladas devem ser ignoradas
      items: [
        { productId: "2032416", productName: "TRIDENT", quantity: 10, price: 4.0, total: 40.0 },
      ],
    },
  ];

  // Catálogo de custos do Atacado e Fichas Técnicas
  const mockInventoryItems: InventoryItemRecord[] = [
    {
      id: "inv-1",
      workspaceId: mockContext.workspaceId,
      code: "2032416",
      description: "TRIDENT",
      category: "Doces",
      salePrice: 4.0,
      currentCost: 1.7143, // Custo exato do atacado (display 21 un / R$ 36,00)
      ativo: true,
    },
    {
      id: "inv-2",
      workspaceId: mockContext.workspaceId,
      code: "2032404",
      description: "Snickers",
      category: "Chocolates",
      salePrice: 5.0,
      currentCost: 3.05,
      ativo: true,
    },
    {
      id: "inv-3",
      workspaceId: mockContext.workspaceId,
      code: "2032412",
      description: "TRENTO",
      category: "Chocolates",
      salePrice: 3.5,
      currentCost: 1.625,
      ativo: true,
    },
  ];

  // Ficha técnica (Pão de Queijo artesanal)
  const mockRecipeCards: RecipeCardRecord[] = [
    {
      id: "recipe-1",
      workspaceId: mockContext.workspaceId,
      name: "Pão de Queijo",
      category: "Produção Própria",
      salePrice: 3.0,
      totalCost: 1.35, // Custo dos insumos (polvilho, queijo, ovos)
      costMethod: "standard",
    },
  ];

  const createMockRepo = (): FinancialQueryRepository => ({
    listRevenues: vi.fn().mockResolvedValue([]),
    listExpenses: vi.fn().mockResolvedValue([]),
    listTransactions: vi.fn().mockResolvedValue([]),
    listBalances: vi.fn().mockResolvedValue([]),
    listDebts: vi.fn().mockResolvedValue([]),
    listSalesPDV: vi.fn().mockResolvedValue([]),
    listSalesPdvDetails: vi.fn().mockResolvedValue(mockSalesDetails),
    listInventoryItems: vi.fn().mockResolvedValue(mockInventoryItems),
    listRecipeCards: vi.fn().mockResolvedValue(mockRecipeCards),
  });

  it("1. consultar_top_produtos_pdv retorna ranking de vendas com CMV e Lucro Bruto reais", async () => {
    const repo = createMockRepo();
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_top_produtos_pdv({
      data_inicio: "2026-11-19",
      data_fim: "2026-11-19",
      limite: 5,
    }, mockContext);

    const data = result.data as Record<string, unknown>;
    expect(data.status).toBe("calculado");
    expect(data.totalPedidos).toBe(2); // Venda cancelada foi descartada

    const top = data.topProdutos as Array<{
      produto: string;
      quantidade: number;
      faturamento: number;
      cmvTotal: number | null;
      lucroBruto: number | null;
      margemBrutaPercent: number | null;
      statusCusto: string;
    }>;

    expect(top.length).toBeGreaterThanOrEqual(4);

    const trident = top.find((p) => p.produto.includes("TRIDENT"));
    expect(trident).toBeDefined();
    expect(trident?.quantidade).toBe(5);
    expect(trident?.faturamento).toBe(20.0);
    expect(trident?.cmvTotal).toBe(8.57);
    expect(trident?.lucroBruto).toBe(11.43);
    expect(trident?.margemBrutaPercent).toBe(57.2);
    expect(trident?.statusCusto).toBe("confirmado");
  });

  it("2. PRODUTOS SEM CUSTO: não trata custo como zero e sinaliza margem indisponível", async () => {
    const repo = createMockRepo();
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_top_produtos_pdv({
      data_inicio: "2026-11-19",
      data_fim: "2026-11-19",
    }, mockContext);

    const data = result.data as Record<string, unknown>;
    const top = data.topProdutos as Array<{
      produto: string;
      cmvTotal: number | null;
      lucroBruto: number | null;
      margemBrutaPercent: number | null;
      statusCusto: string;
      avisoCusto?: string;
    }>;

    const semCusto = top.find((p) => p.produto === "Produto Novo Sem Custo");
    expect(semCusto).toBeDefined();
    expect(semCusto?.statusCusto).toBe("sem_custo");
    expect(semCusto?.cmvTotal).toBeNull();
    expect(semCusto?.lucroBruto).toBeNull();
    expect(semCusto?.margemBrutaPercent).toBeNull();
    expect(semCusto?.avisoCusto).toBe("Custo não confirmado — margem indisponível.");
  });

  it("3. consultar_vendas_por_produto localiza item por nome e traz evolução e métricas", async () => {
    const repo = createMockRepo();
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_vendas_por_produto({
      produto: "Pão de Queijo",
      data_inicio: "2026-11-19",
      data_fim: "2026-11-19",
    }, mockContext);

    const data = result.data as Record<string, unknown>;
    expect(data.status).toBe("encontrado");
    expect(data.totalQuantidadeVendida).toBe(2);
    expect(data.totalFaturamento).toBe(6.0);
    expect(data.totalCmv).toBe(2.7); // 2 * 1.35
    expect(data.totalLucroBruto).toBe(3.3);
    expect(data.margemBrutaPercent).toBe(55.0);
  });

  it("4. consultar_cmv_periodo segrega estritamente receita coberta e percentual de cobertura", async () => {
    const repo = createMockRepo();
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_cmv_periodo({
      data_inicio: "2026-11-19",
      data_fim: "2026-11-19",
    }, mockContext);

    const data = result.data as Record<string, unknown>;
    expect(data.status).toBe("apurado_parcial_ou_total");
    // Faturamento total = 15 + 25 = 40.0 (sem cancelada)
    expect(data.faturamentoBrutoPdv).toBe(40.0);
    // Produto sem custo faturou R$ 2.0 -> Receita com custo conhecido = R$ 38.0
    expect(data.receitaComCustoConhecido).toBe(38.0);
    expect(data.receitaSemCustoConhecido).toBe(2.0);
    expect(data.coberturaCustoPercent).toBe(95.0); // 38 / 40 * 100 = 95.0%
  });
});
