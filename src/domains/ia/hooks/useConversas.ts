import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Conversa {
  id: string;
  titulo: string;
  created_at: string;
  ultima_mensagem_em: string | null;
}

const CONVERSAS_KEY = ["chat_conversas"];

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");
  return user.id;
}

export const useConversas = () => {
  const queryClient = useQueryClient();

  const { data: conversas = [], isLoading } = useQuery({
    queryKey: CONVERSAS_KEY,
    queryFn: async () => {
      const userId = await getUserId();
      const { data, error } = await supabase
        .from("chat_conversas")
        .select("id, titulo, created_at, ultima_mensagem_em")
        .eq("user_id", userId)
        .order("ultima_mensagem_em", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Conversa[];
    },
  });

  const criarConversa = useMutation({
    mutationFn: async (titulo?: string) => {
      const userId = await getUserId();
      const { data, error } = await supabase
        .from("chat_conversas")
        .insert({ user_id: userId, titulo: titulo ?? "Nova Conversa" })
        .select("id, titulo, created_at, ultima_mensagem_em")
        .single();
      if (error) throw error;
      return data as Conversa;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONVERSAS_KEY }),
  });

  const renomearConversa = useMutation({
    mutationFn: async ({ id, titulo }: { id: string; titulo: string }) => {
      const { error } = await supabase
        .from("chat_conversas")
        .update({ titulo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONVERSAS_KEY }),
  });

  const deletarConversa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_conversas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONVERSAS_KEY }),
  });

  const atualizarUltimaMensagem = async (conversaId: string) => {
    await supabase
      .from("chat_conversas")
      .update({ ultima_mensagem_em: new Date().toISOString() })
      .eq("id", conversaId);
    queryClient.invalidateQueries({ queryKey: CONVERSAS_KEY });
  };

  return {
    conversas,
    isLoading,
    criarConversa,
    renomearConversa,
    deletarConversa,
    atualizarUltimaMensagem,
  };
};
