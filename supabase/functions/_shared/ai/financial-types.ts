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

export interface InventoryItemRecord {
  id: string;
  workspaceId: string;
  codigo: string | null;
  descricao: string;
  categoria: string | null;
  precoVenda: number;
  custoAtual: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  estoqueIdeal: number;
  unidadeMedida: string;
  multiploCompra: number;
  fornecedorPadrao: string | null;
  margemRealPercentual: number;
  ativo: boolean;
  estoqueInformado?: boolean;
  custoInformado?: boolean;
  estoqueMinimoInformado?: boolean;
  estoqueIdealInformado?: boolean;
}

export interface RecipeCardRecord {
  id: string;
  workspaceId: string;
  nome: string;
  precoVenda: number;
  custoTotal: number;
  margemPercentual: number | null;
  statusMargem: string;
  statusFicha: string;
  qtdInsumos: number;
  qtdInsumosSemCusto: number;
  ativo: boolean;
}

export interface SupplierRecord {
  id: string;
  workspaceId: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  contatoNome: string | null;
  prazoPagamentoDias: number;
}

export interface EmployeeRecord {
  id: string;
  workspaceId: string;
  nome: string;
  cargo: string | null;
  tipo: string | null;
  status: string;
  salarioBruto: number;
  valeTransporte: number;
  valeRefeicao: number;
  diaPagamento: number | null;
  valorDiaria: number;
  dataAdmissao: string | null;
}

export interface EmployeeScheduleRecord {
  id: string;
  workspaceId: string;
  colaboradorId: string;
  data: string;
  turno: string | null;
  valorDiaria: number;
  valorTotal: number;
  status: string;
  observacao: string | null;
}

export interface EmployeePaymentRecord {
  id: string;
  workspaceId: string;
  acertoId: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  competenciaInicio?: string | null;
  competenciaFim?: string | null;
  idempotencyKey?: string | null;
  divipayExternalId?: string | null;
  comprovanteUrl?: string | null;
  valor: number;
  status: string;
  origem: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface GrowthOpportunityRecord {
  id: string;
  workspaceId: string;
  department: string;
  title: string;
  problemDescription: string | null;
  hypothesis: string | null;
  recommendedAction: string | null;
  estimatedFinancialImpact: number | null;
  confidenceScore: number | null;
  status: string;
  evidenceData: Record<string, unknown> | null;
  limitationsNotes: string | null;
  createdAt: string;
}

export interface CommercialExperimentRecord {
  id: string;
  workspaceId: string;
  opportunityId: string | null;
  name: string;
  hypothesis: string;
  department: string;
  targetKpi: string;
  baselineValue: number | null;
  currentValue: number | null;
  targetValue: number | null;
  startDate: string | null;
  endDate: string | null;
  responsiblePerson: string | null;
  measuredFinancialImpact: number | null;
  decision: string | null;
  decisionRationale: string | null;
  status: string;
  createdAt: string;
}

