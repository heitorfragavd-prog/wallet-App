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
  user_id: string;
  nome: string;
  descricao?: string;
  intervalo_km?: number;
  intervalo_meses?: number;
  created_at: string;
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
