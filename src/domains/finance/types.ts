/**
 * Finance Domain Types
 * 
 * Type definitions for financial operations
 */

export interface Transaction {
  id: string;
  user_id: string;
  type: 'receita' | 'despesa';
  amount: number;
  description: string;
  category_id: string;
  date: string;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: 'receita' | 'despesa';
  color?: string;
  icon?: string;
}

export interface Receita {
  id: string;
  user_id: string;
  descricao: string;
  valor: number;
  data: string;
  categoria_id?: string;
  created_at: string;
}

export interface Despesa {
  id: string;
  user_id: string;
  descricao: string;
  valor: number;
  data: string;
  categoria_id?: string;
  created_at: string;
}

export interface Divida {
  id: string;
  user_id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  data_vencimento: string;
  status: 'pendente' | 'pago' | 'atrasado';
  created_at: string;
}

export interface Meta {
  id: string;
  user_id: string;
  titulo: string;
  valor_alvo: number;
  valor_atual: number;
  data_limite?: string;
  categoria_id?: string;
  created_at: string;
}

export interface Orcamento {
  id: string;
  user_id: string;
  categoria_id: string;
  valor_limite: number;
  mes: number;
  ano: number;
  created_at: string;
}
