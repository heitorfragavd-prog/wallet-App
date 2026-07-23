import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

export interface OrcamentoCategoria {
  id: string;
  user_id: string;
  categoria_id: string;
  valor_limite: number;
  mes_referencia: string; // YYYY-MM
  created_at: string;
  updated_at: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
}

export const ORCAMENTOS_CATEGORIAS_QUERY_KEY = ["orcamentos_categorias"] as const;

async function fetchOrcamentosCategorias(mesReferencia: string): Promise<OrcamentoCategoria[]> {
  const { data, error } = await supabase
    .from("orcamentos_categorias" as any)
    .select("*, categorias!categoria_id(nome, cor, icone)")
    .eq("mes_referencia", mesReferencia);

  if (error && error.code !== "PGRST116" && error.code !== "PGRST200") {
    logger.error("useOrcamentosCategorias", "Erro ao carregar orçamentos", { error: error.message });
    throw error;
  }

  return (data ?? []) as OrcamentoCategoria[];
}

export const useOrcamentosCategorias = (mesReferencia?: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mes = mesReferencia || new Date().toISOString().substring(0, 7);

  const { data: orcamentos = [], isLoading: loading } = useQuery({
    queryKey: [...ORCAMENTOS_CATEGORIAS_QUERY_KEY, mes],
    queryFn: () => fetchOrcamentosCategorias(mes),
    staleTime: 1000 * 60 * 2,
  });

  const upsertOrcamento = useMutation({
    mutationFn: async ({
      categoria_id,
      valor_limite,
      mes_referencia = mes,
    }: {
      categoria_id: string;
      valor_limite: number;
      mes_referencia?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("orcamentos_categorias" as any)
        .upsert(
          {
            user_id: userId,
            categoria_id,
            valor_limite,
            mes_referencia,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,categoria_id,mes_referencia" }
        )
        .select("*, categorias!categoria_id(nome, cor, icone)")
        .single();

      if (error) throw error;
      return data as OrcamentoCategoria;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORCAMENTOS_CATEGORIAS_QUERY_KEY });
      toast({ title: "Teto de Gastos Definido", description: "Limite de orçamento salvo com sucesso!" });
    },
    onError: (error: any) => {
      logger.error("useOrcamentosCategorias", "Erro ao salvar limite", { error: String(error) });
      const msg = error?.message || (typeof error === "object" ? JSON.stringify(error) : String(error));
      toast({
        title: "Erro ao definir limite",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const deleteOrcamento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orcamentos_categorias" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORCAMENTOS_CATEGORIAS_QUERY_KEY });
      toast({ title: "Limite Removido", description: "Orçamento de categoria removido com sucesso!" });
    },
    onError: (error) => {
      logger.error("useOrcamentosCategorias", "Erro ao remover limite", { error: String(error) });
      toast({
        title: "Erro ao remover limite",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  return {
    orcamentos,
    loading,
    upsertOrcamento: (params: { categoria_id: string; valor_limite: number; mes_referencia?: string }) =>
      upsertOrcamento.mutateAsync(params),
    deleteOrcamento: (id: string) => deleteOrcamento.mutateAsync(id),
  };
};
