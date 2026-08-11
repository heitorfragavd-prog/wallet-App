import React from "react";
import { Smartphone, Wifi, WifiOff } from "lucide-react";

interface Props {
  terminalLabel?: string;
}

export const PDVHeader: React.FC<Props> = ({ terminalLabel }) => {
  const isOnline = true;
  return (
    <header className="flex items-center justify-between px-5 py-3 bg-[#0B132B]/80 border-b border-[#1E2942] backdrop-blur-md shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <img src="/rodo-point-logo.png" alt="Rodo Point Logo" className="h-8 w-auto object-contain" />
          <p className="text-[9px] text-slate-400 uppercase tracking-widest font-black mt-0.5">Frente de Caixa</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1C2541]/50 border border-[#1E2942]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-semibold text-slate-200">Caixa 01 — Aberto</span>
        </div>
        {terminalLabel && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1C2541]/50 border border-emerald-500/30">
            <Smartphone className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-300">{terminalLabel}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px]">
          {isOnline ? (
            <><Wifi className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400 hidden sm:inline">Online</span></>
          ) : (
            <><WifiOff className="w-3.5 h-3.5 text-rose-400" /><span className="text-rose-400 hidden sm:inline">Offline</span></>
          )}
        </div>
      </div>
    </header>
  );
};
