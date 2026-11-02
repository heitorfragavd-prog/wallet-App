import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/shared/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import {
  Bike,
  Calculator,
  Settings2,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  X,
  FileText,
  Clock,
  Save,
  Network,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DeliveryRoleGuard } from '@/domains/delivery/DeliveryRoleGuard';
import { DeliveryMarginSimulator } from '@/domains/delivery/components/DeliveryMarginSimulator';
import { MarketplaceConnectionsTab } from '@/domains/delivery/components/MarketplaceConnectionsTab';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/shared/hooks/use-toast';

interface DeliveryOrderHistoryItem {
  id: string;
  display_id: string;
  channel_name: string;
  customer_name: string;
  order_status: string;
  total_amount: number;
  created_at: string;
}

export const WalletDeliveryPage: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? '';
  const { toast } = useToast();

  const [pedidos30Dias, setPedidos30Dias] = useState<number>(0);
  const [tempoMedioPreparo, setTempoMedioPreparo] = useState<number | null>(null);
  const [taxaConclusao, setTaxaConclusao] = useState<number | null>(null);
  const [taxaCancelamento, setTaxaCancelamento] = useState<number>(0);

  // Sub-navegação do Delivery Growth (Hub de Canais, Integrações API, Simulador)
  const [activeSubTab, setActiveSubTab] = useState<'hub' | 'integracoes' | 'simulador'>('hub');

  // Modais de ações inferiores
  const [activeModal, setActiveModal] = useState<'simulador' | 'taxas' | 'historico' | 'alertas' | null>(null);

  // Estados para Taxas Contratuais (Gate 4)
  const [selectedChannel, setSelectedChannel] = useState<'ifood' | '99food' | 'direto'>('ifood');
  const [channelRates, setChannelRates] = useState<Record<string, { comissao: string; pagamento: string; fixa: string }>>({
    ifood: { comissao: '23.0', pagamento: '3.2', fixa: '0.00' },
    '99food': { comissao: '20.0', pagamento: '3.0', fixa: '0.00' },
    direto: { comissao: '0.0', pagamento: '1.5', fixa: '0.00' },
  });
  const [savingChannel, setSavingChannel] = useState(false);

  // Estados para Histórico de Pedidos (Gate 4)
  const [ordersHistory, setOrdersHistory] = useState<DeliveryOrderHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Carrega métricas consolidadas reais
  const loadDeliveryMetrics = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const hoje = new Date();
      const limite30Dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: orders } = await supabase
        .from('delivery_orders')
        .select('id, order_status, total_amount, created_at, delivery_time_minutes')
        .eq('workspace_id', workspaceId)
        .gte('created_at', limite30Dias);

      const total = (orders || []).length;
      setPedidos30Dias(total);

      if (total > 0) {
        const cancelados = (orders || []).filter((o) => o.order_status === 'cancelled').length;
        setTaxaCancelamento(Math.round((cancelados / total) * 1000) / 10);

        const tempos = (orders || [])
          .map((o) => Number(o.delivery_time_minutes || 0))
          .filter((t) => t > 0);
        if (tempos.length > 0) {
          const somaTempo = tempos.reduce((a, b) => a + b, 0);
          setTempoMedioPreparo(Math.round(somaTempo / tempos.length));
        } else {
          setTempoMedioPreparo(null);
        }

        const concluidos = (orders || []).filter(
          (o) => o.order_status === 'delivered' || o.order_status === 'completed'
        ).length;
        setTaxaConclusao(Math.round((concluidos / total) * 1000) / 10);
      } else {
        setTempoMedioPreparo(null);
        setTaxaConclusao(null);
        setTaxaCancelamento(0);
      }
    } catch (err) {
      console.warn('[WalletDeliveryPage] Erro ao carregar métricas de delivery:', err);
    }
  }, [workspaceId]);

  // Carrega taxas configuradas dos canais
  const loadChannelRates = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const { data, error } = await supabase
        .from('delivery_channels')
        .select('channel_name, commission_rate, payment_fee_rate, fixed_fee')
        .eq('workspace_id', workspaceId);

      if (error) {
        console.warn('[WalletDeliveryPage] Erro ao carregar taxas de canais:', error);
        return;
      }

      if (data && data.length > 0) {
        setChannelRates((prev) => {
          const updated = { ...prev };
          for (const ch of data) {
            if (ch.channel_name && updated[ch.channel_name]) {
              updated[ch.channel_name] = {
                comissao: (Number(ch.commission_rate || 0) * 100).toFixed(1),
                pagamento: (Number(ch.payment_fee_rate || 0) * 100).toFixed(1),
                fixa: Number(ch.fixed_fee || 0).toFixed(2),
              };
            }
          }
          return updated;
        });
      }
    } catch (err) {
      console.warn('[WalletDeliveryPage] Falha ao consultar canais:', err);
    }
  }, [workspaceId]);

  // Salva taxas contratuais no banco (Gate 4)
  const handleSaveChannelRates = async () => {
    if (!workspaceId || savingChannel) return;
    setSavingChannel(true);

    try {
      const current = channelRates[selectedChannel];
      const comissao = Math.max(0, Math.min(100, parseFloat(current.comissao) || 0)) / 100;
      const pagto = Math.max(0, Math.min(100, parseFloat(current.pagamento) || 0)) / 100;
      const fixa = Math.max(0, parseFloat(current.fixa) || 0);

      const displayName =
        selectedChannel === 'ifood' ? 'iFood' : selectedChannel === '99food' ? '99Food' : 'Canal Próprio';

      const { error } = await supabase
        .from('delivery_channels')
        .upsert(
          {
            workspace_id: workspaceId,
            channel_name: selectedChannel,
            display_name: displayName,
            commission_rate: comissao,
            payment_fee_rate: pagto,
            fixed_fee: fixa,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,channel_name' }
        );

      if (error) throw error;

      toast({
        title: 'Taxas Contratuais Salvas',
        description: `As taxas do canal ${displayName} foram salvas com sucesso no banco de dados.`,
      });

      await loadChannelRates();
    } catch (err) {
      console.error('[WalletDeliveryPage] Erro ao salvar taxas:', err);
      toast({
        title: 'Falha ao Salvar',
        description: 'Não foi possível atualizar as taxas contratuais.',
        variant: 'destructive',
      });
    } finally {
      setSavingChannel(false);
    }
  };

  // Carrega histórico de pedidos (Gate 4)
  const loadOrdersHistory = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('delivery_orders')
        .select('id, display_id, channel_name, customer_name, order_status, total_amount, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.warn('[WalletDeliveryPage] Erro ao carregar histórico:', error);
        return;
      }

      setOrdersHistory(data || []);
    } catch (err) {
      console.error('[WalletDeliveryPage] Falha ao consultar histórico de pedidos:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadDeliveryMetrics();
    loadChannelRates();
  }, [loadDeliveryMetrics, loadChannelRates]);

  useEffect(() => {
    if (activeModal === 'historico') {
      loadOrdersHistory();
    }
  }, [activeModal, loadOrdersHistory]);

  return (
    <DeliveryRoleGuard fallbackPath="/delivery/kds">
      <DashboardLayout>
        <div className="space-y-6 pb-12">
          {/* Header Conforme Painel 5 */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/40 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🚲</span>
                <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                  Delivery Growth — Hub de Canais
                </h1>
              </div>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                Gestão integrada de pedidos, canais e rentabilidade de entregas.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/delivery/kds">
                <Button className="h-9 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center gap-1.5">
                  Abrir KDS Cozinha
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Sub-navegação do Delivery Growth (Hub de Canais, Integrações API, Simulador) */}
          <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border border-border/40 w-fit">
            <button
              onClick={() => setActiveSubTab('hub')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                activeSubTab === 'hub'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              Hub de Canais & KPIs
            </button>
            <button
              onClick={() => setActiveSubTab('integracoes')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                activeSubTab === 'integracoes'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              Integrações de Marketplace (iFood / 99Food)
            </button>
            <button
              onClick={() => setActiveSubTab('simulador')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                activeSubTab === 'simulador'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              Simulador de Rentabilidade
            </button>
          </div>

          {/* ABA 1: Hub de Canais & KPIs Operacionais */}
          {activeSubTab === 'hub' && (
            <div className="space-y-6">
              {/* 3 Channel Cards Conforme Painel 5 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. iFood Card */}
                <Card className="bg-card/70 border-border/50">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded bg-red-600 text-white font-bold text-xs tracking-wide">
                        iFood
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400 bg-slate-900/60">
                          Não conectado
                        </Badge>
                      </div>
                    </div>

                    <div className="text-xs text-amber-400/90 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Aguardando homologação
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Comissão contratual:</span>
                        <span className="font-semibold text-foreground">
                          {channelRates.ifood.comissao}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Taxa de pagamento*:</span>
                        <span className="font-semibold text-foreground">
                          {channelRates.ifood.pagamento}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Recepção de pedidos:</span>
                        <span className="text-slate-400 font-medium">Inativa</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setSelectedChannel('ifood');
                          setActiveModal('taxas');
                        }}
                        variant="outline"
                        className="flex-1 h-8 text-xs font-semibold border-red-700/60 text-red-200 hover:bg-red-950/40"
                      >
                        Taxas
                      </Button>
                      <Button
                        onClick={() => setActiveSubTab('integracoes')}
                        className="flex-1 h-8 text-xs font-semibold bg-red-700/80 hover:bg-red-700 text-white"
                      >
                        Integração API
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* 2. 99Food Card */}
                <Card className="bg-card/70 border-border/50">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-bold text-xs tracking-wide">
                        99Food
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400 bg-slate-900/60">
                          Não conectado
                        </Badge>
                      </div>
                    </div>

                    <div className="text-xs text-amber-400/90 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Aguardando credenciais
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Comissão contratual:</span>
                        <span className="font-semibold text-foreground">
                          {channelRates['99food'].comissao}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Taxa de pagamento*:</span>
                        <span className="font-semibold text-foreground">
                          {channelRates['99food'].pagamento}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Recepção de pedidos:</span>
                        <span className="text-slate-400 font-medium">Inativa</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setSelectedChannel('99food');
                          setActiveModal('taxas');
                        }}
                        variant="outline"
                        className="flex-1 h-8 text-xs font-semibold border-amber-600/60 text-amber-200 hover:bg-amber-950/40"
                      >
                        Taxas
                      </Button>
                      <Button
                        onClick={() => setActiveSubTab('integracoes')}
                        className="flex-1 h-8 text-xs font-semibold bg-amber-500/80 hover:bg-amber-500 text-slate-950"
                      >
                        Integração API
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* 3. Direto / WhatsApp Card */}
                <Card className="bg-card/70 border-border/50">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-xs tracking-wide flex items-center gap-1">
                        <Bike className="w-3.5 h-3.5" />
                        Direto / WhatsApp
                      </span>
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                        Canal Próprio
                      </Badge>
                    </div>

                    <div className="text-xs text-slate-300 font-medium">
                      Pedidos via site/WhatsApp
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Taxa de pagamento:</span>
                        <span className="font-semibold text-emerald-400">Pix / Maquininha ({channelRates.direto.pagamento}%)</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Comissão sobre vendas:</span>
                        <span className="font-semibold text-emerald-400">0% (Livre de comissão)</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Recepção de pedidos:</span>
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Ativa no KDS
                        </span>
                      </div>
                    </div>

                    <Link to="/delivery/kds" className="block w-full">
                      <Button className="w-full h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white">
                        Abrir KDS Cozinha
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </div>

              {/* 4 KPIs de Delivery Conforme Painel 5 (com Taxa de Conclusão Canônica) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Pedidos (30 dias) */}
                <Card className="bg-card/70 border-border/50">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground font-medium">Pedidos (30 dias)</div>
                    <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
                      {pedidos30Dias.toLocaleString('pt-BR')}
                    </div>
                    <div className="mt-2 text-xs text-emerald-400 font-medium flex items-center gap-1">
                      {pedidos30Dias > 0 ? (
                        <>
                          <TrendingUp className="w-3 h-3" />
                          Pedidos registrados
                        </>
                      ) : (
                        <span className="text-slate-500">Sem pedidos no período</span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Entrega (média) */}
                <Card className="bg-card/70 border-border/50">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground font-medium">Entrega (média)</div>
                    <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
                      {tempoMedioPreparo !== null ? `${tempoMedioPreparo} min` : 'Aguardando dados'}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {tempoMedioPreparo !== null ? 'Tempo médio de expedição' : 'Conforme pedidos entregues'}
                    </div>
                  </CardContent>
                </Card>

                {/* 3. Taxa de Conclusão */}
                <Card className="bg-card/70 border-border/50">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground font-medium">Taxa de Conclusão</div>
                    <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
                      {taxaConclusao !== null ? `${taxaConclusao}%` : 'Aguardando dados'}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {taxaConclusao !== null ? 'Pedidos entregues com sucesso' : 'Calculado após conclusão'}
                    </div>
                  </CardContent>
                </Card>

                {/* 4. Cancelamentos */}
                <Card className="bg-card/70 border-border/50">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground font-medium">Cancelamentos</div>
                    <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
                      {taxaCancelamento.toFixed(1)}%
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Taxa de pedidos cancelados
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 4 Ações / Módulos Inferiores Conforme Painel 5 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Simulador de Margem */}
                <Card
                  onClick={() => setActiveSubTab('simulador')}
                  className="bg-card/70 border-border/50 hover:border-amber-500/40 cursor-pointer transition-colors"
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                      <Calculator className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">Simulador de Margem</div>
                      <div className="text-[11px] text-muted-foreground">Calcule sua rentabilidade</div>
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Taxas Contratuais */}
                <Card
                  onClick={() => setActiveModal('taxas')}
                  className="bg-card/70 border-border/50 hover:border-amber-500/40 cursor-pointer transition-colors"
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                      <Settings2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">Taxas Contratuais</div>
                      <div className="text-[11px] text-muted-foreground">Configure por canal</div>
                    </div>
                  </CardContent>
                </Card>

                {/* 3. Histórico de Pedidos */}
                <Card
                  onClick={() => setActiveModal('historico')}
                  className="bg-card/70 border-border/50 hover:border-amber-500/40 cursor-pointer transition-colors"
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">Histórico de Pedidos</div>
                      <div className="text-[11px] text-muted-foreground">Acompanhe e analise</div>
                    </div>
                  </CardContent>
                </Card>

                {/* 4. Alertas Operacionais */}
                <Card
                  onClick={() => setActiveModal('alertas')}
                  className="bg-card/70 border-border/50 hover:border-amber-500/40 cursor-pointer transition-colors"
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">Alertas Operacionais</div>
                      <div className="text-[11px] text-muted-foreground">Atrasos, falhas e anomalias</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ABA 2: Integrações de Marketplace (Gate 5) */}
          {activeSubTab === 'integracoes' && (
            <MarketplaceConnectionsTab
              workspaceId={workspaceId}
              onRefreshChannels={loadChannelRates}
            />
          )}

          {/* ABA 3: Simulador de Rentabilidade */}
          {activeSubTab === 'simulador' && (
            <Card className="bg-card/70 border-border/50">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-sm font-bold text-foreground">
                  Simulador de Margem & Precificação Estratégica por Canal
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <DeliveryMarginSimulator />
              </CardContent>
            </Card>
          )}

          {/* Modal: Simulador de Margem */}
          {activeModal === 'simulador' && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <Card className="w-full max-w-xl bg-slate-900 border-border shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
                  <CardTitle className="text-sm font-bold text-foreground">
                    Simulador de Margem por Canal
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)} className="h-7 w-7 p-0">
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-5">
                  <DeliveryMarginSimulator />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Modal: Taxas Contratuais Funcional e Persistente (Gate 4) */}
          {activeModal === 'taxas' && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <Card className="w-full max-w-md bg-slate-900 border-border shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-sky-400" />
                    <CardTitle className="text-sm font-bold text-foreground">
                      Configuração de Taxas Contratuais
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)} className="h-7 w-7 p-0">
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-5 space-y-4 text-xs">
                  <p className="text-slate-400 leading-relaxed">
                    Configure as taxas contratuais acordadas com cada canal para apuração exata de repasses líquidos:
                  </p>

                  {/* Channel Selector Pills */}
                  <div className="flex gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSelectedChannel('ifood')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        selectedChannel === 'ifood' ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      iFood
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedChannel('99food')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        selectedChannel === '99food' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      99Food
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedChannel('direto')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        selectedChannel === 'direto' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Canal Próprio
                    </button>
                  </div>

                  {/* Inputs Form */}
                  <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Comissão do Marketplace (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={channelRates[selectedChannel].comissao}
                        onChange={(e) =>
                          setChannelRates((prev) => ({
                            ...prev,
                            [selectedChannel]: { ...prev[selectedChannel], comissao: e.target.value },
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Taxa de Pagamento / Adquirente (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={channelRates[selectedChannel].pagamento}
                        onChange={(e) =>
                          setChannelRates((prev) => ({
                            ...prev,
                            [selectedChannel]: { ...prev[selectedChannel], pagamento: e.target.value },
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Taxa Fixa por Pedido (R$)
                      </label>
                      <input
                        type="number"
                        step="0.10"
                        min="0"
                        value={channelRates[selectedChannel].fixa}
                        onChange={(e) =>
                          setChannelRates((prev) => ({
                            ...prev,
                            [selectedChannel]: { ...prev[selectedChannel], fixa: e.target.value },
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)} className="h-8 text-xs">
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveChannelRates}
                      disabled={savingChannel}
                      className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingChannel ? 'Salvando...' : 'Salvar Taxas'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Modal: Histórico de Pedidos Real e Paginado (Gate 4) */}
          {activeModal === 'historico' && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <Card className="w-full max-w-2xl bg-slate-900 border-border shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <CardTitle className="text-sm font-bold text-foreground">
                      Histórico de Pedidos de Delivery
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)} className="h-7 w-7 p-0">
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-5 text-xs max-h-96 overflow-y-auto">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
                      <Clock className="w-4 h-4 animate-spin text-amber-400" />
                      Carregando pedidos do banco...
                    </div>
                  ) : ordersHistory.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 space-y-1">
                      <p className="font-semibold text-slate-300">Nenhum pedido registrado no histórico do workspace.</p>
                      <p className="text-[11px] text-slate-500">
                        Os pedidos sincronizados do iFood, 99Food ou Canal Próprio aparecerão aqui automaticamente.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-5 text-[11px] font-semibold text-slate-400 pb-2 border-b border-slate-800">
                        <span>Comanda</span>
                        <span>Canal</span>
                        <span>Cliente</span>
                        <span>Valor</span>
                        <span>Status</span>
                      </div>
                      {ordersHistory.map((order) => {
                        const statusColors: Record<string, string> = {
                          new: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
                          preparing: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                          ready: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                          delivered: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                          completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                          cancelled: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
                        };
                        const statusLabels: Record<string, string> = {
                          new: 'Novo',
                          preparing: 'Em preparo',
                          ready: 'Pronto',
                          delivered: 'Entregue',
                          completed: 'Concluído',
                          cancelled: 'Cancelado',
                        };

                        return (
                          <div
                            key={order.id}
                            className="grid grid-cols-5 items-center py-2 border-b border-slate-800/60 text-slate-300"
                          >
                            <span className="font-semibold text-foreground">
                              #{order.display_id || order.id.slice(0, 5)}
                            </span>
                            <span className="capitalize">{order.channel_name}</span>
                            <span className="truncate pr-2">{order.customer_name}</span>
                            <span className="font-medium text-emerald-400">
                              R$ {Number(order.total_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  statusColors[order.order_status] || 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {statusLabels[order.order_status] || order.order_status}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex justify-end pt-4">
                    <Button size="sm" onClick={() => setActiveModal(null)}>
                      Fechar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Modal: Alertas Operacionais */}
          {activeModal === 'alertas' && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <Card className="w-full max-w-md bg-slate-900 border-border shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
                  <CardTitle className="text-sm font-bold text-foreground">
                    Alertas Operacionais de Entrega
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)} className="h-7 w-7 p-0">
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-5 space-y-3 text-xs">
                  <div className="flex items-start gap-2 p-3 rounded bg-amber-950/30 border border-amber-500/30 text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Canais Externos Aguardando Homologação</span>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        iFood e 99Food estão inativos até que as credenciais Merchant sejam confirmadas.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button size="sm" onClick={() => setActiveModal(null)}>
                      Fechar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DashboardLayout>
    </DeliveryRoleGuard>
  );
};

export default WalletDeliveryPage;
