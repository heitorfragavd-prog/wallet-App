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
});
