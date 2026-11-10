import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationPreferences } from "../hooks/useNotificationPreferences";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NotificationCategory,
  NotificationChannel,
} from "../types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import { useToast } from "@/shared/hooks/use-toast";
import {
  Users,
  ShieldCheck,
  Lock,
  Crown,
  Smartphone,
  Bell,
  MessageCircle,
} from "lucide-react";

interface TeamMember {
  workspace_id?: string;
  user_id: string;
  role: string;
  active: boolean;
  user_email?: string;
  user_name?: string;
}

interface TeamPermissionsTabProps {
  workspaceId: string;
  ownerUserId: string;
}

export const TeamPermissionsTab: React.FC<TeamPermissionsTabProps> = ({
  workspaceId,
  ownerUserId,
}) => {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Busca membros ativos do workspace
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, user_id, role, active")
        .eq("workspace_id", workspaceId)
        .eq("active", true);

      if (error) throw error;
      return (data || []) as TeamMember[];
    },
    enabled: !!workspaceId,
  });

  // Se nenhum membro estiver selecionado, seleciona o primeiro por padrão
  React.useEffect(() => {
    if (!selectedUserId && members.length > 0) {
      setSelectedUserId(members[0].user_id);
    }
  }, [members, selectedUserId]);

  const { preferences, loading: loadingPrefs, updateMemberAuthorization } =
    useNotificationPreferences(workspaceId, selectedUserId);

  const getPreference = (categoria: NotificationCategory, canal: NotificationChannel) => {
    return preferences.find((p) => p.categoria === categoria && p.canal === canal);
  };

  const handleToggleAutorizacao = async (
    categoria: NotificationCategory,
    canal: NotificationChannel,
    currentAutorizado: boolean
  ) => {
    if (!selectedUserId) return;

    if (categoria === "ceo_executivo" && selectedUserId !== ownerUserId) {
      toast({
        title: "Operação não permitida",
        description: "A inteligência CEO é restrita exclusivamente ao proprietário do workspace.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateMemberAuthorization({
        targetUserId: selectedUserId,
        categoria,
        canal,
        autorizado: !currentAutorizado,
      });

      toast({
        title: !currentAutorizado ? "Permissão concedida" : "Permissão revogada",
        description: `Canal ${canal} para ${categoria} atualizado.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Erro ao atualizar permissão",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  if (loadingMembers) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
        Carregando membros da equipe...
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          Nenhum outro membro ativo encontrado neste workspace.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Seleção do Membro da Equipe ── */}
      <Card className="border-border/60 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-emerald-500" /> Permissões de Notificação da Equipe
          </CardTitle>
          <CardDescription>
            Como administrador, defina quais canais e categorias de notificação cada membro pode
            receber.
            <strong> Lembrete:</strong> Apenas o Proprietário tem acesso ao cérebro executivo
            (CEO).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Selecione o membro:</span>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-background border border-border/60 rounded px-3 py-1.5 text-sm font-medium"
            >
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  Membro ({m.role}) — {m.user_id.slice(0, 8)}...
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ── Matriz de Permissões para o Membro Selecionado ── */}
      {selectedUserId && (
        <div className="space-y-4">
          {loadingPrefs ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Carregando permissões do membro...
            </div>
          ) : (
            NOTIFICATION_CATEGORIES.map((cat) => {
              const isCeoOnly = cat.ownerOnly;
              const isSelectedMemberOwner = selectedUserId === ownerUserId;
              const blockedForMember = isCeoOnly && !isSelectedMemberOwner;

              return (
                <Card
                  key={cat.id}
                  className={`border-border/60 ${blockedForMember ? "opacity-60 bg-muted/20" : "bg-card"}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-base font-semibold">
                          {cat.id === "ceo_executivo" && <Crown className="h-4 w-4 text-amber-500" />}
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
                    {blockedForMember ? (
                      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        Membros da equipe não podem receber notificações estratégicas do Wallet CEO.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {NOTIFICATION_CHANNELS.map((ch) => {
                          const pref = getPreference(cat.id, ch.id);
                          const isAutorizado = pref ? pref.autorizado : true;

                          return (
                            <div
                              key={ch.id}
                              className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/10"
                            >
                              <div className="space-y-0.5">
                                <span className="flex items-center gap-1.5 text-xs font-medium">
                                  {ch.id === "app" && <Smartphone className="h-3.5 w-3.5 text-sky-400" />}
                                  {ch.id === "push" && <Bell className="h-3.5 w-3.5 text-emerald-400" />}
                                  {ch.id === "telegram" && <MessageCircle className="h-3.5 w-3.5 text-blue-400" />}
                                  {ch.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  {isAutorizado ? (
                                    <span className="text-emerald-500 flex items-center gap-0.5">
                                      <ShieldCheck className="h-3 w-3" /> Permitido
                                    </span>
                                  ) : (
                                    <span className="text-destructive flex items-center gap-0.5">
                                      <Lock className="h-3 w-3" /> Bloqueado
                                    </span>
                                  )}
                                </span>
                              </div>
                              <Switch
                                checked={isAutorizado}
                                onCheckedChange={() =>
                                  handleToggleAutorizacao(cat.id, ch.id, isAutorizado)
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
