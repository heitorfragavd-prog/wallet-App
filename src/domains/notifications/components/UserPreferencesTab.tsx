import React, { useState } from "react";
import { useNotificationPreferences } from "../hooks/useNotificationPreferences";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
} from "../types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useToast } from "@/shared/hooks/use-toast";
import {
  Bell,
  Lock,
  Moon,
  ShieldAlert,
  Crown,
  Smartphone,
  MessageCircle,
  Clock,
  Save,
} from "lucide-react";

interface UserPreferencesTabProps {
  workspaceId: string;
  userId: string;
  isOwner?: boolean;
}

export const UserPreferencesTab: React.FC<UserPreferencesTabProps> = ({
  workspaceId,
  userId,
  isOwner = false,
}) => {
  const { toast } = useToast();
  const { preferences, loading, savePreference } = useNotificationPreferences(
    workspaceId,
    userId
  );

  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [salvandoHorario, setSalvandoHorario] = useState(false);

  // Inicializa o horário de silêncio a partir da primeira preferência carregada
  React.useEffect(() => {
    if (preferences.length > 0) {
      const firstWithQuiet = preferences.find((p) => p.horario_silencio_inicio);
      if (firstWithQuiet) {
        setQuietStart(firstWithQuiet.horario_silencio_inicio.slice(0, 5));
        setQuietEnd(firstWithQuiet.horario_silencio_fim.slice(0, 5));
      }
    }
  }, [preferences]);

  const getPreference = (categoria: NotificationCategory, canal: NotificationChannel) => {
    return preferences.find((p) => p.categoria === categoria && p.canal === canal);
  };

  const handleToggleHabilitado = async (
    categoria: NotificationCategory,
    canal: NotificationChannel,
    currentHabilitado: boolean,
    autorizado: boolean
  ) => {
    if (!autorizado) {
      toast({
        title: "Canal bloqueado",
        description: "Este canal não foi autorizado pelo gestor do workspace.",
        variant: "destructive",
      });
      return;
    }

    try {
      await savePreference({
        categoria,
        canal,
        habilitado: !currentHabilitado,
        horario_silencio_inicio: quietStart,
        horario_silencio_fim: quietEnd,
      });

      toast({
        title: !currentHabilitado ? "Notificação ativada" : "Notificação silenciada",
        description: `Canal ${canal} atualizado com sucesso.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar preferência",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleSalvarHorarioSilencio = async () => {
    setSalvandoHorario(true);
    try {
      for (const pref of preferences) {
        await savePreference({
          categoria: pref.categoria,
          canal: pref.canal,
          horario_silencio_inicio: quietStart,
          horario_silencio_fim: quietEnd,
        });
      }

      toast({
        title: "Horário de silêncio atualizado",
        description: `Alertas não-críticos serão silenciados das ${quietStart} às ${quietEnd}.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar horário",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSalvandoHorario(false);
    }
  };

  const handleChangePrioridade = async (
    categoria: NotificationCategory,
    canal: NotificationChannel,
    prioridade: NotificationPriority
  ) => {
    try {
      await savePreference({
        categoria,
        canal,
        prioridade_minima: prioridade,
      });
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar prioridade",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
        Carregando preferências de notificações...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Horário de Silêncio (Quiet Hours) ── */}
      <Card className="border-border/60 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Moon className="h-5 w-5 text-indigo-400" /> Horário de Silêncio (Quiet Hours)
          </CardTitle>
          <CardDescription>
            Defina o período em que notificações sonoras e externas (Push e Telegram) não
            incomodarão você. Notificações in-app serão gravadas em silêncio. Alertas com
            prioridade <strong>crítica</strong> sempre furam a janela de silêncio por segurança.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Início:</span>
              <Input
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                className="w-28 text-center"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Fim:</span>
              <Input
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className="w-28 text-center"
              />
            </div>
            <Button
              onClick={handleSalvarHorarioSilencio}
              disabled={salvandoHorario}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Save className="h-4 w-4 mr-1" />
              Salvar Horário
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Matriz de Categorias e Canais ── */}
      <div className="space-y-4">
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const isCeoOnly = cat.ownerOnly;
          const blockedForUser = isCeoOnly && !isOwner;

          return (
            <Card
              key={cat.id}
              className={`border-border/60 ${blockedForUser ? "opacity-60 bg-muted/20" : "bg-card"}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      {cat.id === "ceo_executivo" && <Crown className="h-4 w-4 text-amber-500" />}
                      {cat.id === "seguranca" && <ShieldAlert className="h-4 w-4 text-red-500" />}
                      {cat.label}
                    </CardTitle>
                    <CardDescription className="text-xs">{cat.description}</CardDescription>
                  </div>
                  {isCeoOnly && (
                    <Badge variant="outline" className="text-amber-500 border-amber-500/40 text-xs">
                      Exclusivo Proprietário
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {blockedForUser ? (
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Esta categoria é restrita exclusivamente ao proprietário do workspace.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {NOTIFICATION_CHANNELS.map((ch) => {
                      const pref = getPreference(cat.id, ch.id);
                      const isAutorizado = pref ? pref.autorizado : true;
                      const isHabilitado = pref ? pref.habilitado : true;
                      const prioridade = pref ? pref.prioridade_minima : "normal";

                      return (
                        <div
                          key={ch.id}
                          className="flex flex-col justify-between p-3 rounded-lg border border-border/40 bg-muted/10 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-medium">
                              {ch.id === "app" && <Smartphone className="h-3.5 w-3.5 text-sky-400" />}
                              {ch.id === "push" && <Bell className="h-3.5 w-3.5 text-emerald-400" />}
                              {ch.id === "telegram" && <MessageCircle className="h-3.5 w-3.5 text-blue-400" />}
                              {ch.label}
                            </span>
                            <Switch
                              checked={isHabilitado && isAutorizado}
                              disabled={!isAutorizado}
                              onCheckedChange={() =>
                                handleToggleHabilitado(cat.id, ch.id, isHabilitado, isAutorizado)
                              }
                            />
                          </div>

                          {!isAutorizado ? (
                            <Badge variant="destructive" className="text-[10px] py-0 px-1.5 w-fit">
                              <Lock className="h-2.5 w-2.5 mr-1" /> Bloqueado pelo Gestor
                            </Badge>
                          ) : (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                              <span>Prioridade:</span>
                              <select
                                value={prioridade}
                                onChange={(e) =>
                                  handleChangePrioridade(
                                    cat.id,
                                    ch.id,
                                    e.target.value as NotificationPriority
                                  )
                                }
                                className="bg-background border border-border/60 rounded px-1.5 py-0.5 text-[11px]"
                              >
                                <option value="informativa">Informativa</option>
                                <option value="normal">Normal</option>
                                <option value="importante">Importante</option>
                                <option value="critica">Crítica</option>
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
