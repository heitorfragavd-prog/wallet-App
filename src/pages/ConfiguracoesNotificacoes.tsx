import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useNotificacoesPush } from "@/domains/notifications/hooks/useNotificacoesPush";
import { useTelegram } from "@/domains/finance/hooks/useTelegram";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { UserPreferencesTab } from "@/domains/notifications/components/UserPreferencesTab";
import { TeamPermissionsTab } from "@/domains/notifications/components/TeamPermissionsTab";
import { NotificationDispatcherService } from "@/domains/notifications/services/NotificationDispatcherService";
import {
  Bell,
  BellOff,
  Send,
  Smartphone,
  MessageCircle,
  Link2,
  Unlink,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  Users,
  History,
  SlidersHorizontal,
} from "lucide-react";

interface NotificacaoLog {
  id: string;
  tipo: "push" | "telegram" | "app";
  titulo: string;
  mensagem: string;
  enviado: boolean;
  erro?: string | null;
  created_at: string;
}

const ConfiguracoesNotificacoes = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const push = useNotificacoesPush();
  const telegram = useTelegram();

  const [activeTab, setActiveTab] = useState("preferencias");
  const [tokenVinculo, setTokenVinculo] = useState("");
  const [vinculando, setVinculando] = useState(false);
  const [testandoPush, setTestandoPush] = useState(false);
  const [testandoTelegram, setTestandoTelegram] = useState(false);
  const [simulando, setSimulando] = useState(false);

  const workspaceId = activeWorkspace?.id || "";
  const ownerUserId = activeWorkspace?.user_id || "";
  const isOwner = !!user && !!ownerUserId && user.id === ownerUserId;

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["notificacoes-log"],
    queryFn: async (): Promise<NotificacaoLog[]> => {
      const { data, error } = await supabase
        .from("notificacoes_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as NotificacaoLog[];
    },
    refetchInterval: 30000,
  });

  const permissaoBadge = {
    granted: <Badge className="bg-emerald-500 text-white">Permitido</Badge>,
    denied: <Badge variant="destructive">Bloqueado</Badge>,
    default: <Badge variant="secondary">Pendente</Badge>,
    unsupported: <Badge variant="destructive">Não suportado</Badge>,
  }[push.permission];

  const handleVincular = async () => {
    if (!tokenVinculo.trim()) return;
    setVinculando(true);
    try {
      await telegram.vincularConta(tokenVinculo.trim());
      setTokenVinculo("");
    } finally {
      setVinculando(false);
    }
  };

  const handleTestarPush = async () => {
    setTestandoPush(true);
    try {
      await push.testarPush();
    } finally {
      setTestandoPush(false);
    }
  };

  const handleTestarTelegram = async () => {
    setTestandoTelegram(true);
    try {
      await telegram.testarMensagem();
    } finally {
      setTestandoTelegram(false);
    }
  };

  const handleSimularNotificacaoVencimento = async () => {
    if (!user || !workspaceId) {
      toast({
        title: "Atenção",
        description: "Selecione um workspace para simular notificações.",
        variant: "destructive",
      });
      return;
    }

    setSimulando(true);
    try {
      // SIMULAÇÃO SEGURA ATRAVÉS DO NOTIFICATION DISPATCHER:
      // NUNCA grava registros financeiros (dívidas, despesas, etc).
      // Respeita quiet hours, categorias e preferências.
      const res = await NotificationDispatcherService.simulateAlert({
        workspace_id: workspaceId,
        target_user_id: user.id,
        categoria: "boletos",
        prioridade: "normal",
        titulo: "Boleto D+1 a Vencer",
        mensagem: "Exemplo: Fatura de R$ 250,00 vence amanhã. (Simulação sem impacto financeiro)",
        link_redirecionamento: "/dividas",
      });

      if (!res.success) {
        throw new Error(res.error || "Erro no despacho de simulação");
      }

      toast({
        title: "⚡ Simulação Executada",
        description: "Alerta roteado pelo notification-dispatcher. Confira a central in-app e os logs.",
      });

      // Se push estiver inscrito, dispara push no navegador
      if (push.isSubscribed) {
        await push.testarPush(
          "🔔 [SIMULAÇÃO] Alerta de Vencimento D+1",
          "Fatura Exemplo no valor de R$ 250,00 vence amanhã! (Sem gravação financeira)"
        );
      }

      refetchLogs();
    } catch (err: unknown) {
      console.error("Erro ao simular notificação:", err);
      toast({
        title: "Erro na simulação",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSimulando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Bell className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Central de Notificações</h1>
              <p className="text-sm text-muted-foreground">
                Preferências individuais, permissões da equipe, quiet hours e canais integrados
              </p>
            </div>
          </div>
          {activeWorkspace && (
            <Badge variant="outline" className="text-xs px-3 py-1 border-primary/30">
              Workspace: <strong>{activeWorkspace.nome || "Principal"}</strong>
            </Badge>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
            <TabsTrigger value="preferencias" className="flex items-center gap-2 text-xs sm:text-sm">
              <UserCheck className="h-4 w-4" />
              Minhas Notificações
            </TabsTrigger>
            <TabsTrigger value="equipe" className="flex items-center gap-2 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              Permissões da Equipe
            </TabsTrigger>
            <TabsTrigger value="dispositivos" className="flex items-center gap-2 text-xs sm:text-sm">
              <SlidersHorizontal className="h-4 w-4" />
              Dispositivos & Canais
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex items-center gap-2 text-xs sm:text-sm">
              <History className="h-4 w-4" />
              Histórico & Auditoria
            </TabsTrigger>
          </TabsList>

          {/* ── ABA 1: MINHAS PREFERÊNCIAS ── */}
          <TabsContent value="preferencias" className="space-y-4">
            {user && workspaceId ? (
              <UserPreferencesTab
                workspaceId={workspaceId}
                userId={user.id}
                isOwner={isOwner}
              />
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Conecte-se a um workspace para gerenciar suas preferências de notificação.
              </div>
            )}
          </TabsContent>

          {/* ── ABA 2: PERMISSÕES DA EQUIPE ── */}
          <TabsContent value="equipe" className="space-y-4">
            {workspaceId ? (
              <TeamPermissionsTab
                workspaceId={workspaceId}
                ownerUserId={ownerUserId}
              />
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhum workspace selecionado.
              </div>
            )}
          </TabsContent>

          {/* ── ABA 3: DISPOSITIVOS & CANAIS ── */}
          <TabsContent value="dispositivos" className="space-y-6">
            {/* ── Push do Navegador ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Smartphone className="h-5 w-5 text-sky-500" /> Notificações no Navegador
                </CardTitle>
                <CardDescription>Receba alertas neste dispositivo, mesmo com o app fechado</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status da permissão</span>
                  {permissaoBadge}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Inscrito neste dispositivo</span>
                  {push.isSubscribed ? (
                    <Badge className="bg-emerald-500 text-white">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <BellOff className="h-3 w-3 mr-1" /> Inativo
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {push.isSubscribed ? (
                    <Button variant="outline" onClick={push.unregisterPush} disabled={push.loading}>
                      {push.loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BellOff className="h-4 w-4 mr-1" />}
                      Desativar notificações
                    </Button>
                  ) : (
                    <Button
                      onClick={push.registerPush}
                      disabled={push.loading || push.permission === "unsupported"}
                      className="bg-sky-500 hover:bg-sky-600 text-white"
                    >
                      {push.loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
                      Ativar notificações no navegador
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleTestarPush} disabled={!push.isSubscribed || testandoPush}>
                    {testandoPush ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                    Testar push
                  </Button>
                  <Button
                    onClick={handleSimularNotificacaoVencimento}
                    disabled={simulando}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {simulando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Clock className="h-4 w-4 mr-1" />}
                    ⚡ Simular Alerta D+1 (Sem gravação financeira)
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Bot do Telegram ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageCircle className="h-5 w-5 text-blue-500" /> Bot do Telegram
                </CardTitle>
                <CardDescription>Receba alertas e consulte dívidas e saldo direto no Telegram</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  {telegram.isVinculado ? (
                    <Badge className="bg-emerald-500 text-white">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Vinculado{" "}
                      {telegram.vinculo?.telegram_username ? `(@${telegram.vinculo.telegram_username})` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" /> Não vinculado
                    </Badge>
                  )}
                </div>

                {telegram.isVinculado ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleTestarTelegram} disabled={testandoTelegram}>
                      {testandoTelegram ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                      Testar mensagem
                    </Button>
                    <Button variant="outline" onClick={() => telegram.desvincularConta()} className="text-red-500 hover:text-red-600">
                      <Unlink className="h-4 w-4 mr-1" /> Desvincular
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Código de vinculação (ex: 123456)"
                        value={tokenVinculo}
                        onChange={(e) => setTokenVinculo(e.target.value)}
                        className="max-w-xs"
                      />
                      <Button onClick={handleVincular} disabled={vinculando || !tokenVinculo.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {vinculando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                        Vincular
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Para vincular, inicie conversa com o bot no Telegram e use o código gerado pelo comando /vincular.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── ABA 4: HISTÓRICO & AUDITORIA ── */}
          <TabsContent value="historico" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <History className="h-5 w-5 text-primary" /> Histórico de Envios & Auditoria
                </CardTitle>
                <CardDescription>
                  Registro cronológico dos últimos disparos e avaliações de entrega
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum envio registrado ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start justify-between p-3 rounded-lg border border-border/40 text-sm gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={log.tipo === "push" ? "secondary" : log.tipo === "telegram" ? "outline" : "default"} className="text-xs">
                              {log.tipo}
                            </Badge>
                            <span className="font-medium text-foreground">{log.titulo}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{log.mensagem}</p>
                          {log.erro && <p className="text-xs text-red-500">Motivo/Erro: {log.erro}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {log.enviado ? (
                            <Badge className="bg-emerald-500 text-white text-[11px]">Enviado</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[11px]">Bloqueado / Falha</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ConfiguracoesNotificacoes;
