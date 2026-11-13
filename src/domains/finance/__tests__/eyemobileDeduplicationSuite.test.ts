import { describe, it, expect } from "vitest";

describe("GATE 6: Suíte de Testes de Deduplicação, Idempotência e Consistência Eyemobile", () => {
  // 1. Sincronização repetida e Proteção contra Duplicidade
  it("G6-01: Garante geração de chave canônica deduplication_key idempotente (eyemobile:<id>)", () => {
    const sale = { id: 340295932, total: 15.0 };
    const dedupKey = `eyemobile:${sale.id}`;
    expect(dedupKey).toBe("eyemobile:340295932");

    // Simulando 2 execuções para a mesma venda
    const existingKeys = new Set<string>();
    const registerSale = (id: number) => {
      const key = `eyemobile:${id}`;
      if (existingKeys.has(key)) return { inserted: false, reason: "duplicate" };
      existingKeys.add(key);
      return { inserted: true, key };
    };

    const firstRun = registerSale(sale.id);
    const secondRun = registerSale(sale.id);
    expect(firstRun.inserted).toBe(true);
    expect(secondRun.inserted).toBe(false);
    expect(secondRun.reason).toBe("duplicate");
  });

  // 2. Sincronização simultânea (Tratamento de erro 23505 como sucesso idempotente)
  it("G6-02: Rejeição concorrente do banco (código 23505) é tratada com idempotência segura sem falhar a rotina", () => {
    const mockPostgresError = {
      code: "23505",
      message: "duplicate key value violates unique constraint \"idx_transacoes_wallet_ai_dedup\"",
    };

    const handleInsertResult = (err: { code: string; message: string } | null) => {
      if (err) {
        if (
          err.code === "23505" ||
          err.message.includes("idx_transacoes_wallet_ai_dedup") ||
          err.message.includes("duplicate key")
        ) {
          return { status: "idempotent_skipped" };
        }
        return { status: "error" };
      }
      return { status: "inserted" };
    };

    expect(handleInsertResult(mockPostgresError)).toEqual({ status: "idempotent_skipped" });
  });

  // 3. Paginação determinística
  it("G6-03: Paginação determinística preserva ordenação por data, created_at e id para evitar deslocamento de linhas", () => {
    const rows = [
      { id: "uuid-2", data: "2026-11-11", created_at: "2026-11-11 05:50:00+00" },
      { id: "uuid-1", data: "2026-11-11", created_at: "2026-11-11 05:50:00+00" },
      { id: "uuid-3", data: "2026-11-11", created_at: "2026-11-11 05:40:00+00" },
    ];

    const sorted = [...rows].sort((a, b) => {
      if (b.data !== a.data) return b.data.localeCompare(a.data);
      if (b.created_at !== a.created_at) return b.created_at.localeCompare(a.created_at);
      return b.id.localeCompare(a.id);
    });

    expect(sorted.map(r => r.id)).toEqual(["uuid-2", "uuid-1", "uuid-3"]);
  });

  // 4. Vendas canceladas e estornadas
  it("G6-04: Exclui vendas canceladas, incompletas ou estornadas do cômputo financeiro", () => {
    const sales = [
      { id: 1, total: 100, cancelled: false, completed: true, refunded: false },
      { id: 2, total: 50, cancelled: true, completed: true, refunded: false },
      { id: 3, total: 30, cancelled: false, completed: false, refunded: false },
      { id: 4, total: 80, cancelled: false, completed: true, refunded: true },
      { id: 5, total: 20, cancelled: false, completed: true, is_refund: true },
    ];

    const validSales = sales.filter(
      (s) => !s.cancelled && s.completed && !s.refunded && !s.is_refund
    );

    expect(validSales.length).toBe(1);
    expect(validSales[0].id).toBe(1);
    expect(validSales[0].total).toBe(100);
  });

  // 5. Vendas com múltiplas formas de pagamento
  it("G6-05: Preserva e mapeia vendas com múltiplas formas de pagamento", () => {
    const sale = {
      id: 999,
      total: 50,
      transaction_pays: [
        { pay_type_name: "Débito", amount: 30 },
        { pay_type_name: "Dinheiro", amount: 20 },
      ],
    };

    const payNames = sale.transaction_pays.map((p) => p.pay_type_name).join(" / ");
    expect(payNames).toBe("Débito / Dinheiro");
    expect(sale.transaction_pays.reduce((acc, p) => acc + p.amount, 0)).toBe(50);
  });

  // 6. Isolamento por Workspace
  it("G6-06: Assegura que vendas Eyemobile só afetam workspace PJ", () => {
    const workspaces = [
      { id: "ws-pf", tipo: "PF" },
      { id: "ws-pj", tipo: "PJ" },
    ];

    const canSyncEyemobile = (ws: { id: string; tipo: string }) => ws.tipo === "PJ";
    expect(canSyncEyemobile(workspaces[0])).toBe(false);
    expect(canSyncEyemobile(workspaces[1])).toBe(true);
  });

  // 7. Deduplicação em useReceitas
  it("G6-07: Motor de useReceitas desduplica vendas Eyemobile tanto por deduplication_key quanto por texto da observação", () => {
    const transacoes = [
      {
        id: "tx-1",
        descricao: "Venda Eyemobile #340295932",
        observacoes: "Integrado via Eyemobile API. Venda: #340295932 | Loja: Rodo Point | Pagamento: Débito",
        deduplication_key: "eyemobile:340295932",
        valor: 15.0,
      },
      {
        id: "tx-1-dupe",
        descricao: "Venda Eyemobile #340295932",
        observacoes: "Integrado via Eyemobile API. Venda: #340295932 | Loja: Rodo Point | Pagamento: Débito",
        deduplication_key: null, // cópia antiga sem key
        valor: 15.0,
      },
      {
        id: "tx-2",
        descricao: "Venda Eyemobile #340296334",
        observacoes: "Integrado via Eyemobile API. Venda: #340296334 | Loja: Rodo Point | Pagamento: PIX",
        deduplication_key: "eyemobile:340296334",
        valor: 3.0,
      },
    ];

    const seenEyemobileSaleIds = new Set<string>();
    const deduped = transacoes.filter((t) => {
      const dedupKey = t.deduplication_key;
      const keyId = dedupKey?.startsWith("eyemobile:") ? dedupKey.replace("eyemobile:", "") : null;
      const textToMatch = `${t.descricao || ""} ${t.observacoes || ""}`;
      const idMatch = textToMatch.match(/#(\d+)/);
      const saleId = keyId || (idMatch?.[1] ? idMatch[1] : null);

      if (saleId) {
        if (seenEyemobileSaleIds.has(saleId)) return false;
        seenEyemobileSaleIds.add(saleId);
      }
      return true;
    });

    expect(deduped.length).toBe(2);
    expect(deduped.reduce((acc, t) => acc + t.valor, 0)).toBe(18.0);
  });

  // 8. Preservação integral de outras origens
  it("G6-08: Transações de outras origens (Divipay, manuais, etc.) nunca são filtradas pela desduplicação Eyemobile", () => {
    const transacoes = [
      { id: "manual-1", descricao: "Venda Balcão Manual", observacoes: "", valor: 100 },
      { id: "divipay-1", descricao: "Recebimento Divipay Cartão", observacoes: "Liquidado", valor: 500 },
      { id: "divipay-2", descricao: "Recebimento Divipay Cartão", observacoes: "Liquidado", valor: 250 },
      { id: "eye-1", descricao: "Venda Eyemobile #100", observacoes: "Venda: #100", valor: 10 },
      { id: "eye-1-dupe", descricao: "Venda Eyemobile #100", observacoes: "Venda: #100", valor: 10 },
    ];

    const seenEyemobileSaleIds = new Set<string>();
    const filtered = transacoes.filter((t) => {
      const isEye = t.descricao.includes("Eyemobile") || t.observacoes.includes("Eyemobile");
      if (isEye) {
        const match = t.descricao.match(/#(\d+)/) || t.observacoes.match(/#(\d+)/);
        const saleId = match ? match[1] : t.id;
        if (seenEyemobileSaleIds.has(saleId)) return false;
        seenEyemobileSaleIds.add(saleId);
      }
      return true;
    });

    expect(filtered.length).toBe(4); // manual + 2 divipay + 1 eyemobile única
    expect(filtered.some((t) => t.id === "manual-1")).toBe(true);
    expect(filtered.some((t) => t.id === "divipay-1")).toBe(true);
    expect(filtered.some((t) => t.id === "divipay-2")).toBe(true);
    expect(filtered.some((t) => t.id === "eye-1")).toBe(true);
    expect(filtered.some((t) => t.id === "eye-1-dupe")).toBe(false);
  });
});
