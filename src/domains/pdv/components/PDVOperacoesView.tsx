import React, { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import {
  ShoppingBag,
  Lock,
  ArrowUpCircle,
  ArrowDownCircle,
  History,
  RefreshCw,
  ArrowLeft,
  Receipt,
  Plus
} from "lucide-react";

interface Props {
  saldoCaixa: number;
  movimentacoes: Array<{ tipo: "abertura" | "venda" | "sangria" | "reforco", valor: number, hora: string, motivo?: string }>;
  vendas: Array<{ id: string, total: number, hora: string, itens: number, metodo: string }>;
  onSangria: () => void;
  onReforco: () => void;
  onFechamento: () => void;
  onSincronizar: () => void;
}

export const PDVOperacoesView: React.FC<Props> = ({
  saldoCaixa,
  movimentacoes,
  vendas,
  onSangria,
  onReforco,
  onFechamento,
  onSincronizar
}) => {
  const [subView, setSubView] = useState<"grid" | "vendas" | "movimentacoes">("grid");

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (subView === "vendas") {
    return (
      <div className="flex flex-col h-full bg-[#111827]/40 border border-[#1E2942] rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-6 shrink-0">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-full text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => setSubView("grid")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-bold text-white">Histórico de Vendas</h2>
            <p className="text-xs text-slate-400">Vendas finalizadas nesta sessão</p>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-3 pr-2">
            {vendas.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma venda realizada ainda.</p>
              </div>
            ) : (
              vendas.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-4 bg-[#1C2541]/40 rounded-2xl border border-[#1E2942]/60">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-200">Venda #{v.id.substring(0, 6).toUpperCase()}</p>
                    <p className="text-xs text-slate-400">{v.hora} • {v.itens} {v.itens === 1 ? "item" : "itens"} • {v.metodo}</p>
                  </div>
                  <span className="text-lg font-black text-emerald-400">{fmt(v.total)}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (subView === "movimentacoes") {
    return (
      <div className="flex flex-col h-full bg-[#111827]/40 border border-[#1E2942] rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-6 shrink-0">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-full text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => setSubView("grid")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-bold text-white">Movimentações do Caixa</h2>
            <p className="text-xs text-slate-400">Extrato de fluxo da gaveta de dinheiro</p>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-3 pr-2">
            {movimentacoes.map((m, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-[#1C2541]/40 rounded-2xl border border-[#1E2942]/60">
                <div className="space-y-1">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider
                    ${m.tipo === "abertura" ? "bg-blue-500/20 text-blue-400" : ""}
                    ${m.tipo === "venda" ? "bg-emerald-500/20 text-emerald-400" : ""}
                    ${m.tipo === "reforco" ? "bg-amber-500/20 text-amber-400" : ""}
                    ${m.tipo === "sangria" ? "bg-rose-500/20 text-rose-400" : ""}
                  `}>
                    {m.tipo === "abertura" ? "Abertura" : m.tipo === "venda" ? "Venda" : m.tipo === "reforco" ? "Reforço" : "Sangria"}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">{m.hora} {m.motivo ? `• ${m.motivo}` : ""}</p>
                </div>
                <span className={`text-base font-black ${m.tipo === "sangria" ? "text-rose-400" : "text-emerald-400"}`}>
                  {m.tipo === "sangria" ? "-" : "+"}{fmt(m.valor)}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Resumo superior */}
      <div className="flex items-center justify-between p-6 bg-[#1C2541]/40 border border-[#1E2942]/60 rounded-3xl mb-6 shrink-0">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo em Dinheiro na Gaveta</p>
          <p className="text-3xl font-black text-emerald-400 mt-1">{fmt(saldoCaixa)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 rounded-xl" onClick={onReforco}>
            <ArrowDownCircle className="w-4 h-4 mr-2" />Reforço
          </Button>
          <Button variant="outline" className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-xl" onClick={onSangria}>
            <ArrowUpCircle className="w-4 h-4 mr-2" />Sangria
          </Button>
        </div>
      </div>

      {/* Grade de 6 Operações principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto pb-4 flex-1">
        <button onClick={() => setSubView("vendas")} className="group p-6 bg-[#1C2541]/30 border border-[#1E2942]/60 rounded-3xl hover:bg-emerald-500/5 hover:border-emerald-500/30 transition-all active:scale-[0.98] text-center flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">Vendas</h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">Lista de recibos</p>
          </div>
        </button>

        <button onClick={onFechamento} className="group p-6 bg-[#1C2541]/30 border border-[#1E2942]/60 rounded-3xl hover:bg-rose-500/5 hover:border-rose-500/30 transition-all active:scale-[0.98] text-center flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:bg-rose-500/20">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors">Fechamento</h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">Encerrar expediente</p>
          </div>
        </button>

        <button onClick={onSangria} className="group p-6 bg-[#1C2541]/30 border border-[#1E2942]/60 rounded-3xl hover:bg-amber-500/5 hover:border-amber-500/30 transition-all active:scale-[0.98] text-center flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20">
            <ArrowUpCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">Sangria</h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">Retirada de valor</p>
          </div>
        </button>

        <button onClick={onReforco} className="group p-6 bg-[#1C2541]/30 border border-[#1E2942]/60 rounded-3xl hover:bg-blue-500/5 hover:border-blue-500/30 transition-all active:scale-[0.98] text-center flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20">
            <ArrowDownCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">Reforço</h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">Suprimento de troco</p>
          </div>
        </button>

        <button onClick={() => setSubView("movimentacoes")} className="group p-6 bg-[#1C2541]/30 border border-[#1E2942]/60 rounded-3xl hover:bg-purple-500/5 hover:border-purple-500/30 transition-all active:scale-[0.98] text-center flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500/20">
            <History className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors">Movimentações</h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">Extrato da gaveta</p>
          </div>
        </button>

        <button onClick={onSincronizar} className="group p-6 bg-[#1C2541]/30 border border-[#1E2942]/60 rounded-3xl hover:bg-teal-500/5 hover:border-teal-500/30 transition-all active:scale-[0.98] text-center flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:bg-teal-500/20">
            <RefreshCw className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-teal-400 transition-colors">Sincronizar</h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">Atualizar com ERP</p>
          </div>
        </button>
      </div>
    </div>
  );
};
