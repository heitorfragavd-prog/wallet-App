import React, { useState, useEffect } from "react";
import { Store, Truck, Utensils, RefreshCw, Settings, DollarSign } from "lucide-react";

export type PDVTab = "vender" | "entregar" | "atender" | "sincronizar" | "configurar" | "operacoes";

interface SidebarItem {
  id: PDVTab;
  label: string;
  icon: React.ReactNode;
}

interface Props {
  activeTab: PDVTab;
  onTabChange: (tab: PDVTab) => void;
  disabled?: boolean;
}

export const PDVSidebar: React.FC<Props> = ({ activeTab, onTabChange, disabled = false }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dayName = time.toLocaleDateString("pt-BR", { weekday: "long" }).split("-")[0].toUpperCase();
  const timeStr = time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const menuItems: SidebarItem[] = [
    { id: "vender", label: "Vender", icon: <Store className="w-6 h-6" /> },
    { id: "entregar", label: "Entregar", icon: <Truck className="w-6 h-6" /> },
    { id: "atender", label: "Atender", icon: <Utensils className="w-6 h-6" /> },
    { id: "sincronizar", label: "Sincronizar", icon: <RefreshCw className="w-6 h-6" /> },
    { id: "configurar", label: "Configurar", icon: <Settings className="w-6 h-6" /> },
    { id: "operacoes", label: "Operações", icon: <DollarSign className="w-6 h-6" /> },
  ];

  return (
    <aside className="w-[88px] h-full bg-gradient-to-b from-[#0f1628] to-[#0a0e1a] flex flex-col shrink-0 text-white select-none shadow-[4px_0_24px_rgba(0,0,0,0.4)] z-20 border-r border-white/[0.06]">
      {/* Bloco de Data e Hora no topo */}
      <div className="flex flex-col items-center justify-center py-3.5 border-b border-white/[0.08] bg-emerald-500/10 shrink-0 text-center px-1">
        <p className="text-[10px] font-bold tracking-wider leading-tight text-emerald-400">{dayName}</p>
        <p className="text-sm font-black mt-0.5 tracking-tight text-white">{timeStr}</p>
      </div>

      {/* Itens do Menu */}
      <div className="flex-1 flex flex-col pt-2 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          const isButtonDisabled = disabled && item.id !== "operacoes" && item.id !== "sincronizar" && item.id !== "configurar";
          return (
            <button
              key={item.id}
              onClick={() => !isButtonDisabled && onTabChange(item.id)}
              disabled={isButtonDisabled}
              className={`w-full py-3 flex flex-col items-center justify-center gap-1.5 transition-all duration-200 text-center relative border-b border-white/[0.04]
                ${isActive ? "bg-emerald-500/[0.12] text-emerald-400 font-bold" : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"}
                ${isButtonDisabled ? "opacity-30 cursor-not-allowed hover:bg-transparent" : "cursor-pointer active:scale-95"}
              `}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-r shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
              )}
              <div className={`p-1.5 rounded-xl transition-all duration-200 ${isActive ? "bg-emerald-500/[0.15] shadow-[0_0_12px_rgba(52,211,153,0.15)]" : ""}`}>
                {item.icon}
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
