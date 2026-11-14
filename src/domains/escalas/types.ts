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
  ativo_segunda?: boolean;
  ativo_sexta?: boolean;
  limite_tentativas?: number;
  canal_preferencial?: "telegram" | "whatsapp_manual" | "web";
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

export type TipoRotinaAutomacao =
  | "consulta_segunda"
  | "confirmacao_sexta"
  | "lembrete"
  | "busca_substituto"
  | "simulacao";

export type StatusRotinaAutomacao =
  | "preparada"
  | "executada"
  | "erro"
  | "simulada"
  | "cancelada";

export type TelegramEnvioStatus =
  | "preparada"
  | "aguardando_envio"
  | "enviando"
  | "enviada"
  | "falha"
  | "cancelada"
  | "simulada";

export type FolguistaConfirmationStatus =
  | "aguardando_confirmacao"
  | "confirmado"
  | "recusado"
  | "substituicao_necessaria";

export interface EscalaAutomacaoLog {
  id: string;
  workspace_id: string;
  tipo_rotina: TipoRotinaAutomacao;
  idempotency_key: string;
  data_fim_semana_inicio: string;
  data_fim_semana_fim: string;
  status: StatusRotinaAutomacao;
  destinatario_tipo: "grupo" | "individual" | "sistema";
  destinatario_id?: string | null;
  destinatario_nome?: string | null;
  mensagem_texto: string;
  vagas_identificadas: Array<{
    data: string;
    diaSemana: string;
    turno: TurnoId;
    horario: string;
  }>;
  respostas_processadas?: Array<{
    colaborador_id: string;
    colaborador_nome?: string;
    texto_raw: string;
    interpretacao: string;
    data_resposta: string;
  }>;
  enviado_telegram: boolean;
  status_envio?: TelegramEnvioStatus;
  telegram_message_id?: string | null;
  api_response?: Record<string, unknown> | null;
  tentativas?: number;
  erro_detalhes?: string | null;
  erro_mensagem?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcaoPropostaSimulada {
  tipo: "disponibilidade" | "confirmacao" | "desistencia" | "indisponibilidade" | "ambigua";
  data: string;
  turno: TurnoId;
  descricao: string;
  detalhes: string;
}

export interface SimulacaoRespostaFolguistaResult {
  sucesso: boolean;
  simulada: true;
  colaboradorId: string;
  colaboradorNome: string;
  textoOriginal: string;
  interpretacao: FolguistaParsedResponse;
  acoesPropostas: AcaoPropostaSimulada[];
  resumoAcao: string;
}

export interface FolguistaDayAvailability {
  disponivel: boolean;
  turnos: TurnoId[];
  ambigua: boolean;
}

export interface FolguistaAvailabilityParsed {
  colaboradorId?: string;
  colaboradorNome?: string;
  disponibilidadeGeral: "disponivel" | "indisponivel" | "parcial" | "ambigua";
  dias: {
    sabado: FolguistaDayAvailability;
    domingo: FolguistaDayAvailability;
  };
  preferencias?: string;
  esclarecimentoNecessario: boolean;
  perguntaEsclarecimento?: string;
  respostaConfirmacaoAgradecimento: string;
  tipoMensagem: "disponibilidade" | "confirmacao_presenca" | "desistencia" | "duvida" | "outro";
}

export interface FolguistaSubstitutionCandidate {
  colaborador: ColaboradorFolguista;
  pontuacao: number;
  motivoPontuacao: string[];
  atendeDescansoClt: boolean;
  restricoes: string[];
  recomendado: boolean;
}
