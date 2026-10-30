import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  PackageCheck,
  Send,
  Check,
  User,
  MapPin,
  FileText,
} from 'lucide-react';
import { DeliveryOrder, DeliveryOrderStatus } from '../types';

interface KDSOrderCardProps {
  order: DeliveryOrder;
  onStatusChange: (orderId: string, nextStatus: DeliveryOrderStatus) => void;
  onOpenChecklist: (order: DeliveryOrder) => void;
}

export const KDSOrderCard: React.FC<KDSOrderCardProps> = ({
  order,
  onStatusChange,
  onOpenChecklist,
}) => {
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);

  // Calcula tempo decorrido dinamicamente a cada 30 segundos
  useEffect(() => {
    const calculateElapsed = () => {
      const created = new Date(order.created_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - created) / 60000));
      setElapsedMinutes(diff);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 30000);
    return () => clearInterval(interval);
  }, [order.created_at]);

  // Alerta de tempo (Verde < 15m, Amarelo 15-25m, Vermelho > 25m)
  const isDelayed = elapsedMinutes >= 25;
  const isWarning = elapsedMinutes >= 15 && elapsedMinutes < 25;

  const timerColorClass = isDelayed
    ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-300 dark:border-red-800 animate-pulse'
    : isWarning
    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800'
    : 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-300 dark:border-green-800';

  // Badge do canal
  const getChannelBadge = () => {
    const cid = (order.channel_id || '').toLowerCase();
    const isIfood = cid.includes('ifood') || order.display_id.toLowerCase().includes('ifood');
    const is99 = cid.includes('99') || order.display_id.toLowerCase().includes('99');

    if (isIfood) {
      return (
        <Badge variant="outline" className="bg-red-600 text-white font-bold border-red-600">
          iFood
        </Badge>
      );
    }
    if (is99) {
      return (
        <Badge variant="outline" className="bg-amber-500 text-stone-900 font-bold border-amber-500">
          99Food
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-emerald-600 text-white font-bold border-emerald-600">
        Direto
      </Badge>
    );
  };

  return (
    <Card
      className={`border-2 transition-all shadow-sm ${
        isDelayed
          ? 'border-red-400 dark:border-red-700 bg-red-50/10'
          : order.status === 'ready'
          ? 'border-green-400 dark:border-green-700'
          : 'border-border'
      }`}
    >
      <CardHeader className="p-3 pb-2 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg text-foreground tracking-tight">
              {order.display_id}
            </span>
            {getChannelBadge()}
          </div>

          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${timerColorClass}`}>
            {isDelayed ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            <span>{elapsedMinutes} min</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1 truncate font-medium">
            <User className="h-3 w-3 shrink-0" />
            {order.customer_name}
          </span>
          {order.delivery_address && (
            <span className="flex items-center gap-1 text-[11px] truncate max-w-[140px]" title={order.delivery_address}>
              <MapPin className="h-3 w-3 shrink-0" />
              {order.delivery_address}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-3">
        {/* Observações com destaque visual */}
        {order.notes && (
          <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
            <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
            <span className="italic font-medium">{order.notes}</span>
          </div>
        )}

        {/* Lista de Itens do Pedido */}
        <div className="space-y-1.5">
          {order.items?.map((item) => (
            <div key={item.id} className="flex items-start justify-between text-sm py-0.5 border-b border-border/40 last:border-0">
              <div className="flex items-start gap-2">
                <span className="font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs min-w-[24px] text-center">
                  {item.quantity}x
                </span>
                <div>
                  <span className="font-medium text-foreground">{item.name}</span>
                  {item.notes && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                      {item.notes}
                    </p>
                  )}
                  {item.options && item.options.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {item.options.map((o) => `+ ${o.name}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Ações de Transição de Status no KDS */}
        <div className="pt-2 flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChecklist(order)}
            className="w-full text-xs font-semibold h-8 flex items-center justify-center gap-1.5"
          >
            <PackageCheck className="h-3.5 w-3.5 text-primary" />
            Conferir Itens
          </Button>

          {order.status === 'received' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onStatusChange(order.id, 'preparing')}
              className="w-full text-xs font-bold h-9 bg-primary hover:bg-primary/90 flex items-center justify-center gap-1.5"
            >
              <Play className="h-4 w-4" />
              Iniciar Preparo
            </Button>
          )}

          {order.status === 'confirmed' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onStatusChange(order.id, 'preparing')}
              className="w-full text-xs font-bold h-9 bg-primary hover:bg-primary/90 flex items-center justify-center gap-1.5"
            >
              <Play className="h-4 w-4" />
              Iniciar Preparo
            </Button>
          )}

          {order.status === 'preparing' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onStatusChange(order.id, 'ready')}
              className="w-full text-xs font-bold h-9 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              Marcar Pronto
            </Button>
          )}

          {order.status === 'ready' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onStatusChange(order.id, 'dispatched')}
              className="w-full text-xs font-bold h-9 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5"
            >
              <Send className="h-4 w-4" />
              Despachar / Entregar Motoboy
            </Button>
          )}

          {order.status === 'dispatched' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusChange(order.id, 'delivered')}
              className="w-full text-xs font-bold h-9 text-green-700 border-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 flex items-center justify-center gap-1.5"
            >
              <Check className="h-4 w-4" />
              Concluir Entrega
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
