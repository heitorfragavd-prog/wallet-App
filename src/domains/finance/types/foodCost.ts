// ─── Tipos: Food Cost — Wallet App v2.0 ─────────────────────────────────────

export type CategoriaCardapio =
  | "lanches"
  | "bebidas"
  | "sobremesas"
  | "cafes"
  | "porcoes"
  | "outros";

export type StatusMargem =
  | "excelente"   // margem >= 65%
  | "boa"         // margem >= 50%
  | "atencao"     // margem >= 30%
  | "perigoso"    // margem < 30%
  | "sem_ficha"   // sem insumos cadastrados
  | "sem_preco";  // preço zerado

export interface ProdutoCardapio {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  nome: string;
  descricao?: string;
  preco_venda: number;
  eyemobile_product_id?: string;
  categoria: CategoriaCardapio;
  imagem_url?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface FichaTecnica {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  produto_id: string;
  insumo_nome: string;
  insumo_id?: string | null;
  quantidade: number;
  unidade_medida: string;
  custo_unitario: number;
  created_at: string;
  updated_at: string;
}

/** Produto com custo calculado a partir da ficha técnica (v_produtos_custo) */
export interface ProdutoComCusto extends ProdutoCardapio {
  custo_total: number;
  qtd_insumos: number;
  margem_percentual: number;
  status_margem: StatusMargem;
}

/** Resumo agregado para o painel de Food Cost */
export interface FoodCostSummary {
  totalProdutos: number;
  produtosComFicha: number;
  mediaMargemGeral: number;
  produtosMelhoresMargem: ProdutoComCusto[];
  produtosPiorMargem: ProdutoComCusto[];
  cmvTotal: number;
  receitaBruta: number;
  foodCostPercent: number;
}

// ─── Tipos: DRE Gerencial ────────────────────────────────────────────────────

export interface LinhaDRE {
  label: string;
  valor: number;
  percentualSobreReceita?: number;
  tipo: "positivo" | "negativo" | "neutro" | "total" | "subtotal";
  indent?: number; // nível de indentação (0 = topo, 1 = filho)
}

export interface DREGerencial {
  periodo: string;          // Ex: "julho/2025"
  mes: number;
  ano: number;
  receitaBruta: number;
  impostosSimples: number;  // Simples Nacional (alíquota efetiva)
  pisCofinsSobreReceita: number;
  issServicos: number;
  receitaLiquida: number;
  cmv: number;              // Custo de Mercadoria Vendida
  lucroBruto: number;
  despesasOperacionais: number;
  ebitda: number;
  depreciacao: number;
  lair: number;
  irpj: number;
  lucroLiquido: number;
  margemBruta: number;      // %
  margemEbitda: number;     // %
  margemLiquida: number;    // %
  linhas: LinhaDRE[];
}

// ─── Tipos: Validades ────────────────────────────────────────────────────────

export type StatusValidade = "ok" | "proximo" | "vencido";

export interface InsumoComValidade {
  id: string;
  nome: string;
  data_validade?: string | null;
  alerta_dias: number;
  quantidade_estoque: number;
  status_validade: StatusValidade;
  workspace_id?: string | null;
}
