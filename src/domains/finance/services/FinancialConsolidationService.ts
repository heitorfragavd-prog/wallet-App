import { formatarDataParaSaoPaulo, getHojeSaoPaulo } from "../utils/dateHelpers";

export interface DespesaInput {
  id: string;
  valor: number;
  data: string; // YYYY-MM-DD ou ISO
  descricao?: string | null;
  workspace_id?: string | null;
  categoria_id?: string | null;
  categorias?: { nome?: string; cor?: string; icone?: string } | null;
  metodo_pagamento?: string | null;
  conta_id?: string | null;
  conta_destino_id?: string | null;
  fatura_id?: string | null;
  natureza_operacao?: string | null;
  status?: string | null;
  pago?: boolean | null;
  observacoes?: string | null;
  deduplication_key?: string | null;
  divipay_external_id?: string | null;
}

export interface TransacaoInput {
  id: string;
  valor: number;
  data: string; // YYYY-MM-DD ou ISO
  descricao?: string | null;
  workspace_id?: string | null;
  tipo?: string | null; // 'despesa', 'receita', 'transferencia', 'estorno', 'reembolso'
  tipo_transacao?: string | null;
  natureza_operacao?: string | null;
  conta_id?: string | null;
  conta_destino_id?: string | null;
  cartao_id?: string | null;
  fatura_id?: string | null;
  categoria_id?: string | null;
  categorias?: { nome?: string; cor?: string; icone?: string } | null;
  metodo_pagamento?: string | null;
  observacoes?: string | null;
  deduplication_key?: string | null;
  divipay_external_id?: string | null;
  transacao_estornada_id?: string | null;
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
  // Métricas canônicas segregadas (Gate C)
  despesasReconhecidas: number;
  saidasEfetivamentePagas: number;
  pendenciasConciliacao: number;
  transferenciasInternasConfirmadas: number;
  estornosReembolsos: number;
  faturasCartao: number;
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
   * Consolida despesas operacionais da empresa eliminando duplicidades contábeis,
   * sem inferência indevida por texto e com separação rigorosa de Competência vs Caixa.
   */
  static consolidate(params: {
    workspaceId: string;
    despesas?: DespesaInput[];
    transacoes?: TransacaoInput[];
    divipayWithdraws?: DivipayWithdrawInput[];
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

    const normStartDate = startDate ? formatarDataParaSaoPaulo(startDate) : undefined;
    const normEndDate = endDate ? formatarDataParaSaoPaulo(endDate) : undefined;

    // Filtra previamente por workspace com tratamento de nulos
    const rawDespesas = (despesas || []).filter(
      (d) => !d.workspace_id || d.workspace_id === workspaceId
    );
    const rawTransacoes = (transacoes || []).filter(
      (t) => (!t.workspace_id || t.workspace_id === workspaceId) && (t.tipo === "despesa" || !t.tipo || t.tipo === "transferencia" || t.tipo === "estorno" || t.tipo === "reembolso")
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
    let duplicidadesConfirmadas = 0;
    let duplicidadesEvitadasValor = 0;
    let registrosPendentes = 0;
    let transferenciasInternasConfirmadas = 0;
    let faturasCartao = 0;
    let estornosReembolsos = 0;
    let pendenciasConciliacao = 0;

    // ─────────────────────────────────────────────────────────────────
    // FASE 1: Indexação de vínculos canônicos e chaves explícitas
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
    // FASE 2: Processamento de Transações Bancárias
    // ─────────────────────────────────────────────────────────────────
    const consumedTransacaoIds = new Set<string>();
    const linkedDespesaIds = new Set<string>();

    for (const tx of rawTransacoes) {
      const txId = tx.id;
      const txValor = Number(tx.valor || 0);
      const txData = formatarDataParaSaoPaulo(tx.data) || getHojeSaoPaulo();
      const desc = (tx.descricao || "").trim();
      const descLower = desc.toLowerCase();
      const catNome = tx.categorias?.nome || "";
      const catLower = catNome.toLowerCase();

      // 1. Classificação estrita de Transferência Interna (sem exclusão de pagamentos a fornecedores)
      // Requer: natureza explícita, tipo 'transferencia', contas origem/destino cadastradas,
      // ou categoria explícita de transferência entre contas próprias.
      const hasBothAccounts = Boolean(tx.conta_id && tx.conta_destino_id && tx.conta_id !== tx.conta_destino_id);
      const isExplicitInternalNature =
        tx.natureza_operacao === "transferencia_interna" ||
        tx.tipo === "transferencia" ||
        tx.tipo_transacao === "transferencia_interna";

      const isCategoryInternalTransfer =
        catLower === "transferência entre contas" ||
        catLower === "transferencia entre contas" ||
        catLower === "transferência interna" ||
        catLower === "transferencia interna";

      const isUnambiguousInternalDesc =
        descLower.startsWith("transferência entre contas próprias") ||
        descLower.startsWith("transf entre contas proprias") ||
        descLower.startsWith("transferência para aplicação") ||
        descLower.startsWith("transferência entre contas da empresa") ||
        descLower.startsWith("transferência →") ||
        descLower.startsWith("transferencia →") ||
        descLower.startsWith("transferência ←") ||
        descLower.startsWith("transferencia ←");

      const isInternalTransfer = hasBothAccounts || isExplicitInternalNature || isCategoryInternalTransfer || isUnambiguousInternalDesc;

      if (isInternalTransfer) {
        consumedTransacaoIds.add(txId);
        transferenciasInternasConfirmadas += txValor;
        if (ignoreInternalTransfers) {
          diferencasJustificadas.push({
            tipo: "transferencia_propria",
            origemId: txId,
            origemTabela: "transacoes",
            descricao: tx.descricao || "Transferência Interna",
            valor: txValor,
            detalhes:
              "Movimentação interna entre contas próprias (excluída do cômputo de despesa operacional).",
          });
          continue;
        }
      }

      // 2. Classificação canônica de Pagamento de Fatura de Cartão
      // Requer: categoria específica de Fatura de Cartão, fatura_id explícito,
      // ou descrição inequívoca de liquidação de fatura ("pagamento de fatura de cartão").
      // NÃO trata compras legítimas de fornecedores contendo a palavra "fatura" como pagamento de cartão!
      const isExplicitInvoiceCategory =
        catLower === "pagamento de fatura" ||
        catLower === "fatura de cartão" ||
        catLower === "fatura de cartao" ||
        catLower === "fatura cartão de crédito" ||
        catLower === "fatura cartao de credito";

      const isExplicitInvoiceId = Boolean(tx.fatura_id && tx.fatura_id.trim() !== "");

      const isUnambiguousInvoiceDesc =
        /pagamento\s+(da|de)\s+fatura\s+(do\s+)?cart[aã]o/i.test(descLower) ||
        /pgto\s+fatura\s+cart[aã]o/i.test(descLower) ||
        /fatura\s+cart[aã]o\s+de\s+cr[eé]dito/i.test(descLower);

      const isCardBillPayment = isExplicitInvoiceCategory || isExplicitInvoiceId || isUnambiguousInvoiceDesc;

      if (isCardBillPayment) {
        consumedTransacaoIds.add(txId);
        faturasCartao += txValor;
        if (ignoreCreditCardInvoicePayments) {
          diferencasJustificadas.push({
            tipo: "fatura_cartao",
            origemId: txId,
            origemTabela: "transacoes",
            descricao: tx.descricao || "Fatura de Cartão",
            valor: txValor,
            detalhes:
              "Pagamento consolidado de fatura de cartão (excluído para não duplicar compras individuais já reconhecidas).",
          });
          continue;
        }
      }

      // 3. Estorno ou Reembolso comprovado
      const isExplicitEstorno =
        tx.tipo === "estorno" ||
        tx.natureza_operacao === "estorno" ||
        Boolean(tx.transacao_estornada_id);

      const isExplicitReembolso =
        tx.tipo === "reembolso" ||
        tx.natureza_operacao === "reembolso";

      const isEstornoDesc = /^(estorno|revers[aã]o|chargeback)(\s|$)/i.test(descLower);
      const isReembolsoDesc = /^reembolso(\s|$)/i.test(descLower);

      const isEstorno = isExplicitEstorno || isEstornoDesc;
      const isReembolso = isExplicitReembolso || isReembolsoDesc;

      if (isEstorno || isReembolso) {
        consumedTransacaoIds.add(txId);
        estornosReembolsos += txValor;
        diferencasJustificadas.push({
          tipo: "estorno_reembolso",
          origemId: txId,
          origemTabela: "transacoes",
          descricao: tx.descricao || (isEstorno ? "Estorno" : "Reembolso"),
          valor: txValor,
          detalhes: isEstorno
            ? "Estorno de transação financeira comprovado."
            : "Reembolso financeiro comprovado.",
        });
        itensConsolidados.push({
          id: `tx-${txId}`,
          origem: "transacoes",
          origemId: txId,
          valor: -Math.abs(txValor),
          valorCaixa: -Math.abs(txValor),
          data: txData,
          dataCaixa: txData,
          descricao: tx.descricao || (isEstorno ? "Estorno de transação" : "Reembolso"),
          status: "pago",
          regimeReconhecido: "ambos",
          metodoPagamento: tx.metodo_pagamento,
          categoriaId: tx.categoria_id,
          categoriaNome: catNome,
          classificacaoContabil: isEstorno ? "estorno" : "reembolso",
          observacaoAuditoria: isEstorno ? "Estorno financeiro comprovado" : "Reembolso financeiro comprovado",
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
        consumedTransacaoIds.add(txId);
        linkedDespesaIds.add(matchedDespesa.id);
        lancamentosConciliados++;

        const despValor = Number(matchedDespesa.valor || 0);
        const despData = formatarDataParaSaoPaulo(matchedDespesa.data) || txData;

        duplicidadesConfirmadas++;
        duplicidadesEvitadasValor += txValor;

        diferencasJustificadas.push({
          tipo: "duplicidade_vinculada",
          origemId: txId,
          origemTabela: "transacoes",
          descricao: tx.descricao || matchedDespesa.descricao || "Despesa Conciliada",
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
          descricao: matchedDespesa.descricao || tx.descricao || "Despesa Conciliada",
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
        continue;
      }

      const despId = d.id;
      const despValor = Number(d.valor || 0);
      const despData = formatarDataParaSaoPaulo(d.data) || getHojeSaoPaulo();
      const descLower = (d.descricao || "").trim().toLowerCase();
      const catNome = d.categorias?.nome || "";
      const catLower = catNome.toLowerCase();
      const isPago = d.status === "pago" || d.pago === true;

      // Transferência interna em despesas
      const isInternalTransfer =
        d.natureza_operacao === "transferencia_interna" ||
        catLower.includes("transferência entre contas") ||
        catLower.includes("transferência interna") ||
        Boolean(d.conta_id && d.conta_destino_id && d.conta_id !== d.conta_destino_id) ||
        descLower.startsWith("transferência entre contas próprias") ||
        descLower.startsWith("transferência →") ||
        descLower.startsWith("transferencia →") ||
        descLower.startsWith("transferência ←") ||
        descLower.startsWith("transferencia ←");

      if (isInternalTransfer) {
        transferenciasInternasConfirmadas += despValor;
        if (ignoreInternalTransfers) {
          diferencasJustificadas.push({
            tipo: "transferencia_propria",
            origemId: despId,
            origemTabela: "despesas",
            descricao: d.descricao || "Transferência Interna",
            valor: despValor,
            detalhes:
              "Transferência interna registrada em despesas (excluída de despesa operacional).",
          });
          continue;
        }
      }

      // Compra no cartão
      const isCardPurchase = Boolean(d.fatura_id) || d.metodo_pagamento === "cartao_credito";

      // Verifica ambiguidade: transação de mesmo valor e data SEM vínculo comprovado
      const potentialMatch = rawTransacoes.find(
        (t) =>
          !consumedTransacaoIds.has(t.id) &&
          Number(t.valor || 0) === despValor &&
          formatarDataParaSaoPaulo(t.data) === despData
      );

      if (potentialMatch) {
        registrosPendentes++;
        pendenciasConciliacao += despValor;
        diferencasJustificadas.push({
          tipo: "conciliacao_pendente",
          origemId: despId,
          origemTabela: "despesas",
          descricao: d.descricao || "Despesa sem Vínculo Confirmado",
          valor: despValor,
          detalhes: `Valor (R$ ${despValor.toFixed(2)}) e data (${despData}) idênticos à transação transacoes/${potentialMatch.id}, mas sem identificador canônico de vínculo. Preservados ambos para conferência auditável.`,
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
        descricao: d.descricao || "Despesa",
        status: isPago ? "pago" : "pendente",
        regimeReconhecido: isPago ? "ambos" : "competencia",
        metodoPagamento: d.metodo_pagamento,
        categoriaId: d.categoria_id,
        categoriaNome: catNome,
        categoriaCor: d.categorias?.cor,
        classificacaoContabil: potentialMatch
          ? "conciliacao_pendente"
          : isCardPurchase
            ? "parcela_cartao"
            : isPago
              ? "despesa_competencia"
              : "obrigacao_cadastrada",
        chaveDeduplicacao: d.deduplication_key || undefined,
        observacaoAuditoria: potentialMatch
          ? "Conciliação pendente: mesmo valor/data sem identificador unívoco"
          : isPago
            ? "Despesa liquidada"
            : "Obrigação em aberto",
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // FASE 4: Transações Bancárias Autônomas (não consumidas)
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
        descricao: tx.descricao || "Transação Bancária",
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
    // FASE 5: Saques da Divipay
    // ─────────────────────────────────────────────────────────────────
    for (const w of rawDivipay) {
      const cleanId = String(w.id || "").trim().replace(/^divipay-/, "");
      if (!cleanId) continue;

      if (existingDivipayIds.has(cleanId)) {
        duplicidadesConfirmadas++;
        duplicidadesEvitadasValor += Number(w.amount || 0);
        diferencasJustificadas.push({
          tipo: "duplicidade_vinculada",
          origemId: cleanId,
          origemTabela: "divipay_withdraws",
          descricao: w.description || "Saque Divipay",
          valor: Number(w.amount || 0),
          detalhes: `Saque Divipay ${cleanId} já cadastrado e conciliado em transacoes/despesas. Duplicidade evitada.`,
        });
        continue;
      }

      existingDivipayIds.add(cleanId);
      const amount = Number(w.amount || 0);
      const dateStr = formatarDataParaSaoPaulo(w.createdAt) || getHojeSaoPaulo();
      const method = w.metodo_pagamento || w.paymentMethod || "outros";

      itensConsolidados.push({
        id: `divipay-${cleanId}`,
        origem: "divipay",
        origemId: cleanId,
        valor: amount,
        valorCaixa: amount,
        data: dateStr,
        dataCaixa: dateStr,
        descricao: w.description || `Saque Divipay (${cleanId})`,
        status: "pago",
        regimeReconhecido: "ambos",
        metodoPagamento: method,
        categoriaNome: "Divipay Repasses",
        classificacaoContabil: "pagamento_realizado",
        observacaoAuditoria: "Saque Divipay autônomo",
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // FASE 6: Filtragem por Período e Agregações Segregadas
    // ─────────────────────────────────────────────────────────────────
    const filteredItems = itensConsolidados.filter((item) => {
      if (normStartDate && item.data < normStartDate) return false;
      if (normEndDate && item.data > normEndDate) return false;
      return true;
    });

    let totalPorCompetencia = 0;
    let totalPorCaixa = 0;
    let despesasReconhecidas = 0;
    let saidasEfetivamentePagas = 0;

    for (const item of filteredItems) {
      // Competência: reconhece a obrigação pelo fato gerador
      totalPorCompetencia += Number(item.valor || 0);
      despesasReconhecidas += Number(item.valor || 0);

      // Caixa: reconhece saídas de caixa liquidadas
      if (item.status === "pago") {
        const valCaixa = Number(item.valorCaixa ?? item.valor ?? 0);
        totalPorCaixa += valCaixa;
        saidasEfetivamentePagas += valCaixa;
      }
    }

    filteredItems.sort((a, b) => {
      if (b.data !== a.data) return b.data.localeCompare(a.data);
      return Math.abs(b.valor) - Math.abs(a.valor);
    });

    return {
      workspaceId,
      periodoInicio: normStartDate || undefined,
      periodoFim: normEndDate || undefined,
      totalBrutoOrigem: Math.round(totalBrutoOrigem * 100) / 100,
      totalRegistrosOrigem,
      lancamentosConciliados,
      lancamentosUnicos: filteredItems.length,
      duplicidadesConfirmadas,
      duplicidadesEvitadasValor: Math.round(duplicidadesEvitadasValor * 100) / 100,
      registrosPendentes,
      totalPorCompetencia: Math.round(totalPorCompetencia * 100) / 100,
      totalPorCaixa: Math.round(totalPorCaixa * 100) / 100,
      despesasReconhecidas: Math.round(despesasReconhecidas * 100) / 100,
      saidasEfetivamentePagas: Math.round(saidasEfetivamentePagas * 100) / 100,
      pendenciasConciliacao: Math.round(pendenciasConciliacao * 100) / 100,
      transferenciasInternasConfirmadas: Math.round(transferenciasInternasConfirmadas * 100) / 100,
      estornosReembolsos: Math.round(estornosReembolsos * 100) / 100,
      faturasCartao: Math.round(faturasCartao * 100) / 100,
      dadosParciais,
      itensConsolidados: filteredItems,
      diferencasJustificadas,
    };
  }
}
