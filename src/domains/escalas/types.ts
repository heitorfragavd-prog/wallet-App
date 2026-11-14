export type TurnoId = "manha" | "intermediario" | "noite" | "integral";

export interface TurnoInfo {
  id: TurnoId;
  inicio: string; // HH:mm
  fim: string;    // HH:mm
  descricao: string;
}

export const TURNOS_PADRAO: Record<TurnoId, TurnoInfo> = {
  manha: {
    id: "manha",
    inicio: "05:00",
    fim: "13:30",
    descricao: "Manhã (Abertura)",
  },
  intermediario: {
    id: "intermediario",
    inicio: "12:00",
    fim: "20:30",
    descricao: "Intermediário",
  },
  noite: {
    id: "noite",
    inicio: "15:00",
    fim: "23:30",
    descricao: "Noite (Fechamento)",
  },
  integral: {
    id: "integral",
    inicio: "08:00",
    fim: "18:00",
    descricao: "Turno Integral",
  },
};

export interface ColaboradorFolguista {
  id: string;
  workspace_id: string;
  nome: string;
  tipo: "funcionario" | "folguista" | "socio";
  cargo?: string | null;
  telefone?: string | null;
  pix_tipo?: string | null;
  pix_chave?: string | null;
  valor_diaria: number;
  status: "ativo" | "inativo";
  turnos_preferidos: TurnoId[];
  dias_disponiveis: string[];
  avaliacao_nota: number;
  restricoes_alimentares?: string | null;
  observacoes_escala?: string | null;
  foto_url?: string | null;
}

export interface DisponibilidadeFolguista {
  id: string;
  workspace_id: string;
  colaborador_id: string;
  data_referencia: string; // YYYY-MM-DD
  turno: TurnoId | "qualquer";
  disponivel: boolean;
  confirmado: boolean;
  origem: "telegram" | "web" | "manual" | "ia";
  resposta_raw?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EscalasConfig {
  id?: string;
  workspace_id: string;
  min_horas_descanso: number;
  valor_diaria_padrao: number;
  valor_meta_padrao: number;
  horarios_turnos: Record<string, { inicio: string; fim: string; descricao?: string }>;
  dias_semana_turnos: Record<string, TurnoId[]>;
  notificacao_segunda_horario: string;
  notificacao_sexta_horario: string;
  simulacao_modo: boolean;
}

export interface EscalaSlot {
  id?: string;
  data: string; // YYYY-MM-DD
  diaSemana: "sabado" | "domingo" | "segunda" | "terca" | "quarta" | "quinta" | "sexta";
  turno: TurnoId;
  horarioInicio: string;
  horarioFim: string;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  colaboradorTipo?: "funcionario" | "folguista" | "socio" | null;
  valorDiaria: number;
  valorMeta?: number;
  bateuMeta?: boolean;
  status: "programada" | "confirmada" | "concluida" | "cancelada";
  observacao?: string | null;
  violacoes?: string[];
}

export interface EscalaValidationIssue {
  tipo:
    | "violacao_descanso"
    | "sobreposicao"
    | "turno_descoberto"
    | "sem_disponibilidade"
    | "regra_clt_domingo"
    | "aviso";
  severidade: "erro" | "alerta";
  mensagem: string;
  data: string;
  turno: TurnoId;
  colaboradorId?: string;
  colaboradorNome?: string;
}

export interface ScheduleGenerationResult {
  slots: EscalaSlot[];
  turnosDescobertosCount: number;
  violacoes: EscalaValidationIssue[];
  sugestoes: string[];
}
