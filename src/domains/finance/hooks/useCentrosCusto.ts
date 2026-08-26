import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface CentroCusto {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  nome: string;
  descricao?: string | null;
  responsavel?: string | null;
  orcamento_mensal?: number | null;
  ativo: boolean;
  created_at?: string;
}

export const CENTROS_CUSTO_QUERY_KEY = ["centros-custo"] as const;

async function fetchCentrosCusto(workspaceId: string | null): Promise<CentroCusto[]> {
  if (!workspaceId) return [];

  let query = supabase
    .from("centros_custo")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("nome", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CentroCusto[];
}

export const useCentrosCusto = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const currentWorkspaceId = activeWorkspace?.id || null;

  const { data: centrosCusto = [], isLoading: loading } = useQuery({
    queryKey: [...CENTROS_CUSTO_QUERY_KEY, { workspaceId: currentWorkspaceId }],
    queryFn: () => fetchCentrosCusto(currentWorkspaceId),
    enabled: !!currentWorkspaceId,
    staleTime: 1000 * 60 * 2,
  });

  const createCentroCusto = useMutation({
    mutationFn: async (c: Omit<CentroCusto, "id" | "user_id" | "created_at">) => {
      if (!currentWorkspaceId) {
        throw new Error("Workspace não selecionado para criar centro de custo.");
      }
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("centros_custo")
        .insert([{ ...c, user_id: userId, workspace_id: currentWorkspaceId }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CENTROS_CUSTO_QUERY_KEY });
      toast({ title: "Centro de custo criado", description: "Centro de custo criado com sucesso!" });
    },
    onError: (error) => {
      logger.error("useCentrosCusto", "Erro ao criar centro de custo", { error: String(error) });
      toast({ title: "Erro ao criar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const updateCentroCusto = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CentroCusto> & { id: string }) => {
      let q = supabase
        .from("centros_custo")
        .update(updates)
        .eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { data, error } = await q
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CENTROS_CUSTO_QUERY_KEY });
      toast({ title: "Centro de custo atualizado", description: "Centro de custo atualizado com sucesso!" });
    },
    onError: (error) => {
      logger.error("useCentrosCusto", "Erro ao atualizar centro de custo", { error: String(error) });
      toast({ title: "Erro ao atualizar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const deleteCentroCusto = useMutation({
    mutationFn: async (id: string) => {
      let q = supabase.from("centros_custo").delete().eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CENTROS_CUSTO_QUERY_KEY });
      toast({ title: "Centro de custo excluído", description: "Centro de custo excluído com sucesso!" });
    },
    onError: (error) => {
      logger.error("useCentrosCusto", "Erro ao excluir centro de custo", { error: String(error) });
      toast({ title: "Erro ao excluir", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  return {
    centrosCusto,
    loading,
    createCentroCusto: createCentroCusto.mutateAsync,
    updateCentroCusto: updateCentroCusto.mutateAsync,
    deleteCentroCusto: deleteCentroCusto.mutateAsync,
  };
};
