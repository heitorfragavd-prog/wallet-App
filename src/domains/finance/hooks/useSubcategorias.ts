import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface Subcategoria {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  categoria_id: string | null;
  nome: string;
  cor: string;
  ativo: boolean;
  created_at?: string;
  categorias?: { nome: string; cor: string; icone: string } | null;
}

export const SUBCATEGORIAS_QUERY_KEY = ["subcategorias"] as const;

async function fetchSubcategorias(workspaceId: string | null): Promise<Subcategoria[]> {
  if (!workspaceId) return [];

  const query = supabase
    .from("subcategorias")
    .select("*, categorias!categoria_id (nome, cor, icone)")
    .eq("workspace_id", workspaceId)
    .order("nome", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Subcategoria[];
}

export const useSubcategorias = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const currentWorkspaceId = activeWorkspace?.id || null;

  const { data: subcategorias = [], isLoading: loading } = useQuery({
    queryKey: [...SUBCATEGORIAS_QUERY_KEY, { workspaceId: currentWorkspaceId }],
    queryFn: () => fetchSubcategorias(currentWorkspaceId),
    enabled: !!currentWorkspaceId,
    staleTime: 1000 * 60 * 2,
  });

  const createSubcategoria = useMutation({
    mutationFn: async (sub: Omit<Subcategoria, "id" | "user_id" | "created_at" | "categorias">) => {
      if (!currentWorkspaceId) {
        throw new Error("Workspace não selecionado para criar subcategoria.");
      }
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("subcategorias")
        .insert([{ ...sub, user_id: userId, workspace_id: currentWorkspaceId }])
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBCATEGORIAS_QUERY_KEY });
      toast({ title: "Subcategoria criada", description: "Subcategoria criada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useSubcategorias", "Erro ao criar subcategoria", { error: String(error) });
      toast({ title: "Erro ao criar subcategoria", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const updateSubcategoria = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Subcategoria> & { id: string }) => {
      let q = supabase
        .from("subcategorias")
        .update(updates)
        .eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { data, error } = await q
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBCATEGORIAS_QUERY_KEY });
      toast({ title: "Subcategoria atualizada", description: "Subcategoria atualizada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useSubcategorias", "Erro ao atualizar subcategoria", { error: String(error) });
      toast({ title: "Erro ao atualizar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const deleteSubcategoria = useMutation({
    mutationFn: async (id: string) => {
      let q = supabase.from("subcategorias").delete().eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBCATEGORIAS_QUERY_KEY });
      toast({ title: "Subcategoria excluída", description: "Subcategoria excluída com sucesso!" });
    },
    onError: (error) => {
      logger.error("useSubcategorias", "Erro ao excluir subcategoria", { error: String(error) });
      toast({ title: "Erro ao excluir", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  return {
    subcategorias,
    loading,
    createSubcategoria: createSubcategoria.mutateAsync,
    updateSubcategoria: updateSubcategoria.mutateAsync,
    deleteSubcategoria: deleteSubcategoria.mutateAsync,
  };
};
