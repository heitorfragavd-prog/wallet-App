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
  });

  it("retorna totalItemsSold como null quando as vendas não possuem detalhamento de itens", () => {
    const dashboard = buildEyemobileDashboard({
      sales: [
        { id: "s-1", total: 100, time: "2026-10-31T20:00:00-03:00" },
        { id: "s-2", total: 50, time: "2026-10-31T21:00:00-03:00" },
      ],
      products: [],
      stores: [],
    });

    expect(dashboard.kpis.totalItemsSold).toBeNull();
    expect(dashboard.kpis.totalTransactions).toBe(2);
    expect(dashboard.kpis.totalRevenue).toBe(150);
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
