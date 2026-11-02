import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import {
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Copy,
  Check,
  Settings,
  HelpCircle,
  Unplug,
  Info,
  Radio,
} from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import {
  MarketplaceIntegrationService,
  MarketplaceChannelIntegration,
  IntegrationActionResult,
  OnboardingGuide,
} from '../services/MarketplaceIntegrationService';
import { MarketplaceConnectionState } from '../types';

interface MarketplaceConnectionsTabProps {
  workspaceId: string;
  onRefreshChannels?: () => void;
}

export const MarketplaceConnectionsTab: React.FC<MarketplaceConnectionsTabProps> = ({
  workspaceId,
  onRefreshChannels,
}) => {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<MarketplaceChannelIntegration[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [testingChannel, setTestingChannel] = useState<'ifood' | '99food' | null>(null);
  const [_testResult, setTestResult] = useState<{ channel: string; result: IntegrationActionResult } | null>(null);

  // Modais de ação
  const [credentialsModalChannel, setCredentialsModalChannel] = useState<'ifood' | '99food' | null>(null);
  const [guideModalChannel, setGuideModalChannel] = useState<'ifood' | '99food' | null>(null);
  const [disconnectModalChannel, setDisconnectModalChannel] = useState<'ifood' | '99food' | null>(null);

  // Formulário de credenciais
  const [formMerchantId, setFormMerchantId] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formClientSecret, setFormClientSecret] = useState('');
  const [formAutoAccept, setFormAutoAccept] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);

  // Copiado para clipboard
  const [copiedStoreId, setCopiedStoreId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await MarketplaceIntegrationService.getIntegrations(workspaceId);
      setIntegrations(data);
    } catch (err) {
      console.warn('[MarketplaceConnectionsTab] Erro ao carregar integrações:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Abre modal de credenciais preenchendo dados existentes se houver
  const handleOpenCredentialsModal = (item: MarketplaceChannelIntegration) => {
    setCredentialsModalChannel(item.channel_name);
    setFormMerchantId(item.store_id || '');
    setFormClientId(''); // Não preenche input editável com preview mascarado
    setFormClientSecret('');
    setFormAutoAccept(item.auto_accept_orders && item.connection_state === 'homologated');
  };

  // Salva credenciais com segurança no cofre
  const handleSaveCredentials = async () => {
    if (!workspaceId || !credentialsModalChannel) return;
    const currentChannel = integrations.find((i) => i.channel_name === credentialsModalChannel);
    const hasExistingClientId = Boolean(currentChannel?.client_id_preview);

    if (!formMerchantId.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Informe o ID da Loja (Merchant ID / Shop ID).',
        variant: 'destructive',
      });
      return;
    }
    if (!formClientId.trim() && !hasExistingClientId) {
      toast({
        title: 'Campo obrigatório',
        description: 'Informe a Chave da Aplicação (Client ID / App Key).',
        variant: 'destructive',
      });
      return;
    }

    setSavingCredentials(true);
    try {
      const res = await MarketplaceIntegrationService.saveCredentials({
        workspaceId,
        channelName: credentialsModalChannel,
        merchantId: formMerchantId.trim(),
        clientId: formClientId.trim() || 'KEEP_EXISTING',
        clientSecret: formClientSecret.trim() || undefined,
        autoAcceptOrders: formAutoAccept,
      });

      if (res.success) {
        toast({
          title: 'Credenciais Armazenadas com Sucesso',
          description: `Canal ${credentialsModalChannel === 'ifood' ? 'iFood' : '99Food'} salvo no cofre seguro. Execute o teste de conexão para verificar a homologação.`,
        });
        setCredentialsModalChannel(null);
        await loadData();
        if (onRefreshChannels) onRefreshChannels();
      } else {
        toast({
          title: 'Erro ao salvar credenciais',
          description: res.message,
          variant: 'destructive',
        });
      }
    } finally {
      setSavingCredentials(false);
    }
  };

  // Testa conexão sem falso positivo
  const handleTestConnection = async (channelName: 'ifood' | '99food') => {
    if (!workspaceId) return;
    setTestingChannel(channelName);
    setTestResult(null);

    try {
      const res = await MarketplaceIntegrationService.testConnection({
        workspaceId,
        channelName,
      });

      setTestResult({ channel: channelName, result: res });

      if (res.success) {
        toast({
          title: 'Conexão Verificada com Sucesso',
          description: res.message,
        });
      } else if (res.state === 'credentials_present_unverified') {
        toast({
          title: 'Credenciais Cadastradas (Aguardando Homologação)',
          description: res.message,
        });
      } else {
        toast({
          title: 'Falha no Teste de Conexão',
          description: res.message,
          variant: 'destructive',
        });
      }
      await loadData();
      if (onRefreshChannels) onRefreshChannels();
    } finally {
      setTestingChannel(null);
    }
  };

  // Desconecta canal com confirmação
  const handleConfirmDisconnect = async () => {
    if (!workspaceId || !disconnectModalChannel) return;

    try {
      const res = await MarketplaceIntegrationService.disconnectChannel(
        workspaceId,
        disconnectModalChannel
      );

      if (res.success) {
        toast({
          title: 'Canal Desconectado',
          description: res.message,
        });
        setDisconnectModalChannel(null);
        await loadData();
        if (onRefreshChannels) onRefreshChannels();
      } else {
        toast({
          title: 'Erro ao desconectar',
          description: res.message,
          variant: 'destructive',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao desconectar.';
      toast({
        title: 'Erro ao desconectar',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const handleCopyStoreId = (storeId?: string) => {
    if (!storeId) return;
    navigator.clipboard.writeText(storeId);
    setCopiedStoreId(storeId);
    setTimeout(() => setCopiedStoreId(null), 2500);
    toast({
      title: 'ID Copiado',
      description: 'Identificador da loja copiado para a área de transferência.',
    });
  };

  // Renderizador de badge de status
  const renderStatusBadge = (state: MarketplaceConnectionState) => {
    switch (state) {
      case 'homologated':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Homologado
          </Badge>
        );
      case 'credentials_present_unverified':
      case 'awaiting_homologation':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 text-[11px]">
            <Clock className="w-3.5 h-3.5" />
            Aguardando homologação
          </Badge>
        );
      case 'authenticating':
      case 'authenticated':
        return (
          <Badge className="bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1 text-[11px]">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Credenciais cadastradas
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge variant="outline" className="border-slate-700 text-slate-400 bg-slate-900/60 flex items-center gap-1 text-[11px]">
            <Unplug className="w-3.5 h-3.5" />
            Desconectado
          </Badge>
        );
      case 'error':
        return (
          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 text-[11px]">
            <XCircle className="w-3.5 h-3.5" />
            Erro na conexão
          </Badge>
        );
      case 'not_configured':
      default:
        return (
          <Badge variant="outline" className="border-slate-800 text-slate-400 bg-slate-950/40 flex items-center gap-1 text-[11px]">
            <HelpCircle className="w-3.5 h-3.5" />
            Não configurado
          </Badge>
        );
    }
  };

  const ifoodIntegration = integrations.find((i) => i.channel_name === 'ifood');
  const ninetyNineIntegration = integrations.find((i) => i.channel_name === '99food');

  return (
    <div className="space-y-6">
      {/* Banner de Segurança & Cofre */}
      <div className="bg-slate-900/70 border border-border/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-foreground">
              Cofre Criptografado & Isolamento de Credenciais
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Chaves de API, senhas e segredos são armazenados com criptografia no servidor. Operadores do KDS têm acesso estritamente operacional sem visualização de dados financeiros ou segredos de conexão.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={loadData}
          disabled={loading}
          className="h-8 text-xs border-slate-700 text-slate-300 gap-1.5 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Canais
        </Button>
      </div>

      {/* Grid de Canais de Marketplace (iFood e 99Food) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: iFood */}
        {ifoodIntegration && (
          <Card className="bg-card/70 border-border/50 shadow-md flex flex-col justify-between">
            <CardHeader className="pb-4 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-md bg-red-600 text-white font-extrabold text-xs tracking-wider shadow-sm">
                    iFood
                  </span>
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground">
                      iFood Marketplace
                    </CardTitle>
                    <span className="text-[11px] text-muted-foreground">
                      API Oficial de Pedidos & KDS
                    </span>
                  </div>
                </div>

                {renderStatusBadge(ifoodIntegration.connection_state)}
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4 flex-1">
              {/* Informações de Conexão */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/40 p-3 rounded-lg border border-border/30">
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                    Store / Merchant ID
                  </span>
                  <div className="font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                    {ifoodIntegration.store_id ? (
                      <>
                        <span className="truncate max-w-[130px] font-mono text-[11px]">
                          {ifoodIntegration.store_id}
                        </span>
                        <button
                          onClick={() => handleCopyStoreId(ifoodIntegration.store_id)}
                          className="text-slate-400 hover:text-foreground"
                          title="Copiar Merchant ID"
                        >
                          {copiedStoreId === ifoodIntegration.store_id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-slate-500 font-normal">Não informado</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                    Última Sincronização
                  </span>
                  <div className="text-foreground mt-0.5 text-[11px]">
                    {ifoodIntegration.last_sync_at ? (
                      new Intl.DateTimeFormat('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(ifoodIntegration.last_sync_at))
                    ) : (
                      <span className="text-slate-500">Aguardando pedidos</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                    Credencial no Cofre
                  </span>
                  <div className="text-foreground mt-0.5 flex items-center gap-1">
                    {ifoodIntegration.has_client_secret ? (
                      <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        Chave Protegida
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Ausente</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                    Aceite Automático
                  </span>
                  <div className="text-foreground mt-0.5 text-[11px]">
                    {ifoodIntegration.auto_accept_orders ? (
                      <span className="text-emerald-400 font-semibold">Ativo no KDS</span>
                    ) : (
                      <span className="text-slate-400">Manual pela Cozinha</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status de Escopos / Permissões */}
              <div>
                <span className="text-[11px] font-semibold text-slate-300 block mb-2">
                  Capacidades da Integração:
                </span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Recepção de Pedidos (Polling/Webhook)</span>
                    <span className={ifoodIntegration.capabilities.can_fetch_orders.status === 'available' ? 'text-emerald-400 font-semibold text-[11px]' : 'text-amber-400 text-[11px]'}>
                      {ifoodIntegration.capabilities.can_fetch_orders.status === 'available' ? 'Ativo' : 'Aguardando Homologação'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Atualização de Status no KDS</span>
                    <span className={ifoodIntegration.capabilities.can_update_status.status === 'available' ? 'text-emerald-400 font-semibold text-[11px]' : 'text-amber-400 text-[11px]'}>
                      {ifoodIntegration.capabilities.can_update_status.status === 'available' ? 'Ativo' : 'Aguardando Homologação'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground">Sincronização de Cardápio / Preços</span>
                    <span className="text-slate-500 text-[11px]">Catálogo Standard</span>
                  </div>
                </div>
              </div>

              {/* Feedback de Teste de Conexão Recente */}
              {ifoodIntegration.last_connection_test && (
                <div className="text-[11px] bg-slate-950/60 p-2.5 rounded-lg border border-border/40 text-slate-300 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground">Último Teste: </span>
                    {ifoodIntegration.last_connection_test.message}
                    <span className="text-slate-500 block text-[10px] mt-0.5">
                      Latência: {ifoodIntegration.last_connection_test.latency_ms}ms •{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(ifoodIntegration.last_connection_test.tested_at))}
                    </span>
                  </div>
                </div>
              )}

              {/* Ações do Card */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                <Button
                  size="sm"
                  onClick={() => handleOpenCredentialsModal(ifoodIntegration)}
                  className="h-8 text-xs bg-red-700 hover:bg-red-800 text-white font-semibold flex items-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {ifoodIntegration.has_client_secret ? 'Editar Credenciais' : 'Conectar API'}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTestConnection('ifood')}
                  disabled={testingChannel === 'ifood'}
                  className="h-8 text-xs border-slate-700 text-slate-300 hover:text-foreground flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingChannel === 'ifood' ? 'animate-spin' : ''}`} />
                  {testingChannel === 'ifood' ? 'Testando...' : 'Testar Conexão'}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setGuideModalChannel('ifood')}
                  className="h-8 text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Homologação
                </Button>

                {ifoodIntegration.has_client_secret && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDisconnectModalChannel('ifood')}
                    className="h-8 text-xs text-rose-400 hover:text-rose-300 ml-auto flex items-center gap-1"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    Desconectar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CARD 2: 99Food */}
        {ninetyNineIntegration && (
          <Card className="bg-card/70 border-border/50 shadow-md flex flex-col justify-between">
            <CardHeader className="pb-4 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-md bg-amber-500 text-slate-950 font-extrabold text-xs tracking-wider shadow-sm">
                    99Food
                  </span>
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground">
                      99Food Restaurante
                    </CardTitle>
                    <span className="text-[11px] text-muted-foreground">
                      Open Platform v2 & KDS
                    </span>
                  </div>
                </div>

                {renderStatusBadge(ninetyNineIntegration.connection_state)}
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4 flex-1">
              {/* Informações de Conexão */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/40 p-3 rounded-lg border border-border/30">
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                    Shop ID da Loja
                  </span>
                  <div className="font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                    {ninetyNineIntegration.store_id ? (
                      <>
                        <span className="truncate max-w-[130px] font-mono text-[11px]">
                          {ninetyNineIntegration.store_id}
                        </span>
                        <button
                          onClick={() => handleCopyStoreId(ninetyNineIntegration.store_id)}
                          className="text-slate-400 hover:text-foreground"
                          title="Copiar Shop ID"
                        >
                          {copiedStoreId === ninetyNineIntegration.store_id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-slate-500 font-normal">Não informado</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                    Última Sincronização
                  </span>
                  <div className="text-foreground mt-0.5 text-[11px]">
                    {ninetyNineIntegration.last_sync_at ? (
                      new Intl.DateTimeFormat('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(ninetyNineIntegration.last_sync_at))
                    ) : (
                      <span className="text-slate-500">Aguardando pedidos</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                    Credencial no Cofre
                  </span>
                  <div className="text-foreground mt-0.5 flex items-center gap-1">
                    {ninetyNineIntegration.has_client_secret ? (
                      <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        Chave Protegida
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Ausente</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                    Aceite Automático
                  </span>
                  <div className="text-foreground mt-0.5 text-[11px]">
                    {ninetyNineIntegration.auto_accept_orders ? (
                      <span className="text-emerald-400 font-semibold">Ativo no KDS</span>
                    ) : (
                      <span className="text-slate-400">Manual pela Cozinha</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status de Escopos / Permissões */}
              <div>
                <span className="text-[11px] font-semibold text-slate-300 block mb-2">
                  Capacidades da Integração:
                </span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Recepção de Pedidos (API v2)</span>
                    <span className={ninetyNineIntegration.capabilities.can_fetch_orders.status === 'available' ? 'text-emerald-400 font-semibold text-[11px]' : 'text-amber-400 text-[11px]'}>
                      {ninetyNineIntegration.capabilities.can_fetch_orders.status === 'available' ? 'Ativo' : 'Aguardando Homologação'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Atualização de Status no KDS</span>
                    <span className={ninetyNineIntegration.capabilities.can_update_status.status === 'available' ? 'text-emerald-400 font-semibold text-[11px]' : 'text-amber-400 text-[11px]'}>
                      {ninetyNineIntegration.capabilities.can_update_status.status === 'available' ? 'Ativo' : 'Aguardando Homologação'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground">Sincronização de Cardápio / Preços</span>
                    <span className="text-slate-500 text-[11px]">Catálogo Standard</span>
                  </div>
                </div>
              </div>

              {/* Feedback de Teste de Conexão Recente */}
              {ninetyNineIntegration.last_connection_test && (
                <div className="text-[11px] bg-slate-950/60 p-2.5 rounded-lg border border-border/40 text-slate-300 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground">Último Teste: </span>
                    {ninetyNineIntegration.last_connection_test.message}
                    <span className="text-slate-500 block text-[10px] mt-0.5">
                      Latência: {ninetyNineIntegration.last_connection_test.latency_ms}ms •{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(ninetyNineIntegration.last_connection_test.tested_at))}
                    </span>
                  </div>
                </div>
              )}

              {/* Ações do Card */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                <Button
                  size="sm"
                  onClick={() => handleOpenCredentialsModal(ninetyNineIntegration)}
                  className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold flex items-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {ninetyNineIntegration.has_client_secret ? 'Editar Credenciais' : 'Conectar API'}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTestConnection('99food')}
                  disabled={testingChannel === '99food'}
                  className="h-8 text-xs border-slate-700 text-slate-300 hover:text-foreground flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingChannel === '99food' ? 'animate-spin' : ''}`} />
                  {testingChannel === '99food' ? 'Testando...' : 'Testar Conexão'}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setGuideModalChannel('99food')}
                  className="h-8 text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Homologação
                </Button>

                {ninetyNineIntegration.has_client_secret && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDisconnectModalChannel('99food')}
                    className="h-8 text-xs text-rose-400 hover:text-rose-300 ml-auto flex items-center gap-1"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    Desconectar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Histórico / Logs Recentes de Conexão */}
      <Card className="bg-card/70 border-border/50">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" />
            Registro de Eventos & Auditoria de Conexão
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {(() => {
            const allLogs = [
              ...(ifoodIntegration?.event_log || []).map((l) => ({ ...l, channel: 'iFood' })),
              ...(ninetyNineIntegration?.event_log || []).map((l) => ({ ...l, channel: '99Food' })),
            ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            if (allLogs.length === 0) {
              return (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  Nenhum evento registrado ainda. Conecte um canal ou execute um teste para iniciar o log de auditoria.
                </div>
              );
            }

            return (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {allLogs.map((log) => {
                  const dateStr = new Intl.DateTimeFormat('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }).format(new Date(log.timestamp));

                  return (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-lg bg-slate-950/40 border border-border/30 text-xs flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : log.status === 'warning' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : log.status === 'error' ? (
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : (
                          <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        )}
                        <span className="font-semibold text-foreground">[{log.channel}]</span>
                        <span className="text-slate-300">{log.message}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {dateStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Modal: Formulário de Credenciais no Cofre Seguro */}
      {credentialsModalChannel && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-900 border-border shadow-2xl">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Configurar Cofre: {credentialsModalChannel === 'ifood' ? 'iFood Marketplace' : '99Food'}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                As credenciais serão gravadas com isolamento estrito e sem exposição pública.
              </p>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="text-[11px] text-slate-300 font-medium block mb-1">
                  {credentialsModalChannel === 'ifood' ? 'Merchant ID (ID da Loja no iFood)' : 'Shop ID (ID da Loja na 99Food)'} *
                </label>
                <input
                  type="text"
                  value={formMerchantId}
                  onChange={(e) => setFormMerchantId(e.target.value)}
                  placeholder="Ex: a1b2c3d4-e5f6-7890..."
                  className="w-full bg-slate-950 border border-border/60 rounded-lg px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-300 font-medium block mb-1">
                  {credentialsModalChannel === 'ifood' ? 'Client ID da Aplicação' : 'App Key da Aplicação'} *
                </label>
                {(() => {
                  const ch = integrations.find((i) => i.channel_name === credentialsModalChannel);
                  return (
                    <>
                      <input
                        type="text"
                        value={formClientId}
                        onChange={(e) => setFormClientId(e.target.value)}
                        placeholder={ch?.client_id_preview ? `Configurado: ${ch.client_id_preview} (deixe em branco para manter)` : "Ex: ifood-client-id-..."}
                        className="w-full bg-slate-950 border border-border/60 rounded-lg px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      {ch?.client_id_preview && (
                        <span className="text-[10px] text-muted-foreground mt-1 block">
                          Client ID atual no cofre: <span className="font-mono text-slate-300">{ch.client_id_preview}</span>. Digite apenas se desejar substituir.
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>

              <div>
                <label className="text-[11px] text-slate-300 font-medium block mb-1">
                  {credentialsModalChannel === 'ifood' ? 'Client Secret (Chave Secreta)' : 'App Secret (Chave Secreta)'}
                </label>
                <input
                  type="password"
                  value={formClientSecret}
                  onChange={(e) => setFormClientSecret(e.target.value)}
                  placeholder="••••••••••••••••••••••••"
                  className="w-full bg-slate-950 border border-border/60 rounded-lg px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  Deixe em branco para manter o segredo atual já gravado com segurança.
                </span>
              </div>

              {(() => {
                const ch = integrations.find((i) => i.channel_name === credentialsModalChannel);
                const isHomologated = ch?.connection_state === 'homologated';
                return (
                  <div className="pt-2 border-t border-border/40 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-foreground text-xs block">Aceite Automático de Pedidos</span>
                        <span className="text-[10px] text-muted-foreground block">
                          Confirma novos pedidos automaticamente sem exigir clique manual no KDS.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={formAutoAccept && isHomologated}
                        disabled={!isHomologated}
                        onChange={(e) => setFormAutoAccept(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 disabled:opacity-40"
                      />
                    </div>
                    {!isHomologated && (
                      <span className="text-[10px] text-amber-400/90 block">
                        Disponível apenas após a conexão ser homologada e verificada junto ao parceiro oficial.
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCredentialsModalChannel(null)}
                  disabled={savingCredentials}
                  className="h-8 text-xs border-slate-700 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveCredentials}
                  disabled={savingCredentials}
                  className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                >
                  {savingCredentials ? 'Salvando no Cofre...' : 'Salvar no Cofre'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Guia Oficial de Homologação */}
      {guideModalChannel && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-slate-900 border-border shadow-2xl">
            {(() => {
              const guide: OnboardingGuide = MarketplaceIntegrationService.getOnboardingGuide(guideModalChannel);
              return (
                <>
                  <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold text-foreground">
                        {guide.title}
                      </CardTitle>
                      <a
                        href={guide.portalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-sky-400 hover:underline flex items-center gap-1 mt-0.5"
                      >
                        Acessar Portal Oficial ({guide.portalUrl})
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setGuideModalChannel(null)}
                      className="h-7 w-7 p-0"
                    >
                      ✕
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
                    <div>
                      <span className="font-semibold text-foreground text-xs block mb-1.5">
                        Pré-requisitos Mandatórios:
                      </span>
                      <ul className="space-y-1 list-disc list-inside text-slate-300 text-[11px]">
                        {guide.requirements.map((req, i) => (
                          <li key={i}>{req}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <span className="font-semibold text-foreground text-xs block mb-2">
                        Passo a Passo de Homologação:
                      </span>
                      <div className="space-y-2.5">
                        {guide.steps.map((st) => (
                          <div
                            key={st.step}
                            className="bg-slate-950/50 p-2.5 rounded-lg border border-border/40"
                          >
                            <div className="font-bold text-amber-400 text-xs">
                              Passo {st.step}: {st.title}
                            </div>
                            <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                              {st.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => setGuideModalChannel(null)}
                        className="h-8 text-xs bg-slate-800 hover:bg-slate-700 text-white"
                      >
                        Entendido
                      </Button>
                    </div>
                  </CardContent>
                </>
              );
            })()}
          </Card>
        </div>
      )}

      {/* Modal: Confirmação de Desconexão */}
      {disconnectModalChannel && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-slate-900 border-border shadow-2xl">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Desconectar {disconnectModalChannel === 'ifood' ? 'iFood' : '99Food'}?
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Tem certeza que deseja desconectar o canal? Todas as chaves ativas serão removidas do cofre seguro e novos pedidos deste marketplace não serão mais recebidos automaticamente no KDS.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDisconnectModalChannel(null)}
                  className="h-8 text-xs border-slate-700 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmDisconnect}
                  className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold"
                >
                  Confirmar Desconexão
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
