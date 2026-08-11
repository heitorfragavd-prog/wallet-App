import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Minus, Plus, Trash2, ShoppingCart, CreditCard, Banknote, X, Receipt } from "lucide-react";
import type { CartItem } from "../hooks/usePDVCart";

interface Props {
  items: CartItem[]; subtotal: number; discount: number; total: number; itemCount: number;
  onIncrement: (id: string) => void; onDecrement: (id: string) => void; onRemove: (id: string) => void;
  onClear: () => void; onCheckout: () => void; onCashPayment: () => void;
}

export const PDVCart: React.FC<Props> = ({ items, subtotal, discount, total, itemCount, onIncrement, onDecrement, onRemove, onClear, onCheckout, onCashPayment }) => {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="flex flex-col h-full bg-[#0B132B]/40 border-l border-[#1E2942]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2942]">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-200">CARRINHO</h2>
          <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] border-0">{itemCount} {itemCount === 1 ? "item" : "itens"}</Badge>
        </div>
        {items.length > 0 && <Button size="sm" variant="ghost" className="h-7 text-[10px] text-rose-400 hover:bg-rose-500/10" onClick={onClear}><X className="w-3 h-3 mr-1" />Limpar</Button>}
      </div>
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-2 py-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500"><Receipt className="w-10 h-10 mb-2 opacity-30" /><p className="text-xs">Carrinho vazio</p></div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 p-2.5 bg-[#1C2541]/40 rounded-xl border border-[#1E2942]/40">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">{item.name}</p>
                  <p className="text-[10px] text-emerald-400 font-mono">{fmt(item.price)} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => onDecrement(item.id)}><Minus className="w-3 h-3" /></Button>
                  <span className="w-6 text-center text-xs font-bold text-slate-200">{item.quantity}</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => onIncrement(item.id)}><Plus className="w-3 h-3" /></Button>
                </div>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10" onClick={() => onRemove(item.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-[#1E2942] px-4 py-3 space-y-2">
        <div className="flex justify-between text-xs text-slate-400"><span>Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
        {discount > 0 && <div className="flex justify-between text-xs text-amber-400"><span>Desconto</span><span className="font-mono">-{fmt(discount)}</span></div>}
        <div className="flex justify-between items-end pt-1 border-t border-[#1E2942]/50">
          <span className="text-xs font-bold text-slate-300">TOTAL A PAGAR</span>
          <span className="text-2xl font-extrabold text-emerald-400">{fmt(total)}</span>
        </div>
      </div>
      <div className="px-4 pb-4 space-y-2">
        <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.98]" onClick={onCheckout} disabled={items.length === 0}>
          <CreditCard className="w-4 h-4 mr-2" />[F4] ENVIAR PARA A MAQUININHA
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-9 border-[#1E2942] text-slate-300 hover:bg-slate-800 text-xs rounded-xl" onClick={onCashPayment} disabled={items.length === 0}><Banknote className="w-3.5 h-3.5 mr-1.5" />[F8] Dinheiro</Button>
          <Button variant="outline" className="h-9 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs rounded-xl" onClick={onClear} disabled={items.length === 0}><X className="w-3.5 h-3.5 mr-1.5" />[ESC] Cancelar</Button>
        </div>
      </div>
    </div>
  );
};
