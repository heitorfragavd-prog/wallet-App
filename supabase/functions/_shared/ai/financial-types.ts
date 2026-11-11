export type FinancialSourceType = "receita" | "despesa" | "transacao";
export type FinancialRecordKind = "income" | "expense" | "transfer";

export interface CanonicalFinancialRecord {
  id: string;
  sourceType: FinancialSourceType;
  sourceId: string;
  workspaceId: string;
  userId: string;
  kind: FinancialRecordKind;
  amount: number;
  occurredOn: string;
  deduplicationKey: string;
  description: string;
  status?: string;
}

export interface FiscalNoteRecord {
  id: string;
  workspaceId: string;
  numeroNf: string | null;
  serieNf: string | null;
  fornecedor: string | null;
  cnpjFornecedor: string | null;
  dataEmissao: string | null;
  dataEntrada: string | null;
  valorTotal: number;
  valorIcms: number;
  valorProdutos: number;
  chaveAcesso: string | null;
  status: string;
  origem: string | null;
  createdAt: string;
}

export interface SefazDocumentRecord {
  id: string;
  workspaceId: string;
  chaveAcesso: string | null;
  tipoDocumento: string | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  dataEmissao: string | null;
  valorTotal: number;
  statusProcessamento: string;
  createdAt: string;
}

export interface DocumentSessionRecord {
  id: string;
  workspaceId: string;
  documentoTipo: string | null;
  chaveAcesso: string | null;
  numeroNf: string | null;
  fornecedor: string | null;
  status: string;
  createdAt: string;
}

export interface SalesPdvItemRecord {
  id: string | number;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  productId?: string | number;
  time?: string;
}

export interface SalesPdvDetailRecord {
  id: string;
  workspaceId: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: string | null;
  items: SalesPdvItemRecord[];
  createdAt: string;
  status?: string;
}

export interface CanonicalBalance {
  accountId: string;
  name: string;
  amount: number;
  type: string;
}

export interface FinancialPeriodContext {
  userId: string;
  workspaceId: string;
  start: string;
  end: string;
}

export interface FinancialSourceReference {
  type: FinancialSourceType;
  ids: string[];
}

export interface CanonicalFinancialSummary {
  period: { start: string; end: string };
  operationalIncome: number;
  operationalExpenses: number;
  cashResult: number;
  internalTransfers: number;
  availableBalance: number;
  sources: FinancialSourceReference[];
  warnings: string[];
  formulas: {
    cashResult: string;
    availableBalance: string;
  };
}
