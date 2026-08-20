import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Home,
  TrendingUp,
  TrendingDown,
  FileText,
  BarChart3,
  Tag,
  PieChart,
  Target,
  Users,
  Bot,
  ShoppingCart,
  Car,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Shield,
  Bell,
  Wallet,
  Building2,
  Store,
  Landmark,
  ChefHat,
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  ListTree,
  Building,
  CheckCircle,
  Receipt,
  BellRing,
  MonitorPlay,
  Brain,
  Activity,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
import { useProfile } from "@/domains/auth/hooks/useProfile";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { WhatsAppButton } from "@/shared/components/WhatsAppButton";
import { WorkspaceSwitcher } from "@/shared/components/WorkspaceSwitcher";
import { NotificationsPopover } from "@/shared/components/NotificationsPopover";
import { PrivacyToggle } from "@/shared/components/PrivacyToggle";
import { useDivipayConciliacaoAuto } from "@/domains/divipay/hooks/useDivipayConciliacao";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useProfile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Conciliação Divipay em background: despesas da carteira sobem sem
  // precisar abrir a tela de Saques (1x por dia por sessão).
  useDivipayConciliacaoAuto();

  const baseMenuItems = [
    { icon: Home, label: "Dashboard", path: "/dashboard" },
    { icon: Store, label: "Eyemobile PDV", path: "/eyemobile-pdv" },
    { icon: MonitorPlay, label: "Frente de Caixa", path: "/pdv" },
    { icon: Landmark, label: "Divipay", path: "/divipay" },
    { icon: Building2, label: "Contas & Cartões", path: "/contas" },
    { icon: TrendingUp, label: "Receitas", path: "/receitas" },
    { icon: TrendingDown, label: "Despesas", path: "/despesas" },
    { icon: ArrowRightLeft, label: "Transferências", path: "/transferencias" },
    { icon: FileText, label: "Transações", path: "/transacoes" },
    { icon: PieChart, label: "Dívidas", path: "/dividas" },
    { icon: Calendar, label: "Agenda", path: "/agenda" },
    { icon: Bell, label: "Lembretes", path: "/lembretes" },
    { icon: BellRing, label: "Notificações", path: "/configuracoes/notificacoes" },
    { icon: Tag, label: "Categorias", path: "/categorias" },
    { icon: ListTree, label: "Subcategorias", path: "/subcategorias" },
    { icon: Building, label: "Centros de Custo", path: "/centros-custo" },
    { icon: Users, label: "Fornecedores", path: "/fornecedores" },
    { icon: Users, label: "Equipe", path: "/equipe" },
    { icon: CheckCircle, label: "Conciliação", path: "/conciliacao" },
    { icon: Receipt, label: "Recibos", path: "/recibos" },
    { icon: BarChart3, label: "Relatórios", path: "/relatorios" },
    { icon: TrendingUp, label: "Fluxo de Caixa", path: "/fluxo-caixa" },
    { icon: FileText, label: "DRE Simplificada", path: "/dre" },
    { icon: ChefHat, label: "Cardápio", path: "/cardapio" },
    { icon: AlertTriangle, label: "Validades", path: "/validades" },
    { icon: Target, label: "Metas", path: "/metas" },
    { icon: Wallet, label: "Patrimônio", path: "/patrimonio" },
    { icon: Brain, label: "Inteligência Artificial", path: "/ia" },
    { icon: Activity, label: "Métricas de IA", path: "/ia-metrics" },
    { icon: ShoppingCart, label: "Mercado", path: "/mercado" },
    { icon: Car, label: "Veículos", path: "/veiculos" },
    { icon: Users, label: "Perfil", path: "/perfil" },
  ];

  // Adicionar item Administrador se o usuário for admin
  const menuItems = profile?.role === 'admin' 
    ? [...baseMenuItems, { icon: Shield, label: "Administrador", path: "/admin" }]
    : baseMenuItems;

  const handleLogout = () => {
    // Limpar dados de autenticação do localStorage
    localStorage.removeItem("userToken");
    localStorage.removeItem("userData");
    localStorage.removeItem("isAuthenticated");

    // Mostrar toast de confirmação
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });

    // Redirecionar para a página inicial (login)
    navigate("/");
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background flex relative overflow-x-hidden">
      {/* Mobile Menu Button - Only show when menu is closed */}
      {!isMobileMenuOpen && (
        <div className="lg:hidden fixed top-4 left-4 z-50">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 bg-background shadow-md rounded-full hover:bg-muted transition-colors"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed top-0 left-0 h-screen
          ${
            isMobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          }
          transition-all duration-300
          bg-card border-r border-border flex flex-col
          z-40
          ${isCollapsed ? "w-20" : "w-64"}
        `}
      >
        {/* Logo & Workspace Switcher */}
        <div className="p-4 border-b border-border flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-orange-500 rounded-lg p-2">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              {!isCollapsed && (
                <span className="text-xl font-bold text-foreground">Wallet</span>
              )}
            </div>

            {/* Mobile Close Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8 hover:bg-muted transition-colors"
              onClick={closeMobileMenu}
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>

          <WorkspaceSwitcher isCollapsed={isCollapsed} />
        </div>

        {/* Collapse Button - Desktop only */}
        <Button
          variant="ghost"
          size="icon"
          className={`
            hidden lg:flex absolute top-6 -right-3
            h-6 w-6 rounded-full bg-background border border-border
            hover:bg-muted hover:border-muted-foreground
            transition-all duration-200 shadow-sm
            items-center justify-center
          `}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-1">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMobileMenu}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${isCollapsed ? "justify-center" : "space-x-3"}`}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        </nav>

        {/* WhatsApp Button, Theme Toggle and Logout */}
        <div className="p-4 border-t border-border flex-shrink-0 space-y-2">
          <WhatsAppButton isCollapsed={isCollapsed} onClick={closeMobileMenu} />
          
          <div className={`flex gap-2 ${
            isCollapsed ? "flex-col items-center" : "flex-row items-center justify-between"
          }`}>
            <Button
              variant="ghost"
              className={`text-muted-foreground hover:text-foreground min-h-[44px] ${
                isCollapsed ? "justify-center px-0 min-w-[44px]" : "justify-start"
              }`}
              onClick={() => {
                handleLogout();
                closeMobileMenu();
              }}
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

      {/* Main Content */}
      <div
        className={`flex-1 min-w-0 ${
          isCollapsed ? "lg:ml-20" : "lg:ml-64"
        } transition-all duration-300 flex flex-col`}
      >
        {/* Header Bar */}
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-card/80 backdrop-blur px-4 sm:px-6 flex items-center justify-between lg:justify-end">
          <div className="lg:hidden flex items-center gap-2">
            {/* Mobile menu space */}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <PrivacyToggle />
            <NotificationsPopover />
          </div>
        </header>

        <div className="w-full max-w-full overflow-x-hidden flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
