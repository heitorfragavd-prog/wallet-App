import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { ProdutoCardapio, CategoriaCardapio } from "@/domains/finance/types/foodCost";

export const PRODUTOS_CARDAPIO_QUERY_KEY = ["produtos_cardapio"] as const;

async function fetchProdutos(workspaceId?: string | null): Promise<ProdutoCardapio[]> {
  let query = supabase
    .from("produtos_cardapio")
    .select("*")
    .order("nome", { ascending: true });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProdutoCardapio[];
}

export function useProdutosCardapio() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const { data: produtos = [], isLoading: loading } = useQuery({
    queryKey: [...PRODUTOS_CARDAPIO_QUERY_KEY, workspaceId],
    queryFn: () => fetchProdutos(workspaceId),
    staleTime: 1000 * 60 * 5,
  });

  const createProduto = useMutation({
    mutationFn: async (
      input: Omit<ProdutoCardapio, "id" | "user_id" | "created_at" | "updated_at">
    ) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase
        .from("produtos_cardapio")
        .insert([{ ...input, user_id: userId, workspace_id: workspaceId }])
        .select("*")
        .single();
      if (error) throw error;
      return data as ProdutoCardapio;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUTOS_CARDAPIO_QUERY_KEY });
      toast({ title: "Produto criado", description: "Produto adicionado ao cardápio!" });
    },
    onError: (err) => {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const updateProduto = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ProdutoCardapio> }) => {
      const { data, error } = await supabase
        .from("produtos_cardapio")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as ProdutoCardapio;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUTOS_CARDAPIO_QUERY_KEY });
      toast({ title: "Produto atualizado", description: "Produto salvo com sucesso!" });
    },
    onError: (err) => {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const deleteProduto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produtos_cardapio").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUTOS_CARDAPIO_QUERY_KEY });
      toast({ title: "Produto removido" });
    },
    onError: (err) => {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const categorias: CategoriaCardapio[] = ["lanches", "bebidas", "sobremesas", "cafes", "porcoes", "outros"];

  return {
    produtos,
    loading,
    categorias,
    createProduto: createProduto.mutateAsync,
    updateProduto: updateProduto.mutateAsync,
    deleteProduto: deleteProduto.mutateAsync,
    refetch: () => qc.invalidateQueries({ queryKey: PRODUTOS_CARDAPIO_QUERY_KEY }),
  };
}
