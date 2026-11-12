export type OperationalGroupType =
  | "fechamento"
  | "nfe_boletos"
  | "contas_empresa"
  | "conversas_loja";

export interface GroupPermissions {
  ler: boolean;
  enviar_mensagens: boolean;
  enviar_documentos: boolean;
  confirmar_operacoes: boolean;
  gerenciar_grupo: boolean;
}

export interface GrupoConfig {
  id: string;
  workspace_id: string;
  chat_id: number | null;
  nome_grupo: string | null;
  descricao: string | null;
  tipo_grupo: OperationalGroupType;
  ativo: boolean;
  ferramentas_permitidas: string[];
  dados_permitidos: string[];
  acoes_permitidas: string[];
  funcionalidades_autorizadas: string[];
  config: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface GrupoParticipante {
  id: string;
  grupo_id: string;
  workspace_id: string;
  user_id: string;
  role_no_grupo: "admin_grupo" | "operador" | "leitor";
  permissoes: GroupPermissions;
  ativo: boolean;
  autorizado_por: string | null;
  created_at: string;
  updated_at?: string;
  nome?: string | null;
  email?: string | null;
  telegram_username?: string | null;
  workspace_role?: string | null;
}

export interface ConversaRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  grupo_id: string | null;
  title: string;
  agent_type: "operational" | "ceo";
  is_shared: boolean;
  is_group: boolean;
  is_archived: boolean;
  channel: "web" | "telegram";
  last_channel: "web" | "telegram";
  external_chat_id: string | null;
  processing_status: "idle" | "processing" | "awaiting_confirmation" | "error";
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversaMessage {
  id: string;
  conversation_id: string;
  workspace_id: string;
  user_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  channel: "web" | "telegram";
  external_message_id: string | null;
  sender_name: string | null;
  sender_role: string | null;
  attachment_url: string | null;
  attachment_path: string | null;
  attachment_mime: string | null;
  attachment_name: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface ConversaAttachment {
  id: string;
  message_id: string | null;
  conversation_id: string;
  workspace_id: string;
  grupo_id: string | null;
  uploaded_by: string | null;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  source_channel: "web" | "telegram" | "system";
  created_at: string;
}

export interface ConversaActionProposal {
  id: string;
  workspace_id: string;
  user_id: string;
  conversation_id: string | null;
  grupo_id: string | null;
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
  risk_level: string | null;
  status: "prepared" | "confirmed" | "executed" | "cancelled" | "expired";
  expires_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface FechamentoCaixaItem {
  id: string;
  workspace_id: string | null;
  grupo_id: string | null;
  conversation_id: string | null;
  data_fechamento: string | null;
  caixa1: Record<string, unknown>;
  caixa2: Record<string, unknown>;
  envelope_total: Record<string, unknown>;
  eyemobile_total: Record<string, unknown>;
  sobra: number | null;
  status: string | null;
  anexo_path: string | null;
  observacao: string | null;
  created_at: string | null;
}

export interface WorkspaceMemberOption {
  user_id: string;
  role: string;
  active: boolean;
  nome?: string | null;
  email?: string | null;
  telegram_username?: string | null;
  is_owner?: boolean;
}

export interface ThreadListItem {
  id: string; // conversation_id (or synthetic id if missing conversation yet)
  kind: "group" | "private_operational" | "private_ceo";
  title: string;
  subtitle: string;
  grupo?: GrupoConfig;
  conversation?: ConversaRecord;
  unreadCount: number;
  participantsCount: number;
  pendingProposalsCount: number;
  telegramLinked: boolean;
  processingStatus: "idle" | "processing" | "awaiting_confirmation" | "error";
  lastActivityAt: string | null;
  lastMessagePreview: string | null;
  myPermissions: GroupPermissions;
  myGroupRole?: "admin_grupo" | "operador" | "leitor";
}

export const GROUP_TYPE_META: Record<
  OperationalGroupType,
  {
    label: string;
    shortLabel: string;
    emoji: string;
    badgeClass: string;
    securityNote: string;
    defaultCapabilities: Array<{ id: string; label: string }>;
    quickPrompts: string[];
  }
> = {
  fechamento: {
    label: "Fechamento da Loja",
    shortLabel: "Fechamento",
    emoji: "🧾",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    securityNote:
      "Conferência diária de fechamento de caixa com validação contra Eyemobile PDV e aprovação de sobras.",
    defaultCapabilities: [
      { id: "buscar_vendas_pdv", label: "Consultar vendas Eyemobile" },
      { id: "buscar_transacoes", label: "Consultar movimentações do dia" },
      { id: "consultar_resumo_mensal", label: "Resumo mensal operacional" },
      { id: "fechamento_caixa", label: "Processar fechamento e envelopes" },
    ],
    quickPrompts: [
      "Qual foi o total de vendas de hoje no Eyemobile?",
      "Fechamento de hoje: Dinheiro R$ 0,00 | Pix R$ 0,00 | Débito R$ 0,00 | Crédito R$ 0,00",
      "Mostrar histórico de fechamentos pendentes",
    ],
  },
  nfe_boletos: {
    label: "Notas Fiscais e Boletos",
    shortLabel: "NF-e e Boletos",
    emoji: "📄",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    securityNote:
      "Leitura de boletos e DANFEs com checagem de duplicidade e propostas pendentes. Pagamentos reais NUNCA são executados automaticamente aqui.",
    defaultCapabilities: [
      { id: "consultar_dividas", label: "Verificar duplicidade em dívidas" },
      { id: "buscar_despesas", label: "Consultar despesas e fornecedores" },
      { id: "consultar_estoque", label: "Preparar entrada de itens / custos" },
    ],
    quickPrompts: [
      "Quais boletos estão vencendo esta semana?",
      "Verificar se há propostas de notas fiscais pendentes",
      "Como enviar uma DANFE ou linha digitável?",
    ],
  },
  contas_empresa: {
    label: "Contas da Empresa",
    shortLabel: "Contas Empresa",
    emoji: "💰",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    securityNote:
      "Acesso estrito ao proprietário e administradores autorizados. Funcionários comuns são bloqueados por política de segurança e RLS.",
    defaultCapabilities: [
      { id: "consultar_saldos", label: "Consultar saldos das contas" },
      { id: "consultar_dividas", label: "Consultar dívidas e vencimentos" },
      { id: "buscar_despesas", label: "Auditar despesas e pagamentos" },
      { id: "buscar_transacoes", label: "Conciliar transações Pix Divipay" },
    ],
    quickPrompts: [
      "Quais dívidas vencem hoje e amanhã?",
      "Qual o saldo atual das contas da empresa?",
      "Resumo das despesas pagas nos últimos 7 dias",
    ],
  },
  conversas_loja: {
    label: "Conversas da Loja",
    shortLabel: "Equipe Loja",
    emoji: "🏪",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    securityNote:
      "Comunicação de turno, procedimentos e ocorrências. Dados financeiros confidenciais da empresa são bloqueados neste grupo.",
    defaultCapabilities: [
      { id: "consultar_validades", label: "Consultar alertas de validade" },
      { id: "consultar_rotinas", label: "Apoio em procedimentos e tarefas" },
    ],
    quickPrompts: [
      "Registrar recado de troca de turno",
      "Checklist de abertura e fechamento da loja",
      "Registrar ocorrência operacional na loja",
    ],
  },
};
