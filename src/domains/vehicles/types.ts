/**
 * Vehicles Domain Types
 */

export interface Veiculo {
  id: string;
  user_id: string;
  marca: string;
  modelo: string;
  ano: number;
  placa: string;
  quilometragem: number;
  cor?: string;
  combustivel?: string;
  created_at: string;
}

export interface TipoManutencao {
  id: string;
  user_id?: string;
  nome: string;
  sistema?: string;
  intervalo_km?: number;
  intervalo_meses?: number;
  descricao?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Manutencao {
  id: string;
  veiculo_id: string;
  tipo_manutencao_id: string;
  data: string;
  quilometragem: number;
  valor: number;
  observacoes?: string;
  created_at: string;
}

export interface ManutencaoPendente {
  veiculo: Veiculo;
  tipoManutencao: TipoManutencao;
  kmRestante?: number;
  diasRestantes?: number;
}

export interface PlanoManutencaoVeiculo {
  id: string;
  user_id: string;
  veiculo_id: string;
  tipo_manutencao_id: string;
  intervalo_km: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  tipo_manutencao?: TipoManutencao;
}

export interface ManutencaoCustomizada {
  id: string;
  user_id: string;
  veiculo_id: string;
  nome: string;
  sistema?: string;
  intervalo_km?: number;
  data_prevista?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface LembreteManutencao {
  id: string;
  user_id: string;
  veiculo_id: string;
  manutencao_id: string;
  tipo_manutencao: string;
  data_prevista: string;
  dias_antecedencia: number;
  status: string;
  webhook_enviado_em?: string | null;
  webhook_response?: string | null;
  created_at: string;
  updated_at: string;
}
