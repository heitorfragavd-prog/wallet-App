import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  UserNotificationPreference,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
} from "../types";
import { useToast } from "@/shared/hooks/use-toast";

export function useNotificationPreferences(workspaceIdOverride?: string, userIdOverride?: string) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const qc = useQueryClient();

  const workspaceId = workspaceIdOverride || activeWorkspace?.id;
  const targetUserId = userIdOverride || user?.id;

  const queryKey = useMemo(
    () => ["user-notification-preferences", workspaceId, targetUserId],
    [workspaceId, targetUserId]
  );

  const {
    data: preferences = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    enabled: Boolean(workspaceId && targetUserId),
    queryFn: async (): Promise<UserNotificationPreference[]> => {
      if (!workspaceId || !targetUserId) return [];

      const { data, error: fetchErr } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("user_id", targetUserId);

      if (fetchErr) throw fetchErr;
      return (data as UserNotificationPreference[]) || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  // Escuta alterações em tempo real via Supabase Realtime
  useEffect(() => {
    if (!workspaceId || !targetUserId) return;

    const channel = supabase
      .channel(`rt-pref-${workspaceId}-${targetUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notification_preferences",
          filter: `user_id=eq.${targetUserId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, targetUserId, qc, queryKey]);

  // Atualizar preferência pessoal
  const updatePreference = useMutation({
    mutationFn: async (params: {
      categoria: NotificationCategory;
      canal: NotificationChannel;
      habilitado?: boolean;
      prioridade_minima?: NotificationPriority;
      horario_silencio_inicio?: string;
      horario_silencio_fim?: string;
      fuso_horario?: string;
    }) => {
      if (!workspaceId || !targetUserId) throw new Error("Workspace ou usuário não selecionado");

      const payload = {
        workspace_id: workspaceId,
        user_id: targetUserId,
        categoria: params.categoria,
        canal: params.canal,
        ...(params.habilitado !== undefined && { habilitado: params.habilitado }),
        ...(params.prioridade_minima !== undefined && { prioridade_minima: params.prioridade_minima }),
        ...(params.horario_silencio_inicio !== undefined && { horario_silencio_inicio: params.horario_silencio_inicio }),
        ...(params.horario_silencio_fim !== undefined && { horario_silencio_fim: params.horario_silencio_fim }),
        ...(params.fuso_horario !== undefined && { fuso_horario: params.fuso_horario }),
      };

      const { error: upsertErr } = await supabase
        .from("user_notification_preferences")
        .upsert(payload, { onConflict: "user_id,workspace_id,categoria,canal" });

      if (upsertErr) throw upsertErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast({
        title: "Erro ao salvar preferência",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  // Atualizar autorização do gestor
  const updateAuthorization = useMutation({
    mutationFn: async (params: {
      categoria: NotificationCategory;
      canal: NotificationChannel;
      autorizado: boolean;
    }) => {
      if (!workspaceId || !targetUserId) throw new Error("Workspace ou usuário não selecionado");

      const { error: updateErr } = await supabase
        .from("user_notification_preferences")
        .upsert(
          {
            workspace_id: workspaceId,
            user_id: targetUserId,
            categoria: params.categoria,
            canal: params.canal,
            autorizado: params.autorizado,
          },
          { onConflict: "user_id,workspace_id,categoria,canal" }
        );

      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({
        title: "Permissão atualizada",
        description: "A autorização de alerta da equipe foi salva com sucesso.",
      });
    },
    onError: (err) => {
      toast({
        title: "Erro de permissão",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  // Retorna a preferência com defaults caso ainda não exista no banco
  const getPreference = (
    categoria: NotificationCategory,
    canal: NotificationChannel
  ): UserNotificationPreference => {
    const found = preferences.find((p) => p.categoria === categoria && p.canal === canal);
    if (found) return found;

    return {
      id: `default-${categoria}-${canal}`,
      workspace_id: workspaceId || "",
      user_id: targetUserId || "",
      categoria,
      canal,
      habilitado: true,
      autorizado: categoria !== "ceo_executivo",
      prioridade_minima: "normal",
      horario_silencio_inicio: "22:00",
      horario_silencio_fim: "07:00",
      fuso_horario: "America/Sao_Paulo",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  };

  return {
    preferences,
    isLoading,
    error,
    refetch,
    getPreference,
    updatePreference: updatePreference.mutateAsync,
    updateAuthorization: updateAuthorization.mutateAsync,
    isUpdating: updatePreference.isPending || updateAuthorization.isPending,
  };
}
