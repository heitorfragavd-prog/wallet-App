/**
 * Market Domain Types
 */

export interface ItemMercado {
  id: string;
  user_id: string;
  nome: string;
  quantidade: number;
  unidade?: string;
  preco_estimado?: number;
  categoria_id?: string;
  comprado: boolean;
  created_at: string;
}

export interface CategoriaMercado {
  id: string;
  user_id: string;
  nome: string;
  cor?: string;
  icone?: string;
  created_at: string;
}
