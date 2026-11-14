/**
 * types.ts
 *
 * Definições de tipos para a integração Google Calendar do Wallet CEO (Etapa 12).
 * Suporte a OAuth 2.0 dedicado, isolamento de tokens em relação ao Gmail,
 * seleção de calendários e sincronização incremental de eventos.
 */

export type CalendarIntegrationStatus =
  | 'pendente_autorizacao'
  | 'conectado'
  | 'desconectado'
  | 'erro_autenticacao';

export interface CalendarIntegration {
  id: string;
  workspace_id: string;
  user_id: string;
  email_conectado: string;
  calendar_id: string;
  calendar_nome?: string | null;
  status: CalendarIntegrationStatus;
  ultimo_sync_em: string | null;
  ultimo_sync_token?: string | null;
  configuracoes?: {
    sincronizar_vencimentos?: boolean;
    apenas_eventos_comerciais?: boolean;
    dias_antecedencia_lembrete?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  timeZone?: string;
}

export interface CalendarSyncedEvent {
  id: string;
  workspace_id: string;
  integration_id?: string | null;
  google_event_id: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  inicio: string; // ISO 8601
  fim: string;    // ISO 8601
  dia_inteiro: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  compromisso_id?: string | null;
  idempotency_hash: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarSyncSummary {
  success: boolean;
  eventsChecked: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsCancelled: number;
  lastSyncTimestamp: string;
  error?: string;
}
