/**
 * Finance Domain Types
 * 
 * Type definitions for financial operations
 */

export type PaymentMethod = 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'transferencia' | 'voucher';

export type AccountType = 'conta_corrente' | 'poupanca' | 'carteira' | 'cartao_credito' | 'outro';

export type RecurrenceType = 'unica' | 'diaria' | 'semanal' | 'mensal' | 'anual';

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

export interface Tag {
  id: string;
  user_id: string;
  nome: string;
  cor?: string;
  created_at: string;
}

export interface ContaUsuario {
  id: string;
  user_id: string;
  nome: string;
  tipo: AccountType;
  created_at: string;
}

export interface AnexoTransacao {
  id: string;
  transacao_tipo: 'receita' | 'despesa' | 'divida';
  transacao_id: string;
  user_id: string;
  nome: string;
  storage_path: string;
  tipo_arquivo: string;
  tamanho: number;
  created_at: string;
}

export interface TransacaoRecorrente {
  id: string;
  user_id: string;
  tipo_transacao: 'receita' | 'despesa';
  descricao: string;
  valor: number;
  categoria_id?: string;
  metodo_pagamento?: PaymentMethod;
  conta_id?: string;
  recorrencia: Exclude<RecurrenceType, 'unica'>;
  dia_execucao?: number;
  dia_semana?: number;
  data_inicio: string;
  data_fim?: string;
  ativo: boolean;
  ultima_execucao?: string;
  created_at: string;
  updated_at: string;
}

export interface Receita {
  id: string;
  user_id: string;
  descricao: string;
  valor: number;
  data: string;
  categoria_id?: string;
  metodo_pagamento?: PaymentMethod;
  conta_id?: string;
  observacoes?: string;
  recorrencia_id?: string;
  created_at: string;
  // Relations
  tags?: Tag[];
  anexos?: AnexoTransacao[];
}

export interface Despesa {
  id: string;
  user_id: string;
  descricao: string;
  valor: number;
  data: string;
  categoria_id?: string;
  metodo_pagamento?: PaymentMethod;
  conta_id?: string;
  observacoes?: string;
  recorrencia_id?: string;
  created_at: string;
  // Relations
  tags?: Tag[];
  anexos?: AnexoTransacao[];
}

export interface Divida {
  id: string;
  user_id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  valor_restante: number;
  data_vencimento: string;
  parcelas: number;
  parcelas_pagas: number;
  status: 'pendente' | 'vencida' | 'quitada';
  credor: string;
  created_at: string;
}

export interface PagamentoDivida {
  id: string;
  divida_id: string;
  user_id: string;
  valor: number;
  data_pagamento: string;
  metodo_pagamento: PaymentMethod;
  conta_id?: string;
  observacoes?: string;
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

export interface DebtReminder {
  id: string;
  divida_id: string;
  user_id: string;
  reminder_hours: number;
  trigger_at: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  dividas?: {
    descricao: string;
    credor: string;
    valor_total: number;
    valor_restante: number;
    data_vencimento: string;
    parcelas: number;
    parcelas_pagas: number;
  };
}

export interface WebhookPayload {
  event: 'debt_reminder';
  timestamp: string;
  user: {
    name: string;
    phone: string;
    email: string;
  };
  debt: {
    id: string;
    description: string;
    creditor: string;
    total_amount: number;
    remaining_amount: number;
    due_date: string;
    installments: number;
    installments_paid: number;
  };
  reminder: {
    id: string;
    hours_before: number;
    trigger_time: string;
  };
}
