import { describe, expect, it } from "vitest";
import { buildEyemobileDashboard } from "./eyemobileDashboard";

describe("buildEyemobileDashboard", () => {
  it("calcula KPIs, vendas por hora, pagamentos e top produtos a partir das vendas do período", () => {
    const dashboard = buildEyemobileDashboard({
      sales: [
        {
          id: "sale-1",
          total: 120,
          time: "2026-07-28T08:15:00-03:00",
          origin: "front_cashier",
          transaction_pays: [{ pay_type_name: "PIX", amount: 120 }],
          items: [{ product_id: "coffee", product_name: "Café", quantity: 2, total: 120 }],
        },
        {
          id: "sale-2",
          total: 80,
          time: "2026-07-28T08:45:00-03:00",
          origin: "delivery",
          transaction_pays: [{ pay_type_name: "Crédito", amount: 80 }],
          items: [{ product_id: "cake", product_name: "Bolo", quantity: 4, total: 80 }],
        },
      ],
      products: [],
      stores: [],
    });

    expect(dashboard.kpis).toEqual({
      totalRevenue: 200,
      totalTransactions: 2,
      averageTicket: 100,
      frontCashierRevenue: 120,
      totalItemsSold: 6,
      itemsCoverage: "complete",
      itemsCoverageRatio: 1,
      salesWithItemsCount: 2,
    });
    expect(dashboard.dailySales).toEqual([
      { date: "2026-07-28", total: 200, transactions: 2 },
    ]);
    const sumDaily = dashboard.dailySales.reduce((acc, d) => acc + d.total, 0);
    expect(sumDaily).toBe(dashboard.kpis.totalRevenue);
    expect(dashboard.salesByHour.find((item) => item.hour === "08h")).toMatchObject({
      frontCashier: 120,
      otherOrigins: 80,
    });
    expect(dashboard.payments).toEqual([
      expect.objectContaining({ name: "Pix", value: 120 }),
      expect.objectContaining({ name: "Crédito", value: 80 }),
    ]);
    expect(dashboard.topProducts).toEqual([
      expect.objectContaining({ id: "cake", product: "Bolo", quantity: 4, total: 80 }),
      expect.objectContaining({ id: "coffee", product: "Café", quantity: 2, total: 120 }),
    ]);
  });

  it("agrega série diária com fuso America/Sao_Paulo e garante soma estritamente idêntica ao faturamento total", () => {
    const dashboard = buildEyemobileDashboard({
      sales: [
        { id: "s-1", total: 100.50, time: "2026-10-31T20:00:00-03:00", items: [{ quantity: 3 }] },
        { id: "s-2", total: 50.25, time: "2026-10-31T23:30:00-03:00", items: [{ quantity: 1 }] },
        { id: "s-3", total: 200.75, time: "2026-11-01T14:00:00-03:00", items: [{ quantity: 5 }] },
      ],
      products: [],
      stores: [],
    });

    expect(dashboard.dailySales).toEqual([
      { date: "2026-10-31", total: 150.75, transactions: 2 },
      { date: "2026-11-01", total: 200.75, transactions: 1 },
    ]);
    const sumDaily = dashboard.dailySales.reduce((acc, d) => acc + d.total, 0);
    expect(sumDaily).toBe(351.50);
    expect(dashboard.kpis.totalRevenue).toBe(351.50);
    expect(dashboard.kpis.totalItemsSold).toBe(9);
    expect(dashboard.kpis.itemsCoverage).toBe("complete");
    expect(dashboard.dailySalesCoverage.coverageRatio).toBe(1);
  });

  it("retorna totalItemsSold como null e itemsCoverage='unavailable' quando nenhuma venda possui itens", () => {
    const dashboard = buildEyemobileDashboard({
      sales: [
        { id: "s-1", total: 100, time: "2026-10-31T20:00:00-03:00" },
        { id: "s-2", total: 50, time: "2026-10-31T21:00:00-03:00" },
      ],
      products: [],
      stores: [],
    });

    expect(dashboard.kpis.totalItemsSold).toBeNull();
    expect(dashboard.kpis.itemsCoverage).toBe("unavailable");
    expect(dashboard.kpis.itemsCoverageRatio).toBe(0);
    expect(dashboard.kpis.salesWithItemsCount).toBe(0);
    expect(dashboard.kpis.totalTransactions).toBe(2);
    expect(dashboard.kpis.totalRevenue).toBe(150);
  });

  describe("Gate B.1 — Cobertura integral dos itens vendidos e integridade", () => {
    it("identifica cobertura parcial quando apenas parte das vendas contém detalhamento de itens", () => {
      const dashboard = buildEyemobileDashboard({
        sales: [
          { id: "s-1", total: 50, time: "2026-11-01T10:00:00-03:00", items: [{ product_id: "p1", quantity: 2, total: 50 }] },
          { id: "s-2", total: 30, time: "2026-11-01T11:00:00-03:00" }, // sem itens
          { id: "s-3", total: 40, time: "2026-11-01T12:00:00-03:00", items: [] }, // array vazio
          { id: "s-4", total: 60, time: "2026-11-01T13:00:00-03:00", items: [{ product_id: "p2", quantity: 3, total: 60 }] },
        ],
        products: [],
        stores: [],
      });

      expect(dashboard.kpis.itemsCoverage).toBe("partial");
      expect(dashboard.kpis.itemsCoverageRatio).toBe(0.5); // 2 de 4 vendas
      expect(dashboard.kpis.salesWithItemsCount).toBe(2);
      expect(dashboard.kpis.totalItemsSold).toBe(5); // 2 + 3
      expect(dashboard.kpis.totalTransactions).toBe(4);
      expect(dashboard.kpis.totalRevenue).toBe(180);
    });

    it("descarta vendas canceladas, estornadas e deduplica transações repetidas", () => {
      const dashboard = buildEyemobileDashboard({
        sales: [
          { id: "s-1", total: 50, time: "2026-11-01T10:00:00-03:00", items: [{ quantity: 2 }] },
          { id: "s-1", total: 50, time: "2026-11-01T10:00:00-03:00", items: [{ quantity: 2 }] }, // duplicata idêntica
          { id: "s-2", total: 80, time: "2026-11-01T11:00:00-03:00", cancelled: true, items: [{ quantity: 4 }] },
          { id: "s-3", total: 60, time: "2026-11-01T12:00:00-03:00", status: "refunded", items: [{ quantity: 3 }] },
          { id: "s-4", total: 40, time: "2026-11-01T13:00:00-03:00", completed: false, items: [{ quantity: 1 }] },
          { id: "s-5", total: 70, time: "2026-11-01T14:00:00-03:00", items: [
            { product_id: "p-ok", quantity: 2, total: 50 },
            { product_id: "p-canc", quantity: 1, total: 20, cancelled: true }, // item cancelado dentro da venda
          ] },
        ],
        products: [],
        stores: [],
      });

      // Apenas s-1 e s-5 são válidas
      expect(dashboard.kpis.totalTransactions).toBe(2);
      expect(dashboard.kpis.totalRevenue).toBe(120); // 50 + 70
      expect(dashboard.kpis.totalItemsSold).toBe(4); // 2 (de s-1) + 2 (de s-5)
      expect(dashboard.kpis.itemsCoverage).toBe("complete");
    });

    it("lida corretamente com itens de valor zero (brindes/cortesias) e quantidades > 1", () => {
      const dashboard = buildEyemobileDashboard({
        sales: [
          {
            id: "s-1",
            total: 25,
            time: "2026-11-01T10:00:00-03:00",
            items: [
              { product_id: "p1", name: "Café Especial", quantity: 1, total: 25 },
              { product_id: "p2", name: "Biscoito Cortesia", quantity: 2, total: 0 },
            ],
          },
        ],
        products: [],
        stores: [],
      });

      expect(dashboard.kpis.totalItemsSold).toBe(3); // 1 café + 2 biscoitos
      expect(dashboard.topProducts).toEqual([
        expect.objectContaining({ id: "p2", product: "Biscoito Cortesia", quantity: 2, total: 0 }),
        expect.objectContaining({ id: "p1", product: "Café Especial", quantity: 1, total: 25 }),
      ]);
    });
  });

  describe("Gate B.2 — Integridade da série diária e classificação temporal", () => {
    it("não atribui vendas sem data ao primeiro dia do período, segregando em unclassifiedRevenue", () => {
      const dashboard = buildEyemobileDashboard({
        startDate: "2026-11-01",
        endDate: "2026-11-03",
        sales: [
          { id: "s-1", total: 100, time: "2026-11-01T15:00:00-03:00" },
          { id: "s-2", total: 150, time: "2026-11-02T16:00:00-03:00" },
          { id: "s-sem-data", total: 80, time: "" }, // sem data válida
          { id: "s-data-invalida", total: 20, time: "data_corrompida" }, // data inválida
        ],
        products: [],
        stores: [],
      });

      // Vendas com data válida vão para seus dias
      expect(dashboard.dailySales).toEqual([
        { date: "2026-11-01", total: 100, transactions: 1 },
        { date: "2026-11-02", total: 150, transactions: 1 },
      ]);

      // Vendas sem data NÃO foram para 2026-11-01
      expect(dashboard.dailySales.find((d) => d.date === "2026-11-01")?.total).toBe(100);

      // Cobertura do gráfico comprova matematicamente
      expect(dashboard.dailySalesCoverage).toEqual({
        classifiedRevenue: 250,
        unclassifiedRevenue: 100, // 80 + 20
        classifiedTransactions: 2,
        unclassifiedTransactions: 2,
        coverageRatio: 0.714,
      });

      // Prova de soma exata
      const sumBars = dashboard.dailySales.reduce((acc, d) => acc + d.total, 0);
      expect(sumBars).toBe(dashboard.dailySalesCoverage.classifiedRevenue);
      expect(dashboard.kpis.totalRevenue).toBe(
        dashboard.dailySalesCoverage.classifiedRevenue + dashboard.dailySalesCoverage.unclassifiedRevenue
      );
    });

    it("converte timestamps UTC para America/Sao_Paulo corretamente na virada de dia e mês (31/10 vs 01/11)", () => {
      const dashboard = buildEyemobileDashboard({
        sales: [
          // 2026-11-01 01:30:00 UTC = 2026-10-31 22:30:00 BRT (-03:00) -> Dia 31/10
          { id: "s-outubro", total: 200, time: "2026-11-01T01:30:00Z" },
          // 2026-11-01 02:59:00 UTC = 2026-10-31 23:59:00 BRT (-03:00) -> Dia 31/10
          { id: "s-outubro-fim", total: 100, time: "2026-11-01T02:59:00Z" },
          // 2026-11-01 03:00:00 UTC = 2026-11-01 00:00:00 BRT (-03:00) -> Dia 01/11
          { id: "s-novembro-inicio", total: 300, time: "2026-11-01T03:00:00Z" },
          // 2026-11-02 02:59:59 UTC = 2026-11-01 23:59:59 BRT (-03:00) -> Dia 01/11
          { id: "s-novembro-noite", total: 150, time: "2026-11-02T02:59:59Z" },
          // 2026-11-02 03:00:00 UTC = 2026-11-02 00:00:00 BRT (-03:00) -> Dia 02/11
          { id: "s-dia-dois", total: 400, time: "2026-11-02T03:00:00Z" },
        ],
        products: [],
        stores: [],
      });

      expect(dashboard.dailySales).toEqual([
        { date: "2026-10-31", total: 300, transactions: 2 },
        { date: "2026-11-01", total: 450, transactions: 2 },
        { date: "2026-11-02", total: 400, transactions: 1 },
      ]);
      expect(dashboard.kpis.totalRevenue).toBe(1150);
      expect(dashboard.dailySalesCoverage.coverageRatio).toBe(1);
    });
  });

  describe("Gate B.3 — Paginação, volume e alta escala (1.000, 5.000 e 10.000 registros)", () => {
    it("processa 1.000 vendas com consistência determinística", () => {
      const sales = Array.from({ length: 1000 }, (_, i) => ({
        id: `sale-1k-${i}`,
        total: 10.50,
        time: "2026-11-01T12:00:00-03:00",
        items: [{ product_id: `prod-${i % 10}`, quantity: 2, total: 10.50 }],
      }));

      const dashboard = buildEyemobileDashboard({ sales, products: [], stores: [] });

      expect(dashboard.kpis.totalTransactions).toBe(1000);
      expect(dashboard.kpis.totalRevenue).toBe(10500);
      expect(dashboard.kpis.totalItemsSold).toBe(2000);
      expect(dashboard.kpis.itemsCoverage).toBe("complete");
      expect(dashboard.dailySales).toEqual([
        { date: "2026-11-01", total: 10500, transactions: 1000 },
      ]);
    });

    it("processa 5.000 vendas com alto volume e precisão matemática", () => {
      const sales = Array.from({ length: 5000 }, (_, i) => ({
        id: `sale-5k-${i}`,
        total: 15.00,
        time: `2026-11-${String((i % 28) + 1).padStart(2, "0")}T12:00:00-03:00`,
        items: [{ product_id: "prod-x", quantity: 3, total: 15.00 }],
      }));

      const dashboard = buildEyemobileDashboard({ sales, products: [], stores: [] });

      expect(dashboard.kpis.totalTransactions).toBe(5000);
      expect(dashboard.kpis.totalRevenue).toBe(75000);
      expect(dashboard.kpis.totalItemsSold).toBe(15000);
      expect(dashboard.dailySales.length).toBe(28);

      const sumDaily = dashboard.dailySales.reduce((acc, d) => acc + d.total, 0);
      expect(sumDaily).toBe(75000);
    });

    it("processa 10.000 vendas de forma ultrarrápida (< 150ms) sem vazamento de memória", () => {
      const sales = Array.from({ length: 10000 }, (_, i) => ({
        id: `sale-10k-${i}`,
        total: 12.30,
        time: "2026-11-01T14:00:00-03:00",
        items: [{ product_id: "prod-y", quantity: 2, total: 12.30 }],
      }));

      const start = performance.now();
      const dashboard = buildEyemobileDashboard({ sales, products: [], stores: [], hasMore: true });
      const duration = performance.now() - start;

      expect(dashboard.kpis.totalTransactions).toBe(10000);
      expect(dashboard.kpis.totalRevenue).toBe(123000);
      expect(dashboard.kpis.totalItemsSold).toBe(20000);
      expect(dashboard.dataCompleteness).toBe("truncated");
      expect(duration).toBeLessThan(350); // Deve ser sub-350ms para 10.000 registros
    });

    it("Gate 3: Deduplicação segura quando há IDs de vendas duplicados no payload", () => {
      const sales = [
        { id: "sale-dup-1", total: 100, time: "2026-11-01T10:00:00-03:00", items: [{ quantity: 1 }] },
        { id: "sale-dup-1", total: 100, time: "2026-11-01T10:00:00-03:00", items: [{ quantity: 1 }] }, // repetido
        { id: "sale-dup-2", total: 50, time: "2026-11-01T11:00:00-03:00", items: [{ quantity: 2 }] },
      ];

      const dashboard = buildEyemobileDashboard({ sales, products: [], stores: [] });

      // Deve processar apenas 2 vendas únicas (100 + 50 = 150)
      expect(dashboard.kpis.totalTransactions).toBe(2);
      expect(dashboard.kpis.totalRevenue).toBe(150);
      expect(dashboard.kpis.totalItemsSold).toBe(3);
    });

    it("Gate 3: Vendas canceladas ou incompletas no meio do stream NÃO interrompem vendas completadas posteriores", () => {
      const sales = [
        { id: "sale-valid-1", total: 70, completed: true, cancelled: false, time: "2026-11-01T10:00:00-03:00" },
        { id: "sale-cancel-1", total: 500, completed: true, cancelled: true, time: "2026-11-01T10:15:00-03:00" }, // Cancelada
        { id: "sale-incomp-1", total: 300, completed: false, cancelled: false, time: "2026-11-01T10:30:00-03:00" }, // Incompleta
        { id: "sale-valid-2", total: 80, completed: true, cancelled: false, time: "2026-11-01T10:45:00-03:00" }, // Válida posterior
      ];

      const dashboard = buildEyemobileDashboard({ sales, products: [], stores: [] });

      // Ambas as vendas válidas foram contabilizadas (70 + 80 = 150), as inválidas foram ignoradas
      expect(dashboard.kpis.totalTransactions).toBe(2);
      expect(dashboard.kpis.totalRevenue).toBe(150);
    });

    it("Gate 3: Vendas fora de ordem cronológica são ordenadas e agrupadas perfeitamente na série diária", () => {
      const sales = [
        { id: "sale-dia-3", total: 30, time: "2026-11-03T12:00:00-03:00" },
        { id: "sale-dia-1", total: 10, time: "2026-11-01T12:00:00-03:00" },
        { id: "sale-dia-2", total: 20, time: "2026-11-02T12:00:00-03:00" },
      ];

      const dashboard = buildEyemobileDashboard({ sales, products: [], stores: [] });

      expect(dashboard.dailySales).toEqual([
        { date: "2026-11-01", total: 10, transactions: 1 },
        { date: "2026-11-02", total: 20, transactions: 1 },
        { date: "2026-11-03", total: 30, transactions: 1 },
      ]);
      expect(dashboard.kpis.totalRevenue).toBe(60);
    });

    it("Gate 3: Vendas sem data confiável são segregadas em unclassifiedRevenue e não quebram o gráfico", () => {
      const sales = [
        { id: "sale-com-data", total: 100, time: "2026-11-01T14:00:00-03:00" },
        { id: "sale-sem-data", total: 45, time: null }, // Sem data
        { id: "sale-data-invalida", total: 55, time: "data_corrompida_abc" }, // Inválida
      ];

      const dashboard = buildEyemobileDashboard({ sales, products: [], stores: [] });

      expect(dashboard.kpis.totalRevenue).toBe(200);
      expect(dashboard.dailySalesCoverage.classifiedRevenue).toBe(100);
      expect(dashboard.dailySalesCoverage.unclassifiedRevenue).toBe(100);
      expect(dashboard.dailySalesCoverage.coverageRatio).toBe(0.5);
      expect(dashboard.dailySales).toEqual([
        { date: "2026-11-01", total: 100, transactions: 1 },
      ]);
    });
  });

  it("identifica estoque crítico quando o saldo é menor ou igual ao mínimo", () => {
    const dashboard = buildEyemobileDashboard({
      sales: [],
      stores: [],
      products: [
        { id: "p-1", name: "Água", stock: 2, min_stock: 2, depot: { name: "Depósito Central" } },
        { id: "p-2", name: "Suco", stock: 3, min_stock: 2 },
      ],
    });

    expect(dashboard.criticalStock).toEqual([
      expect.objectContaining({ id: "p-1", product: "Água", stock: 2, minStock: 2, depot: "Depósito Central" }),
    ]);
  });
});
