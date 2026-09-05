import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  roundToCents,
  normalizePaymentMethod,
  deduplicateOperationalTransactions,
  reconcileCashClosing,
} from "../../../../supabase/functions/_shared/ai/operations-core.ts";
import type { OperationalTransaction } from "../../../../supabase/functions/_shared/ai/operations-types.ts";

describe("Operations Core — Cálculos Determinísticos & Precisão Monetária (Etapa 9.5B)", () => {
  const TEST_WORKSPACE = "ws-core-111";
  const TEST_USER = "user-core-111";

  // ─── 1. PRECISÃO MONETÁRIA & INTEGER CENTS ──────────────────────────────────
  describe("1. Precisão Monetária e Aritmética de Centavos Inteiros", () => {
    it("resolve perfeitamente 0.1 + 0.2 = 0.3 sem floating point drift", () => {
      const c1 = toCents(0.1); // 10 cents
      const c2 = toCents(0.2); // 20 cents
      const sumCents = c1 + c2; // 30 cents
      const total = fromCents(sumCents);

      expect(total).toBe(0.3);
      expect(toCents(total)).toBe(30);
      // Confirma que não há o clássico 0.30000000000000004
      expect(total.toString()).toBe("0.3");
    });

    it("converte valores monetários decimais e strings com precisão", () => {
      expect(toCents(150.45)).toBe(15045);
      expect(toCents("150.45")).toBe(15045);
      expect(toCents("150,45")).toBe(15045);
      expect(fromCents(15045)).toBe(150.45);
      expect(roundToCents(150.456)).toBe(150.46);
    });

    it("trata valores nulos, indefinidos, vazios e zero sem quebrar", () => {
      expect(toCents(0)).toBe(0);
      expect(toCents(null)).toBe(0);
      expect(toCents(undefined)).toBe(0);
      expect(toCents("")).toBe(0);
      expect(toCents("invalid")).toBe(0);
      expect(fromCents(0)).toBe(0);
    });

    it("lida corretamente com valores negativos", () => {
      expect(toCents(-45.5)).toBe(-4550);
      expect(fromCents(-4550)).toBe(-45.5);
    });
  });

  // ─── 2. NORMALIZAÇÃO DE FORMAS DE PAGAMENTO ─────────────────────────────────
  describe("2. Normalização Canônica de Métodos de Pagamento", () => {
    it("mapeia sinônimos comuns para o enum canônico", () => {
      expect(normalizePaymentMethod("dinheiro")).toBe("dinheiro");
      expect(normalizePaymentMethod("Dinheiro Espécie")).toBe("dinheiro");
      expect(normalizePaymentMethod("CASH")).toBe("dinheiro");
      expect(normalizePaymentMethod("cartao_debito")).toBe("debito");
      expect(normalizePaymentMethod("DEBIT")).toBe("debito");
      expect(normalizePaymentMethod("cartao_credito")).toBe("credito");
      expect(normalizePaymentMethod("Crédito Parcelado")).toBe("credito");
      expect(normalizePaymentMethod("PIX")).toBe("pix");
      expect(normalizePaymentMethod("Chave Pix")).toBe("pix");
      expect(normalizePaymentMethod("voucher")).toBe("voucher");
      expect(normalizePaymentMethod("Vale Refeição / Sodexo")).toBe("voucher");
      expect(normalizePaymentMethod("alelo")).toBe("voucher");
      expect(normalizePaymentMethod("desconhecido")).toBe("outros");
      expect(normalizePaymentMethod(null)).toBe("outros");
    });
  });

  // ─── 3. PREVENÇÃO DE DOUBLE COUNTING (FONTES DUPLICADAS) ────────────────────
  describe("3. Prevenção de Contabilização Dupla entre Banco Local e Eyemobile", () => {
    it("deduplica transações locais já sincronizadas evitando soma cega", () => {
      const localTxs: OperationalTransaction[] = [
        {
          id: "tx-local-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 100.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda PDV 1",
          source: "local",
          metadata: { eyemobile_sale_id: "eye-999" },
        },
      ];

      const eyemobileTxs: OperationalTransaction[] = [
        {
          id: "tx-eye-duplicate",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 100.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda PDV 1 (cópia API)",
          source: "eyemobile",
          metadata: { eyemobile_sale_id: "eye-999" },
        },
        {
          id: "tx-eye-new",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 50.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda Nova",
          source: "eyemobile",
          metadata: { eyemobile_sale_id: "eye-1000" },
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyemobileTxs);

      expect(duplicatesCount).toBe(1);
      expect(unique).toHaveLength(2);
      expect(unique.map((t) => t.id)).toEqual(["tx-local-1", "tx-eye-new"]);
    });
  });

  // ─── 4. RECONCILIAÇÃO DETERMINÍSTICA DE FECHAMENTO DE CAIXA ─────────────────
  describe("4. Reconciliação Determinística de Fechamento de Caixa", () => {
    it("fechamento exato: saldo e todos os meios de pagamento batem com precisão", () => {
      const sales: OperationalTransaction[] = [
        {
          id: "s1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 150.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda Dinheiro",
          source: "local",
        },
        {
          id: "s2",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 250.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda Pix",
          source: "local",
        },
        {
          id: "s3",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 100.0,
          type: "receita",
          paymentMethod: "debito",
          description: "Venda Débito",
          source: "local",
        },
      ];

      const withdrawals: OperationalTransaction[] = [
        {
          id: "w1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 50.0,
          type: "despesa",
          paymentMethod: "dinheiro",
          description: "Sangria Dinheiro",
          source: "local",
        },
      ];

      // Dinheiro esperado: 150 - 50 = 100
      // Pix esperado: 250
      // Débito esperado: 100
      // Total esperado: 450
      const result = reconcileCashClosing({
        workspaceId: TEST_WORKSPACE,
        userId: TEST_USER,
        date: "2026-09-04",
        shift: "noite",
        sales,
        withdrawals,
        reportedByMethod: {
          dinheiro: 100.0,
          pix: 250.0,
          debito: 100.0,
        },
      });

      expect(result.status).toBe("exato");
      expect(result.expectedTotal).toBe(450.0);
      expect(result.reportedTotal).toBe(450.0);
      expect(result.difference).toBe(0.0);
      expect(result.differencesByMethod.dinheiro.status).toBe("exato");
      expect(result.differencesByMethod.pix.status).toBe("exato");
      expect(result.differencesByMethod.debito.status).toBe("exato");
      expect(result.summaryMessage).toContain("EXATO");
    });

    it("falta dinheiro (furo): detecta diferença negativa", () => {
      const sales: OperationalTransaction[] = [
        {
          id: "s1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 200.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda",
          source: "local",
        },
      ];

      const result = reconcileCashClosing({
        workspaceId: TEST_WORKSPACE,
        userId: TEST_USER,
        date: "2026-09-04",
        sales,
        withdrawals: [],
        reportedByMethod: {
          dinheiro: 180.0, // Faltam 20
        },
      });

      expect(result.status).toBe("furo");
      expect(result.expectedTotal).toBe(200.0);
      expect(result.reportedTotal).toBe(180.0);
      expect(result.difference).toBe(-20.0);
      expect(result.differencesByMethod.dinheiro.difference).toBe(-20.0);
      expect(result.differencesByMethod.dinheiro.status).toBe("furo");
      expect(result.warnings.some((w) => w.includes("Furo total"))).toBe(true);
    });

    it("sobra dinheiro (sobra): detecta diferença positiva", () => {
      const sales: OperationalTransaction[] = [
        {
          id: "s1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 300.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda",
          source: "local",
        },
      ];

      const result = reconcileCashClosing({
        workspaceId: TEST_WORKSPACE,
        userId: TEST_USER,
        date: "2026-09-04",
        sales,
        withdrawals: [],
        reportedByMethod: {
          dinheiro: 325.5, // Sobram 25.50
        },
      });

      expect(result.status).toBe("sobra");
      expect(result.expectedTotal).toBe(300.0);
      expect(result.reportedTotal).toBe(325.5);
      expect(result.difference).toBe(25.5);
      expect(result.differencesByMethod.dinheiro.status).toBe("sobra");
      expect(result.warnings.some((w) => w.includes("Sobra total"))).toBe(true);
    });

    it("divergência entre meios com compensação cruzada (total bate mas métodos divergem)", () => {
      const sales: OperationalTransaction[] = [
        {
          id: "s1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 100.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda Dinheiro",
          source: "local",
        },
        {
          id: "s2",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 100.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda Pix",
          source: "local",
        },
      ];

      // Operador informou 150 em dinheiro (+50) e 50 em pix (-50). Total = 200 bate!
      const result = reconcileCashClosing({
        workspaceId: TEST_WORKSPACE,
        userId: TEST_USER,
        date: "2026-09-04",
        sales,
        withdrawals: [],
        reportedByMethod: {
          dinheiro: 150.0,
          pix: 50.0,
        },
      });

      expect(result.status).toBe("divergencia_meio_pagamento");
      expect(result.difference).toBe(0.0);
      expect(result.differencesByMethod.dinheiro.status).toBe("sobra");
      expect(result.differencesByMethod.pix.status).toBe("furo");
      expect(result.warnings.some((w) => w.includes("compensação cruzada"))).toBe(true);
    });

    it("rejeita transações pertencentes a outro workspace (Fail-Closed cross-workspace)", () => {
      const foreignSales: OperationalTransaction[] = [
        {
          id: "s-alien",
          workspaceId: "ws-alien-999", // Workspace divergente
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 500.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda Alien",
          source: "local",
        },
      ];

      expect(() =>
        reconcileCashClosing({
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          sales: foreignSales,
          reportedByMethod: { pix: 500.0 },
        }),
      ).toThrow("WALLET_AI_OPERATIONS_WORKSPACE_MISMATCH");
    });
  });

  // ─── 5. RECONCILIAÇÃO OPERACIONAL REAL — CAMADAS DE DEDUP (CHECKPOINT 9.5B.1) ─
  describe("5. Reconciliação Operacional Real — 3 Camadas de Dedup (Checkpoint 9.5B.1)", () => {
    it("Eyemobile dinheiro único → conta 1x", () => {
      const localTxs: OperationalTransaction[] = [];
      const eyeTxs: OperationalTransaction[] = [
        {
          id: "eye-cash-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 50.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda Balcão Dinheiro",
          source: "eyemobile",
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyeTxs);
      expect(duplicatesCount).toBe(0);
      expect(unique).toHaveLength(1);
      expect(unique[0].amount).toBe(50.0);
      expect(unique[0].paymentMethod).toBe("dinheiro");
    });

    it("Eyemobile PIX + Divipay PIX correspondente → conta 1x", () => {
      const localTxs: OperationalTransaction[] = [
        {
          id: "divipay-pix-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 100.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Recebimento Pix Divipay 9901",
          source: "divipay",
        },
      ];
      const eyeTxs: OperationalTransaction[] = [
        {
          id: "eye-pix-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 100.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda Eyemobile #501",
          source: "eyemobile",
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyeTxs);
      expect(duplicatesCount).toBe(1);
      expect(unique).toHaveLength(1);
      expect(unique[0].id).toBe("divipay-pix-1");
      expect(unique[0].amount).toBe(100.0);
    });

    it("Eyemobile débito + Divipay débito → conta 1x", () => {
      const localTxs: OperationalTransaction[] = [
        {
          id: "divipay-deb-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 80.0,
          type: "receita",
          paymentMethod: "debito",
          description: "Entrada Débito Gateway Divipay",
          source: "divipay",
        },
      ];
      const eyeTxs: OperationalTransaction[] = [
        {
          id: "eye-deb-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 80.0,
          type: "receita",
          paymentMethod: "debito",
          description: "Venda Cartão Débito Eyemobile #502",
          source: "eyemobile",
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyeTxs);
      expect(duplicatesCount).toBe(1);
      expect(unique).toHaveLength(1);
      expect(unique[0].id).toBe("divipay-deb-1");
      expect(unique[0].amount).toBe(80.0);
    });

    it("Eyemobile crédito + Divipay crédito → conta 1x", () => {
      const localTxs: OperationalTransaction[] = [
        {
          id: "divipay-cred-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 150.0,
          type: "receita",
          paymentMethod: "credito",
          description: "Entrada Crédito Gateway Divipay",
          source: "divipay",
        },
      ];
      const eyeTxs: OperationalTransaction[] = [
        {
          id: "eye-cred-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 150.0,
          type: "receita",
          paymentMethod: "credito",
          description: "Venda Crédito Eyemobile #503",
          source: "eyemobile",
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyeTxs);
      expect(duplicatesCount).toBe(1);
      expect(unique).toHaveLength(1);
      expect(unique[0].id).toBe("divipay-cred-1");
      expect(unique[0].amount).toBe(150.0);
    });

    it("Eyemobile digital sem metadata ID mas coberto pela fonte autoritativa → conta 1x", () => {
      const localTxs: OperationalTransaction[] = [
        {
          id: "divipay-pix-raw",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 75.5,
          type: "receita",
          paymentMethod: "pix",
          description: "Recebimento Pix Divipay",
          source: "divipay",
          metadata: {}, // Sem nenhum ID de venda do Eyemobile
        },
      ];
      const eyeTxs: OperationalTransaction[] = [
        {
          id: "eye-pix-raw",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 75.5,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda PDV",
          source: "eyemobile",
          metadata: {}, // Sem metadata ID
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyeTxs);
      expect(duplicatesCount).toBe(1);
      expect(unique).toHaveLength(1);
      expect(unique[0].amount).toBe(75.5);
    });

    it("Eyemobile sale_id explicitamente duplicado → conta 1x", () => {
      const localTxs: OperationalTransaction[] = [
        {
          id: "local-sale-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 120.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda Eyemobile #8888",
          source: "local",
          metadata: { eyemobile_sale_id: "8888" },
        },
      ];
      const eyeTxs: OperationalTransaction[] = [
        {
          id: "eye-sale-dup",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 120.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda Eyemobile #8888",
          source: "eyemobile",
          metadata: { eyemobile_sale_id: "8888" },
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyeTxs);
      expect(duplicatesCount).toBe(1);
      expect(unique).toHaveLength(1);
      expect(unique[0].id).toBe("local-sale-1");
    });

    it("Venda legítima diferente com mesmo valor → NÃO eliminar indevidamente", () => {
      // 1 lançamento Divipay de R$ 50 e 2 vendas legítimas Eyemobile de R$ 50 cada
      const localTxs: OperationalTransaction[] = [
        {
          id: "divipay-pix-50",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 50.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Recebimento Pix Divipay 101",
          source: "divipay",
        },
      ];
      const eyeTxs: OperationalTransaction[] = [
        {
          id: "eye-sale-a",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 50.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda Eyemobile #301",
          source: "eyemobile",
        },
        {
          id: "eye-sale-b",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 50.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda Eyemobile #302",
          source: "eyemobile",
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyeTxs);
      // Divipay cobre apenas 1 venda de 50. A 2ª venda legítima de 50 é PRESERVADA!
      expect(duplicatesCount).toBe(1);
      expect(unique).toHaveLength(2);
      const total = unique.reduce((acc, t) => acc + t.amount, 0);
      expect(total).toBe(100.0);
    });

    it("Transação manual independente → preservada", () => {
      const localTxs: OperationalTransaction[] = [
        {
          id: "manual-dinheiro-1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 200.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Aporte em Espécie Gaveta",
          source: "local",
        },
      ];
      const eyeTxs: OperationalTransaction[] = [
        {
          id: "eye-cash-sales",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 150.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Vendas Dinheiro PDV",
          source: "eyemobile",
        },
      ];

      const { unique, duplicatesCount } = deduplicateOperationalTransactions(localTxs, eyeTxs);
      expect(duplicatesCount).toBe(0);
      expect(unique).toHaveLength(2);
      const total = unique.reduce((acc, t) => acc + t.amount, 0);
      expect(total).toBe(350.0);
    });
  });

  // ─── 6. PRECISÃO MONETÁRIA ESTREITA EM CENTAVOS INTEIROS ───────────────────
  describe("6. Precisão Monetária Estreita em Centavos Inteiros", () => {
    it("resolve soma flutuante crítica 0.1 + 0.2 exatamente como 0.30", () => {
      const c1 = toCents(0.1);
      const c2 = toCents(0.2);
      expect(c1 + c2).toBe(30);
      expect(fromCents(c1 + c2)).toBe(0.3);
    });

    it("lida com o menor centavo (R$ 0,01) e grandes volumes (R$ 999.999,99)", () => {
      expect(toCents(0.01)).toBe(1);
      expect(fromCents(1)).toBe(0.01);

      expect(toCents(999999.99)).toBe(99999999);
      expect(fromCents(99999999)).toBe(999999.99);
    });

    it("detecta diferença de exatamente 1 centavo (0.01 de sobra ou furo) sem tolerância frouxa", () => {
      const sales: OperationalTransaction[] = [
        {
          id: "s-cent",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 100.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda 100",
          source: "local",
        },
      ];

      // Relatado 100.01 -> sobra de 0.01
      const resSobra = reconcileCashClosing({
        workspaceId: TEST_WORKSPACE,
        userId: TEST_USER,
        date: "2026-09-04",
        sales,
        reportedTotal: 100.01,
      });
      expect(resSobra.status).toBe("sobra");
      expect(resSobra.difference).toBe(0.01);

      // Relatado 99.99 -> furo de -0.01
      const resFuro = reconcileCashClosing({
        workspaceId: TEST_WORKSPACE,
        userId: TEST_USER,
        date: "2026-09-04",
        sales,
        reportedTotal: 99.99,
      });
      expect(resFuro.status).toBe("furo");
      expect(resFuro.difference).toBe(-0.01);
    });
  });
});
