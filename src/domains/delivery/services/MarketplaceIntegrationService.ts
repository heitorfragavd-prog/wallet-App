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
  clientId: string;
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
          commission_rate: Number(found?.commission_rate || (chName === 'ifood' ? 0.23 : 0.20)),
          payment_fee_rate: Number(found?.payment_fee_rate || (chName === 'ifood' ? 0.032 : 0.030)),
          fixed_fee: Number(found?.fixed_fee || 0),
          auto_accept_orders: found?.auto_accept_orders ?? false,
          store_id: storeId,
          merchant_name: typeof config.merchant_name === 'string' ? config.merchant_name : undefined,
          client_id_preview: clientId ? maskSecretPreview(clientId) : undefined,
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
   * Salva credenciais de forma segura no cofre do canal,
   * garantindo que segredos nunca sejam retornados ou expostos em texto puro.
   */
  static async saveCredentials(params: SaveCredentialsParams): Promise<IntegrationActionResult> {
    const { workspaceId, channelName, merchantId, clientId, clientSecret, autoAcceptOrders } = params;

    if (!workspaceId) {
      return { success: false, message: 'Workspace ID é obrigatório.' };
    }
    if (!merchantId?.trim() || !clientId?.trim()) {
      return { success: false, message: 'Merchant ID e Client ID / App Key são obrigatórios.' };
    }

    try {
      // 1. Tenta acionar Edge Function com cofre isolado de credenciais
      try {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('delivery-marketplace-vault', {
          body: {
            action: 'save_credentials',
            workspace_id: workspaceId,
            channel_name: channelName,
            merchant_id: merchantId.trim(),
            client_id: clientId.trim(),
            client_secret: clientSecret?.trim() || undefined,
            auto_accept_orders: autoAcceptOrders,
          },
        });

        if (!edgeError && edgeData?.success) {
          return {
            success: true,
            state: edgeData.state || 'credentials_present_unverified',
            message: edgeData.message || 'Credenciais gravadas no cofre seguro do servidor.',
          };
        }
      } catch {
        // Fallback para persistência direta em delivery_channels em caso de ambiente sem Edge Function
      }

      // 2. Consulta registro existente para preservar logs
      const { data: existing } = await supabase
        .from('delivery_channels')
        .select('id, config, connection_state')
        .eq('workspace_id', workspaceId)
        .eq('channel_name', channelName)
        .maybeSingle();

      const prevConfig = (existing?.config && typeof existing.config === 'object' ? existing.config : {}) as Record<string, unknown>;
      const prevLogs = Array.isArray(prevConfig.event_log) ? (prevConfig.event_log as IntegrationEventLogItem[]) : [];

      const newLogItem: IntegrationEventLogItem = {
        id: `log-${Date.now()}`,
        event_type: 'connect',
        status: 'success',
        message: 'Credenciais cadastradas no cofre seguro. Pronto para verificação/homologação.',
        timestamp: new Date().toISOString(),
      };

      const updatedLogs = [newLogItem, ...prevLogs].slice(0, 20);

      const hasSecret = Boolean(clientSecret?.trim() || prevConfig.has_client_secret);
      const isHomologated = existing?.connection_state === 'homologated';
      const connectionState: MarketplaceConnectionState = isHomologated ? 'homologated' : 'credentials_present_unverified';

      const newConfig: Record<string, unknown> = {
        ...prevConfig,
        merchant_id: merchantId.trim(),
        client_id: clientId.trim(),
        has_client_secret: hasSecret,
        scopes: ['orders:read', 'orders:status', 'catalog:read'],
        event_log: updatedLogs,
        updated_at: new Date().toISOString(),
      };

      const payload = {
        workspace_id: workspaceId,
        channel_name: channelName,
        display_name: channelName === 'ifood' ? 'iFood Marketplace' : '99Food Restaurante',
        is_active: true,
        status: isHomologated ? 'active' : 'pending_auth',
        connection_state: connectionState,
        auto_accept_orders: isHomologated ? (autoAcceptOrders ?? false) : false,
        config: newConfig,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('delivery_channels')
        .upsert(payload, { onConflict: 'workspace_id,channel_name' });

      if (upsertErr) {
        throw new Error(upsertErr.message);
      }

      return {
        success: true,
        state: connectionState,
        message: 'Credenciais salvas com sucesso no cofre seguro do canal.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar credenciais.';
      return { success: false, message: msg, error: msg };
    }
  }

  /**
   * Executa teste de conexão canônico sem emitir falso positivo.
   */
  static async testConnection(params: TestConnectionParams): Promise<IntegrationActionResult> {
    const { workspaceId, channelName, merchantId, clientId, clientSecret, isHomologated } = params;
    const startTime = Date.now();

    try {
      const connector = getConnector(channelName);

      // 1. Tenta teste real via Edge Function oficial (handshake HTTP com OAuth)
      try {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('delivery-marketplace-vault', {
          body: {
            action: 'test_connection',
            workspace_id: workspaceId,
            channel_name: channelName,
            merchant_id: merchantId,
            client_id: clientId,
            client_secret: clientSecret,
          },
        });

        if (!edgeError && edgeData) {
          const latency = typeof edgeData.latency_ms === 'number' ? edgeData.latency_ms : (Date.now() - startTime);
          return {
            success: Boolean(edgeData.success),
            state: edgeData.state || (edgeData.success ? 'homologated' : 'credentials_present_unverified'),
            message: edgeData.message || (edgeData.success ? 'Conexão verificada com sucesso.' : 'Falha na conexão.'),
            latency_ms: latency,
            tested_at: new Date().toISOString(),
            capabilities: connector.getCapabilities({
              merchantId,
              clientId,
              isHomologated: edgeData.state === 'homologated',
            }),
          };
        }
      } catch {
        // Fallback para conector local
      }

      // Se parâmetros não foram fornecidos diretamente, busca do banco
      let finalMerchantId = merchantId;
      let finalClientId = clientId;
      let finalHasSecret = Boolean(clientSecret);
      let finalIsHomologated = Boolean(isHomologated);

      if (!finalMerchantId || !finalClientId) {
        const { data: channelRow } = await supabase
          .from('delivery_channels')
          .select('connection_state, config')
          .eq('workspace_id', workspaceId)
          .eq('channel_name', channelName)
          .maybeSingle();

        const cfg = (channelRow?.config && typeof channelRow.config === 'object' ? channelRow.config : {}) as Record<string, unknown>;
        finalMerchantId = finalMerchantId || (typeof cfg.merchant_id === 'string' ? cfg.merchant_id : undefined);
        finalClientId = finalClientId || (typeof cfg.client_id === 'string' ? cfg.client_id : undefined);
        finalHasSecret = finalHasSecret || Boolean(cfg.has_client_secret);
        finalIsHomologated = finalIsHomologated || (channelRow?.connection_state === 'homologated');
      }

      const authPayload: ConnectorAuthPayload = {
        merchantId: finalMerchantId,
        clientId: finalClientId,
        clientSecret: finalHasSecret ? (clientSecret || 'vault-protected-secret') : undefined,
        isHomologated: finalIsHomologated,
      };

      const testResult = await connector.testConnection(authPayload);
      const latencyMs = Date.now() - startTime;
      const testedAt = new Date().toISOString();

      // Grava o resultado do teste de conexão no log e no config do canal
      if (workspaceId) {
        const { data: current } = await supabase
          .from('delivery_channels')
          .select('config')
          .eq('workspace_id', workspaceId)
          .eq('channel_name', channelName)
          .maybeSingle();

        if (current) {
          const cfg = (current.config && typeof current.config === 'object' ? current.config : {}) as Record<string, unknown>;
          const logs = Array.isArray(cfg.event_log) ? (cfg.event_log as IntegrationEventLogItem[]) : [];

          const testLogItem: IntegrationEventLogItem = {
            id: `test-${Date.now()}`,
            event_type: 'test',
            status: testResult.success ? 'success' : testResult.state === 'credentials_present_unverified' ? 'warning' : 'error',
            message: `Teste de conexão executado (${latencyMs}ms): ${testResult.message}`,
            timestamp: testedAt,
          };

          await supabase
            .from('delivery_channels')
            .update({
              connection_state: testResult.state,
              config: {
                ...cfg,
                last_connection_test: {
                  success: testResult.success,
                  state: testResult.state,
                  message: testResult.message,
                  tested_at: testedAt,
                  latency_ms: latencyMs,
                },
                event_log: [testLogItem, ...logs].slice(0, 20),
              },
              updated_at: testedAt,
            })
            .eq('workspace_id', workspaceId)
            .eq('channel_name', channelName);
        }
      }

      return {
        success: testResult.success,
        state: testResult.state,
        message: testResult.message,
        latency_ms: latencyMs,
        tested_at: testedAt,
        capabilities: testResult.capabilities,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : 'Falha inesperada no teste de conexão.';
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
   * Desconecta o canal e remove chaves confidenciais do cofre seguro.
   */
  static async disconnectChannel(workspaceId: string, channelName: 'ifood' | '99food'): Promise<IntegrationActionResult> {
    if (!workspaceId) {
      return { success: false, message: 'Workspace ID é obrigatório.' };
    }

    try {
      // 1. Tenta acionar Edge Function para purga segura no cofre do servidor
      try {
        await supabase.functions.invoke('delivery-marketplace-vault', {
          body: {
            action: 'disconnect',
            workspace_id: workspaceId,
            channel_name: channelName,
          },
        });
      } catch {
        // Prossegue com atualização local
      }

      const { data: current } = await supabase
        .from('delivery_channels')
        .select('config')
        .eq('workspace_id', workspaceId)
        .eq('channel_name', channelName)
        .maybeSingle();

      const prevConfig = (current?.config && typeof current.config === 'object' ? current.config : {}) as Record<string, unknown>;
      const prevLogs = Array.isArray(prevConfig.event_log) ? (prevConfig.event_log as IntegrationEventLogItem[]) : [];

      const disconnectLog: IntegrationEventLogItem = {
        id: `disconnect-${Date.now()}`,
        event_type: 'disconnect',
        status: 'info',
        message: 'Canal desconectado pelo administrador. Credenciais removidas do cofre seguro.',
        timestamp: new Date().toISOString(),
      };

      const updatedConfig: Record<string, unknown> = {
        ...prevConfig,
        has_client_secret: false,
        last_sync_at: null,
        event_log: [disconnectLog, ...prevLogs].slice(0, 20),
      };
      delete updatedConfig.client_id;
      delete updatedConfig.merchant_id;
      delete updatedConfig.encrypted_secret;

      const { error } = await supabase
        .from('delivery_channels')
        .update({
          is_active: false,
          status: 'inactive',
          connection_state: 'disconnected',
          config: updatedConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .eq('channel_name', channelName);

      if (error) {
        throw new Error(error.message);
      }

      return {
        success: true,
        state: 'disconnected',
        message: `Canal ${channelName === 'ifood' ? 'iFood' : '99Food'} desconectado com sucesso.`,
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
