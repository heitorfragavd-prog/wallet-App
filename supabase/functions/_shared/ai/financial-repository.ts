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
    | "colaborador_pagamentos";
  columns: string;
  equals: { workspace_id: string; user_id?: string; [key: string]: unknown };
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
          fornecedorPadrao: row.fornecedor_padrao ? String(row.fornecedor_padrao) : null,
          margemRealPercentual: amount(row.margem_real_percentual),
          ativo: row.ativo !== false,
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
        columns: "id,workspace_id,acerto_id,valor,status,origem,paid_at,created_at",
        equals: { workspace_id: context.workspaceId },
        dateRange: period ? { column: "created_at" as any, ...period } : undefined,
      });
      return rows.map((row): EmployeePaymentRecord => {
        assertScope(row, context);
        return {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          acertoId: row.acerto_id ? String(row.acerto_id) : null,
          valor: amount(row.valor),
          status: String(row.status ?? "pendente"),
          origem: row.origem ? String(row.origem) : null,
          paidAt: row.paid_at ? String(row.paid_at) : null,
          createdAt: String(row.created_at ?? ""),
        };
      });
    },
  };
}
