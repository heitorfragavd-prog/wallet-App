import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { CheckCircle2, AlertCircle, PackageCheck } from 'lucide-react';
import { DeliveryOrder, DeliveryOrderItem } from '../types';

interface ItemChecklistDialogProps {
  order: DeliveryOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmChecked: (orderId: string) => void;
}

export const ItemChecklistDialog: React.FC<ItemChecklistDialogProps> = ({
  order,
  isOpen,
  onClose,
  onConfirmChecked,
}) => {
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    order?.items?.forEach((item) => {
      initial[item.id] = !!item.checked;
    });
    return initial;
  });

  if (!order) return null;

  const items = order.items || [];
  const totalItems = items.length;
  const checkedCount = items.filter((it) => checkedMap[it.id]).length;
  const allChecked = totalItems > 0 && checkedCount === totalItems;

  const toggleItem = (itemId: string) => {
    setCheckedMap((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const checkAll = () => {
    const update: Record<string, boolean> = {};
    items.forEach((it) => {
      update[it.id] = true;
    });
    setCheckedMap(update);
  };

  const handleConfirm = () => {
    onConfirmChecked(order.id);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl flex items-center gap-2">
              <PackageCheck className="h-6 w-6 text-primary" />
              Conferência de Expedição {order.display_id}
            </DialogTitle>
          </div>
          <DialogDescription>
            Confira todos os itens e adicionais antes de liberar para o entregador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Barra de Progresso */}
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">Progresso da conferência:</span>
            <span
              className={`font-semibold ${
                allChecked ? 'text-green-600 dark:text-green-400' : 'text-amber-600'
              }`}
            >
              {checkedCount} de {totalItems} itens verificados
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                allChecked ? 'bg-green-500' : 'bg-primary'
              }`}
              style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }}
            />
          </div>

          {/* Observações do Cliente */}
          {order.notes && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md text-amber-900 dark:text-amber-200 text-sm flex gap-2 items-start">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <strong>Atenção às instruções do cliente:</strong>
                <p className="mt-0.5 italic">{order.notes}</p>
              </div>
            </div>
          )}

          {/* Lista de Itens com Checkbox Grande para Toque em Tablet/Mobile */}
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {items.map((item: DeliveryOrderItem) => {
              const isChecked = !!checkedMap[item.id];
              return (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                    isChecked
                      ? 'bg-green-50/60 dark:bg-green-950/20 border-green-300 dark:border-green-800'
                      : 'bg-card hover:bg-muted/50 border-border'
                  }`}
                >
                  <Checkbox
                    id={`check-${item.id}`}
                    checked={isChecked}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-1 h-5 w-5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-base">
                        <span className="inline-block px-1.5 py-0.5 bg-primary/10 text-primary font-bold rounded mr-1.5 text-sm">
                          {item.quantity}x
                        </span>
                        {item.name}
                      </span>
                    </div>

                    {item.notes && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 italic">
                        Obs: {item.notes}
                      </p>
                    )}

                    {item.options && item.options.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.options.map((opt, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="text-primary font-medium">+ {opt.quantity}x</span>
                            <span>{opt.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={checkAll}
            disabled={allChecked}
          >
            Marcar Todos
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={allChecked ? 'default' : 'secondary'}
              onClick={handleConfirm}
              className={allChecked ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {allChecked ? 'Conferência Completa' : 'Confirmar Parcial'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
