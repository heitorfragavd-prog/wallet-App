import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { FichaTecnica } from "@/domains/finance/types/foodCost";

export const FICHAS_TECNICAS_QUERY_KEY = ["fichas_tecnicas"] as const;

async function fetchFichasDoProduto(produtoId: string): Promise<FichaTecnica[]> {
  const { data, error } = await supabase
    .from("fichas_tecnicas")
    .select("*")
    .eq("produto_id", produtoId)
    .order("insumo_nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FichaTecnica[];
}

export function useFichaTecnica(produtoId?: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const { data: fichas = [], isLoading: loading } = useQuery({
    queryKey: [...FICHAS_TECNICAS_QUERY_KEY, produtoId],
    queryFn: () => fetchFichasDoProduto(produtoId!),
    enabled: !!produtoId,
    staleTime: 1000 * 60 * 5,
  });

  const custoTotal = fichas.reduce((acc, f) => acc + f.quantidade * f.custo_unitario, 0);

  const addInsumo = useMutation({
    mutationFn: async (
      input: Omit<FichaTecnica, "id" | "user_id" | "created_at" | "updated_at">
    ) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase
        .from("fichas_tecnicas")
        .insert([{ ...input, user_id: userId, workspace_id: workspaceId }])
        .select("*")
        .single();
      if (error) throw error;
      return data as FichaTecnica;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...FICHAS_TECNICAS_QUERY_KEY, produtoId] });
      toast({ title: "Insumo adicionado", description: "Ingrediente adicionado à ficha técnica!" });
    },
    onError: (err) => {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const updateInsumo = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<FichaTecnica> }) => {
      const { data, error } = await supabase
        .from("fichas_tecnicas")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as FichaTecnica;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...FICHAS_TECNICAS_QUERY_KEY, produtoId] });
      toast({ title: "Insumo atualizado" });
    },
    onError: (err) => {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const removeInsumo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fichas_tecnicas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...FICHAS_TECNICAS_QUERY_KEY, produtoId] });
      toast({ title: "Insumo removido" });
    },
    onError: (err) => {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  return {
    fichas,
    loading,
    custoTotal,
    addInsumo: addInsumo.mutateAsync,
    updateInsumo: updateInsumo.mutateAsync,
    removeInsumo: removeInsumo.mutateAsync,
  };
}
