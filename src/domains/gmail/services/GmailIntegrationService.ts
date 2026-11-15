/**
 * GmailIntegrationService.ts
 *
 * Cliente Frontend para gerenciamento da integração segura com o Gmail (Etapa 11).
 * Consome a Edge Function `gmail-sync` e a tabela `workspace_gmail_integrations`.
 * Autenticação oficial Google OAuth 2.0 (somente leitura: gmail.readonly).
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  GmailIntegration,
  GmailProcessedMessage,
  GmailSyncSummary,
} from '../types';

export class GmailIntegrationService {
  /**
   * Conta oficial vinculada
   */
  public static readonly TARGET_EMAIL = 'rodopointcafe@gmail.com';

  /**
   * Consulta a integração ativa do workspace
   */
  public static async getIntegration(workspaceId: string): Promise<GmailIntegration | null> {
    if (!workspaceId) return null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('workspace_gmail_integrations' as any) as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (error) {
        console.warn('[GmailService] Erro ao consultar workspace_gmail_integrations:', error.message);
        return null;
      }

      return data as GmailIntegration | null;
    } catch (err) {
      console.error('[GmailService] Falha inesperada ao consultar integração:', err);
      return null;
    }
  }

  /**
   * Obtém a URL de autorização OAuth 2.0 do Google (somente leitura)
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
      const endpoint = `${supabaseUrl}/functions/v1/gmail-sync/auth-url`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          workspaceId,
          redirectUri: redirectUri || `${window.location.origin}/dividas`,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Falha ao obter URL OAuth (${resp.status}): ${errText}`);
      }

      const result = await resp.json();
      return result as { authUrl: string; state: string };
    } catch (err) {
      console.error('[GmailService] Erro ao requisitar auth-url:', err);
      return null;
    }
  }

  /**
   * Processa o retorno do fluxo OAuth 2.0 (troca do authorization code pelos tokens)
   */
  public static async handleOAuthCallback(
    code: string,
    state: string,
    redirectUri?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        throw new Error('Usuário não autenticado.');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const endpoint = `${supabaseUrl}/functions/v1/gmail-sync/oauth-callback`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          code,
          state,
          redirectUri: redirectUri || `${window.location.origin}/dividas`,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: 'Falha na autenticação com o Gmail' }));
        return { success: false, error: errData.error || `Erro (${resp.status})` };
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar autorização Gmail.';
      return { success: false, error: msg };
    }
  }

  /**
   * Dispara a sincronização incremental imediata dos e-mails com anexos financeiros
   */
  public static async syncNow(workspaceId: string): Promise<GmailSyncSummary> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        return {
          success: false,
          messagesChecked: 0,
          newDocumentsFound: 0,
          duplicatesSkipped: 0,
          errorsCount: 1,
          lastSyncTimestamp: new Date().toISOString(),
          error: 'Usuário não autenticado.',
        };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const endpoint = `${supabaseUrl}/functions/v1/gmail-sync/sync`;

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
          messagesChecked: 0,
          newDocumentsFound: 0,
          duplicatesSkipped: 0,
          errorsCount: 1,
          lastSyncTimestamp: new Date().toISOString(),
          error: `Erro na sincronização (${resp.status}): ${errText}`,
        };
      }

      const data = await resp.json();
      return data as GmailSyncSummary;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão com o servidor de sincronização.';
      return {
        success: false,
        messagesChecked: 0,
        newDocumentsFound: 0,
        duplicatesSkipped: 0,
        errorsCount: 1,
        lastSyncTimestamp: new Date().toISOString(),
        error: msg,
      };
    }
  }

  /**
   * Desconecta a conta e revoga o token de acesso
   */
  public static async disconnect(workspaceId: string): Promise<boolean> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return false;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const endpoint = `${supabaseUrl}/functions/v1/gmail-sync/disconnect`;

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
      console.error('[GmailService] Erro ao desconectar Gmail:', err);
      return false;
    }
  }

  /**
   * Lista mensagens financeiras já processadas ou pendentes de conferência
   */
  public static async listProcessedMessages(
    workspaceId: string,
    limit = 50
  ): Promise<GmailProcessedMessage[]> {
    if (!workspaceId) return [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('gmail_mensagens_processadas' as any) as any)
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('[GmailService] Erro ao listar mensagens processadas:', error.message);
        return [];
      }

      return (data || []) as GmailProcessedMessage[];
    } catch (err) {
      console.error('[GmailService] Falha ao consultar histórico de e-mails:', err);
      return [];
    }
  }
}
