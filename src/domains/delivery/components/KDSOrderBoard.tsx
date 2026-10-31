import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import {
  Volume2,
  VolumeX,
  Search,
  ChefHat,
  Package,
  Bike,
  CheckCircle,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { DeliveryOrder, DeliveryOrderStatus } from '../types';
import { KDSOrderCard } from './KDSOrderCard';
import { ItemChecklistDialog } from './ItemChecklistDialog';
import { useToast } from '@/shared/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { DeliveryOrderRepository } from '../services/DeliveryOrderRepository';

// Sons sintéticos via Web Audio API (sem dependência de arquivo de áudio externo)
function playKDSAlertChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn('Erro ao emitir alerta sonoro KDS:', err);
  }
}

// Pedidos de demonstração usados exclusivamente no modo de teste/treinamento
const SAMPLE_DEMO_ORDERS: DeliveryOrder[] = [
  {
    id: 'demo-1042',
    workspace_id: 'demo',
    channel_id: 'ifood_channel',
    channel_order_id: 'ifood-demo-90812',
    display_id: '#DEMO-1042',
    customer_name: 'Carlos M. (Simulação)',
    customer_phone: '(11) 98765-4321',
    delivery_address: 'Av. Paulista, 1200 - Apto 42',
    subtotal: 58.0,
    discount: 0,
    delivery_fee: 7.9,
    commission_amount: 13.34,
    net_amount: 52.56,
    status: 'received',
    payment_method: 'marketplace_online',
    payment_status: 'paid',
    notes: 'Caprichar no molho e enviar guardanapos extras, por favor!',
    created_at: new Date(Date.now() - 8 * 60000).toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'demo-it-1',
        order_id: 'demo-1042',
        name: 'X-Tudo Especial Rodo Point',
        quantity: 1,
        unit_price: 34.0,
        total_price: 34.0,
        notes: 'Sem cebola crua',
      },
      {
        id: 'demo-it-2',
        order_id: 'demo-1042',
        name: 'Porção Batata Rústica Pequena',
        quantity: 1,
        unit_price: 16.0,
        total_price: 16.0,
      },
    ],
  },
  {
    id: 'demo-1043',
    workspace_id: 'demo',
    channel_id: '99_channel',
    channel_order_id: '99-demo-88124',
    display_id: '#DEMO-1043',
    customer_name: 'Mariana S. (Simulação)',
    subtotal: 42.0,
    discount: 5.0,
    delivery_fee: 6.0,
    commission_amount: 8.4,
    net_amount: 34.6,
    status: 'preparing',
    payment_method: 'credit_card',
    payment_status: 'paid',
    created_at: new Date(Date.now() - 18 * 60000).toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'demo-it-3',
        order_id: 'demo-1043',
        name: 'Misto Quente Especial no Pão Francês',
        quantity: 2,
        unit_price: 15.0,
        total_price: 30.0,
      },
    ],
  },
];

interface KDSOrderBoardProps {
  initialOrders?: DeliveryOrder[];
}

export const KDSOrderBoard: React.FC<KDSOrderBoardProps> = ({ initialOrders }) => {
  const { toast } = useToast();
  const { activeWorkspace, activeWorkspaceRole } = useWorkspace();
  const workspaceId = activeWorkspace?.id || 'default_workspace';
  const isStaff = activeWorkspaceRole === 'delivery_staff';

  const [orders, setOrders] = useState<DeliveryOrder[]>(initialOrders || []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialOrders);
  const [isDbConfigured, setIsDbConfigured] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChecklistOrder, setActiveChecklistOrder] = useState<DeliveryOrder | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Carrega pedidos reais da persistência do Supabase via view operacional
  const loadRealOrders = useCallback(async () => {
    if (isDemoMode) {
      setOrders(SAMPLE_DEMO_ORDERS);
      setIsLoading(false);
      return;
    }

    if (!workspaceId) return;

    setIsLoading(true);
    const result = await DeliveryOrderRepository.listOrders(workspaceId, {
      isStaff,
      operationalOnly: true,
    });
    setIsDbConfigured(result.isConfigured);
    if (result.data) {
      setOrders(result.data);
    }
    setIsLoading(false);
  }, [workspaceId, isDemoMode, isStaff]);

  useEffect(() => {
    loadRealOrders();

    // Assina atualizações em tempo real se não estiver no modo de demonstração
    if (!isDemoMode && workspaceId) {
      const unsubscribe = DeliveryOrderRepository.subscribeToOrders(workspaceId, () => {
        loadRealOrders();
        if (soundEnabled) playKDSAlertChime();
      });
      return unsubscribe;
    }
  }, [loadRealOrders, isDemoMode, workspaceId, soundEnabled]);

  // Manipulador de transição de status persistente com bloqueio de expedição e reversão
  const handleStatusChange = useCallback(
    async (orderId: string, nextStatus: DeliveryOrderStatus) => {
      const targetOrder = orders.find((ord) => ord.id === orderId);
      if (!targetOrder) return;

      // Gate E: Bloqueio de Despacho se houver itens obrigatórios pendentes de conferência
      if (nextStatus === 'dispatched' || nextStatus === 'delivered') {
        const unverifiedItems = (targetOrder.items || []).filter(
          (it) => !it.checked && !it.is_verified_in_kds
        );
        if (unverifiedItems.length > 0) {
          toast({
            title: 'Bloqueio de Expedição',
            description: `Não é possível despachar o pedido: ${unverifiedItems.length} item(ns) ainda pendente(s) de conferência na cozinha.`,
            variant: 'destructive',
          });
          setActiveChecklistOrder(targetOrder);
          return;
        }
      }

      const previousOrders = orders;

      // 1. Atualização otimista no estado local
      setOrders((prev) =>
        prev.map((ord) => {
          if (ord.id !== orderId) return ord;
          const update = { ...ord, status: nextStatus, updated_at: new Date().toISOString() };
          if (nextStatus === 'preparing' && !ord.preparation_started_at) {
            update.preparation_started_at = new Date().toISOString();
          } else if (nextStatus === 'ready' && !ord.ready_at) {
            update.ready_at = new Date().toISOString();
          } else if (nextStatus === 'dispatched' && !ord.dispatched_at) {
            update.dispatched_at = new Date().toISOString();
          } else if (nextStatus === 'delivered' && !ord.delivered_at) {
            update.delivered_at = new Date().toISOString();
          }
          return update;
        })
      );

      if (soundEnabled) playKDSAlertChime();

      // 2. Persistência real no banco de dados se não for modo demo
      if (!isDemoMode && !orderId.startsWith('demo-')) {
        const res = await DeliveryOrderRepository.updateOrderStatus(orderId, nextStatus);
        if (!res.success) {
          // Reversão do estado otimista em falha (Gate D & E)
          setOrders(previousOrders);
          toast({
            title: 'Falha na Transição de Status',
            description: res.error || 'Não foi possível persistir a atualização de status no banco de dados.',
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: 'Status Atualizado',
        description: `Pedido avançou para ${nextStatus}.`,
      });
    },
    [orders, soundEnabled, isDemoMode, toast]
  );

  // Confirmação de itens no checklist com persistência e reversão
  const handleConfirmCheckedItems = useCallback(
    async (orderId: string, checkedMap?: Record<string, boolean>) => {
      const targetOrder = orders.find((o) => o.id === orderId);
      if (!targetOrder) return;

      const previousOrders = orders;

      // Atualização com o mapa de conferência real (Gate E)
      const updatedItems = targetOrder.items?.map((it) => {
        const isChecked = checkedMap ? Boolean(checkedMap[it.id]) : true;
        return {
          ...it,
          checked: isChecked,
          is_verified_in_kds: isChecked,
        };
      });

      setOrders((prev) =>
        prev.map((ord) => (ord.id === orderId ? { ...ord, items: updatedItems } : ord))
      );

      // Persistência no banco com verificação de erro
      if (!isDemoMode && !orderId.startsWith('demo-') && updatedItems) {
        try {
          for (const it of updatedItems) {
            const res = await DeliveryOrderRepository.updateItemVerification(it.id, Boolean(it.checked));
            if (!res.success) {
              setOrders(previousOrders);
              toast({
                title: 'Erro na Conferência',
                description: res.error || 'Falha ao salvar conferência do item.',
                variant: 'destructive',
              });
              return;
            }
          }
        } catch {
          setOrders(previousOrders);
          toast({
            title: 'Erro na Conferência',
            description: 'Falha na comunicação com o servidor ao salvar conferência.',
            variant: 'destructive',
          });
          return;
        }
      }

      const allChecked = updatedItems?.every((it) => it.checked);
      toast({
        title: allChecked ? 'Itens Conferidos' : 'Conferência Parcial Salva',
        description: allChecked
          ? 'Todos os itens foram verificados pela expedição.'
          : 'Conferência parcial registrada. Finalize os itens restantes antes do despacho.',
      });
    },
    [orders, isDemoMode, toast]
  );

  // Gate C: Adicionar pedido de teste EXCLUSIVAMENTE em modo demonstração (nunca persiste em produção)
  const handleAddDemoOrder = () => {
    if (!isDemoMode) return;

    const seq = Math.floor(1000 + Math.random() * 9000);
    const newDisplayId = `#DEMO-${seq}`;

    const newOrder: DeliveryOrder = {
      id: `demo-${Date.now()}`,
      workspace_id: workspaceId,
      channel_id: 'demo_channel',
      channel_order_id: `demo_${Date.now()}`,
      display_id: newDisplayId,
      customer_name: 'Cliente Simulado Demo',
      subtotal: 35.0,
      discount: 0,
      delivery_fee: 5.0,
      commission_amount: 0,
      net_amount: 40.0,
      status: 'received',
      payment_method: 'pix',
      payment_status: 'paid',
      is_demo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [
        {
          id: `demo_it_${Date.now()}_1`,
          order_id: `demo-${Date.now()}`,
          name: 'Item Simulado de Cozinha',
          quantity: 1,
          unit_price: 28.0,
          total_price: 28.0,
          checked: false,
          is_verified_in_kds: false,
        },
        {
          id: `demo_it_${Date.now()}_2`,
          order_id: `demo-${Date.now()}`,
          name: 'Bebida Simulada 350ml',
          quantity: 1,
          unit_price: 7.0,
          total_price: 7.0,
          checked: false,
          is_verified_in_kds: false,
        },
      ],
    };

    setOrders((prev) => [newOrder, ...prev]);

    if (soundEnabled) playKDSAlertChime();
    toast({
      title: 'Pedido Demo Injetado',
      description: `Pedido ${newDisplayId} gerado em memória de demonstração.`,
    });
  };

  // Filtragem de pedidos
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (selectedChannel === 'ifood' && !ord.channel_id.includes('ifood') && !ord.display_id.includes('ifood')) {
        return false;
      }
      if (selectedChannel === '99food' && !ord.channel_id.includes('99') && !ord.display_id.includes('99')) {
        return false;
      }
      if (selectedChannel === 'direct' && !ord.channel_id.includes('direct') && !ord.display_id.includes('DIR')) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = ord.customer_name.toLowerCase().includes(query);
        const matchesId = ord.display_id.toLowerCase().includes(query);
        const matchesAddress = ord.delivery_address?.toLowerCase().includes(query);
        return matchesName || matchesId || matchesAddress;
      }
      return true;
    });
  }, [orders, selectedChannel, searchQuery]);

  const receivedOrders = filteredOrders.filter((o) => o.status === 'received' || o.status === 'confirmed');
  const preparingOrders = filteredOrders.filter((o) => o.status === 'preparing');
  const readyOrders = filteredOrders.filter((o) => o.status === 'ready');
  const dispatchedOrders = filteredOrders.filter((o) => o.status === 'dispatched');

  return (
    <div className="space-y-4">
      {/* Top Header: Breadcrumb & Fullscreen CTA (Painel 6) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-border/40">
        <div className="text-sm text-muted-foreground flex items-center gap-1.5 font-medium">
          <span className="text-orange-500 font-bold">Delivery Growth</span>
          <span>›</span>
          <span className="text-foreground font-semibold">KDS — Painel de Cozinha</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={toggleFullScreen}
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs h-8 px-4 rounded-md shadow-sm"
          >
            Abrir KDS Tela Cheia (Cozinha)
          </Button>
        </div>
      </div>

      {/* 4 Contadores de Status do KDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Pedidos Pendentes */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-amber-400 font-medium">Pedidos Pendentes</div>
            <div className="text-2xl font-black text-amber-300 mt-0.5">
              {receivedOrders.length > 0 ? receivedOrders.length : (isDemoMode ? 5 : 0)}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            📋
          </div>
        </div>

        {/* Em Preparo */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-yellow-400 font-medium">Em Preparo</div>
            <div className="text-2xl font-black text-yellow-300 mt-0.5">
              {preparingOrders.length > 0 ? preparingOrders.length : (isDemoMode ? 3 : 0)}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold">
            🍳
          </div>
        </div>

        {/* Prontos */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-emerald-400 font-medium">Prontos</div>
            <div className="text-2xl font-black text-emerald-300 mt-0.5">
              {readyOrders.length > 0 ? readyOrders.length : (isDemoMode ? 2 : 0)}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            ✅
          </div>
        </div>

        {/* Tempo Médio */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-blue-400 font-medium">Tempo Médio</div>
            <div className="text-2xl font-black text-blue-300 mt-0.5">12 min</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
            ⏱️
          </div>
        </div>
      </div>
      {/* Alerta de Modo de Demonstração */}
      {isDemoMode && (
        <div className="p-3 bg-amber-500/15 border-2 border-amber-500/40 rounded-lg text-amber-950 dark:text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Modo de Demonstração Ativo:</strong> Você está visualizando pedidos simulados de teste. Eles não afetam vendas reais nem relatórios contábeis.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsDemoMode(false)}
            className="h-7 text-xs border-amber-600 text-amber-900 dark:text-amber-100 font-bold"
          >
            Sair do Modo Demo
          </Button>
        </div>
      )}

      {/* Alerta se tabelas ainda não foram migradas */}
      {!isDbConfigured && !isDemoMode && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-900 dark:text-blue-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              Tabela de pedidos aguardando migração em produção. O KDS está operando em memória local para permitir testes de interface da cozinha.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsDemoMode(true)}
            className="h-7 text-xs"
          >
            Carregar Dados de Demonstração
          </Button>
        </div>
      )}

      {/* Barra de Ferramentas Superior do KDS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-card border rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por #pedido ou cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 bg-muted p-1 rounded-md text-xs font-medium">
            <Button
              variant={selectedChannel === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedChannel('all')}
              className="h-7 px-2.5 text-xs"
            >
              Todos ({orders.length})
            </Button>
            <Button
              variant={selectedChannel === 'ifood' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedChannel('ifood')}
              className="h-7 px-2.5 text-xs text-red-600 dark:text-red-400 font-bold"
            >
              iFood
            </Button>
            <Button
              variant={selectedChannel === '99food' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedChannel('99food')}
              className="h-7 px-2.5 text-xs text-amber-600 dark:text-amber-400 font-bold"
            >
              99Food
            </Button>
            <Button
              variant={selectedChannel === 'direct' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedChannel('direct')}
              className="h-7 px-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold"
            >
              Direto
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Alternador de Modo Demo */}
          <Button
            variant={isDemoMode ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setIsDemoMode((prev) => !prev)}
            className={`h-9 text-xs font-semibold ${isDemoMode ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-400' : ''}`}
            title="Alternar entre pedidos reais e ambiente de treino"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {isDemoMode ? 'Modo Demo (Ativo)' : 'Ativar Modo Demo'}
          </Button>

          {/* Botão de Atualizar / Sincronizar */}
          <Button
            variant="ghost"
            size="sm"
            onClick={loadRealOrders}
            className="h-9 w-9 p-0"
            title="Recarregar pedidos"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {/* Alerta Sonoro */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playKDSAlertChime();
            }}
            className="h-9 text-xs flex items-center gap-1.5"
            title={soundEnabled ? 'Alertas sonoros ativos' : 'Alertas sonoros desativados'}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-4 w-4 text-primary animate-pulse" />
                <span className="hidden sm:inline">Som Ativo</span>
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4 text-muted-foreground" />
                <span className="hidden sm:inline">Mudo</span>
              </>
            )}
          </Button>

          {/* Simulação de Pedido Exclusiva em Modo Demo (Gate C) */}
          {isDemoMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddDemoOrder}
              className="h-9 text-xs flex items-center gap-1.5 border-amber-500 text-amber-700 dark:text-amber-300 font-bold hover:bg-amber-50 dark:hover:bg-amber-950/20"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span className="hidden sm:inline">+ Simular Pedido Demo</span>
            </Button>
          )}
        </div>
      </div>

      {/* Seletor de Modo: Tabela (Painel 6) vs Kanban */}
      <div className="flex items-center justify-between pt-1">
        <h3 className="text-sm font-bold text-foreground">Pedidos em Tempo Real</h3>
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/40 text-xs">
          <Button
            size="sm"
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            onClick={() => setViewMode('table')}
            className="h-7 px-3 text-xs font-semibold"
          >
            Tabela
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'kanban' ? 'default' : 'ghost'}
            onClick={() => setViewMode('kanban')}
            className="h-7 px-3 text-xs font-semibold"
          >
            Kanban
          </Button>
        </div>
      </div>

      {/* Visualização de Tabela em Tempo Real (Painel 6) */}
      {viewMode === 'table' ? (
        <div className="bg-card/70 border border-border/50 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-4 w-16">#</th>
                  <th className="py-2.5 px-4">Canal</th>
                  <th className="py-2.5 px-4">Cliente / Pedido</th>
                  <th className="py-2.5 px-4">Itens</th>
                  <th className="py-2.5 px-4">Tempo</th>
                  <th className="py-2.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {orders.length === 0 ? (
                  <>
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">7892</td>
                      <td className="py-3 px-4">
                        <Badge className="bg-red-600 text-white font-bold text-[10px] px-2 py-0">iFood</Badge>
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">João S.</td>
                      <td className="py-3 px-4 text-muted-foreground">2 itens</td>
                      <td className="py-3 px-4 text-muted-foreground">4 min</td>
                      <td className="py-3 px-4 text-right">
                        <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-semibold">
                          Em preparo
                        </Badge>
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">7891</td>
                      <td className="py-3 px-4">
                        <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0">WhatsApp</Badge>
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">Ana C.</td>
                      <td className="py-3 px-4 text-muted-foreground">3 itens</td>
                      <td className="py-3 px-4 text-muted-foreground">8 min</td>
                      <td className="py-3 px-4 text-right">
                        <Badge className="bg-sky-500/20 text-sky-400 border border-sky-500/40 text-[10px] font-semibold">
                          Novo
                        </Badge>
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">7890</td>
                      <td className="py-3 px-4">
                        <Badge className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0">Salão</Badge>
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">Cliente local</td>
                      <td className="py-3 px-4 text-muted-foreground">1 item</td>
                      <td className="py-3 px-4 text-muted-foreground">12 min</td>
                      <td className="py-3 px-4 text-right">
                        <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-semibold">
                          Em preparo
                        </Badge>
                      </td>
                    </tr>
                  </>
                ) : (
                  orders.map((ord) => {
                    const elapsedMin = Math.max(1, Math.round((Date.now() - new Date(ord.created_at).getTime()) / 60000));
                    const isIfood = ord.channel_id?.includes('ifood') || ord.display_id?.includes('ifood');
                    const isWhatsApp = ord.channel_id?.includes('direct') || ord.display_id?.includes('DIR');
                    return (
                      <tr key={ord.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          {ord.display_id.replace('#', '')}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            className={`font-bold text-[10px] px-2 py-0 ${
                              isIfood
                                ? 'bg-red-600 text-white'
                                : isWhatsApp
                                ? 'bg-emerald-600 text-white'
                                : 'bg-blue-600 text-white'
                            }`}
                          >
                            {isIfood ? 'iFood' : isWhatsApp ? 'WhatsApp' : 'Salão'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">{ord.customer_name}</td>
                        <td className="py-3 px-4 text-muted-foreground">{ord.items?.length || 1} itens</td>
                        <td className="py-3 px-4 text-muted-foreground">{elapsedMin} min</td>
                        <td className="py-3 px-4 text-right">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${
                              ord.status === 'received'
                                ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                                : ord.status === 'preparing'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {ord.status === 'received'
                              ? 'Novo'
                              : ord.status === 'preparing'
                              ? 'Em preparo'
                              : 'Pronto'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid de Colunas do KDS (Responsivo para Mac, Telas Touch e Tablets Android) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {/* Coluna 1: Novos */}
        <div className="flex flex-col bg-muted/20 border border-border/80 rounded-lg p-2.5 min-h-[500px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-sm">Novos / Pendentes</h3>
            </div>
            <Badge variant="secondary" className="font-bold">
              {receivedOrders.length}
            </Badge>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {receivedOrders.map((ord) => (
              <KDSOrderCard
                key={ord.id}
                order={ord}
                onStatusChange={handleStatusChange}
                onOpenChecklist={setActiveChecklistOrder}
              />
            ))}
            {receivedOrders.length === 0 && (
              <div className="text-center py-16 text-xs text-muted-foreground">
                Nenhum novo pedido na fila
              </div>
            )}
          </div>
        </div>

        {/* Coluna 2: Em Preparo */}
        <div className="flex flex-col bg-muted/20 border border-border/80 rounded-lg p-2.5 min-h-[500px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b">
            <div className="flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-amber-500" />
              <h3 className="font-bold text-sm">Na Cozinha / Preparo</h3>
            </div>
            <Badge variant="secondary" className="font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300">
              {preparingOrders.length}
            </Badge>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {preparingOrders.map((ord) => (
              <KDSOrderCard
                key={ord.id}
                order={ord}
                onStatusChange={handleStatusChange}
                onOpenChecklist={setActiveChecklistOrder}
              />
            ))}
            {preparingOrders.length === 0 && (
              <div className="text-center py-16 text-xs text-muted-foreground">
                Cozinha livre
              </div>
            )}
          </div>
        </div>

        {/* Coluna 3: Prontos */}
        <div className="flex flex-col bg-muted/20 border border-border/80 rounded-lg p-2.5 min-h-[500px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <h3 className="font-bold text-sm">Prontos / Aguardando Motoboy</h3>
            </div>
            <Badge variant="secondary" className="font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {readyOrders.length}
            </Badge>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {readyOrders.map((ord) => (
              <KDSOrderCard
                key={ord.id}
                order={ord}
                onStatusChange={handleStatusChange}
                onOpenChecklist={setActiveChecklistOrder}
              />
            ))}
            {readyOrders.length === 0 && (
              <div className="text-center py-16 text-xs text-muted-foreground">
                Nenhum pedido aguardando retirada
              </div>
            )}
          </div>
        </div>

        {/* Coluna 4: Em Rota / Despachados */}
        <div className="flex flex-col bg-muted/20 border border-border/80 rounded-lg p-2.5 min-h-[500px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b">
            <div className="flex items-center gap-2">
              <Bike className="h-4 w-4 text-blue-500" />
              <h3 className="font-bold text-sm">Em Rota / Despachados</h3>
            </div>
            <Badge variant="secondary" className="font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300">
              {dispatchedOrders.length}
            </Badge>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {dispatchedOrders.map((ord) => (
              <KDSOrderCard
                key={ord.id}
                order={ord}
                onStatusChange={handleStatusChange}
                onOpenChecklist={setActiveChecklistOrder}
              />
            ))}
            {dispatchedOrders.length === 0 && (
              <div className="text-center py-16 text-xs text-muted-foreground">
                Nenhum pedido em rota no momento
              </div>
            )}
          </div>
        </div>
      </div>
    )}

      {/* Modal de Conferência de Itens do Pedido */}
      <ItemChecklistDialog
        order={activeChecklistOrder}
        isOpen={Boolean(activeChecklistOrder)}
        onClose={() => setActiveChecklistOrder(null)}
        onConfirmChecked={handleConfirmCheckedItems}
      />
    </div>
  );
};
