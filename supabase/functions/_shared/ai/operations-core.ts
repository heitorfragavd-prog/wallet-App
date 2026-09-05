/**
 * Operations Agent — Deterministic Calculations & Reconciliation (Etapa 9.5B)
 * Todos os cálculos monetários utilizam aritmética de centavos inteiros (Integer Cents)
 * para eliminar qualquer risco de floating point drift.
 */

import type {
  PaymentMethod,
  ClosingStatus,
  OperationalTransaction,
  CashClosingResult,
  PaymentMethodDifference,
} from "./operations-types.ts";

export const ALL_PAYMENT_METHODS: readonly PaymentMethod[] = [
  "dinheiro",
  "debito",
  "credito",
  "pix",
  "voucher",
  "outros",
] as const;

/**
 * Converte valor monetário (número ou string) em centavos inteiros.
 * Exemplo: 0.1 -> 10, 0.2 -> 20, 150.45 -> 15045.
 */
export function toCents(val: unknown): number {
  if (val == null) return 0;
  const num = typeof val === "number" ? val : Number(String(val).replace(",", "."));
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Converte centavos inteiros de volta para valor decimal em Reais com 2 casas decimais.
 */
export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

/**
 * Arredonda valor decimal para precisão de 2 casas com proteção de centavos inteiros.
 */
export function roundToCents(val: number): number {
  return fromCents(toCents(val));
}

/**
 * Normaliza strings de métodos de pagamento para os métodos canônicos.
 */
export function normalizePaymentMethod(method: unknown): PaymentMethod {
  if (!method) return "outros";
  const norm = String(method)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (norm.includes("dinheiro") || norm.includes("money") || norm.includes("cash") || norm === "especie") {
    return "dinheiro";
  }
  if (norm.includes("debito") || norm.includes("debit")) {
    return "debito";
  }
  if (norm.includes("credito") || norm.includes("credit")) {
    return "credito";
  }
  if (norm.includes("pix")) {
    return "pix";
  }
  if (norm.includes("voucher") || norm.includes("vale") || norm.includes("fidelidade") || norm.includes("alelo") || norm.includes("sodexo")) {
    return "voucher";
  }
  return "outros";
}

/**
 * Identifica se uma transação provém de uma fonte digital consolidada / autoritativa (ex: Divipay / Gateway).
 */
export function isAuthoritativeDigitalSource(tx: OperationalTransaction): boolean {
  if (tx.source === "divipay") return true;
  if (tx.metadata?.source === "divipay") return true;
  const text = `${tx.description} ${tx.metadata?.observacoes ?? ""}`.toLowerCase();
  return text.includes("divipay") || text.includes("gateway") || text.includes("recebimento pix divipay");
}

/**
 * Identifica se uma transação provém do PDV Eyemobile.
 */
export function isEyemobileTransaction(tx: OperationalTransaction): boolean {
  if (tx.source === "eyemobile") return true;
  if (tx.metadata?.source === "eyemobile") return true;
  if (tx.metadata?.eyemobile_sale_id != null) return true;
  const text = `${tx.description} ${tx.metadata?.observacoes ?? ""}`.toLowerCase();
  return text.includes("eyemobile") || text.includes("venda eyemobile");
}

/**
 * Extrai o ID da venda Eyemobile de metadados, externalId ou texto de descrição/observações.
 */
export function extractEyemobileSaleId(tx: OperationalTransaction): string | null {
  if (tx.metadata?.eyemobile_sale_id != null) {
    return String(tx.metadata.eyemobile_sale_id);
  }
  if (tx.externalId && tx.source === "eyemobile") {
    return String(tx.externalId);
  }
  const text = `${tx.description} ${tx.metadata?.observacoes ?? ""}`;
  const match = text.match(/(?:Venda\s*(?:Eyemobile\s*)?#|#)(\d+)/i);
  return match ? match[1] : null;
}

/**
 * Deduplica transações operacionais entre banco local, gateways digitais e Eyemobile PDV
 * prevenindo double counting através de arquitetura determinística em 3 Camadas:
 *
 * CAMADA 1 — ID Explícito:
 *  - eyemobile_sale_id, externalId ou `#<id>` na descrição/observações.
 *  - Se uma transação do banco local já possuir o ID da venda PDV, a duplicata externa é descartada.
 *
 * CAMADA 2 — Autoridade por Meio de Pagamento Digital (Divipay / Gateway Bancário):
 *  - Meios digitais: PIX, cartão de débito, cartão de crédito.
 *  - Se uma fonte digital autoritativa consolidada (Divipay / gateway) já registrou a entrada digital,
 *    a venda PDV correspondente sem ID explícito é reconciliada 1 para 1 (conta 1x).
 *  - DINHEIRO: NUNCA é removido pela deduplicação digital. Eyemobile dinheiro e transações manuais
 *    em dinheiro são preservadas independentemente.
 *
 * CAMADA 3 — Vendas Legítimas Distintas com Mesmo Valor:
 *  - Consumo estritamente 1 para 1 da cobertura de gateway.
 *  - Vendas legítimas adicionais com o mesmo valor que não possuam correspondente no gateway
 *    são preservadas integralmente.
 *  - Transações manuais locais independentes permanecem intactas.
 */
export function deduplicateOperationalTransactions(
  localTxs: OperationalTransaction[],
  eyemobileTxs: OperationalTransaction[] = [],
): { unique: OperationalTransaction[]; duplicatesCount: number } {
  const seenExplicitEyeIds = new Set<string>();
  const unique: OperationalTransaction[] = [];
  let duplicatesCount = 0;

  // 1. Registra e preserva todas as transações locais existentes no banco (sistema de registro primário)
  for (const tx of localTxs) {
    const eyeId = extractEyemobileSaleId(tx);
    if (eyeId) {
      seenExplicitEyeIds.add(String(eyeId));
    }
    unique.push(tx);
  }

  // 2. Prepara o pool de cobertura autoritativa digital (apenas para meios digitais: pix, debito, credito)
  const digitalMethods: PaymentMethod[] = ["pix", "debito", "credito"];
  const authoritativePool = new Map<string, number>(); // `${method}_${cents}` -> count

  for (const tx of localTxs) {
    const method = normalizePaymentMethod(tx.paymentMethod);
    if (digitalMethods.includes(method) && isAuthoritativeDigitalSource(tx)) {
      const cents = toCents(tx.amount);
      const key = `${method}_${cents}`;
      authoritativePool.set(key, (authoritativePool.get(key) || 0) + 1);
    }
  }

  // 3. Processa vendas do Eyemobile através dos filtros em camadas
  for (const tx of eyemobileTxs) {
    const eyeId = extractEyemobileSaleId(tx) || tx.id;
    const method = normalizePaymentMethod(tx.paymentMethod);
    const cents = toCents(tx.amount);

    // CAMADA 1: ID Explícito (já registrado nas transações locais ou já visto no lote externo)
    if (seenExplicitEyeIds.has(String(eyeId))) {
      duplicatesCount++;
      continue;
    }

    // CAMADA 2: Fonte autoritativa digital (PIX, débito, crédito)
    if (digitalMethods.includes(method)) {
      const poolKey = `${method}_${cents}`;
      const available = authoritativePool.get(poolKey) || 0;
      if (available > 0) {
        // Coberto pela fonte autoritativa digital (1 para 1)
        authoritativePool.set(poolKey, available - 1);
        seenExplicitEyeIds.add(String(eyeId));
        duplicatesCount++;
        continue;
      }
    }

    // Venda PDV legítima aceita (dinheiro físico, ou digital não coberto)
    seenExplicitEyeIds.add(String(eyeId));
    unique.push(tx);
  }

  return { unique, duplicatesCount };
}

export interface ReconcileCashClosingParams {
  workspaceId: string;
  userId: string;
  date: string;
  shift?: string;
  sales: OperationalTransaction[];
  withdrawals?: OperationalTransaction[]; // Sangrias / saídas de caixa
  reportedByMethod?: Partial<Record<PaymentMethod, number>>;
  reportedTotal?: number;
  correlationId?: string;
}

/**
 * Executa reconciliação determinística de fechamento de caixa com precisão em centavos inteiros.
 * Cálculos NÃO dependem de LLM; LLM é utilizado estritamente para apresentação e explicação.
 */
export function reconcileCashClosing(params: ReconcileCashClosingParams): CashClosingResult {
  const {
    workspaceId,
    date,
    shift,
    sales,
    withdrawals = [],
    reportedByMethod = {},
    reportedTotal,
    correlationId = `closing_${Date.now()}`,
  } = params;

  const warnings: string[] = [];

  // Validação de escopo: nenhuma transação de outro workspace permitida
  const foreignTx = [...sales, ...withdrawals].find((tx) => tx.workspaceId !== workspaceId);
  if (foreignTx) {
    throw new Error(`WALLET_AI_OPERATIONS_WORKSPACE_MISMATCH: Transação ${foreignTx.id} pertence a outro workspace.`);
  }

  // Totalizadores em centavos por método
  const expectedSalesCents: Record<PaymentMethod, number> = {
    dinheiro: 0,
    debito: 0,
    credito: 0,
    pix: 0,
    voucher: 0,
    outros: 0,
  };

  const expectedWithdrawalsCents: Record<PaymentMethod, number> = {
    dinheiro: 0,
    debito: 0,
    credito: 0,
    pix: 0,
    voucher: 0,
    outros: 0,
  };

  for (const s of sales) {
    const method = normalizePaymentMethod(s.paymentMethod);
    expectedSalesCents[method] += toCents(s.amount);
  }

  for (const w of withdrawals) {
    const method = normalizePaymentMethod(w.paymentMethod);
    expectedWithdrawalsCents[method] += toCents(w.amount);
  }

  const differencesByMethod: Record<PaymentMethod, PaymentMethodDifference> = {} as any;

  let totalExpectedCents = 0;
  let totalReportedCentsFromMethods = 0;
  let hasAnyMethodDifference = false;

  for (const method of ALL_PAYMENT_METHODS) {
    // Para dinheiro, saídas/sangrias reduzem o saldo em caixa
    // Para cartões e digitais, vendas são o saldo esperado a creditar
    const expectedCents = expectedSalesCents[method] - expectedWithdrawalsCents[method];
    const reportedVal = reportedByMethod[method];
    const reportedCents = reportedVal != null ? toCents(reportedVal) : 0;

    totalExpectedCents += expectedCents;
    if (reportedVal != null) {
      totalReportedCentsFromMethods += reportedCents;
    }

    const diffCents = reportedCents - expectedCents;
    let methodStatus: "exato" | "sobra" | "furo" = "exato";
    if (diffCents > 0) methodStatus = "sobra";
    if (diffCents < 0) methodStatus = "furo";

    if (diffCents !== 0) {
      hasAnyMethodDifference = true;
    }

    differencesByMethod[method] = {
      expected: fromCents(expectedCents),
      reported: fromCents(reportedCents),
      difference: fromCents(diffCents),
      status: methodStatus,
    };
  }

  // Se o total informado foi fornecido explicitamente, usa-o; caso contrário, soma dos métodos
  const finalReportedCents = reportedTotal != null ? toCents(reportedTotal) : totalReportedCentsFromMethods;
  const totalDiffCents = finalReportedCents - totalExpectedCents;

  const hasReportedMethods = Object.keys(reportedByMethod).length > 0;

  let overallStatus: ClosingStatus = "exato";
  if (totalDiffCents < 0) {
    overallStatus = "furo";
  } else if (totalDiffCents > 0) {
    overallStatus = "sobra";
  } else if (hasReportedMethods && hasAnyMethodDifference) {
    overallStatus = "divergencia_meio_pagamento";
  }

  const expectedTotal = fromCents(totalExpectedCents);
  const reportedTotalVal = fromCents(finalReportedCents);
  const differenceVal = fromCents(totalDiffCents);

  // Gera resumo explicativo estruturado e auditável
  let summaryMessage = "";
  const shiftText = shift ? ` (Turno: ${shift})` : "";

  if (overallStatus === "exato") {
    summaryMessage = `Fechamento de caixa em ${date}${shiftText} EXATO! Total esperado e relatado conferem perfeitamente em R$ ${expectedTotal.toFixed(2)}.`;
  } else if (overallStatus === "furo") {
    summaryMessage = `Atenção: FURO de caixa detectado em ${date}${shiftText}! Faltam R$ ${Math.abs(differenceVal).toFixed(2)} (Esperado: R$ ${expectedTotal.toFixed(2)}, Informado: R$ ${reportedTotalVal.toFixed(2)}).`;
    warnings.push(`Furo total de caixa: R$ ${Math.abs(differenceVal).toFixed(2)}.`);
  } else if (overallStatus === "sobra") {
    summaryMessage = `Aviso: SOBRA de caixa detectada em ${date}${shiftText}! Há R$ ${differenceVal.toFixed(2)} a mais (Esperado: R$ ${expectedTotal.toFixed(2)}, Informado: R$ ${reportedTotalVal.toFixed(2)}).`;
    warnings.push(`Sobra total de caixa: R$ ${differenceVal.toFixed(2)}.`);
  } else {
    summaryMessage = `Aviso: Total consolidado fecha em R$ ${expectedTotal.toFixed(2)}, porém há divergência de saldo entre meios de pagamento (ex: sobra em um meio compensando furo em outro).`;
    warnings.push("Divergência de compensação cruzada entre meios de pagamento.");
  }

  return {
    workspaceId,
    date,
    shift,
    expectedTotal,
    reportedTotal: reportedTotalVal,
    difference: differenceVal,
    differencesByMethod,
    status: overallStatus,
    warnings,
    correlationId,
    summaryMessage,
  };
}
