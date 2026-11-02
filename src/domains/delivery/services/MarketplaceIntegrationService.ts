import { supabase } from '@/integrations/supabase/client';
import {
  DeliveryChannelStatus,
  MarketplaceConnectionState,
  ConnectorCapabilities,
} from '../types';
import { IFoodConnector } from '../connectors/ifood-connector';
import { NinetyNineConnector } from '../connectors/ninety-nine-connector';
import { ConnectorAuthPayload } from '../connectors/marketplace-connector';

export interface IntegrationEventLogItem {
  id: string;
  event_type: 'connect' | 'disconnect' | 'test' | 'sync' | 'error';
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
}

export interface MarketplaceChannelIntegration {
  id: string;
  workspace_id: string;
  channel_name: 'ifood' | '99food';
  display_name: string;
  is_active: boolean;
  status: DeliveryChannelStatus;
  connection_state: MarketplaceConnectionState;
  commission_rate: number;
  payment_fee_rate: number;
  fixed_fee: number;
  auto_accept_orders: boolean;
  store_id?: string;
  merchant_name?: string;
  client_id_preview?: string;
  has_client_secret: boolean;
  last_sync_at?: string | null;
  last_connection_test?: {
    success: boolean;
    state: MarketplaceConnectionState;
    message: string;
    tested_at: string;
    latency_ms: number;
  } | null;
  scopes?: string[];
  capabilities: ConnectorCapabilities;
  event_log: IntegrationEventLogItem[];
}

export interface SaveCredentialsParams {
  workspaceId: string;
  channelName: 'ifood' | '99food';
  merchantId: string;
  clientId?: string;
  preserveClientId?: boolean;
  clientSecret?: string;
  autoAcceptOrders?: boolean;
}

export interface TestConnectionParams {
  workspaceId: string;
  channelName: 'ifood' | '99food';
  merchantId?: string;
  clientId?: string;
  clientSecret?: string;
  isHomologated?: boolean;
}

export interface IntegrationActionResult {
  success: boolean;
  message: string;
  state?: MarketplaceConnectionState;
  latency_ms?: number;
  tested_at?: string;
  capabilities?: ConnectorCapabilities;
  error?: string;
}

export interface OnboardingGuide {
  channelName: 'ifood' | '99food';
  title: string;
  portalUrl: string;
  docsUrl: string;
  requirements: string[];
  steps: {
    step: number;
    title: string;
    description: string;
  }[];
}

const ifoodConnector = new IFoodConnector();
const ninetyNineConnector = new NinetyNineConnector();

function getConnector(channelName: 'ifood' | '99food') {
  return channelName === 'ifood' ? ifoodConnector : ninetyNineConnector;
}

export function maskSecretPreview(val?: string): string {
  if (!val) return '';
  if (val.length <= 8) return '********';
  return `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
}

export class MarketplaceIntegrationService {
  /**
   * Obtém as configurações e estados de integração dos marketplaces para o workspace,
   * omitindo terminantemente segredos em texto puro.
   */
  static async getIntegrations(workspaceId: string): Promise<MarketplaceChannelIntegration[]> {
    if (!workspaceId) return [];

    try {
      const { data, error } = await supabase
        .from('delivery_channels')
        .select(`
          id,
          workspace_id,
          channel_name,
          display_name,
          is_active,
          status,
          connection_state,
          commission_rate,
          payment_fee_rate,
          fixed_fee,
          auto_accept_orders,
          config,
          created_at,
          updated_at
        `)
        .eq('workspace_id', workspaceId)
        .in('channel_name', ['ifood', '99food']);

      if (error) {
        console.warn('[MarketplaceIntegrationService] Erro ao carregar integrações:', error);
      }

      const rows = data || [];
      const channels: Array<'ifood' | '99food'> = ['ifood', '99food'];

      return channels.map((chName) => {
        const found = rows.find((r) => r.channel_name === chName);
        const config = (found?.config && typeof found.config === 'object' ? found.config : {}) as Record<string, unknown>;
        const connector = getConnector(chName);

        const storeId = typeof config.merchant_id === 'string' ? config.merchant_id : undefined;
        const clientId = typeof config.client_id === 'string' ? config.client_id : undefined;
        const hasSecret = Boolean(config.has_client_secret || config.encrypted_secret);
        const isHomologated = found?.connection_state === 'homologated';

        const authPayload: ConnectorAuthPayload = {
          merchantId: storeId,
          clientId: clientId,
          clientSecret: hasSecret ? 'dummy-present-secret' : undefined,
          isHomologated,
        };

        const capabilities = connector.getCapabilities(authPayload);

        const lastTest = config.last_connection_test && typeof config.last_connection_test === 'object'
          ? (config.last_connection_test as MarketplaceChannelIntegration['last_connection_test'])
          : null;

        const eventLog = Array.isArray(config.event_log)
          ? (config.event_log as IntegrationEventLogItem[])
          : [];

        const connState = (found?.connection_state as MarketplaceConnectionState) || 'not_configured';

        return {
          id: found?.id || `virtual-${chName}`,
          workspace_id: workspaceId,
          channel_name: chName,
          display_name: found?.display_name || (chName === 'ifood' ? 'iFood Marketplace' : '99Food Restaurante'),
          is_active: found?.is_active ?? false,
          status: (found?.status as DeliveryChannelStatus) || 'pending_auth',
          connection_state: connState,
          commission_rate: typeof found?.commission_rate === 'number' ? Number(found.commission_rate) : 0,
          payment_fee_rate: typeof found?.payment_fee_rate === 'number' ? Number(found.payment_fee_rate) : 0,
          fixed_fee: typeof found?.fixed_fee === 'number' ? Number(found.fixed_fee) : 0,
          auto_accept_orders: found?.auto_accept_orders ?? false,
          store_id: storeId,
          merchant_name: typeof config.merchant_name === 'string' ? config.merchant_name : undefined,
          client_id_preview: clientId
            ? maskSecretPreview(clientId)
            : typeof config.client_id_preview === 'string'
            ? config.client_id_preview
            : undefined,
          has_client_secret: hasSecret,
          last_sync_at: typeof config.last_sync_at === 'string' ? config.last_sync_at : null,
          last_connection_test: lastTest,
          scopes: Array.isArray(config.scopes) ? (config.scopes as string[]) : ['orders:read', 'orders:status'],
          capabilities,
          event_log: eventLog,
        };
      });
    } catch (err) {
      console.error('[MarketplaceIntegrationService] Falha inesperada ao consultar integrações:', err);
      return [];
    }
  }

  /**
   * Salva credenciais de forma segura exclusivamente no cofre do servidor,
   * garantindo que segredos nunca sejam retornados ou expostos em texto puro.
   */
  static async saveCredentials(params: SaveCredentialsParams): Promise<IntegrationActionResult> {
    const { workspaceId, channelName, merchantId, clientId, preserveClientId, clientSecret, autoAcceptOrders } = params;

    if (!workspaceId) {
      return { success: false, message: 'Workspace ID é obrigatório.' };
    }
    if (!merchantId?.trim()) {
      return { success: false, message: 'Merchant ID / Shop ID é obrigatório.' };
    }
    if (!preserveClientId && !clientId?.trim()) {
      return { success: false, message: 'Client ID / App Key é obrigatório.' };
    }

    try {
      // Aciona Edge Function com cofre isolado de credenciais (fail-closed)
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('delivery-marketplace-vault', {
        body: {
          action: 'save_credentials',
          workspace_id: workspaceId,
          channel_name: channelName,
          merchant_id: merchantId.trim(),
          client_id: clientId?.trim() || undefined,
          preserve_client_id: Boolean(preserveClientId),
          client_secret: clientSecret?.trim() || undefined,
          auto_accept_orders: autoAcceptOrders,
        },
      });

      if (edgeError || !edgeData?.success) {
        const errorMsg =
          edgeData?.error ||
          'Serviço seguro de cofre indisponível no servidor. Ação não executada por segurança.';
        return {
          success: false,
          message: errorMsg,
          error: errorMsg,
        };
      }

      return {
        success: true,
        state: edgeData.state || 'credentials_saved',
        message: edgeData.message || 'Credenciais gravadas no cofre seguro do servidor.',
      };
    } catch {
      const msg = 'Serviço seguro de cofre indisponível no servidor. Ação não executada por segurança.';
      return { success: false, message: msg, error: msg };
    }
  }

  /**
   * Executa teste de conexão canônico exclusivamente pela Edge Function oficial.
   * Não emite falso positivo nem usa dados simulados no cliente.
   */
  static async testConnection(params: TestConnectionParams): Promise<IntegrationActionResult> {
    const { workspaceId, channelName, merchantId, clientId, clientSecret } = params;
    const startTime = Date.now();

    if (!workspaceId) {
      return { success: false, message: 'Workspace ID é obrigatório.' };
    }

    try {
      const connector = getConnector(channelName);

      // Chamada obrigatória e exclusiva à Edge Function oficial com cofre
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('delivery-marketplace-vault', {
        body: {
          action: 'test_connection',
          workspace_id: workspaceId,
          channel_name: channelName,
          merchant_id: merchantId?.trim() || undefined,
          client_id: clientId?.trim() || undefined,
          client_secret: clientSecret?.trim() || undefined,
        },
      });

      if (edgeError || !edgeData) {
        const errorMsg =
          edgeData?.message ||
          'Serviço seguro de cofre indisponível no servidor. Ação não executada por segurança.';
        return {
          success: false,
          state: 'error',
          message: errorMsg,
          latency_ms: Date.now() - startTime,
          tested_at: new Date().toISOString(),
          error: errorMsg,
        };
      }

      const latency = typeof edgeData.latency_ms === 'number' ? edgeData.latency_ms : Date.now() - startTime;
      const isHomologated = edgeData.state === 'homologated';

      return {
        success: Boolean(edgeData.success),
        state: (edgeData.state as MarketplaceConnectionState) || (isHomologated ? 'homologated' : 'credentials_saved'),
        message: edgeData.message || (isHomologated ? 'Conexão e loja homologadas com sucesso.' : 'Falha na conexão.'),
        latency_ms: latency,
        tested_at: new Date().toISOString(),
        capabilities: connector.getCapabilities({
          merchantId,
          clientId,
          isHomologated,
        }),
      };
    } catch {
      const latencyMs = Date.now() - startTime;
      const msg = 'Serviço seguro de cofre indisponível no servidor. Ação não executada por segurança.';
      return {
        success: false,
        state: 'error',
        message: msg,
        latency_ms: latencyMs,
        tested_at: new Date().toISOString(),
        error: msg,
      };
    }
  }

  /**
   * Desconecta o canal e purga credenciais confidenciais do cofre seguro.
   */
  static async disconnectChannel(
    workspaceId: string,
    channelName: 'ifood' | '99food'
  ): Promise<IntegrationActionResult> {
    if (!workspaceId) {
      return { success: false, message: 'Workspace ID é obrigatório.' };
    }

    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('delivery-marketplace-vault', {
        body: {
          action: 'disconnect',
          workspace_id: workspaceId,
          channel_name: channelName,
        },
      });

      if (edgeError || !edgeData?.success) {
        const msg = edgeError?.message || edgeData?.error || 'Falha ao desconectar canal no servidor.';
        return { success: false, message: msg, error: msg };
      }

      return {
        success: true,
        state: 'disconnected',
        message: `Canal ${channelName === 'ifood' ? 'iFood' : '99Food'} desconectado com sucesso e credenciais removidas do cofre.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao desconectar canal.';
      return { success: false, message: msg, error: msg };
    }
  }

  /**
   * Retorna os passos canônicos de homologação e onboarding oficial.
   */
  static getOnboardingGuide(channelName: 'ifood' | '99food'): OnboardingGuide {
    if (channelName === 'ifood') {
      return {
        channelName: 'ifood',
        title: 'Guia Oficial de Homologação — iFood Open API',
        portalUrl: 'https://developer.ifood.com.br',
        docsUrl: 'https://developer.ifood.com.br/docs/guides/order-management',
        requirements: [
          'Conta ativa no Portal do Parceiro iFood (Merchant).',
          'Cadastro aprovado no Portal de Desenvolvedores iFood (developer.ifood.com.br).',
          'Aplicação criada com os escopos `orders:read`, `orders:status` e `catalog:read`.',
          'Client ID e Client Secret gerados.',
          'Merchant ID da loja Rodo Point obtido no Portal do Parceiro.',
        ],
        steps: [
          {
            step: 1,
            title: 'Crie a Aplicação no Portal iFood Developer',
            description: 'Acesse developer.ifood.com.br, faça login com a conta de desenvolvedor e crie um novo App do tipo "Integração Própria / Standard".',
          },
          {
            step: 2,
            title: 'Gere Client ID e Client Secret',
            description: 'Na aba de credenciais do App no iFood, gere o Client ID e Client Secret e copie os valores com atenção.',
          },
          {
            step: 3,
            title: 'Cadastre no Wallet App',
            description: 'Abra a aba de Integrações no Wallet App, clique em "Conectar API" do iFood e informe o Merchant ID, Client ID e Client Secret.',
          },
          {
            step: 4,
            title: 'Autorize o Merchant no iFood',
            description: 'No Portal de Desenvolvedores do iFood, solicite a autorização da loja Rodo Point para permitir que o Wallet App receba pedidos e atualize o KDS.',
          },
          {
            step: 5,
            title: 'Valide no Simulador e KDS',
            description: 'Clique em "Testar Conexão" para confirmar que o status mudou para "Homologado" e os pedidos cheguem em tempo real.',
          },
        ],
      };
    }

    return {
      channelName: '99food',
      title: 'Guia Oficial de Homologação — 99Food Open Platform v2',
      portalUrl: 'https://developer-food.99app.com',
      docsUrl: 'https://developer-food.99app.com/docs',
      requirements: [
        'Restaurante credenciado e ativo na 99Food.',
        'Acesso ao Portal de Desenvolvedores 99Food (developer-food.99app.com).',
        'App Key e App Secret gerados no painel de parceiros.',
        'Shop ID numérico da loja obtido no Portal do Restaurante 99Food.',
      ],
      steps: [
        {
          step: 1,
          title: 'Cadastro no 99Food Open Platform',
          description: 'Acesse developer-food.99app.com e solicite o perfil de desenvolvedor ou franqueado para acesso à API v2.',
        },
        {
          step: 2,
          title: 'Criação do App e Chaves',
          description: 'Crie uma aplicação interna e anote a App Key e o App Secret gerados.',
        },
        {
          step: 3,
          title: 'Configuração do Shop ID',
          description: 'No Wallet App, insira o Shop ID da loja Rodo Point e as credenciais fornecidas pela 99Food.',
        },
        {
          step: 4,
          title: 'Homologação e Testes Operacionais',
          description: 'Envie pedido de homologação no portal 99Food e execute o teste de conexão no Wallet App.',
        },
        {
          step: 5,
          title: 'Ativação do KDS',
          description: 'Assim que homologado, a recepção de pedidos e a confirmação para a cozinha estarão 100% operacionais.',
        },
      ],
    };
  }
}
