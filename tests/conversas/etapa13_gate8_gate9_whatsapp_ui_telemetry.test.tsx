import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsAppIntegrationService } from '../../src/domains/conversas/services/WhatsAppIntegrationService';
import { WhatsAppIntegrationCard } from '../../src/domains/conversas/components/WhatsAppIntegrationCard';

// Mock do cliente Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/integrations/supabase/client';

describe('Wallet CEO 3.0 — Etapa 13: Gates 8 e 9 (Telemetria, Segurança e Painel UI)', () => {
  const mockWorkspaceId = '33333333-3333-3333-3333-333333333333';
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  // ─── GATE 8: SERVIÇO & TELEMETRIA ──────────────────────────────────────────

  it('deve cadastrar e atualizar credenciais da integração com upsertIntegration', async () => {
    const mockData = {
      id: 'integ-1',
      workspace_id: mockWorkspaceId,
      phone_number_id: '10987654321',
      waba_id: 'waba-123',
      display_phone_number: '+55 11 99999-8888',
      status: 'active',
      webhook_verify_token: 'custom_token_123',
    };

    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const res = await WhatsAppIntegrationService.upsertIntegration({
      workspaceId: mockWorkspaceId,
      phoneNumberId: '10987654321',
      wabaId: 'waba-123',
      displayPhoneNumber: '+55 11 99999-8888',
      webhookVerifyToken: 'custom_token_123',
    });

    expect(res.success).toBe(true);
    expect(res.data?.phone_number_id).toBe('10987654321');
    expect(res.data?.status).toBe('active');
  });

  it('deve calcular corretamente a telemetria agregando mensagens processadas e ignoradas', async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'whatsapp_usuarios_pareados') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
            }),
          }),
        };
      }
      if (table === 'whatsapp_mensagens_processadas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    { status_processamento: 'processed', created_at: '2026-11-14T17:00:00Z' },
                    { status_processamento: 'processed', created_at: '2026-11-14T16:50:00Z' },
                    { status_processamento: 'ignored', created_at: '2026-11-14T16:40:00Z' },
                    { status_processamento: 'error', created_at: '2026-11-14T16:30:00Z' },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }) as unknown as (table: string) => ReturnType<typeof supabase.from>);

    const telemetry = await WhatsAppIntegrationService.getIntegrationTelemetry(mockWorkspaceId);
    expect(telemetry.totalReceived).toBe(4);
    expect(telemetry.totalProcessed).toBe(2);
    expect(telemetry.totalIgnored).toBe(1);
    expect(telemetry.totalErrors).toBe(1);
    expect(telemetry.pairedUsersCount).toBe(3);
    expect(telemetry.lastActiveAt).toBe('2026-11-14T17:00:00Z');
  });

  it('deve validar e rejeitar números fora do padrão internacional E.164 no pareamento', async () => {
    const res = await WhatsAppIntegrationService.pairUserPhone({
      workspaceId: mockWorkspaceId,
      userId: 'user-1',
      phoneNumber: '123', // Inválido (curto demais)
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Número de telefone inválido');
  });

  // ─── GATE 9: COMPONENTE DA INTERFACE DO USUÁRIO ────────────────────────────

  it('deve renderizar o card com status, Callback URL e Verify Token da Meta', async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'workspace_whatsapp_integrations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'integ-1',
                  workspace_id: mockWorkspaceId,
                  phone_number_id: '10987654321',
                  status: 'active',
                  webhook_verify_token: 'token_seguro_wallet',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'whatsapp_usuarios_pareados') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === 'workspace_id') {
                return {
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'pair-1',
                        workspace_id: mockWorkspaceId,
                        user_id: 'u-1',
                        phone_number: '+5511999998888',
                        nome_contato: 'Carlos Loja',
                        role_no_workspace: 'member',
                        ativo: true,
                      },
                    ],
                    error: null,
                  }),
                  eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
                };
              }
              return {
                eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
              };
            }),
          }),
        };
      }
      if (table === 'whatsapp_mensagens_processadas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    }) as unknown as (table: string) => ReturnType<typeof supabase.from>);

    render(
      <QueryClientProvider client={queryClient}>
        <WhatsAppIntegrationCard workspaceId={mockWorkspaceId} />
      </QueryClientProvider>
    );

    expect(screen.getByText(/WhatsApp Business Cloud API/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Carlos Loja/i)).toBeInTheDocument();
      expect(screen.getByText(/\+5511999998888/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/token_seguro_wallet/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/https:\/\/hdeguzxkdvebdrrutbnx\.supabase\.co\/functions\/v1\/whatsapp-webhook/i)).toBeInTheDocument();
    });
  });
});
