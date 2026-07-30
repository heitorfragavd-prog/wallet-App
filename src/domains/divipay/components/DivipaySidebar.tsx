import { useState } from "react";
import { 
  LayoutDashboard, 
  TrendingUp, 
  QrCode, 
  ArrowDownLeft, 
  Wallet, 
  ArrowUpRight, 
  Settings, 
  MessageSquare, 
  Calculator, 
  Menu,
  Building2
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/lib/utils";

interface DivipaySidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  accountNumber?: string;
  accountName?: string;
}

export function DivipaySidebar({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  accountNumber = "590232-1",
  accountName = "49.683.323 Heitor Fraga de Oliveira",
}: DivipaySidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "vendas", label: "Vendas", icon: TrendingUp, targetTab: "extrato" },
    { id: "cobrancas", label: "Cobranças", icon: QrCode },
    { id: "depositar", label: "Depositar", icon: ArrowDownLeft, targetTab: "cobrancas" },
    { id: "extrato", label: "Saldos & Extrato", icon: Wallet, targetTab: "extrato" },
    { id: "transferencias", label: "Saques", icon: ArrowUpRight },
    { id: "configuracoes", label: "Configurações", icon: Settings },
  ];

  return (
    <aside
      className={cn(
        "relative flex flex-col bg-card/95 backdrop-blur-md border-r border-border/60 transition-all duration-300 ease-in-out z-20 shadow-sm flex-shrink-0 min-h-[750px] rounded-2xl my-1",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Top Header com Logo Oficial e Botão Hambúrguer de 3 Riscos */}
      <div className="flex items-center justify-between p-3.5 border-b border-border/50">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <img 
              src="/logos/divipay.png" 
              alt="Divipay Logo" 
              className="h-8 object-contain drop-shadow-sm" 
            />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden mx-auto">
            <img 
              src="/logos/divipay.png" 
              alt="Divipay Logo" 
              className="h-7 w-7 object-contain" 
            />
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className={cn("h-8 w-8 rounded-lg hover:bg-amber-500/10 hover:text-amber-500 text-muted-foreground transition-colors", collapsed ? "mt-2" : "")}
          title={collapsed ? "Expandir menu Divipay" : "Encolher menu Divipay"}
        >
          <Menu className="w-4 h-4" />
        </Button>
      </div>


      {/* Informações da Conta (quando expandido) */}
      {!collapsed && (
        <div className="p-3.5 m-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5 animate-in fade-in-50 duration-200">
          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 truncate">
            Olá, {accountName}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Sua conta: <span className="font-bold text-foreground">{accountNumber}</span>
          </p>
          <Button
            size="sm"
            onClick={() => onSelectTab("cobrancas")}
            className="w-full h-7 text-[11px] bg-amber-500 hover:bg-amber-600 text-white gap-1.5 rounded-lg shadow-xs mt-1"
          >
            <Calculator className="w-3 h-3" /> Calculadora de Taxas
          </Button>
        </div>
      )}

      {/* Links de Navegação Principal */}
      <div className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id || (item.targetTab && activeTab === item.targetTab);
          const Icon = item.icon;
          const target = item.targetTab || item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(target)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group",
                isActive
                  ? "bg-amber-500 text-white font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110", isActive ? "text-white" : "text-amber-500")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Rodapé do Menu (Feedback & Ajuda) */}
      {!collapsed && (
        <div className="p-3 border-t border-border/50 space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectTab("configuracoes")}
            className="w-full h-8 text-xs gap-2 rounded-xl border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Enviar feedback
          </Button>
        </div>
      )}
    </aside>
  );
}
