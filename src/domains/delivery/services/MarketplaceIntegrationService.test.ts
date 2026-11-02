import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MarketplaceIntegrationService,
  maskSecretPreview,
} from './MarketplaceIntegrationService';
import { supabase } from '@/integrations/supabase/client';

describe('MarketplaceIntegrationService — Testes Canônicos do Hub de Canais (Gate 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('maskSecretPreview', () => {
    it('retorna string vazia quando não fornecido', () => {
      expect(maskSecretPreview('')).toBe('');
      expect(maskSecretPreview(undefined)).toBe('');
    });

    it('mascara strings curtas com 8 asteriscos', () => {
      expect(maskSecretPreview('12345')).toBe('********');
    });

    it('preserva os 4 primeiros e 4 últimos caracteres em chaves longas', () => {
      const masked = maskSecretPreview('client-id-rodo-point-secret-9988');
      expect(masked.startsWith('clie')).toBe(true);
      expect(masked.endsWith('9988')).toBe(true);
      expect(masked).toContain('••••••••');
    });
  });

  describe('getOnboardingGuide', () => {
    it('fornece guia completo com links oficiais do iFood', () => {
      const guide = MarketplaceIntegrationService.getOnboardingGuide('ifood');
      expect(guide.portalUrl).toBe('https://developer.ifood.com.br');
      expect(guide.requirements.length).toBeGreaterThan(3);
      expect(guide.steps).toHaveLength(5);
      expect(guide.steps[0].title).toContain('iFood Developer');
    });

    it('fornece guia completo com links oficiais da 99Food', () => {
      const guide = MarketplaceIntegrationService.getOnboardingGuide('99food');
      expect(guide.portalUrl).toBe('https://developer-food.99app.com');
      expect(guide.requirements.length).toBeGreaterThan(2);
      expect(guide.steps).toHaveLength(5);
      expect(guide.steps[0].title).toContain('99Food Open Platform');
    });
  });

  describe('getIntegrations', () => {
    it('retorna lista estruturada para ifood e 99food omitindo segredos e mascarando client_id', async () => {
      const mockRows = [
        {
          id: 'ch-ifood-1',
          workspace_id: 'ws-rodo-1',
          channel_name: 'ifood',
          display_name: 'iFood Marketplace',
          is_active: true,
          status: 'pending_auth',
          connection_state: 'credentials_present_unverified',
          commission_rate: 0.23,
          payment_fee_rate: 0.032,
          fixed_fee: 0,
          auto_accept_orders: false,
          config: {
            merchant_id: 'merchant-rodo-123',
            client_id: 'ifood-client-id-abc-1234',
            has_client_secret: true,
            scopes: ['orders:read', 'orders:status'],
            event_log: [
              {
                id: 'log-1',
                event_type: 'connect',
                status: 'success',
                message: 'Conectado',
                timestamp: '2026-11-02T10:00:00Z',
              },
            ],
          },
        },
      ];

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      } as unknown as ReturnType<typeof supabase.from>);

      const integrations = await MarketplaceIntegrationService.getIntegrations('ws-rodo-1');

      expect(integrations).toHaveLength(2);

      const ifood = integrations.find((i) => i.channel_name === 'ifood')!;
      expect(ifood.store_id).toBe('merchant-rodo-123');
      expect(ifood.has_client_secret).toBe(true);
      expect(ifood.client_id_preview).toContain('••••••••');
      // Garante que o client_id original não vaza em texto puro na preview
      expect(ifood.client_id_preview).not.toBe('ifood-client-id-abc-1234');
      expect(ifood.connection_state).toBe('credentials_present_unverified');
      expect(ifood.capabilities.can_fetch_orders.status).toBe('awaiting_homologation');
      expect(ifood.event_log).toHaveLength(1);

      const ninetyNine = integrations.find((i) => i.channel_name === '99food')!;
      expect(ninetyNine.connection_state).toBe('not_configured');
      expect(ninetyNine.has_client_secret).toBe(false);
      expect(ninetyNine.capabilities.can_fetch_orders.status).toBe('unauthorized');
    });
  });

  describe('saveCredentials', () => {
    it('rejeita chamada sem workspaceId ou sem chaves obrigatórias', async () => {
      const res1 = await MarketplaceIntegrationService.saveCredentials({
        workspaceId: '',
        channelName: 'ifood',
        merchantId: 'm-1',
        clientId: 'c-1',
      });
      expect(res1.success).toBe(false);
      expect(res1.message).toContain('Workspace ID');

      const res2 = await MarketplaceIntegrationService.saveCredentials({
        workspaceId: 'ws-1',
        channelName: 'ifood',
        merchantId: '',
        clientId: 'c-1',
      });
      expect(res2.success).toBe(false);
      expect(res2.message).toContain('obrigatórios');
    });

    it('persiste credenciais com state credentials_present_unverified e bloqueia auto-aceite sem homologação', async () => {
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: { id: 'ch-1', config: { event_log: [] }, connection_state: 'not_configured' },
      });
      const upsertMock = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: maybeSingleMock,
        upsert: upsertMock,
      } as unknown as ReturnType<typeof supabase.from>);

      const res = await MarketplaceIntegrationService.saveCredentials({
        workspaceId: 'ws-1',
        channelName: 'ifood',
        merchantId: 'rodo-ifood-99',
        clientId: 'client-key-8888',
        clientSecret: 'secret-xyz',
        autoAcceptOrders: true,
      });

      expect(res.success).toBe(true);
      expect(res.state).toBe('credentials_present_unverified');
      // Trava de segurança: auto-aceite NÃO pode ser ativado sem homologação confirmada
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          channel_name: 'ifood',
          connection_state: 'credentials_present_unverified',
          auto_accept_orders: false,
          config: expect.objectContaining({
            merchant_id: 'rodo-ifood-99',
            client_id: 'client-key-8888',
            has_client_secret: true,
          }),
        }),
        expect.objectContaining({ onConflict: 'workspace_id,channel_name' })
      );
    });

    it('permite auto-aceite quando o canal já se encontra oficialmente homologado', async () => {
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: { id: 'ch-1', config: { event_log: [] }, connection_state: 'homologated' },
      });
      const upsertMock = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: maybeSingleMock,
        upsert: upsertMock,
      } as unknown as ReturnType<typeof supabase.from>);

      const res = await MarketplaceIntegrationService.saveCredentials({
        workspaceId: 'ws-1',
        channelName: 'ifood',
        merchantId: 'rodo-ifood-99',
        clientId: 'client-key-8888',
        autoAcceptOrders: true,
      });

      expect(res.success).toBe(true);
      expect(res.state).toBe('homologated');
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          channel_name: 'ifood',
          connection_state: 'homologated',
          auto_accept_orders: true,
        }),
        expect.objectContaining({ onConflict: 'workspace_id,channel_name' })
      );
    });
  });

  describe('testConnection', () => {
    it('identifica canal não configurado quando faltam chaves', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      } as unknown as ReturnType<typeof supabase.from>);

      const res = await MarketplaceIntegrationService.testConnection({
        workspaceId: 'ws-1',
        channelName: 'ifood',
      });

      expect(res.success).toBe(false);
      expect(res.state).toBe('not_configured');
      expect(res.message).toContain('obrigatórios ausentes');
    });

    it('valida credenciais cadastradas sem homologação ativa sem gerar falso positivo', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            connection_state: 'credentials_present_unverified',
            config: {
              merchant_id: 'rodo-99-store',
              client_id: 'app-key-99',
              has_client_secret: true,
            },
          },
        }),
        update: vi.fn().mockReturnThis(),
      } as unknown as ReturnType<typeof supabase.from>);

      const res = await MarketplaceIntegrationService.testConnection({
        workspaceId: 'ws-1',
        channelName: '99food',
      });

      expect(res.success).toBe(false);
      expect(res.state).toBe('credentials_present_unverified');
      expect(res.message).toContain('A homologação oficial requer aprovação');
      expect(res.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('confirma conexão homologada quando isHomologated é verdadeiro', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            connection_state: 'homologated',
            config: {
              merchant_id: 'rodo-ifood-prod',
              client_id: 'client-prod-id',
              has_client_secret: true,
            },
          },
        }),
        update: vi.fn().mockReturnThis(),
      } as unknown as ReturnType<typeof supabase.from>);

      const res = await MarketplaceIntegrationService.testConnection({
        workspaceId: 'ws-1',
        channelName: 'ifood',
        isHomologated: true,
      });

      expect(res.success).toBe(true);
      expect(res.state).toBe('homologated');
      expect(res.message).toContain('homologada com o iFood');
    });
  });

  describe('disconnectChannel', () => {
    it('remove chaves confidenciais e define status como desconectado', async () => {
      const updateMock = vi.fn().mockReturnThis();

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            config: {
              merchant_id: 'rodo-1',
              client_id: 'key-1',
              has_client_secret: true,
              event_log: [],
            },
          },
        }),
        update: updateMock,
      } as unknown as ReturnType<typeof supabase.from>);

      const res = await MarketplaceIntegrationService.disconnectChannel('ws-1', 'ifood');

      expect(res.success).toBe(true);
      expect(res.state).toBe('disconnected');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: false,
          status: 'inactive',
          connection_state: 'disconnected',
          config: expect.objectContaining({
            has_client_secret: false,
            event_log: expect.arrayContaining([
              expect.objectContaining({ event_type: 'disconnect' }),
            ]),
          }),
        })
      );
    });
  });
});
