import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { useToast } from "@/shared/hooks/use-toast";

export interface Notificacao {
  id: string;
  user_id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  link_redirecionamento?: string;
  created_at: string;
}

export const useNotificacoes = () => {
  const { user } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchNotificacoes = useCallback(async () => {
    if (!user) {
      setNotificacoes([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error && (error.code === "PGRST200" || error.code === "42P01")) {
        // Tabela ainda não existe localmente ou em sync
        setNotificacoes([]);
        return;
      }

      if (error) throw error;
      setNotificacoes((data as Notificacao[]) || []);
    } catch (err) {
      console.error("Erro ao carregar notificações:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotificacoes();

    // Inscrever para atualizações em tempo real no Supabase Realtime
    if (!user) return;

    const channel = supabase
      .channel("realtime-notificacoes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notificacao;
          setNotificacoes((prev) => [newNotif, ...prev]);
          toast({
            title: newNotif.titulo,
            description: newNotif.mensagem,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotificacoes, toast]);

  const marcarComoLida = async (id: string) => {
    try {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("id", id);

      if (error) throw error;

      setNotificacoes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
    } catch (err) {
      console.error("Erro ao marcar notificação como lida:", err);
    }
  };

  const marcarTodasComoLidas = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("user_id", user.id)
        .eq("lida", false);

      if (error) throw error;

      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
      toast({
        title: "Notificações atualizadas",
        description: "Todas as notificações foram marcadas como lidas.",
      });
    } catch (err) {
      console.error("Erro ao marcar todas como lidas:", err);
    }
  };

  const naoLidasCount = notificacoes.filter((n) => !n.lida).length;

  return {
    notificacoes,
    naoLidasCount,
    loading,
    marcarComoLida,
    marcarTodasComoLidas,
    refetch: fetchNotificacoes,
  };
};
