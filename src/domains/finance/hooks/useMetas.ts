import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";

export interface Meta {
  id: string;
  user_id: string;
  categoria_meta_id?: string;
  titulo: string;
  tipo: "economia" | "receita" | "despesa" | "investimento";
  valor_alvo: number;
  valor_atual: number;
  data_inicio: string;
  data_limite: string;
  status: "ativa" | "concluida" | "pausada" | "vencida";
  descricao?: string;
  created_at: string;
  updated_at: string;
  categorias_metas?: {
    nome: string;
    cor: string;
    descricao?: string;
  };
}

const fetchMetasData = async () => {
  const q = supabase
    .from("metas")
    .select(`*, categorias_metas (nome, cor, descricao)`)
    .order("data_limite", { ascending: true });

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Meta[];
};

export const useMetas = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const queryKey = ["metas"];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchMetasData(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const createMeta = async (
    meta: Omit<
      Meta,
      "id" | "user_id" | "created_at" | "updated_at" | "categorias_metas"
    >
  ) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("metas")
        .insert([
          {
            ...meta,
            user_id: user.id,
          },
        ])
        .select(`*, categorias_metas (nome, cor, descricao)`)
        .single();

      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["metas"] });

      toast({
        title: "Meta criada",
        description: "Meta criada com sucesso!",
      });

      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao criar meta",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const updateMeta = async (id: string, updates: Partial<Meta>) => {
    try {
      const {
        categorias_metas: _categorias_metas,
        created_at: _created_at,
        updated_at: _updated_at,
        user_id: _user_id,
        ...updateData
      } = updates;

      const { data, error } = await supabase
        .from("metas")
        .update(updateData)
        .eq("id", id)
        .select(`*, categorias_metas (nome, cor, descricao)`)
        .single();

      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["metas"] });

      toast({
        title: "Meta atualizada",
        description: "Meta atualizada com sucesso!",
      });

      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao atualizar meta",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteMeta = async (id: string) => {
    try {
      const { error } = await supabase.from("metas").delete().eq("id", id);

      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["metas"] });

      toast({
        title: "Meta removida",
        description: "Meta removida com sucesso!",
      });

      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover meta",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  return {
    metas: query.data ?? [],
    loading: query.isLoading,
    createMeta,
    updateMeta,
    deleteMeta,
    refetch: () => qc.invalidateQueries({ queryKey }),
  };
};
