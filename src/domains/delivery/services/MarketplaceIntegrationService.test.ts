import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MarketplaceIntegrationService,
  maskSecretPreview,
} from './MarketplaceIntegrationService';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

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
          connection_state: 'credentials_saved',
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

      vi.mocked(supabase.from).mockReturnValue({
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
      expect(ifood.connection_state).toBe('credentials_saved');
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
      expect(res2.message).toContain('Merchant ID');
    });

    it('persiste credenciais exclusivamente via Edge Function de cofre seguro', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          state: 'credentials_saved',
          message: 'Credenciais armazenadas com criptografia AES-256-GCM no cofre seguro.',
        },
        error: null,
      });

      const res = await MarketplaceIntegrationService.saveCredentials({
        workspaceId: 'ws-1',
        channelName: 'ifood',
        merchantId: 'rodo-ifood-99',
        clientId: 'client-key-8888',
        clientSecret: 'secret-xyz',
        autoAcceptOrders: false,
      });

      expect(res.success).toBe(true);
      expect(res.state).toBe('credentials_saved');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('delivery-marketplace-vault', {
        body: expect.objectContaining({
          action: 'save_credentials',
          workspace_id: 'ws-1',
          channel_name: 'ifood',
          merchant_id: 'rodo-ifood-99',
          client_id: 'client-key-8888',
          preserve_client_id: false,
          client_secret: 'secret-xyz',
        }),
      });
    });

    it('fail-closed: falha de forma segura se a Edge Function estiver indisponível sem fallback inseguro', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: new Error('Edge Function offline'),
      });

      const res = await MarketplaceIntegrationService.saveCredentials({
        workspaceId: 'ws-1',
        channelName: 'ifood',
        merchantId: 'rodo-ifood-99',
        clientId: 'client-key-8888',
        clientSecret: 'secret-xyz',
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain('Serviço seguro de cofre indisponível no servidor');
    });
  });

  describe('testConnection', () => {
    it('executa handshake estritamente via Edge Function sem emitir falso positivo no cliente', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          state: 'homologated',
          latency_ms: 250,
          message: 'Conexão e loja homologadas com sucesso no iFood em 250ms.',
        },
        error: null,
      });

      const res = await MarketplaceIntegrationService.testConnection({
        workspaceId: 'ws-1',
        channelName: 'ifood',
        merchantId: 'rodo-ifood-prod',
        clientId: 'client-prod-id',
      });

      expect(res.success).toBe(true);
      expect(res.state).toBe('homologated');
      expect(res.latency_ms).toBe(250);
      expect(res.message).toContain('homologadas com sucesso');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('delivery-marketplace-vault', {
        body: expect.objectContaining({
          action: 'test_connection',
          workspace_id: 'ws-1',
          channel_name: 'ifood',
        }),
      });
    });

    it('retorna merchant_auth_pending quando o parceiro não autorizou o app', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: false,
          state: 'merchant_auth_pending',
          latency_ms: 310,
          message: 'Credenciais autenticadas no iFood, porém a loja ainda não autorizou o aplicativo no Portal do Parceiro.',
        },
        error: null,
      });

      const res = await MarketplaceIntegrationService.testConnection({
        workspaceId: 'ws-1',
        channelName: 'ifood',
      });

      expect(res.success).toBe(false);
      expect(res.state).toBe('merchant_auth_pending');
      expect(res.message).toContain('loja ainda não autorizou');
    });

    it('retorna homologation_pending para 99Food enquanto aguarda liberação comercial', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: false,
          state: 'homologation_pending',
          latency_ms: 180,
          message: 'Credenciais salvas e autenticadas. Aguardando homologação oficial da loja pela 99Food.',
        },
        error: null,
      });

      const res = await MarketplaceIntegrationService.testConnection({
        workspaceId: 'ws-1',
        channelName: '99food',
      });

      expect(res.success).toBe(false);
      expect(res.state).toBe('homologation_pending');
      expect(res.message).toContain('Aguardando homologação oficial');
    });

    it('fail-closed: falha com erro seguro se o cofre remoto falhar', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: new Error('Network timeout'),
      });

      const res = await MarketplaceIntegrationService.testConnection({
        workspaceId: 'ws-1',
        channelName: 'ifood',
      });

      expect(res.success).toBe(false);
      expect(res.state).toBe('error');
      expect(res.message).toContain('Serviço seguro de cofre indisponível no servidor');
    });
  });

  describe('disconnectChannel', () => {
    it('desconecta via Edge Function e purga credenciais com sucesso', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          message: 'Canal desconectado com sucesso e credenciais removidas do cofre.',
        },
        error: null,
      });

      const res = await MarketplaceIntegrationService.disconnectChannel('ws-1', 'ifood');

      expect(res.success).toBe(true);
      expect(res.state).toBe('disconnected');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('delivery-marketplace-vault', {
        body: {
          action: 'disconnect',
          workspace_id: 'ws-1',
          channel_name: 'ifood',
        },
      });
    });
  });
});
