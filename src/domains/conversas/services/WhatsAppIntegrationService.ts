/**
 * WhatsAppIntegrationService.ts
 *
 * Serviço de Gerenciamento da Integração WhatsApp Business Cloud API (Etapa 13 - Gate 3).
 * Gerencia credenciais da Meta, status da integração, pareamento seguro de números e mensagens.
 */

import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppIntegration, WhatsAppPairedUser, WhatsAppMessageProcessed } from '../types';

export class WhatsAppIntegrationService {
  /**
   * Consulta a integração WhatsApp ativa para o workspace
   */
  public static async getIntegration(workspaceId: string): Promise<WhatsAppIntegration | null> {
    if (!workspaceId) return null;

    const { data, error } = await supabase
      .from('workspace_whatsapp_integrations')
      .select('id, workspace_id, phone_number_id, waba_id, display_phone_number, verified_name, quality_rating, status, webhook_verify_token, created_by, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      console.warn('[WhatsAppService] Erro ao consultar integração:', error);
      return null;
    }

    return (data as unknown as WhatsAppIntegration) || null;
  }

  /**
   * Lista os colaboradores e administradores pareados com números do WhatsApp
   */
  public static async listPairedUsers(workspaceId: string): Promise<WhatsAppPairedUser[]> {
    if (!workspaceId) return [];

    const { data, error } = await supabase
      .from('whatsapp_usuarios_pareados')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[WhatsAppService] Erro ao listar usuários pareados:', error);
      return [];
    }

    return (data as unknown as WhatsAppPairedUser[]) || [];
  }

  /**
   * Pareia com segurança um número de WhatsApp a um usuário do sistema
   */
  public static async pairUserPhone(params: {
    workspaceId: string;
    userId: string;
    phoneNumber: string;
    nomeContato?: string;
    roleNoWorkspace?: 'owner' | 'admin' | 'member';
  }): Promise<{ success: boolean; error?: string }> {
    const cleanPhone = params.phoneNumber.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;

    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return { success: false, error: 'Número de telefone inválido. Use formato E.164 (ex: +5511999998888).' };
    }

    const { error } = await supabase.from('whatsapp_usuarios_pareados').upsert(
      {
        workspace_id: params.workspaceId,
        user_id: params.userId,
        phone_number: formattedPhone,
        nome_contato: params.nomeContato || null,
        role_no_workspace: params.roleNoWorkspace || 'member',
        ativo: true,
      },
      { onConflict: 'workspace_id, phone_number' }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Desativa o pareamento de um número WhatsApp
   */
  public static async unpairUserPhone(workspaceId: string, phoneNumber: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('whatsapp_usuarios_pareados')
      .update({ ativo: false })
      .eq('workspace_id', workspaceId)
      .eq('phone_number', phoneNumber);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Lista as últimas mensagens recebidas via WhatsApp
   */
  public static async listRecentMessages(workspaceId: string, limit = 20): Promise<WhatsAppMessageProcessed[]> {
    if (!workspaceId) return [];

    const { data, error } = await supabase
      .from('whatsapp_mensagens_processadas')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[WhatsAppService] Erro ao listar mensagens:', error);
      return [];
    }

    return (data as unknown as WhatsAppMessageProcessed[]) || [];
  }
}
