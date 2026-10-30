import React, { useState, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { useAuth } from '@/domains/auth/hooks/useAuth';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import {
  ChefHat,
  LogOut,
  Maximize2,
  Minimize2,
  Clock,
  Wifi,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';

interface DeliveryLayoutProps {
  children: React.ReactNode;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

/**
 * Layout Operacional Especializado para KDS e Expedição
 * 
 * Princípios de Segurança e Usabilidade:
 * 1. Totalmente isento de menus e consultas financeiras (sem DRE, saldos ou contas).
 * 2. Sem disparo de rotinas de conciliação bancária de carteira.
 * 3. Otimizado para telas de toque em tablets Android, smartphones e Mac.
 * 4. Suporte a modo tela cheia para evitar distrações na cozinha.
 */
export const DeliveryLayout: React.FC<DeliveryLayoutProps> = ({
  children,
  isDemoMode = false,
  onToggleDemoMode,
}) => {
  const { user, signOut } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Relógio digital em tempo real
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Alternador de Tela Cheia
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  const handleLogout = async () => {
    try {
      if (signOut) {
        await signOut();
      } else {
        localStorage.clear();
      }
      toast({
        title: 'Sessão encerrada',
        description: 'Você saiu do terminal operacional.',
      });
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col select-none">
      {/* Faixa de Alerta: Modo de Demonstração (apenas quando ativado explicitamente) */}
      {isDemoMode && (
        <div className="bg-amber-500 text-stone-950 font-bold px-4 py-1.5 text-xs flex items-center justify-between border-b border-amber-600">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span>MODO DE DEMONSTRAÇÃO ATIVO — Pedidos exibidos são dados simulados para teste de fluxo da equipe. Não representam vendas reais.</span>
          </div>
          {onToggleDemoMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleDemoMode}
              className="h-6 text-[11px] bg-stone-900 text-white hover:bg-stone-800 border-none font-bold"
            >
              Voltar aos Pedidos Reais
            </Button>
          )}
        </div>
      )}

      {/* Barra de Navegação Operacional Superior */}
      <header className="h-14 border-b border-border bg-card/95 backdrop-blur px-4 flex items-center justify-between gap-3 sticky top-0 z-50 shadow-sm">
        {/* Identidade do Terminal */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary p-2 rounded-lg">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-tight text-foreground">
                  RODO POINT
                </span>
                <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 bg-primary/5 text-primary border-primary/20">
                  KDS COZINHA
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground hidden sm:block">
                Terminal Operacional de Expedição
              </p>
            </div>
          </div>

          {/* Workspace Ativo */}
          {activeWorkspace && (
            <Badge variant="secondary" className="hidden md:flex text-[11px] font-medium bg-muted">
              {activeWorkspace.nome}
            </Badge>
          )}
        </div>

        {/* Informações de Status e Controles */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Status de Conexão Online */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
            <Wifi className="h-3.5 w-3.5 animate-pulse text-emerald-600" />
            <span className="hidden sm:inline">Online</span>
          </div>

          {/* Relógio de Turno */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-xs font-mono font-bold text-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{currentTime}</span>
          </div>

          {/* Alternador de Tela Cheia */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="h-8 w-8 p-0 hidden sm:flex"
            title={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          {/* Tema */}
          <ThemeToggle className="h-8 w-8" />

          {/* Logout Operacional */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            title="Sair do terminal"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">{user?.email?.split('@')[0] || 'Sair'}</span>
          </Button>
        </div>
      </header>

      {/* Conteúdo Principal do Terminal */}
      <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default DeliveryLayout;
