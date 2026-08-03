import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useNotificacoesPush } from "@/hooks/useNotificacoesPush";
import { useTelegram } from "@/domains/finance/hooks/useTelegram";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Bell, BellOff, Send, Smartphone, MessageCircle, Link2, Unlink, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface NotificacaoLog {
  id: string;
  tipo: "push" | "telegram";
  titulo: string;
  mensagem: string;
  enviado: boolean;
  erro?: string | null;
  created_at: string;
}

const ConfiguracoesNotificacoes = () => {
  const push = useNotificacoesPush();
  const telegram = useTelegram();
  const [tokenVinculo, setTokenVinculo] = useState("");
  const [vinculando, setVinculando] = useState(false);
  const [testandoPush, setTestandoPush] = useState(false);
  const [testandoTelegram, setTestandoTelegram] = useState(false);

  const { data: logs = [] } = useQuery({
    queryKey: ["notificacoes-log"],
    queryFn: async (): Promise<NotificacaoLog[]> => {
      const { data, error } = await supabase
        .from("notificacoes_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
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
    try { await push.testarPush(); } finally { setTestandoPush(false); }
  };

  const handleTestarTelegram = async () => {
    setTestandoTelegram(true);
    try { await telegram.testarMensagem(); } finally { setTestandoTelegram(false); }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Bell className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Configurações de Notificações</h1>
            <p className="text-sm text-muted-foreground">Alertas de dívidas e compromissos no navegador e no Telegram</p>
          </div>
        </div>

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
              {push.isSubscribed
                ? <Badge className="bg-emerald-500 text-white"><CheckCircle2 className="h-3 w-3 mr-1" /> Ativo</Badge>
                : <Badge variant="secondary"><BellOff className="h-3 w-3 mr-1" /> Inativo</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              {push.isSubscribed ? (
                <Button variant="outline" onClick={push.unregisterPush} disabled={push.loading}>
                  {push.loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BellOff className="h-4 w-4 mr-1" />}
                  Desativar notificações
                </Button>
              ) : (
                <Button onClick={push.registerPush} disabled={push.loading || push.permission === "unsupported"} className="bg-sky-500 hover:bg-sky-600 text-white">
                  {push.loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
                  Ativar notificações no navegador
                </Button>
              )}
              <Button variant="outline" onClick={handleTestarPush} disabled={!push.isSubscribed || testandoPush}>
                {testandoPush ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Testar notificação
              </Button>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-foreground">📱 Como ativar no celular:</p>
              <p>1. Abra o app no navegador do celular (Chrome/Safari)</p>
              <p>2. Toque em "Ativar notificações" e aceite a permissão</p>
              <p>3. No Android, você pode adicionar o app à tela inicial para receber como app nativo</p>
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
              {telegram.isVinculado
                ? <Badge className="bg-emerald-500 text-white"><CheckCircle2 className="h-3 w-3 mr-1" /> Vinculado {telegram.vinculo?.telegram_username ? `(@${telegram.vinculo.telegram_username})` : ""}</Badge>
                : <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> Não vinculado</Badge>}
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
              <>
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
                  <p className="font-semibold text-foreground">🔗 Como conectar:</p>
                  <p>1. Abra o Telegram e busque o bot do Wallet</p>
                  <p>2. Envie o comando <code className="bg-background px-1 rounded">/start</code></p>
                  <p>3. O bot responde com um <strong>código de vínculo</strong> — cole ele aqui:</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Cole o código enviado pelo bot"
                    value={tokenVinculo}
                    onChange={(e) => setTokenVinculo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleVincular()}
                  />
                  <Button onClick={handleVincular} disabled={!tokenVinculo.trim() || vinculando} className="bg-blue-500 hover:bg-blue-600 text-white shrink-0">
                    {vinculando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                    Vincular
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Logs ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-muted-foreground" /> Últimas notificações
            </CardTitle>
            <CardDescription>Histórico dos últimos envios (push e Telegram)</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma notificação enviada ainda.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border text-sm">
                    {log.tipo === "push" ? <Smartphone className="h-4 w-4 text-sky-500 shrink-0" /> : <MessageCircle className="h-4 w-4 text-blue-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{log.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">{log.mensagem}</p>
                    </div>
                    {log.enviado
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(log.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ConfiguracoesNotificacoes;
