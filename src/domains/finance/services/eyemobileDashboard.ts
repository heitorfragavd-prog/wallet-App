export type ItemsCoverageStatus = "complete" | "partial" | "unavailable";

export interface EyemobileApiPayload {
  sales: unknown[];
  products: unknown[];
  stores: unknown[];
  startDate?: string;
  endDate?: string;
  hasMore?: boolean;
}

export interface EyemobileDailySale {
  date: string;
  total: number;
  transactions: number;
}

export interface EyemobileDailySalesCoverage {
  classifiedRevenue: number;
  unclassifiedRevenue: number;
  classifiedTransactions: number;
  unclassifiedTransactions: number;
  coverageRatio: number;
}

export interface EyemobileDashboardData {
  kpis: {
    totalRevenue: number;
    totalTransactions: number;
    averageTicket: number;
    frontCashierRevenue: number;
    totalItemsSold: number | null;
    itemsCoverage: ItemsCoverageStatus;
    itemsCoverageRatio: number;
    salesWithItemsCount: number;
  };
  dailySales: EyemobileDailySale[];
  dailySalesCoverage: EyemobileDailySalesCoverage;
  salesByHour: { hour: string; frontCashier: number; otherOrigins: number }[];
  payments: { name: string; value: number; percentage: number }[];
  topProducts: { id: string; product: string; quantity: number; total: number }[];
  operationSummary: { label: string; value: number }[];
  devices: { name: string; transactions: number; total: number }[];
  criticalStock: { id: string; product: string; stock: number; minStock: number; depot: string; unit: string; price: number }[];
  dataCompleteness: "complete" | "truncated";
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const toNumber = (value: unknown): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
};

const firstText = (...values: unknown[]) => {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value : "";
};

const unwrapList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const record = toRecord(value);
  return Array.isArray(record.data) ? record.data : Array.isArray(record.items) ? record.items : [];
};

const paymentLabel = (value: unknown) => {
  const normalized = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("debit") || normalized.includes("debito")) return "Débito";
  if (normalized.includes("pix")) return "Pix";
  if (normalized.includes("dinheiro") || normalized.includes("money") || normalized.includes("cash")) return "Dinheiro";
  if (normalized.includes("credit") || normalized.includes("credito")) return "Crédito";
  if (normalized.includes("fidel") || normalized.includes("voucher") || normalized.includes("vale")) return "Fidelidade / Vouchers / Outros";
  return "Fidelidade / Vouchers / Outros";
};

const isFrontCashier = (sale: Record<string, unknown>) => {
  const source = firstText(sale.origin, sale.source, sale.channel, sale.type, sale.transaction_type).toLowerCase();
  if (source.includes("delivery") || source.includes("ecom") || source.includes("online") || source.includes("web") || source.includes("comanda")) return false;
  return true;
};

const saleTime = (sale: Record<string, unknown>) => firstText(sale.time, sale.created_at, sale.createdAt, sale.date);

const saoPauloDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const saoPauloHourFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "numeric",
  hour12: false,
});

export const toLocalDate = (iso: string): string => {
  if (!iso || typeof iso !== "string") return "";
  const trimmed = iso.trim();
  if (!trimmed) return "";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    let d: Date;
    if (trimmed.includes("T") || trimmed.includes("Z") || trimmed.includes("+") || (/-\d{2}:\d{2}$/.test(trimmed))) {
      d = new Date(trimmed);
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed)) {
      d = new Date(trimmed.replace(" ", "T"));
    } else {
      d = new Date(trimmed);
    }
    if (isNaN(d.getTime())) return "";
    return saoPauloDateFormatter.format(d);
  } catch {
    return "";
  }
};

const parseHour = (str: string) => {
  if (!str) return -1;
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return -1;
    const parsed = parseInt(saoPauloHourFormatter.format(d), 10);
    return parsed === 24 ? 0 : parsed;
  } catch {
    return -1;
  }
};

export function buildEyemobileDashboard(payload: EyemobileApiPayload): EyemobileDashboardData {
  const seenSaleIds = new Set<string>();

  const sales = unwrapList(payload.sales)
    .map(toRecord)
    .filter((sale) => {
      // 1. Exclui vendas canceladas, incompletas ou estornadas
      if (
        sale.cancelled === true ||
        sale.completed === false ||
        sale.refunded === true ||
        sale.is_refund === true ||
        sale.status === "cancelled" ||
        sale.status === "canceled" ||
        sale.status === "refunded"
      ) {
        return false;
      }

      // 2. Deduplicação estrita de eventos/transações repetidas
      const saleId = firstText(sale.id, sale.transaction_id, sale.sale_id, sale.uuid);
      if (saleId) {
        if (seenSaleIds.has(saleId)) return false;
        seenSaleIds.add(saleId);
      }

      // 3. Filtro por período com base na data local America/Sao_Paulo (se fornecida e válida)
      if (payload.startDate || payload.endDate) {
        const d = toLocalDate(saleTime(sale));
        if (d) {
          if (payload.startDate && d < payload.startDate) return false;
          if (payload.endDate && d > payload.endDate) return false;
        }
      }
      return true;
    });

  const paymentTotals = new Map<string, number>();
  const productTotals = new Map<string, { id: string; product: string; quantity: number; total: number }>();
  const deviceTotals = new Map<string, { name: string; transactions: number; total: number }>();
  const dailyTotals = new Map<string, { date: string; total: number; transactions: number }>();

  let totalItemsSold = 0;
  let salesWithItemsCount = 0;

  const hourly = Array.from({ length: 19 }, (_, index) => ({
    hour: `${String(index + 5).padStart(2, "0")}h`,
    frontCashier: 0,
    otherOrigins: 0,
  }));

  let totalRevenue = 0;
  let frontCashierRevenue = 0;
  let classifiedRevenue = 0;
  let unclassifiedRevenue = 0;
  let classifiedTransactions = 0;
  let unclassifiedTransactions = 0;

  const operationValues = { "Aquisição de saldo": 0, "Utilização de saldo": 0, "Frente de caixa": 0, Comandas: 0 };

  sales.forEach((sale) => {
    const total = toNumber(sale.total ?? sale.amount ?? sale.value ?? sale.total_value);
    totalRevenue += total;
    const frontCashier = isFrontCashier(sale);
    if (frontCashier) frontCashierRevenue += total;

    // Classificação temporal estrita: vendas sem data confiável NÃO vão para o primeiro dia
    const createdAt = saleTime(sale);
    const localDate = toLocalDate(createdAt);

    if (localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      classifiedRevenue += total;
      classifiedTransactions += 1;
      const dayEntry = dailyTotals.get(localDate) ?? { date: localDate, total: 0, transactions: 0 };
      dayEntry.total = Math.round((dayEntry.total + total) * 100) / 100;
      dayEntry.transactions += 1;
      dailyTotals.set(localDate, dayEntry);
    } else {
      unclassifiedRevenue += total;
      unclassifiedTransactions += 1;
    }

    const hour = parseHour(createdAt);
    if (Number.isFinite(hour) && hour >= 5 && hour <= 23) {
      const hourItem = hourly[hour - 5];
      if (frontCashier) hourItem.frontCashier += total;
      else hourItem.otherOrigins += total;
    }

    const operation = firstText(sale.operation, sale.operation_type, sale.type, sale.origin).toLowerCase();
    if (operation.includes("acqui") || operation.includes("aquis")) operationValues["Aquisição de saldo"] += total;
    else if (operation.includes("saldo") || operation.includes("balance")) operationValues["Utilização de saldo"] += total;
    else if (operation.includes("comanda") || operation.includes("tab")) operationValues.Comandas += total;
    else operationValues["Frente de caixa"] += total;

    const pays = unwrapList(sale.transaction_pays ?? sale.payments ?? sale.pays);
    if (pays.length === 0) paymentTotals.set("Fidelidade / Vouchers / Outros", (paymentTotals.get("Fidelidade / Vouchers / Outros") ?? 0) + total);
    pays.forEach((pay) => {
      const payment = toRecord(pay);
      const label = paymentLabel(payment.pay_type_name ?? payment.payment_method ?? payment.type ?? payment.name);
      const value = toNumber(payment.amount ?? payment.total ?? payment.value) || (pays.length === 1 ? total : 0);
      paymentTotals.set(label, (paymentTotals.get(label) ?? 0) + value);
      const device = firstText(payment.device_name, payment.device?.toString(), payment.pos_name, payment.terminal_name, sale.device_name, sale.pos_name);
      if (device) {
        const current = deviceTotals.get(device) ?? { name: device, transactions: 0, total: 0 };
        current.transactions += 1;
        current.total += value;
        deviceTotals.set(device, current);
      }
    });

    // Detalhamento de itens vendidos por venda
    const saleItems = unwrapList(sale.items ?? sale.products ?? sale.transaction_items);
    let saleHasValidItem = false;

    saleItems.forEach((rawItem) => {
      const item = toRecord(rawItem);
      // Ignora itens cancelados ou estornados
      if (
        item.cancelled === true ||
        item.refunded === true ||
        item.is_refund === true ||
        item.status === "cancelled" ||
        item.status === "canceled" ||
        item.status === "refunded"
      ) {
        return;
      }

      const rawQty = item.quantity ?? item.qtd ?? item.amount;
      const quantity = toNumber(rawQty);
      if (quantity <= 0 || isNaN(quantity)) {
        return;
      }

      saleHasValidItem = true;
      totalItemsSold += quantity;

      const id = String(item.product_id ?? item.id ?? item.sku ?? "Sem ID");
      const name = firstText(item.product_name, item.name, item.description, "Produto sem nome");
      const itemTotal = toNumber(item.total ?? item.total_value ?? item.value) || toNumber(item.unit_price ?? item.price) * quantity;
      const current = productTotals.get(id) ?? { id, product: name, quantity: 0, total: 0 };
      current.quantity += quantity;
      current.total = Math.round((current.total + itemTotal) * 100) / 100;
      productTotals.set(id, current);
    });

    if (saleHasValidItem) {
      salesWithItemsCount++;
    }
  });

  const criticalStock = unwrapList(payload.products).map(toRecord).map((product) => {
    const depot = toRecord(product.depot ?? product.deposit ?? product.warehouse);
    return {
      id: String(product.id ?? product.product_id ?? product.sku ?? "Sem ID"),
      product: firstText(product.name, product.product_name, product.description, "Produto sem nome"),
      stock: toNumber(product.stock ?? product.current_stock ?? product.quantity),
      minStock: toNumber(product.min_stock ?? product.minimum_stock ?? product.stock_min),
      depot: firstText(depot.name, product.depot_name, product.warehouse_name, "Depósito não informado"),
      unit: firstText(product.unit, product.unit_name, "unidade"),
      price: toNumber(product.cost_price ?? product.price),
    };
  }).filter((product) => product.stock <= product.minStock);

  const dailySales = Array.from(dailyTotals.values()).sort((a, b) => a.date.localeCompare(b.date));
  totalRevenue = Math.round(totalRevenue * 100) / 100;
  frontCashierRevenue = Math.round(frontCashierRevenue * 100) / 100;
  classifiedRevenue = Math.round(classifiedRevenue * 100) / 100;
  unclassifiedRevenue = Math.round(unclassifiedRevenue * 100) / 100;

  let itemsCoverage: ItemsCoverageStatus = "unavailable";
  let itemsCoverageRatio = 0;

  if (sales.length > 0) {
    itemsCoverageRatio = Math.round((salesWithItemsCount / sales.length) * 1000) / 1000;
    if (salesWithItemsCount === sales.length) {
      itemsCoverage = "complete";
    } else if (salesWithItemsCount > 0) {
      itemsCoverage = "partial";
    } else {
      itemsCoverage = "unavailable";
    }
  }

  const dailySalesCoverage: EyemobileDailySalesCoverage = {
    classifiedRevenue,
    unclassifiedRevenue,
    classifiedTransactions,
    unclassifiedTransactions,
    coverageRatio: totalRevenue > 0 ? Math.round((classifiedRevenue / totalRevenue) * 1000) / 1000 : 1,
  };

  const dataCompleteness: "complete" | "truncated" =
    payload.hasMore === true ? "truncated" : "complete";

  return {
    kpis: {
      totalRevenue,
      totalTransactions: sales.length,
      averageTicket: sales.length > 0 ? Math.round((totalRevenue / sales.length) * 100) / 100 : 0,
      frontCashierRevenue,
      totalItemsSold: itemsCoverage !== "unavailable" ? totalItemsSold : null,
      itemsCoverage,
      itemsCoverageRatio,
      salesWithItemsCount,
    },
    dailySales,
    dailySalesCoverage,
    salesByHour: hourly,
    payments: Array.from(paymentTotals, ([name, value]) => ({ name, value, percentage: totalRevenue > 0 ? (value / totalRevenue) * 100 : 0 })).sort((a, b) => b.value - a.value),
    topProducts: Array.from(productTotals.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    operationSummary: [...Object.entries(operationValues).map(([label, value]) => ({ label, value })), { label: "Valor total", value: totalRevenue }],
    devices: Array.from(deviceTotals.values()).sort((a, b) => b.total - a.total),
    criticalStock,
    dataCompleteness,
  };
}
