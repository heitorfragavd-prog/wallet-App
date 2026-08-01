import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { ProdutoComCusto, FoodCostSummary } from "@/domains/finance/types/foodCost";

export const FOOD_COST_QUERY_KEY = ["food_cost"] as const;

async function fetchFoodCost(workspaceId?: string | null): Promise<ProdutoComCusto[]> {
  let query = supabase
    .from("v_produtos_custo")
    .select("*")
    .order("margem_percentual", { ascending: true });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProdutoComCusto[];
}

export function useFoodCost() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const { data: produtos = [], isLoading: loading } = useQuery({
    queryKey: [...FOOD_COST_QUERY_KEY, workspaceId],
    queryFn: () => fetchFoodCost(workspaceId),
    staleTime: 1000 * 60 * 5,
  });

  const summary: FoodCostSummary = (() => {
    const comFicha = produtos.filter((p) => p.qtd_insumos > 0);
    const cmvTotal = comFicha.reduce((acc, p) => acc + p.custo_total, 0);
    const receitaBruta = comFicha.reduce((acc, p) => acc + p.preco_venda, 0);
    const mediaMargemGeral =
      comFicha.length > 0
        ? comFicha.reduce((acc, p) => acc + p.margem_percentual, 0) / comFicha.length
        : 0;

    const sorted = [...comFicha].sort((a, b) => b.margem_percentual - a.margem_percentual);

    return {
      totalProdutos: produtos.length,
      produtosComFicha: comFicha.length,
      mediaMargemGeral: Math.round(mediaMargemGeral * 10) / 10,
      produtosMelhoresMargem: sorted.slice(0, 5),
      produtosPiorMargem: sorted.slice(-5).reverse(),
      cmvTotal,
      receitaBruta,
      foodCostPercent:
        receitaBruta > 0 ? Math.round((cmvTotal / receitaBruta) * 10000) / 100 : 0,
    };
  })();

  return { produtos, summary, loading };
}
