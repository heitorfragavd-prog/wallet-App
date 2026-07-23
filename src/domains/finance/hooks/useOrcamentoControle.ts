import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

export interface TemaOrcamento {
  id: string;
  nome: string;
  percentual: number;
  cor: string;
}

export const TEMAS_PADRAO: TemaOrcamento[] = [
  { id: "liberdade", nome: "Liberdade Financeira", percentual: 25, cor: "#8B5CF6" },
  { id: "custos_fixos", nome: "Custos Fixos", percentual: 30, cor: "#3B82F6" },
  { id: "conforto", nome: "Conforto", percentual: 15, cor: "#EC4899" },
  { id: "metas", nome: "Metas", percentual: 15, cor: "#A855F7" },
  { id: "prazeres", nome: "Prazeres", percentual: 10, cor: "#F97316" },
  { id: "conhecimento", nome: "Conhecimento", percentual: 5, cor: "#EAB308" },
];

export const ORCAMENTO_QUERY_KEY = ["orcamento_configuracoes"] as const;

async function fetchOrcamentoConfig(): Promise<TemaOrcamento[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return TEMAS_PADRAO;

  const { data, error } = await supabase
    .from("orcamento_configuracoes" as any)
    .select("temas")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    logger.error("useOrcamentoControle", "Erro ao carregar orçamento", { error: error.message });
    throw error;
  }

  if (data && Array.isArray((data as any).temas) && (data as any).temas.length > 0) {
    return (data as any).temas as TemaOrcamento[];
  }

  return TEMAS_PADRAO;
}

export const useOrcamentoControle = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: temas = TEMAS_PADRAO, isLoading: loading } = useQuery({
    queryKey: ORCAMENTO_QUERY_KEY,
    queryFn: fetchOrcamentoConfig,
    staleTime: 1000 * 60 * 5,
  });

  const salvarTemas = useMutation({
    mutationFn: async (novosTemas: TemaOrcamento[]) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .single();

      const targetProfileId = profile?.id || userId;

      const { error } = await supabase
        .from("orcamento_configuracoes" as any)
        .upsert(
          {
            user_id: targetProfileId,
            temas: novosTemas,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;
      return novosTemas;
    },
    onSuccess: (data) => {
      qc.setQueryData(ORCAMENTO_QUERY_KEY, data);
      qc.invalidateQueries({ queryKey: ORCAMENTO_QUERY_KEY });
      toast({
        title: "Orçamento Salvo",
        description: "Suas configurações de alocação foram salvas com sucesso!",
      });
    },
    onError: (error) => {
      logger.error("useOrcamentoControle", "Erro ao salvar", { error: String(error) });
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  return {
    temas,
    loading,
    salvarTemas: (novosTemas: TemaOrcamento[]) => salvarTemas.mutateAsync(novosTemas),
    isSalvando: salvarTemas.isPending,
  };
};
