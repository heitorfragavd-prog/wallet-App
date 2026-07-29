export interface EyemobileApiPayload {
  sales: unknown[];
  products: unknown[];
  stores: unknown[];
}

export interface EyemobileDashboardData {
  kpis: {
    totalRevenue: number;
    totalTransactions: number;
    averageTicket: number;
    frontCashierRevenue: number;
  };
  salesByHour: { hour: string; frontCashier: number; otherOrigins: number }[];
  payments: { name: string; value: number; percentage: number }[];
  topProducts: { id: string; product: string; quantity: number; total: number }[];
  operationSummary: { label: string; value: number }[];
  devices: { name: string; transactions: number; total: number }[];
  criticalStock: { id: string; product: string; stock: number; minStock: number; depot: string; unit: string; price: number }[];
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
  return source.includes("cash") || source.includes("caixa") || source.includes("pdv") || source.includes("front");
};

const saleTime = (sale: Record<string, unknown>) => firstText(sale.time, sale.created_at, sale.createdAt, sale.date);

export function buildEyemobileDashboard(payload: EyemobileApiPayload): EyemobileDashboardData {
  const sales = unwrapList(payload.sales).map(toRecord).filter((sale) => !sale.cancelled && sale.completed !== false);
  const paymentTotals = new Map<string, number>();
  const productTotals = new Map<string, { id: string; product: string; quantity: number; total: number }>();
  const deviceTotals = new Map<string, { name: string; transactions: number; total: number }>();
  const hourly = Array.from({ length: 19 }, (_, index) => ({ hour: `${String(index + 5).padStart(2, "0")}h`, frontCashier: 0, otherOrigins: 0 }));
  let totalRevenue = 0;
  let frontCashierRevenue = 0;
  const operationValues = { "Aquisição de saldo": 0, "Utilização de saldo": 0, "Frente de caixa": 0, Comandas: 0 };

  sales.forEach((sale) => {
    const total = toNumber(sale.total ?? sale.amount ?? sale.value ?? sale.total_value);
    totalRevenue += total;
    const frontCashier = isFrontCashier(sale);
    if (frontCashier) frontCashierRevenue += total;

    const createdAt = saleTime(sale);
    const hour = new Date(createdAt).getHours();
    if (Number.isFinite(hour) && hour >= 5 && hour <= 23) {
      const hourItem = hourly[hour - 5];
      if (frontCashier) hourItem.frontCashier += total;
      else hourItem.otherOrigins += total;
    }

    const operation = firstText(sale.operation, sale.operation_type, sale.type, sale.origin).toLowerCase();
    if (operation.includes("acqui") || operation.includes("aquis")) operationValues["Aquisição de saldo"] += total;
    else if (operation.includes("saldo") || operation.includes("balance")) operationValues["Utilização de saldo"] += total;
    else if (operation.includes("comanda") || operation.includes("tab")) operationValues.Comandas += total;
    else if (frontCashier) operationValues["Frente de caixa"] += total;

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

    unwrapList(sale.items ?? sale.products ?? sale.transaction_items).forEach((item) => {
      const product = toRecord(item);
      const id = String(product.product_id ?? product.id ?? product.sku ?? "Sem ID");
      const name = firstText(product.product_name, product.name, product.description, "Produto sem nome");
      const quantity = toNumber(product.quantity ?? product.qtd ?? product.amount ?? 1) || 1;
      const itemTotal = toNumber(product.total ?? product.total_value ?? product.value) || toNumber(product.unit_price ?? product.price) * quantity;
      const current = productTotals.get(id) ?? { id, product: name, quantity: 0, total: 0 };
      current.quantity += quantity;
      current.total += itemTotal;
      productTotals.set(id, current);
    });
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

  return {
    kpis: {
      totalRevenue,
      totalTransactions: sales.length,
      averageTicket: sales.length > 0 ? totalRevenue / sales.length : 0,
      frontCashierRevenue,
    },
    salesByHour: hourly,
    payments: Array.from(paymentTotals, ([name, value]) => ({ name, value, percentage: totalRevenue > 0 ? (value / totalRevenue) * 100 : 0 })).sort((a, b) => b.value - a.value),
    topProducts: Array.from(productTotals.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    operationSummary: [...Object.entries(operationValues).map(([label, value]) => ({ label, value })), { label: "Valor total", value: totalRevenue }],
    devices: Array.from(deviceTotals.values()).sort((a, b) => b.total - a.total),
    criticalStock,
  };
}
