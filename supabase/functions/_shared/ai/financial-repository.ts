import type { AiExecutionContext } from "./auth.ts";
import type {
  CanonicalBalance,
  CanonicalFinancialRecord,
  FinancialRecordKind,
  FinancialSourceType,
  FiscalNoteRecord,
  SefazDocumentRecord,
  DocumentSessionRecord,
  SalesPdvDetailRecord,
  SalesPdvItemRecord,
  InventoryItemRecord,
  RecipeCardRecord,
  SupplierRecord,
  EmployeeRecord,
  EmployeeScheduleRecord,
  EmployeePaymentRecord,
  GrowthOpportunityRecord,
  CommercialExperimentRecord,
  CashClosingRecord,
  OperationalReminderRecord,
} from "./financial-types.ts";
import type { CanonicalDebt, DatePeriod, FinancialQueryRepository } from "./query-tools.ts";

export interface FinancialDataQuery {
  table:
    | "receitas"
    | "despesas"
    | "transacoes"
    | "contas_usuario"
    | "dividas"
    | "notas_fiscais_compra"
    | "sefaz_documentos_recebidos"
    | "documento_sessoes"
    | "produtos_eyemobile"
    | "v_produtos_custo"
    | "fornecedores"
    | "colaboradores"
    | "colaborador_escalas"
    | "colaborador_pagamentos"
    | "colaborador_acertos"
    | "wallet_growth_opportunities"
    | "wallet_commercial_experiments"
    | "fechamentos_caixa"
    | "lembretes"
    | "compromissos";
  columns: string;
  equals: { workspace_id?: string; user_id?: string; [key: string]: unknown };
  dateRange?: {
    column: "data" | "data_vencimento" | "data_emissao" | "created_at";
    start: string;
    end: string;
  };
  /** Optional LIKE filter: { column, pattern }. Applied with SQL LIKE operator. */
  like?: { column: string; pattern: string };
}

export type FinancialDataRow = Record<string, unknown>;
export type FinancialDataExecutor = (query: FinancialDataQuery) => Promise<FinancialDataRow[]>;

function assertScope(row: FinancialDataRow, context: AiExecutionContext): void {
  if (row.workspace_id !== context.workspaceId) {
    throw new Error("repository_scope_mismatch");
  }
}

function amount(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("invalid_financial_amount");
  return parsed;
}

function normalizeRecords(
  rows: FinancialDataRow[],
  context: AiExecutionContext,
  sourceType: FinancialSourceType,
  defaultKind: FinancialRecordKind,
): CanonicalFinancialRecord[] {
  return rows.map((row) => {
    assertScope(row, context);
    const sourceId = String(row.id);
    const kind = sourceType === "transacao"
      ? row.tipo === "transferencia"
        ? "transfer"
        : row.tipo === "despesa"
          ? "expense"
          : "income"
      : defaultKind;
    const desc = String(row.descricao ?? "Sem descrição");
    const matchEyemobile = desc.match(/Venda Eyemobile\s*#(\d+)/i);
    const dedup = typeof row.deduplication_key === "string" && row.deduplication_key
      ? row.deduplication_key
      : matchEyemobile
        ? `eyemobile:sale:${matchEyemobile[1]}`
        : `${sourceType}:${sourceId}`;

    return {
      id: sourceId,
      sourceType,
      sourceId,
      workspaceId: context.workspaceId,
      userId: String(row.user_id || context.userId),
      kind,
      amount: amount(row.valor),
      occurredOn: String(row.data),
      deduplicationKey: dedup,
      description: desc,
      status: typeof row.status_transacao === "string"
        ? String(row.status_transacao)
        : typeof row.status === "string"
          ? String(row.status)
          : undefined,
    };
  });
}

function deduplicateCanonicalRecords(records: CanonicalFinancialRecord[]): CanonicalFinancialRecord[] {
  const seen = new Set<string>();
  const out: CanonicalFinancialRecord[] = [];
  for (const r of records) {
    if (r.deduplicationKey) {
      if (seen.has(r.deduplicationKey)) continue;
      seen.add(r.deduplicationKey);
    }
    out.push(r);
  }
  return out;
}

function scopedQuery(
  table: FinancialDataQuery["table"],
  columns: string,
  context: AiExecutionContext,
  period?: DatePeriod,
  dateColumn: "data" | "data_vencimento" = "data",
): FinancialDataQuery {
  return {
    table,
    columns,
    equals: { user_id: context.userId, workspace_id: context.workspaceId },
    dateRange: period ? { column: dateColumn, ...period } : undefined,
  };
}

export function createFinancialRepository(execute: FinancialDataExecutor): FinancialQueryRepository {
  return {
    async listRevenues(context, period) {
      const [recRows, txRows] = await Promise.all([
        execute(scopedQuery(
          "receitas",
          "id,user_id,workspace_id,descricao,valor,data",
          context,
          period,
        )),
        execute({
          ...scopedQuery(
            "transacoes",
            "id,user_id,workspace_id,descricao,valor,data,tipo",
            context,
            period,
          ),
          equals: { user_id: context.userId, workspace_id: context.workspaceId, tipo: "receita" },
        }),
      ]);
      const recs = normalizeRecords(recRows, context, "receita", "income");
      const txs = normalizeRecords(txRows, context, "transacao", "income");
      return deduplicateCanonicalRecords([...recs, ...txs]);
    },
    async listExpenses(context, period) {
      const [despRows, txRows] = await Promise.all([
        execute(scopedQuery(
          "despesas",
          "id,user_id,workspace_id,descricao,valor,data",
          context,
          period,
        )),
        execute({
          ...scopedQuery(
            "transacoes",
            "id,user_id,workspace_id,descricao,valor,data,tipo",
            context,
            period,
          ),
          equals: { user_id: context.userId, workspace_id: context.workspaceId, tipo: "despesa" },
        }),
      ]);
      const desps = normalizeRecords(despRows, context, "despesa", "expense");
      const txs = normalizeRecords(txRows, context, "transacao", "expense");
      return deduplicateCanonicalRecords([...desps, ...txs]);
    },
    async listTransactions(context, period) {
      const rows = await execute(scopedQuery(
        "transacoes",
        "id,user_id,workspace_id,descricao,valor,data,tipo",
        context,
        period,
      ));
      return deduplicateCanonicalRecords(normalizeRecords(rows, context, "transacao", "income"));
    },
    async listBalances(context) {
      const rows = await execute(scopedQuery(
        "contas_usuario",
        "id,user_id,workspace_id,nome,tipo,saldo_atual",
        context,
      ));
      return rows.map((row): CanonicalBalance => {
        assertScope(row, context);
        return {
          accountId: String(row.id),
          name: String(row.nome),
          amount: amount(row.saldo_atual ?? (row as Record<string, unknown>).saldo),
          type: String(row.tipo),
        };
      });
    },
    async listDebts(context, period) {
      const rows = await execute(scopedQuery(
        "dividas",
        "id,user_id,workspace_id,descricao,valor_total,valor_pago,data_vencimento,status",
        context,
        period,
        "data_vencimento",
      ));
      return rows.map((row): CanonicalDebt => {
        assertScope(row, context);
        return {
          id: String(row.id),
          description: String(row.descricao),
          originalAmount: amount(row.valor_total),
          paidAmount: amount(row.valor_pago),
          dueOn: typeof row.data_vencimento === "string" ? row.data_vencimento : null,
          status: String(row.status),
        };
      });
    },
    async listSalesPDV(context, period) {
      // Fonte canônica de vendas brutas do PDV Eyemobile no banco.
      // Consulta todas as vendas da loja no workspace_id (inclui sincronizações por usuário integrador).
      const rows = await execute({
        table: "transacoes",
        columns: "id,user_id,workspace_id,descricao,valor,data,tipo,status_transacao",
        equals: { workspace_id: context.workspaceId, tipo: "receita" },
        dateRange: period ? { column: "data", ...period } : undefined,
        like: { column: "descricao", pattern: "Venda Eyemobile %" },
      });
      return deduplicateCanonicalRecords(normalizeRecords(rows, context, "transacao", "income"));
    },
    async listFiscalNotes(context, period) {
      const rows = await execute({
        table: "notas_fiscais_compra",
        columns: "id,user_id,workspace_id,numero_nf,serie_nf,fornecedor,cnpj_fornecedor,data_emissao,data_entrada,valor_total,valor_icms,valor_produtos,chave_acesso,status,origem,created_at",
        equals: { workspace_id: context.workspaceId },
        dateRange: period ? { column: "data_emissao", ...period } : undefined,
      });
      return rows.map((row): FiscalNoteRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          numeroNf: row.numero_nf ? String(row.numero_nf) : null,
          serieNf: row.serie_nf ? String(row.serie_nf) : null,
          fornecedor: row.fornecedor ? String(row.fornecedor) : null,
          cnpjFornecedor: row.cnpj_fornecedor ? String(row.cnpj_fornecedor) : null,
          dataEmissao: row.data_emissao ? String(row.data_emissao) : null,
          dataEntrada: row.data_entrada ? String(row.data_entrada) : null,
          valorTotal: amount(row.valor_total),
          valorIcms: amount(row.valor_icms),
          valorProdutos: amount(row.valor_produtos),
          chaveAcesso: row.chave_acesso ? String(row.chave_acesso) : null,
          status: String(row.status ?? "pendente"),
          origem: row.origem ? String(row.origem) : null,
          createdAt: String(row.created_at ?? ""),
        };
      });
    },
    async listSefazDocuments(context, period) {
      const rows = await execute({
        table: "sefaz_documentos_recebidos",
        columns: "id,user_id,workspace_id,chave_acesso,tipo_documento,emitente_nome,emitente_cnpj,data_emissao,valor_total,status_processamento,created_at",
        equals: { workspace_id: context.workspaceId },
        dateRange: period ? { column: "data_emissao", ...period } : undefined,
      });
      return rows.map((row): SefazDocumentRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          chaveAcesso: row.chave_acesso ? String(row.chave_acesso) : null,
          tipoDocumento: row.tipo_documento ? String(row.tipo_documento) : null,
          emitenteNome: row.emitente_nome ? String(row.emitente_nome) : null,
          emitenteCnpj: row.emitente_cnpj ? String(row.emitente_cnpj) : null,
          dataEmissao: row.data_emissao ? String(row.data_emissao) : null,
          valorTotal: amount(row.valor_total),
          statusProcessamento: String(row.status_processamento ?? "pendente"),
          createdAt: String(row.created_at ?? ""),
        };
      });
    },
    async listDocumentSessions(context, period) {
      const rows = await execute({
        table: "documento_sessoes",
        columns: "id,user_id,workspace_id,documento_tipo,chave_acesso,numero_nf,fornecedor,status,created_at",
        equals: { workspace_id: context.workspaceId },
        dateRange: period ? { column: "created_at", ...period } : undefined,
      });
      return rows.map((row): DocumentSessionRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          documentoTipo: row.documento_tipo ? String(row.documento_tipo) : null,
          chaveAcesso: row.chave_acesso ? String(row.chave_acesso) : null,
          numeroNf: row.numero_nf ? String(row.numero_nf) : null,
          fornecedor: row.fornecedor ? String(row.fornecedor) : null,
          status: String(row.status ?? "iniciada"),
          createdAt: String(row.created_at ?? ""),
        };
      });
    },
    async listSalesPdvDetails(context, period) {
      const rows = await execute({
        table: "transacoes",
        columns: "id,user_id,workspace_id,descricao,valor,data,metodo_pagamento,itens,created_at,status_transacao",
        equals: { workspace_id: context.workspaceId, tipo: "receita" },
        dateRange: period ? { column: "data", ...period } : undefined,
        like: { column: "descricao", pattern: "Venda Eyemobile %" },
      });
      return rows.map((row): SalesPdvDetailRecord => {
        assertScope(row, context);
        let itemsList: SalesPdvItemRecord[] = [];
        if (Array.isArray(row.itens)) {
          itemsList = (row.itens as any[]).map((it) => ({
            id: it.id || "",
            productName: String(it.product_name || it.name || "Item sem nome"),
            quantity: Number(it.quantity || it.quantidade || 1),
            price: Number(it.price || it.preco || 0),
            total: Number(it.total || Number(it.quantity || 1) * Number(it.price || 0)),
            productId: it.product_id,
            time: it.time,
          }));
        }
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          description: String(row.descricao ?? ""),
          amount: amount(row.valor),
          date: String(row.data),
          paymentMethod: row.metodo_pagamento ? String(row.metodo_pagamento) : null,
          items: itemsList,
          createdAt: String(row.created_at ?? ""),
          status: row.status_transacao ? String(row.status_transacao) : undefined,
        };
      });
    },
    async listInventoryItems(context, params) {
      const rows = await execute({
        table: "produtos_eyemobile",
        columns: "id,user_id,workspace_id,codigo,descricao,categoria,preco_venda,custo_atual,estoque_atual,estoque_minimo,estoque_ideal,unidade_medida,multiplo_compra,fornecedor_padrao,margem_real_percentual,ativo",
        equals: {
          workspace_id: context.workspaceId,
          ...(params?.categoria ? { categoria: params.categoria } : {}),
        },
      });
      return rows.map((row): InventoryItemRecord => {
        assertScope(row, context);
        const estoqueInformado = row.estoque_atual !== null && row.estoque_atual !== undefined;
        const custoInformado = row.custo_atual !== null && row.custo_atual !== undefined;
        const estoqueMinimoInformado = row.estoque_minimo !== null && row.estoque_minimo !== undefined;
        const estoqueIdealInformado = row.estoque_ideal !== null && row.estoque_ideal !== undefined;
        const fornecedor = typeof row.fornecedor_padrao === "string" && row.fornecedor_padrao.trim().length > 0
          ? row.fornecedor_padrao.trim()
          : null;

        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          codigo: row.codigo ? String(row.codigo) : null,
          descricao: String(row.descricao ?? "Produto sem descrição"),
          categoria: row.categoria ? String(row.categoria) : null,
          precoVenda: amount(row.preco_venda),
          custoAtual: amount(row.custo_atual),
          estoqueAtual: amount(row.estoque_atual),
          estoqueMinimo: amount(row.estoque_minimo),
          estoqueIdeal: amount(row.estoque_ideal),
          unidadeMedida: String(row.unidade_medida ?? "UN"),
          multiploCompra: amount(row.multiplo_compra) || 1,
          fornecedorPadrao: fornecedor,
          margemRealPercentual: amount(row.margem_real_percentual),
          ativo: row.ativo !== false,
          estoqueInformado,
          custoInformado,
          estoqueMinimoInformado,
          estoqueIdealInformado,
        };
      });
    },
    async listRecipeCards(context) {
      const rows = await execute({
        table: "v_produtos_custo",
        columns: "id,user_id,workspace_id,nome,preco_venda,custo_total,margem_percentual,status_margem,status_ficha,qtd_insumos,qtd_insumos_sem_custo,ativo",
        equals: { workspace_id: context.workspaceId },
      });
      return rows.map((row): RecipeCardRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          nome: String(row.nome ?? ""),
          precoVenda: amount(row.preco_venda),
          custoTotal: amount(row.custo_total),
          margemPercentual: row.margem_percentual !== null && row.margem_percentual !== undefined ? amount(row.margem_percentual) : null,
          statusMargem: String(row.status_margem ?? "perigoso"),
          statusFicha: String(row.status_ficha ?? "sem_ficha"),
          qtdInsumos: Number(row.qtd_insumos ?? 0),
          qtdInsumosSemCusto: Number(row.qtd_insumos_sem_custo ?? 0),
          ativo: row.ativo !== false,
        };
      });
    },
    async listSuppliers(context) {
      const rows = await execute({
        table: "fornecedores",
        columns: "id,user_id,workspace_id,nome,cnpj,telefone,email,contato_nome,prazo_pagamento_dias",
        equals: { workspace_id: context.workspaceId },
      });
      return rows.map((row): SupplierRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          nome: String(row.nome ?? ""),
          cnpj: row.cnpj ? String(row.cnpj) : null,
          telefone: row.telefone ? String(row.telefone) : null,
          email: row.email ? String(row.email) : null,
          contatoNome: row.contato_nome ? String(row.contato_nome) : null,
          prazoPagamentoDias: Number(row.prazo_pagamento_dias ?? 30),
        };
      });
    },
    async listEmployees(context) {
      const rows = await execute({
        table: "colaboradores",
        columns: "id,workspace_id,nome,cargo,tipo,status,salario_bruto,vale_transporte,vale_refeicao,dia_pagamento,valor_diaria,data_admissao",
        equals: { workspace_id: context.workspaceId },
      });
      return rows.map((row): EmployeeRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          nome: String(row.nome ?? ""),
          cargo: row.cargo ? String(row.cargo) : null,
          tipo: row.tipo ? String(row.tipo) : null,
          status: String(row.status ?? "ativo"),
          salarioBruto: amount(row.salario_bruto),
          valeTransporte: amount(row.vale_transporte),
          valeRefeicao: amount(row.vale_refeicao),
          diaPagamento: row.dia_pagamento !== null && row.dia_pagamento !== undefined ? Number(row.dia_pagamento) : null,
          valorDiaria: amount(row.valor_diaria),
          dataAdmissao: row.data_admissao ? String(row.data_admissao) : null,
        };
      });
    },
    async listEmployeeSchedules(context, period) {
      const rows = await execute({
        table: "colaborador_escalas",
        columns: "id,workspace_id,colaborador_id,data,turno,valor_diaria,valor_total,status,observacao",
        equals: { workspace_id: context.workspaceId },
        dateRange: period ? { column: "data" as any, ...period } : undefined,
      });
      return rows.map((row): EmployeeScheduleRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          colaboradorId: String(row.colaborador_id),
          data: String(row.data),
          turno: row.turno ? String(row.turno) : null,
          valorDiaria: amount(row.valor_diaria),
          valorTotal: amount(row.valor_total),
          status: String(row.status ?? "agendado"),
          observacao: row.observacao ? String(row.observacao) : null,
        };
      });
    },
    async listEmployeePayments(context, period) {
      const rows = await execute({
        table: "colaborador_pagamentos",
        columns:
          "id,workspace_id,acerto_id,valor,status,origem,paid_at,created_at,idempotency_key,divipay_external_id,comprovante_url",
        equals: { workspace_id: context.workspaceId },
        dateRange: period ? { column: "created_at" as any, ...period } : undefined,
      });

      const hasAcertos = rows.some((r) => Boolean(r.acerto_id));
      const acertoMap = new Map<
        string,
        { colaboradorId: string | null; periodoInicio: string | null; periodoFim: string | null }
      >();

      if (hasAcertos) {
        try {
          const acertoRows = await execute({
            table: "colaborador_acertos",
            columns: "id,workspace_id,colaborador_id,periodo_inicio,periodo_fim",
            equals: { workspace_id: context.workspaceId },
          });
          acertoRows.forEach((ar) => {
            assertScope(ar, context);
            acertoMap.set(String(ar.id), {
              colaboradorId: ar.colaborador_id ? String(ar.colaborador_id) : null,
              periodoInicio: ar.periodo_inicio ? String(ar.periodo_inicio) : null,
              periodoFim: ar.periodo_fim ? String(ar.periodo_fim) : null,
            });
          });
        } catch {
          // Ambiente/mock sem colaborador_acertos mantém mapa vazio sem quebrar consulta de pagamentos
        }
      }

      return rows.map((row): EmployeePaymentRecord => {
        assertScope(row, context);
        const acertoId = row.acerto_id ? String(row.acerto_id) : null;
        const acertoInfo = acertoId ? acertoMap.get(acertoId) : undefined;
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          acertoId,
          colaboradorId: acertoInfo?.colaboradorId ?? (row.colaborador_id ? String(row.colaborador_id) : null),
          competenciaInicio: acertoInfo?.periodoInicio ?? null,
          competenciaFim: acertoInfo?.periodoFim ?? null,
          idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
          divipayExternalId: row.divipay_external_id ? String(row.divipay_external_id) : null,
          comprovanteUrl: row.comprovante_url ? String(row.comprovante_url) : null,
          valor: amount(row.valor),
          status: String(row.status ?? "pendente"),
          origem: row.origem ? String(row.origem) : null,
          paidAt: row.paid_at ? String(row.paid_at) : null,
          createdAt: String(row.created_at ?? ""),
        };
      });
    },
    async listGrowthOpportunities(context) {
      const rows = await execute({
        table: "wallet_growth_opportunities",
        columns:
          "id,workspace_id,department,title,problem_description,hypothesis,recommended_action,estimated_financial_impact,confidence_score,status,evidence_data,limitations_notes,created_at",
        equals: { workspace_id: context.workspaceId },
      });
      return rows.map((row): GrowthOpportunityRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          department: String(row.department ?? "mercado"),
          title: String(row.title ?? ""),
          problemDescription: row.problem_description ? String(row.problem_description) : null,
          hypothesis: row.hypothesis ? String(row.hypothesis) : null,
          recommendedAction: row.recommended_action ? String(row.recommended_action) : null,
          estimatedFinancialImpact:
            row.estimated_financial_impact !== null && row.estimated_financial_impact !== undefined
              ? amount(row.estimated_financial_impact)
              : null,
          confidenceScore:
            row.confidence_score !== null && row.confidence_score !== undefined ? Number(row.confidence_score) : null,
          status: String(row.status ?? "identificada"),
          evidenceData:
            row.evidence_data && typeof row.evidence_data === "object"
              ? (row.evidence_data as Record<string, unknown>)
              : null,
          limitationsNotes: row.limitations_notes ? String(row.limitations_notes) : null,
          createdAt: String(row.created_at ?? ""),
        };
      });
    },
    async listCommercialExperiments(context) {
      const rows = await execute({
        table: "wallet_commercial_experiments",
        columns:
          "id,workspace_id,opportunity_id,name,hypothesis,department,target_kpi,baseline_value,current_value,target_value,start_date,end_date,responsible_person,measured_financial_impact,decision,decision_rationale,status,created_at",
        equals: { workspace_id: context.workspaceId },
      });
      return rows.map((row): CommercialExperimentRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
          name: String(row.name ?? ""),
          hypothesis: String(row.hypothesis ?? ""),
          department: String(row.department ?? "comercial"),
          targetKpi: String(row.target_kpi ?? ""),
          baselineValue: row.baseline_value !== null && row.baseline_value !== undefined ? amount(row.baseline_value) : null,
          currentValue: row.current_value !== null && row.current_value !== undefined ? amount(row.current_value) : null,
          targetValue: row.target_value !== null && row.target_value !== undefined ? amount(row.target_value) : null,
          startDate: row.start_date ? String(row.start_date) : null,
          endDate: row.end_date ? String(row.end_date) : null,
          responsiblePerson: row.responsible_person ? String(row.responsible_person) : null,
          measuredFinancialImpact:
            row.measured_financial_impact !== null && row.measured_financial_impact !== undefined
              ? amount(row.measured_financial_impact)
              : null,
          decision: row.decision ? String(row.decision) : null,
          decisionRationale: row.decision_rationale ? String(row.decision_rationale) : null,
          status: String(row.status ?? "proposto"),
          createdAt: String(row.created_at ?? ""),
        };
      });
    },
    async listCashClosings(context, period) {
      const normalizeMethodMap = (raw: unknown): Record<string, number> => {
        if (!raw || typeof raw !== "object") return {};
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          const num = Number(v ?? 0);
          if (Number.isFinite(num)) out[k] = num;
        }
        return out;
      };
      const normalizeClosingDate = (raw: string, fallbackIso: string): string => {
        const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (br) return `${br[3]}-${br[2]}-${br[1]}`;
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        return fallbackIso.slice(0, 10);
      };

      const rows = await execute({
        table: "fechamentos_caixa",
        columns:
          "id,workspace_id,data_fechamento,status,sobra,total,eyemobile_total,envelope_total,observacao,created_at",
        equals: { workspace_id: context.workspaceId },
      });

      const mapped = rows.map((row): CashClosingRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          dataFechamento: String(row.data_fechamento ?? ""),
          status: String(row.status ?? "pendente"),
          sobra: row.sobra !== null && row.sobra !== undefined ? amount(row.sobra) : null,
          totalInformado: normalizeMethodMap(row.total),
          eyemobileTotal: normalizeMethodMap(row.eyemobile_total),
          envelopeTotal: normalizeMethodMap(row.envelope_total),
          observacao: row.observacao ? String(row.observacao) : null,
          createdAt: String(row.created_at ?? ""),
        };
      });

      if (!period) return mapped;
      return mapped.filter((rec) => {
        const isoDate = normalizeClosingDate(rec.dataFechamento, rec.createdAt);
        return (!period.start || isoDate >= period.start) && (!period.end || isoDate <= period.end);
      });
    },
    async listOperationalReminders(context, period) {
      const results: OperationalReminderRecord[] = [];

      try {
        const lembreteRows = await execute({
          table: "lembretes",
          columns: "id,user_id,titulo,descricao,data,hora,tipo,status,created_at",
          equals: { user_id: context.userId },
          dateRange: period ? { column: "data", ...period } : undefined,
        });
        lembreteRows.forEach((row) => {
          if (row.user_id !== context.userId) {
            throw new Error("repository_scope_mismatch");
          }
          results.push({
            id: String(row.id),
            userId: String(row.user_id),
            workspaceId: null,
            sourceTable: "lembretes",
            titulo: String(row.titulo ?? ""),
            descricao: row.descricao ? String(row.descricao) : null,
            data: row.data ? String(row.data).slice(0, 10) : null,
            hora: row.hora ? String(row.hora) : null,
            tipo: row.tipo ? String(row.tipo) : null,
            status: String(row.status ?? "pendente"),
            local: null,
            createdAt: String(row.created_at ?? ""),
          });
        });
      } catch (err) {
        if (err instanceof Error && err.message === "repository_scope_mismatch") throw err;
      }

      try {
        const compRows = await execute({
          table: "compromissos",
          columns: "id,user_id,workspace_id,titulo,local,data,hora,repetir,created_at",
          equals: { workspace_id: context.workspaceId },
          dateRange: period ? { column: "data", ...period } : undefined,
        });
        compRows.forEach((row) => {
          assertScope(row, context);
          results.push({
            id: String(row.id),
            userId: String(row.user_id ?? context.userId),
            workspaceId: String(row.workspace_id),
            sourceTable: "compromissos",
            titulo: String(row.titulo ?? ""),
            descricao: row.repetir ? `Repetição: ${String(row.repetir)}` : null,
            data: row.data ? String(row.data).slice(0, 10) : null,
            hora: row.hora ? String(row.hora) : null,
            tipo: "compromisso",
            status: "agendado",
            local: row.local ? String(row.local) : null,
            createdAt: String(row.created_at ?? ""),
          });
        });
      } catch (err) {
        if (err instanceof Error && err.message === "repository_scope_mismatch") throw err;
      }

      return results;
    },
  };
}
