export type NotificationCategory =
  | "financeiro"
  | "fechamento_caixa"
  | "boletos"
  | "operacional"
  | "estoque_nfe"
  | "ceo_executivo"
  | "seguranca";

export type NotificationChannel = "app" | "push" | "telegram" | "whatsapp";

export type NotificationPriority = "informativa" | "normal" | "importante" | "critica";

export interface UserNotificationPreference {
  id: string;
  workspace_id: string;
  user_id: string;
  categoria: NotificationCategory;
  canal: NotificationChannel;
  habilitado: boolean;
  autorizado: boolean;
  prioridade_minima: NotificationPriority;
  horario_silencio_inicio: string; // Ex: '22:00'
  horario_silencio_fim: string; // Ex: '07:00'
  fuso_horario: string; // Ex: 'America/Sao_Paulo'
  created_at: string;
  updated_at: string;
}

export interface CategoryMeta {
  id: NotificationCategory;
  label: string;
  description: string;
  ownerOnly?: boolean;
  requiresManager?: boolean;
}

export const NOTIFICATION_CATEGORIES: CategoryMeta[] = [
  {
    id: "financeiro",
    label: "Financeiro & Contas",
    description: "Contas a pagar, contas a receber, divergências financeiras e DRE",
    requiresManager: true,
  },
  {
    id: "fechamento_caixa",
    label: "Fechamento de Caixa",
    description: "Alertas de envelopes, quebras ou sobras de caixa e conciliação de turno",
  },
  {
    id: "boletos",
    label: "Boletos & Vencimentos",
    description: "Avisos prévios de boletos bancários a vencer (D-3, D-1) e vencidos (D-0)",
  },
  {
    id: "operacional",
    label: "Operações & Tarefas",
    description: "Tarefas atribuídas à equipe, atividades pendentes e lembretes de rotina",
  },
  {
    id: "estoque_nfe",
    label: "Estoque & Notas Fiscais",
    description: "Entrada de DANFE, conferência de produtos e custos divergentes",
  },
  {
    id: "ceo_executivo",
    label: "Inteligência Estratégica CEO",
    description: "Métricas executivas, runway, oportunidades e experimentos (Exclusivo Proprietário)",
    ownerOnly: true,
  },
  {
    id: "seguranca",
    label: "Segurança & Acessos",
    description: "Alertas de login, vinculação de dispositivos e limites de rate limit",
    requiresManager: true,
  },
];

export const NOTIFICATION_CHANNELS: { id: NotificationChannel; label: string; icon: string }[] = [
  { id: "app", label: "Aplicativo (In-App)", icon: "Smartphone" },
  { id: "push", label: "Push do Navegador", icon: "Bell" },
  { id: "telegram", label: "Telegram Bot", icon: "MessageCircle" },
];
