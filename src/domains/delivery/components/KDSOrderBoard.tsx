import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import {
  Volume2,
  VolumeX,
  Search,
  PlusCircle,
  ChefHat,
  Package,
  Bike,
  CheckCircle,
} from 'lucide-react';
import { DeliveryOrder, DeliveryOrderStatus } from '../types';
import { KDSOrderCard } from './KDSOrderCard';
import { ItemChecklistDialog } from './ItemChecklistDialog';
import { useToast } from '@/shared/hooks/use-toast';

// Sons sintéticos via Web Audio API (sem dependência de arquivo externo)
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

interface KDSOrderBoardProps {
  initialOrders?: DeliveryOrder[];
  workspaceId?: string;
}

export const KDSOrderBoard: React.FC<KDSOrderBoardProps> = ({
  initialOrders,
  workspaceId = 'default_workspace',
}) => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<DeliveryOrder[]>(() => {
    if (initialOrders && initialOrders.length > 0) return initialOrders;
    // Pedidos de demonstração padrão para inicialização da cozinha Rodo Point
    const now = Date.now();
    return [
      {
        id: 'ord-1042',
        workspace_id: workspaceId,
        channel_id: 'ifood_channel',
        channel_order_id: 'ifood-90812',
        display_id: '#1042',
        customer_name: 'Carlos Eduardo M.',
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
        created_at: new Date(now - 8 * 60000).toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'it-1',
            order_id: 'ord-1042',
            name: 'X-Tudo Especial Rodo Point',
            quantity: 1,
            unit_price: 34.0,
            total_price: 34.0,
            notes: 'Sem cebola crua',
          },
          {
            id: 'it-2',
            order_id: 'ord-1042',
            name: 'Porção Batata Rústica Pequena',
            quantity: 1,
            unit_price: 16.0,
            total_price: 16.0,
          },
          {
            id: 'it-3',
            order_id: 'ord-1042',
            name: 'Coca-Cola Zero 350ml',
            quantity: 1,
            unit_price: 8.0,
            total_price: 8.0,
          },
        ],
      },
      {
        id: 'ord-1043',
        workspace_id: workspaceId,
        channel_id: '99_channel',
        channel_order_id: '99-88124',
        display_id: '#99-1043',
        customer_name: 'Mariana Silva',
        customer_phone: '(11) 97123-9988',
        delivery_address: 'Rua Bela Cintra, 450',
        subtotal: 42.0,
        discount: 5.0,
        delivery_fee: 6.0,
        commission_amount: 8.4,
        net_amount: 34.6,
        status: 'preparing',
        payment_method: 'credit_card',
        payment_status: 'paid',
        created_at: new Date(now - 18 * 60000).toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'it-4',
            order_id: 'ord-1043',
            name: 'Misto Quente Especial no Pão Francês',
            quantity: 2,
            unit_price: 15.0,
            total_price: 30.0,
          },
          {
            id: 'it-5',
            order_id: 'ord-1043',
            name: 'Suco de Laranja Natural 500ml',
            quantity: 1,
            unit_price: 12.0,
            total_price: 12.0,
          },
        ],
      },
      {
        id: 'ord-1044',
        workspace_id: workspaceId,
        channel_id: 'direct_channel',
        channel_order_id: 'dir-5510',
        display_id: '#DIR-1044',
        customer_name: 'Roberto Andrade (Balcão)',
        customer_phone: '(11) 96541-0022',
        subtotal: 28.0,
        discount: 0,
        delivery_fee: 0,
        commission_amount: 0,
        net_amount: 28.0,
        status: 'ready',
        payment_method: 'pix',
        payment_status: 'paid',
        created_at: new Date(now - 28 * 60000).toISOString(), // Atrasado propositalmente para teste
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'it-6',
            order_id: 'ord-1044',
            name: 'Prato Feito Rodo Point — Bife a Cavalo',
            quantity: 1,
            unit_price: 28.0,
            total_price: 28.0,
          },
        ],
      },
    ];
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChecklistOrder, setActiveChecklistOrder] = useState<DeliveryOrder | null>(null);

  // Manipulador de transição de status
  const handleStatusChange = useCallback(
    (orderId: string, nextStatus: DeliveryOrderStatus) => {
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

      if (soundEnabled) {
        playKDSAlertChime();
      }

      toast({
        title: 'Status Atualizado',
        description: `Pedido ${orderId} avançou para ${nextStatus}.`,
      });
    },
    [soundEnabled, toast]
  );

  // Confirmação de itens no checklist
  const handleConfirmCheckedItems = useCallback(
    (orderId: string) => {
      setOrders((prev) =>
        prev.map((ord) => {
          if (ord.id !== orderId) return ord;
          const updatedItems = ord.items?.map((it) => ({ ...it, checked: true }));
          return { ...ord, items: updatedItems };
        })
      );
      toast({
        title: 'Itens Conferidos',
        description: 'Todos os itens foram marcados como conferidos pela expedição.',
      });
    },
    [toast]
  );

  // Adicionar pedido rápido de teste
  const handleAddQuickOrder = () => {
    const newId = `#DIR-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrder: DeliveryOrder = {
      id: `ord_${Date.now()}`,
      workspace_id: workspaceId,
      channel_id: 'direct_channel',
      channel_order_id: `manual_${Date.now()}`,
      display_id: newId,
      customer_name: 'Cliente Direto Rodo Point',
      subtotal: 35.0,
      discount: 0,
      delivery_fee: 5.0,
      commission_amount: 0,
      net_amount: 40.0,
      status: 'received',
      payment_method: 'pix',
      payment_status: 'paid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [
        {
          id: `it_${Date.now()}_1`,
          order_id: `ord_${Date.now()}`,
          name: 'Hambúrguer Artesanal da Casa',
          quantity: 1,
          unit_price: 27.0,
          total_price: 27.0,
        },
        {
          id: `it_${Date.now()}_2`,
          order_id: `ord_${Date.now()}`,
          name: 'Refrigerante Lata 350ml',
          quantity: 1,
          unit_price: 8.0,
          total_price: 8.0,
        },
      ],
    };

    setOrders((prev) => [newOrder, ...prev]);
    if (soundEnabled) playKDSAlertChime();
    toast({
      title: 'Novo Pedido Recebido!',
      description: `Pedido ${newId} adicionado à esteira do KDS.`,
    });
  };

  // Filtragem
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      // Filtro de canal
      if (selectedChannel === 'ifood' && !ord.channel_id.includes('ifood') && !ord.display_id.includes('1042')) {
        return false;
      }
      if (selectedChannel === '99food' && !ord.channel_id.includes('99') && !ord.display_id.includes('99')) {
        return false;
      }
      if (selectedChannel === 'direct' && !ord.channel_id.includes('direct') && !ord.display_id.includes('DIR')) {
        return false;
      }
      // Filtro de busca
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

  // Colunas do KDS
  const receivedOrders = filteredOrders.filter((o) => o.status === 'received' || o.status === 'confirmed');
  const preparingOrders = filteredOrders.filter((o) => o.status === 'preparing');
  const readyOrders = filteredOrders.filter((o) => o.status === 'ready');
  const dispatchedOrders = filteredOrders.filter((o) => o.status === 'dispatched');

  return (
    <div className="space-y-4">
      {/* Barra de Ferramentas Superior do KDS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-card border rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por #pedido ou nome..."
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

          <Button
            variant="default"
            size="sm"
            onClick={handleAddQuickOrder}
            className="h-9 text-xs flex items-center gap-1.5 bg-primary"
          >
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">+ Pedido Rápido</span>
          </Button>
        </div>
      </div>

      {/* Grid de Colunas do KDS (Responsivo para Mac, Telas Touch e Tablets Android) */}
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
              <div className="text-center py-12 text-xs text-muted-foreground">
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
              <div className="text-center py-12 text-xs text-muted-foreground">
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
              <div className="text-center py-12 text-xs text-muted-foreground">
                Nenhum pedido pronto aguardando
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
              <div className="text-center py-12 text-xs text-muted-foreground">
                Nenhum pedido em rota no momento
              </div>
            )}
          </div>
        </div>
      </div>

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
