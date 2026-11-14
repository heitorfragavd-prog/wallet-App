/**
 * CalendarIntegrationService.ts
 *
 * Cliente Frontend para gerenciamento da integração segura com o Google Calendar (Etapa 12).
 * Consome a Edge Function `calendar-sync` e as tabelas `workspace_calendar_integrations` e `calendar_eventos_sincronizados`.
 * Autenticação dedicada com tokens estritamente segregados da integração com Gmail.
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  CalendarIntegration,
  GoogleCalendarItem,
  CalendarSyncedEvent,
  CalendarSyncSummary,
} from '../types';

export class CalendarIntegrationService {
  /**
   * Consulta a integração ativa do usuário no workspace
   */
  public static async getIntegration(workspaceId: string): Promise<CalendarIntegration | null> {
    if (!workspaceId) return null;

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.user) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('workspace_calendar_integrations' as any) as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        console.warn('[CalendarService] Erro ao consultar workspace_calendar_integrations:', error.message);
        return null;
      }

      return data as CalendarIntegration | null;
    } catch (err) {
      console.error('[CalendarService] Falha ao consultar integração:', err);
      return null;
    }
  }

  /**
   * Obtém a URL de autorização OAuth 2.0 do Google Calendar
   */
  public static async getAuthUrl(
    workspaceId: string,
    redirectUri?: string
  ): Promise<{ authUrl: string; state: string } | null> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        throw new Error('Usuário não autenticado.');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const endpoint = `${supabaseUrl}/functions/v1/calendar-sync/auth-url`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          workspaceId,
          redirectUri: redirectUri || `${window.location.origin}/agenda`,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Falha ao obter URL OAuth do Calendar (${resp.status}): ${errText}`);
      }

      const result = await resp.json();
      return result as { authUrl: string; state: string };
    } catch (err) {
      console.error('[CalendarService] Erro ao requisitar auth-url:', err);
      return null;
    }
  }

  /**
   * Lista os calendários disponíveis na conta Google conectada
   */
  public static async listCalendars(workspaceId: string): Promise<GoogleCalendarItem[]> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return [];

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const endpoint = `${supabaseUrl}/functions/v1/calendar-sync/list-calendars`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspaceId }),
      });

      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.calendars || []) as GoogleCalendarItem[];
    } catch (err) {
      console.error('[CalendarService] Erro ao listar calendários:', err);
      return [];
    }
  }

  /**
   * Dispara a sincronização de eventos do Google Calendar
   */
  public static async syncNow(workspaceId: string): Promise<CalendarSyncSummary> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        return {
          success: false,
          eventsChecked: 0,
          eventsCreated: 0,
          eventsUpdated: 0,
          eventsCancelled: 0,
          lastSyncTimestamp: new Date().toISOString(),
          error: 'Usuário não autenticado.',
        };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const endpoint = `${supabaseUrl}/functions/v1/calendar-sync/sync-events`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspaceId }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return {
          success: false,
          eventsChecked: 0,
          eventsCreated: 0,
          eventsUpdated: 0,
          eventsCancelled: 0,
          lastSyncTimestamp: new Date().toISOString(),
          error: `Erro na sincronização (${resp.status}): ${errText}`,
        };
      }

      const data = await resp.json();
      return data as CalendarSyncSummary;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão com o servidor de sincronização de agenda.';
      return {
        success: false,
        eventsChecked: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsCancelled: 0,
        lastSyncTimestamp: new Date().toISOString(),
        error: msg,
      };
    }
  }

  /**
   * Desconecta o calendário Google
   */
  public static async disconnect(workspaceId: string): Promise<boolean> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return false;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const endpoint = `${supabaseUrl}/functions/v1/calendar-sync/disconnect`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspaceId }),
      });

      return resp.ok;
    } catch (err) {
      console.error('[CalendarService] Erro ao desconectar Google Calendar:', err);
      return false;
    }
  }

  /**
   * Lista os eventos sincronizados do Google Calendar no período
   */
  public static async listSyncedEvents(
    workspaceId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CalendarSyncedEvent[]> {
    if (!workspaceId) return [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('calendar_eventos_sincronizados' as any) as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .neq('status', 'cancelled')
        .order('inicio', { ascending: true });

      if (startDate) {
        query = query.gte('inicio', `${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query = query.lte('fim', `${endDate}T23:59:59.999Z`);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[CalendarService] Erro ao listar eventos sincronizados:', error.message);
        return [];
      }

      return (data || []) as CalendarSyncedEvent[];
    } catch (err) {
      console.error('[CalendarService] Falha ao consultar eventos sincronizados:', err);
      return [];
    }
  }
}
