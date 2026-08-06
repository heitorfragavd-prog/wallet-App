import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface MetaInvestimento {
  id: string;
  user_id: string;
  workspace_id?: string;
  nome: string;
  descricao?: string;
  valor_meta: number;
  valor_atual: number;
  data_objetivo?: string;
  tipo: 'reserva_emergencia' | 'aposentadoria' | 'compra' | 'viagem' | 'educacao' | 'outro';
  imagem_url?: string;
  alocacao_fixa: number;
  alocacao_variavel: number;
  ativo: boolean;
  created_at?: string;
}

export const METAS_INVESTIMENTO_QUERY_KEY = ["metas_investimento"] as const;

export function calcularTempoAteMeta(
  meta: Omit<MetaInvestimento, "id" | "user_id" | "workspace_id"> & { id?: string },
  rateAnual: number = 8,
  aporteMensal: number = 0
): number {
  const target = Number(meta.valor_meta || 0);
  let current = Number(meta.valor_atual || 0);
  if (current >= target) return 0;

  const rateMensal = Math.pow(1 + rateAnual / 100, 1 / 12) - 1;
  let months = 0;

  // Evita loop infinito
  if (aporteMensal <= 0 && rateAnual <= 0) return 999;

  while (current < target && months < 1200) { // Limit to 100 years
    current = current * (1 + rateMensal) + aporteMensal;
    months++;
  }

  return months;
}

export function useMetasInvestimento() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const workspaceId = activeWorkspace?.id;

  const { data: metas = [], isLoading } = useQuery({
    queryKey: [...METAS_INVESTIMENTO_QUERY_KEY, workspaceId],
    queryFn: async (): Promise<MetaInvestimento[]> => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from("metas_investimento")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("nome", { ascending: true });

      if (error) {
        logger.error("useMetasInvestimento", "Erro ao buscar metas", { error: error.message });
        throw error;
      }

      return (data ?? []) as MetaInvestimento[];
    },
    enabled: !!workspaceId,
  });

  const createMeta = useMutation({
    mutationFn: async (payload: Omit<MetaInvestimento, "id" | "user_id" | "workspace_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("metas_investimento")
        .insert({
          ...payload,
          user_id: user.id,
          workspace_id: workspaceId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: METAS_INVESTIMENTO_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Meta de investimento criada com sucesso!",
      });
    },
    onError: (err: any) => {
      logger.error("useMetasInvestimento", "Erro ao criar meta", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao criar meta: ${err.message}`,
      });
    },
  });

  const updateMeta = useMutation({
    mutationFn: async (payload: Partial<MetaInvestimento> & { id: string }) => {
      const { id, ...changes } = payload;
      const { data, error } = await supabase
        .from("metas_investimento")
        .update(changes)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: METAS_INVESTIMENTO_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Meta de investimento atualizada com sucesso!",
      });
    },
    onError: (err: any) => {
      logger.error("useMetasInvestimento", "Erro ao atualizar meta", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao atualizar meta: ${err.message}`,
      });
    },
  });

  const deleteMeta = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("metas_investimento")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: METAS_INVESTIMENTO_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Meta de investimento excluída com sucesso!",
      });
    },
    onError: (err: any) => {
      logger.error("useMetasInvestimento", "Erro ao excluir meta", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao excluir meta: ${err.message}`,
      });
    },
  });

  return {
    metas,
    isLoading,
    createMeta,
    updateMeta,
    deleteMeta,
    calcularTempoAteMeta,
  };
}
