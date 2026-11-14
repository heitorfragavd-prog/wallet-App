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
   * Atualiza ou cadastra a integração do WhatsApp Business (Cloud API)
   */
  public static async upsertIntegration(params: {
    workspaceId: string;
    phoneNumberId: string;
    wabaId?: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    webhookVerifyToken?: string;
    status?: 'pending' | 'active' | 'suspended' | 'error';
  }): Promise<{ success: boolean; data?: WhatsAppIntegration; error?: string }> {
    if (!params.workspaceId || !params.phoneNumberId) {
      return { success: false, error: 'workspaceId e phoneNumberId são obrigatórios.' };
    }

    const { data, error } = await supabase
      .from('workspace_whatsapp_integrations')
      .upsert(
        {
          workspace_id: params.workspaceId,
          phone_number_id: params.phoneNumberId,
          waba_id: params.wabaId || null,
          display_phone_number: params.displayPhoneNumber || null,
          verified_name: params.verifiedName || null,
          webhook_verify_token: params.webhookVerifyToken || 'wallet_whatsapp_verify_token_prod',
          status: params.status || 'active',
        },
        { onConflict: 'workspace_id, phone_number_id' }
      )
      .select()
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as unknown as WhatsAppIntegration) || undefined };
  }

  /**
   * Alterna o status ativo/inativo do pareamento
   */
  public static async setPairingStatus(
    workspaceId: string,
    phoneNumber: string,
    ativo: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('whatsapp_usuarios_pareados')
      .update({ ativo })
      .eq('workspace_id', workspaceId)
      .eq('phone_number', phoneNumber);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Obtém métricas e telemetria da integração WhatsApp no workspace (Gate 8)
   */
  public static async getIntegrationTelemetry(workspaceId: string): Promise<{
    totalReceived: number;
    totalProcessed: number;
    totalIgnored: number;
    totalErrors: number;
    pairedUsersCount: number;
    lastActiveAt?: string;
  }> {
    if (!workspaceId) {
      return {
        totalReceived: 0,
        totalProcessed: 0,
        totalIgnored: 0,
        totalErrors: 0,
        pairedUsersCount: 0,
      };
    }

    const [{ count: pairedCount }, { data: messages }] = await Promise.all([
      supabase
        .from('whatsapp_usuarios_pareados')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('ativo', true),
      supabase
        .from('whatsapp_mensagens_processadas')
        .select('status_processamento, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    let totalProcessed = 0;
    let totalIgnored = 0;
    let totalErrors = 0;

    (messages || []).forEach((m) => {
      if (m.status_processamento === 'processed') totalProcessed++;
      else if (m.status_processamento === 'ignored') totalIgnored++;
      else if (m.status_processamento === 'error') totalErrors++;
    });

    const lastActiveAt = messages && messages.length > 0 ? messages[0].created_at : undefined;

    return {
      totalReceived: (messages || []).length,
      totalProcessed,
      totalIgnored,
      totalErrors,
      pairedUsersCount: pairedCount || 0,
      lastActiveAt,
    };
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
