/**
 * FinancialConsolidationService.ts
 *
 * Serviço Canônico de Consolidação e Auditoria Financeira do Wallet App.
 *
 * Responsabilidades estritas:
 * 1. Unificar com precisão contábil despesas manuais ('despesas'), conciliação bancária ('transacoes' despesa)
 *    e saques de liquidação ('divipay').
 * 2. Impedir categoricamente contagem dupla:
 *    - Obrigação cadastrada vs. Liquidação bancária subsequente
 *    - Compras no cartão de crédito vs. Pagamento consolidado de fatura de cartão
 *    - Transferências entre contas próprias (não são despesas operacionais)
 *    - Saques Divipay já persistidos ou integrados
 * 3. Segregação rigorosa de regimes contábeis:
 *    - Regime de Competência: Data da ocorrência do fato gerador/obrigação
 *    - Regime de Caixa: Data da efetiva liquidação/saída financeira
 * 4. Preservação de dados e rastreabilidade:
 *    - Nunca deduzir duplicidade meramente por (valor, data, descrição)
 *    - Lançamentos semelhantes sem vínculo explícito são marcados como 'conciliacao_pendente'
 *    - Auditoria detalhada com justificativas de diferenças
 */

import { formatarDataParaSaoPaulo, getHojeSaoPaulo } from "../utils/dateHelpers";

export type AccountingRegime = "competencia" | "caixa";

export interface DespesaInput {
  id: string;
  valor: number;
  data: string;
  descricao: string;
  workspace_id?: string | null;
  user_id?: string | null;
  categoria_id?: string | null;
  status?: string | null;
  pago?: boolean | null;
  metodo_pagamento?: string | null;
  conta_id?: string | null;
  fatura_id?: string | null;
  recorrencia_id?: string | null;
  deduplication_key?: string | null;
  observacoes?: string | null;
  conciliado?: boolean | null;
  divipay_external_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  categorias?: { nome: string; cor: string; icone: string } | null;
  [key: string]: unknown;
}

export interface TransacaoInput {
  id: string;
  valor: number;
  data: string;
  descricao: string;
  tipo: string;
  workspace_id?: string | null;
  user_id?: string | null;
  categoria_id?: string | null;
  metodo_pagamento?: string | null;
  conta_id?: string | null;
  cartao_id?: string | null;
  fatura_id?: string | null;
  recorrencia_id?: string | null;
  deduplication_key?: string | null;
  observacoes?: string | null;
  conciliado?: boolean | null;
  divipay_external_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  categorias?: { nome: string; cor: string; icone: string } | null;
  [key: string]: unknown;
}

export interface DivipayWithdrawInput {
  id: string;
  amount: number;
  createdAt: string;
  description?: string | null;
  status?: string | null;
  paymentMethod?: string | null;
  metodo_pagamento?: string | null;
  type?: string | null;
  name?: string | null;
}

export type ClassificacaoContabil =
  | "obrigacao_cadastrada"
  | "despesa_competencia"
  | "pagamento_realizado"
  | "saida_caixa"
  | "parcela_cartao"
  | "transferencia_interna"
  | "estorno"
  | "reembolso"
  | "duplicidade_confirmada"
  | "conciliacao_pendente";

export interface ConsolidatedExpenseItem {
  id: string;
  origem: "despesas" | "transacoes" | "divipay";
  origemId: string;
  valor: number;
  valorCaixa?: number;
  data: string; // YYYY-MM-DD
  dataCaixa?: string; // YYYY-MM-DD
  descricao: string;
  status: "pago" | "pendente";
  regimeReconhecido: "competencia" | "caixa" | "ambos";
  metodoPagamento?: string | null;
  categoriaId?: string | null;
  categoriaNome?: string;
  categoriaCor?: string;
  classificacaoContabil: ClassificacaoContabil;
  vinculoId?: string | null;
  chaveDeduplicacao?: string | null;
  observacaoAuditoria?: string;
}

export interface JustificativaDiferenca {
  tipo:
    | "duplicidade_vinculada"
    | "fatura_cartao"
    | "transferencia_propria"
    | "estorno_reembolso"
    | "conciliacao_pendente";
  origemId: string;
  origemTabela: string;
  descricao: string;
  valor: number;
  detalhes: string;
}

export interface FinancialConsolidationReport {
  workspaceId: string;
  periodoInicio?: string;
  periodoFim?: string;
  totalBrutoOrigem: number;
  totalRegistrosOrigem: number;
  lancamentosConciliados: number;
  lancamentosUnicos: number;
  duplicidadesConfirmadas: number;
  duplicidadesEvitadasValor: number;
  registrosPendentes: number;
  totalPorCompetencia: number;
  totalPorCaixa: number;
  dadosParciais?: boolean;
  itensConsolidados: ConsolidatedExpenseItem[];
  diferencasJustificadas: JustificativaDiferenca[];
}

export interface ConsolidationOptions {
  startDate?: string | null;
  endDate?: string | null;
  ignoreInternalTransfers?: boolean;
  ignoreCreditCardInvoicePayments?: boolean;
  dadosParciais?: boolean;
}

export class FinancialConsolidationService {
  /**
   * Consolida despesas com tratamento absoluto anti-duplicidade e separação de regimes.
   */
  public static consolidate(params: {
    workspaceId: string;
    despesas?: DespesaInput[] | null;
    transacoes?: TransacaoInput[] | null;
    divipayWithdraws?: DivipayWithdrawInput[] | null;
    options?: ConsolidationOptions;
  }): FinancialConsolidationReport {
    const {
      workspaceId,
      despesas = [],
      transacoes = [],
      divipayWithdraws = [],
      options = {},
    } = params;

    const {
      startDate,
      endDate,
      ignoreInternalTransfers = true,
      ignoreCreditCardInvoicePayments = true,
      dadosParciais = false,
    } = options;

    const normStartDate = startDate ? formatarDataParaSaoPaulo(startDate) : null;
    const normEndDate = endDate ? formatarDataParaSaoPaulo(endDate) : null;

    const rawDespesas = (despesas || []).filter(
      (d) => !d.workspace_id || d.workspace_id === workspaceId
    );
    const rawTransacoes = (transacoes || []).filter(
      (t) =>
        t.tipo === "despesa" &&
        (!t.workspace_id || t.workspace_id === workspaceId)
    );
    const rawDivipay = divipayWithdraws || [];

    let totalBrutoOrigem = 0;
    let totalRegistrosOrigem = 0;

    rawDespesas.forEach((d) => {
      totalBrutoOrigem += Number(d.valor || 0);
      totalRegistrosOrigem++;
    });
    rawTransacoes.forEach((t) => {
      totalBrutoOrigem += Number(t.valor || 0);
      totalRegistrosOrigem++;
    });
    rawDivipay.forEach((w) => {
      totalBrutoOrigem += Number(w.amount || 0);
      totalRegistrosOrigem++;
    });

    const diferencasJustificadas: JustificativaDiferenca[] = [];
    const itensConsolidados: ConsolidatedExpenseItem[] = [];

    let lancamentosConciliados = 0;
    let lancamentosUnicos = 0;
    let duplicidadesConfirmadas = 0;
    let duplicidadesEvitadasValor = 0;
    let registrosPendentes = 0;

    // ─────────────────────────────────────────────────────────────────
    // FASE 1: Indexação de vínculos explícitos e identificadores canônicos
    // ─────────────────────────────────────────────────────────────────
    const existingDivipayIds = new Set<string>();
    const despesaByLinkKey = new Map<string, DespesaInput>();
    const despesasById = new Map<string, DespesaInput>();

    const registerDivipayId = (id?: string | null) => {
      if (!id) return;
      const clean = id.trim().replace(/^divipay-/, "");
      if (clean) existingDivipayIds.add(clean);
    };

    rawDespesas.forEach((d) => {
      if (d.id) despesasById.set(d.id, d);
      if (d.deduplication_key) despesaByLinkKey.set(d.deduplication_key.trim(), d);
      if (d.divipay_external_id) registerDivipayId(d.divipay_external_id);

      const obs = String(d.observacoes || "");
      if (obs.includes("divipay-saque:")) {
        const id = obs.split("divipay-saque:")[1]?.split(")")[0]?.trim();
        registerDivipayId(id);
      }
      if (obs.includes("Pago via Divipay") && obs.includes(" - ")) {
        const id = obs.split(" - ").pop()?.trim();
        registerDivipayId(id);
      }
      if (obs.includes("transacao_id:")) {
        const txId = obs.split("transacao_id:")[1]?.trim().split(/\s+/)[0];
        if (txId) despesaByLinkKey.set(`transacao:${txId}`, d);
      }
    });

    rawTransacoes.forEach((t) => {
      if (t.divipay_external_id) registerDivipayId(t.divipay_external_id);
      const obs = String(t.observacoes || "");
      if (obs.includes("divipay-saque:")) {
        const id = obs.split("divipay-saque:")[1]?.split(")")[0]?.trim();
        registerDivipayId(id);
      }
      if (obs.includes("Pago via Divipay") && obs.includes(" - ")) {
        const id = obs.split(" - ").pop()?.trim();
        registerDivipayId(id);
      }
    });

    // ─────────────────────────────────────────────────────────────────
    // FASE 2: Processamento de Transações (Detecção de Fatura, Transf, Links)
    // ─────────────────────────────────────────────────────────────────
    const consumedTransacaoIds = new Set<string>();
    const linkedDespesaIds = new Set<string>();

    for (const tx of rawTransacoes) {
      const txId = tx.id;
      const txValor = Number(tx.valor || 0);
      const txData = formatarDataParaSaoPaulo(tx.data) || getHojeSaoPaulo();
      const descLower = (tx.descricao || "").trim().toLowerCase();
      const metodo = (tx.metodo_pagamento || "").trim().toLowerCase();
      const catNome = tx.categorias?.nome || "";

      // 1. Transferência entre contas próprias
      const isInternalTransfer =
        metodo === "transferencia" ||
        descLower.startsWith("transferência →") ||
        descLower.startsWith("transferencia →") ||
        descLower.startsWith("transferência ←") ||
        descLower.startsWith("transferência entre contas") ||
        descLower.startsWith("transf entre contas") ||
        catNome.toLowerCase().includes("transferência entre contas");

      if (isInternalTransfer && ignoreInternalTransfers) {
        consumedTransacaoIds.add(txId);
        diferencasJustificadas.push({
          tipo: "transferencia_propria",
          origemId: txId,
          origemTabela: "transacoes",
          descricao: tx.descricao,
          valor: txValor,
          detalhes:
            "Movimentação interna entre contas próprias (excluída do cômputo de despesa operacional).",
        });
        continue;
      }

      // 2. Pagamento de Fatura de Cartão de Crédito
      const isCardBillPayment =
        descLower.includes("pagamento de fatura") ||
        descLower.includes("pagto fatura") ||
        descLower.includes("pagamento fatura") ||
        descLower.includes("fatura de cartao") ||
        descLower.includes("fatura do cartao") ||
        descLower.includes("fatura cartão") ||
        descLower.includes("fatura cartao") ||
        catNome.toLowerCase().includes("fatura cartão") ||
        catNome.toLowerCase().includes("pagamento de fatura");

      if (isCardBillPayment && ignoreCreditCardInvoicePayments) {
        consumedTransacaoIds.add(txId);
        diferencasJustificadas.push({
          tipo: "fatura_cartao",
          origemId: txId,
          origemTabela: "transacoes",
          descricao: tx.descricao,
          valor: txValor,
          detalhes:
            "Pagamento consolidado de fatura de cartão (excluído para não duplicar compras já reconhecidas).",
        });
        continue;
      }

      // 3. Estorno ou Reembolso em transação
      const isEstorno =
        descLower.includes("estorno") ||
        descLower.includes("reversão") ||
        descLower.includes("reversao") ||
        descLower.includes("chargeback");

      const isReembolso = descLower.includes("reembolso");

      if (isEstorno || isReembolso) {
        // Estorno / reembolso registrado como despesa negativa ou ajuste
        consumedTransacaoIds.add(txId);
        diferencasJustificadas.push({
          tipo: "estorno_reembolso",
          origemId: txId,
          origemTabela: "transacoes",
          descricao: tx.descricao,
          valor: txValor,
          detalhes: isEstorno
            ? "Estorno de transação financeira reconhecido."
            : "Reembolso financeiro registrado.",
        });
        itensConsolidados.push({
          id: `tx-${txId}`,
          origem: "transacoes",
          origemId: txId,
          valor: -Math.abs(txValor),
          valorCaixa: -Math.abs(txValor),
          data: txData,
          dataCaixa: txData,
          descricao: tx.descricao,
          status: "pago",
          regimeReconhecido: "ambos",
          metodoPagamento: tx.metodo_pagamento,
          categoriaId: tx.categoria_id,
          categoriaNome: catNome,
          classificacaoContabil: isEstorno ? "estorno" : "reembolso",
          observacaoAuditoria: isEstorno ? "Estorno de despesa" : "Reembolso de despesa",
        });
        continue;
      }

      // 4. Vínculo Explícito com lançamento em 'despesas'
      let matchedDespesa: DespesaInput | undefined;

      // Por deduplication_key
      if (tx.deduplication_key) {
        const cleanKey = tx.deduplication_key.trim();
        matchedDespesa =
          despesaByLinkKey.get(cleanKey) ||
          despesasById.get(cleanKey.replace(/^despesa:/, ""));
      }

      // Por observações da transação
      if (!matchedDespesa && tx.observacoes) {
        const obs = tx.observacoes;
        if (obs.includes("despesa_id:")) {
          const despId = obs.split("despesa_id:")[1]?.trim().split(/\s+/)[0];
          if (despId) matchedDespesa = despesasById.get(despId);
        } else if (obs.includes("despesa:")) {
          const despId = obs.split("despesa:")[1]?.trim().split(/\s+/)[0];
          if (despId) matchedDespesa = despesasById.get(despId);
        }
      }

      // Por chave reversa cadastrada na despesa
      if (!matchedDespesa) {
        matchedDespesa = despesaByLinkKey.get(`transacao:${txId}`);
      }

      if (matchedDespesa) {
        // Vínculo canônico comprovado!
        consumedTransacaoIds.add(txId);
        linkedDespesaIds.add(matchedDespesa.id);
        lancamentosConciliados++;

        const despValor = Number(matchedDespesa.valor || 0);
        const despData =
          formatarDataParaSaoPaulo(matchedDespesa.data) || txData;

        // Prevenção de duplicidade:
        // A despesa econômica é UMA SÓ.
        // Competência = valor da obrigação (despValor)
        // Caixa = valor efetivamente liquidado (txValor)
        duplicidadesConfirmadas++;
        duplicidadesEvitadasValor += txValor;

        diferencasJustificadas.push({
          tipo: "duplicidade_vinculada",
          origemId: txId,
          origemTabela: "transacoes",
          descricao: tx.descricao,
          valor: txValor,
          detalhes: `Liquidação bancária vinculada à obrigação despesas/${matchedDespesa.id}. Contabilizada uma única vez para evitar duplicidade.`,
        });

        itensConsolidados.push({
          id: `cons-${matchedDespesa.id}`,
          origem: "despesas",
          origemId: matchedDespesa.id,
          valor: despValor,
          valorCaixa: txValor,
          data: despData,
          dataCaixa: txData,
          descricao: matchedDespesa.descricao || tx.descricao,
          status: "pago",
          regimeReconhecido: "ambos",
          metodoPagamento: tx.metodo_pagamento || matchedDespesa.metodo_pagamento,
          categoriaId: matchedDespesa.categoria_id || tx.categoria_id,
          categoriaNome: matchedDespesa.categorias?.nome || catNome,
          categoriaCor: matchedDespesa.categorias?.cor,
          classificacaoContabil: "pagamento_realizado",
          vinculoId: txId,
          chaveDeduplicacao: tx.deduplication_key || `despesa:${matchedDespesa.id}`,
          observacaoAuditoria: "Despesa manual e liquidação bancária conciliadas",
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // FASE 3: Processamento dos Lançamentos de 'despesas'
    // ─────────────────────────────────────────────────────────────────
    for (const d of rawDespesas) {
      if (linkedDespesaIds.has(d.id)) {
        // Já consolidada no vínculo com a transação
        continue;
      }

      const despId = d.id;
      const despValor = Number(d.valor || 0);
      const despData = formatarDataParaSaoPaulo(d.data) || getHojeSaoPaulo();
      const descLower = (d.descricao || "").trim().toLowerCase();
      const metodo = (d.metodo_pagamento || "").trim().toLowerCase();
      const catNome = d.categorias?.nome || "";
      const isPago = d.status === "pago" || d.pago === true;

      // Transferência entre contas próprias em despesas
      const isInternalTransfer =
        metodo === "transferencia" ||
        descLower.startsWith("transferência →") ||
        descLower.startsWith("transferencia →") ||
        descLower.startsWith("transferência entre contas") ||
        catNome.toLowerCase().includes("transferência entre contas");

      if (isInternalTransfer && ignoreInternalTransfers) {
        diferencasJustificadas.push({
          tipo: "transferencia_propria",
          origemId: despId,
          origemTabela: "despesas",
          descricao: d.descricao,
          valor: despValor,
          detalhes:
            "Transferência interna registrada em despesas (excluída de despesa operacional).",
        });
        continue;
      }

      // Parcela de cartão ou compra no cartão
      const isCardPurchase =
        Boolean(d.fatura_id) || metodo === "cartao_credito";

      // Verifica se há alguma transação com mesmo valor e mesma data SEM vínculo explícito (ambiguidade)
      const potentialMatch = rawTransacoes.find(
        (t) =>
          !consumedTransacaoIds.has(t.id) &&
          Number(t.valor || 0) === despValor &&
          formatarDataParaSaoPaulo(t.data) === despData
      );

      if (potentialMatch) {
        // Ambiguidade identificada: não apaga nem deduplica cegamente!
        registrosPendentes++;
        diferencasJustificadas.push({
          tipo: "conciliacao_pendente",
          origemId: despId,
          origemTabela: "despesas",
          descricao: d.descricao,
          valor: despValor,
          detalhes: `Valor (R$ ${despValor.toFixed(2)}) e data (${despData}) idênticos à transação transacoes/${potentialMatch.id}, mas sem identificador canônico de vínculo. Preservados ambos para revisão.`,
        });
      }

      itensConsolidados.push({
        id: `desp-${despId}`,
        origem: "despesas",
        origemId: despId,
        valor: despValor,
        valorCaixa: isPago ? despValor : 0,
        data: despData,
        dataCaixa: isPago ? despData : undefined,
        descricao: d.descricao,
        status: isPago ? "pago" : "pendente",
        regimeReconhecido: isPago ? "ambos" : "competencia",
        metodoPagamento: d.metodo_pagamento,
        categoriaId: d.categoria_id,
        categoriaNome: catNome,
        categoriaCor: d.categorias?.cor,
        classificacaoContabil: isCardPurchase
          ? "parcela_cartao"
          : isPago
            ? "despesa_competencia"
            : "obrigacao_cadastrada",
        chaveDeduplicacao: d.deduplication_key || undefined,
        observacaoAuditoria: potentialMatch
          ? "Conciliação pendente com transação de mesmo valor/data"
          : isPago
            ? "Despesa liquidada"
            : "Obrigação em aberto",
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // FASE 4: Transações Restantes não vinculadas
    // ─────────────────────────────────────────────────────────────────
    for (const tx of rawTransacoes) {
      if (consumedTransacaoIds.has(tx.id)) continue;

      const txId = tx.id;
      const txValor = Number(tx.valor || 0);
      const txData = formatarDataParaSaoPaulo(tx.data) || getHojeSaoPaulo();
      const catNome = tx.categorias?.nome || "";
      const isCardPurchase = Boolean(tx.cartao_id) || tx.metodo_pagamento === "cartao_credito";

      itensConsolidados.push({
        id: `tx-${txId}`,
        origem: "transacoes",
        origemId: txId,
        valor: txValor,
        valorCaixa: txValor,
        data: txData,
        dataCaixa: txData,
        descricao: tx.descricao,
        status: "pago",
        regimeReconhecido: "ambos",
        metodoPagamento: tx.metodo_pagamento,
        categoriaId: tx.categoria_id,
        categoriaNome: catNome,
        classificacaoContabil: isCardPurchase ? "parcela_cartao" : "saida_caixa",
        chaveDeduplicacao: tx.deduplication_key || undefined,
        observacaoAuditoria: "Transação bancária autônoma",
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // FASE 5: Saques da Divipay (se fornecidos como lista pura)
    // ─────────────────────────────────────────────────────────────────
    const DIVIPAY_SETTLED_STATUSES = [
      "FINISHED", "COMPLETED", "SETTLED", "PAID", "PAGO", "CONFIRMED",
    ];
    const DIVIPAY_NON_SETTLED_STATUSES = [
      "PENDING", "PROCESSING", "FAILED", "ERROR", "REJECTED",
      "CANCELED", "CANCELLED", "EXPIRED", "REFUNDED", "CHARGEBACK",
    ];

    for (const w of rawDivipay) {
      const cleanId = String(w.id || "").trim().replace(/^divipay-/, "");
      const amount = Number(w.amount || 0);
      const status = String(w.status || "").trim().toUpperCase();

      if (!status || !DIVIPAY_SETTLED_STATUSES.includes(status)) continue;
      if (DIVIPAY_NON_SETTLED_STATUSES.some((s) => status.includes(s))) continue;

      if (existingDivipayIds.has(cleanId)) {
        // Já existe em despesas ou transações
        duplicidadesConfirmadas++;
        duplicidadesEvitadasValor += amount;
        diferencasJustificadas.push({
          tipo: "duplicidade_vinculada",
          origemId: w.id,
          origemTabela: "divipay",
          descricao: w.description || "Saque Divipay",
          valor: amount,
          detalhes: `Saque Divipay ${cleanId} já presente na base persistida. Duplicação evitada.`,
        });
        continue;
      }

      const wDate = formatarDataParaSaoPaulo(w.createdAt) || getHojeSaoPaulo();
      itensConsolidados.push({
        id: `divipay-${cleanId}`,
        origem: "divipay",
        origemId: cleanId,
        valor: amount,
        valorCaixa: amount,
        data: wDate,
        dataCaixa: wDate,
        descricao: w.description || "Saque Divipay",
        status: "pago",
        regimeReconhecido: "ambos",
        metodoPagamento: w.paymentMethod || w.metodo_pagamento || "pix",
        categoriaNome: "Transferências e Saques Divipay",
        classificacaoContabil: "saida_caixa",
        observacaoAuditoria: "Saque Divipay liquidado direto da API",
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // FASE 6: Filtragem por Período e Agregação Final
    // ─────────────────────────────────────────────────────────────────
    const filteredItems = itensConsolidados.filter((item) => {
      if (normStartDate && item.data < normStartDate) return false;
      if (normEndDate && item.data > normEndDate) return false;
      return true;
    });

    let totalPorCompetencia = 0;
    let totalPorCaixa = 0;

    for (const item of filteredItems) {
      // Competência: reconhece a obrigação pelo fato gerador
      totalPorCompetencia += Number(item.valor || 0);

      // Caixa: reconhece saídas de caixa liquidadas
      if (item.status === "pago") {
        totalPorCaixa += Number(item.valorCaixa ?? item.valor ?? 0);
      }
    }

    // Ordenar itens decrescente por data
    filteredItems.sort((a, b) => {
      if (b.data !== a.data) return b.data.localeCompare(a.data);
      return Math.abs(b.valor) - Math.abs(a.valor);
    });

    lancamentosUnicos = filteredItems.length;

    return {
      workspaceId,
      periodoInicio: normStartDate || undefined,
      periodoFim: normEndDate || undefined,
      totalBrutoOrigem: Math.round(totalBrutoOrigem * 100) / 100,
      totalRegistrosOrigem,
      lancamentosConciliados,
      lancamentosUnicos,
      duplicidadesConfirmadas,
      duplicidadesEvitadasValor: Math.round(duplicidadesEvitadasValor * 100) / 100,
      registrosPendentes,
      totalPorCompetencia: Math.round(totalPorCompetencia * 100) / 100,
      totalPorCaixa: Math.round(totalPorCaixa * 100) / 100,
      dadosParciais,
      itensConsolidados: filteredItems,
      diferencasJustificadas,
    };
  }
}
