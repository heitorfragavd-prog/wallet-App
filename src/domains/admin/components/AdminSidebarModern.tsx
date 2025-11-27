import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Home,
  Users,
  CreditCard,
  Gauge,
  DollarSign,
  Receipt,
  Wallet,
  Plug,
  Webhook,
  Settings,
  BarChart3,
  FileText,
  ChevronDown,
  ChevronRight,
  LogOut,
  LucideIcon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { WhatsAppButton } from "@/shared/components/WhatsAppButton";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: MenuItem[];
}

interface AdminSidebarModernProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const ADMIN_MENU_GROUPS: MenuGroup[] = [
  {
    id: 'overview',
    label: 'Visão Geral',
    icon: LayoutDashboard,
    items: [
      { path: '/admin', label: 'Dashboard', icon: Home }
    ]
  },
  {
    id: 'users-plans',
    label: 'Usuários & Planos',
    icon: Users,
    items: [
      { path: '/admin/users', label: 'Usuários', icon: Users },
      { path: '/admin/plans', label: 'Planos', icon: CreditCard },
      { path: '/admin/limits', label: 'Limites', icon: Gauge }
    ]
  },
  {
    id: 'financial',
    label: 'Financeiro',
    icon: DollarSign,
    items: [
      { path: '/admin/subscriptions', label: 'Assinaturas', icon: Receipt },
      { path: '/admin/payment-settings', label: 'Pagamentos', icon: Wallet }
    ]
  },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: Plug,
    items: [
      { path: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
      { path: '/admin/webhook-settings', label: 'Configurações', icon: Settings }
    ]
  },
  {
    id: 'system',
    label: 'Sistema',
    icon: Settings,
    items: [
      { path: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
      { path: '/admin/audit', label: 'Auditoria', icon: FileText }
    ]
  }
];

export const AdminSidebarModern = ({ isCollapsed, onToggleCollapse }: AdminSidebarModernProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(ADMIN_MENU_GROUPS.map(g => g.id))
  );

  const handleLogout = () => {
    localStorage.removeItem("userToken");
    localStorage.removeItem("userData");
    localStorage.removeItem("isAuthenticated");
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
    navigate("/");
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* Logo - Same as user DashboardLayout */}
      <div className="p-6 border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="bg-orange-500 rounded-lg p-2">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold text-foreground">Wallet</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-2">
          {ADMIN_MENU_GROUPS.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const hasActiveItem = group.items.some(item => isActive(item.path));

            return (
              <div key={group.id} className="space-y-1">
                {/* Group Header */}
                <button
                  onClick={() => !isCollapsed && toggleGroup(group.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    hasActiveItem
                      ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    isCollapsed && "justify-center"
                  )}
                  title={isCollapsed ? group.label : undefined}
                >
                  <div className="flex items-center gap-3">
                    <group.icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span>{group.label}</span>}
                  </div>
                  {!isCollapsed && (
                    <div className="transition-transform duration-200">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  )}
                </button>

                {/* Group Items */}
                {!isCollapsed && isExpanded && (
                  <div className="ml-4 space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {group.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          isActive(item.path)
                            ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Collapsed state - show items on hover */}
                {isCollapsed && (
                  <div className="hidden group-hover:block absolute left-full ml-2 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[200px] z-50">
                    <div className="text-xs font-semibold text-muted-foreground px-3 py-1 mb-1">
                      {group.label}
                    </div>
                    {group.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          isActive(item.path)
                            ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Footer - WhatsApp Button, Theme Toggle and Logout (Same as user DashboardLayout) */}
      <div className="p-4 border-t border-border flex-shrink-0 space-y-2">
        <WhatsAppButton isCollapsed={isCollapsed} />
        
        <div className={cn(
          "flex gap-2",
          isCollapsed ? "flex-col items-center" : "flex-row items-center justify-between"
        )}>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className={cn(
              "text-muted-foreground hover:text-foreground min-h-[44px]",
              isCollapsed ? "justify-center px-0 min-w-[44px]" : "justify-start"
            )}
            title={isCollapsed ? "Sair" : undefined}
            aria-label="Sair da conta"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="ml-3">Sair</span>}
          </Button>
          <ThemeToggle className="min-h-[44px] min-w-[44px]" />
        </div>
      </div>
    </div>
  );
};
