import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { InsumoComValidade } from "@/domains/finance/types/foodCost";

export const VALIDADES_QUERY_KEY = ["validades_insumos"] as const;

async function fetchInsumosComValidade(workspaceId?: string | null): Promise<InsumoComValidade[]> {
  let query = supabase
    .from("itens_mercado")
    .select("id, nome, data_validade, alerta_dias, quantidade_estoque, status_validade, workspace_id")
    .order("data_validade", { ascending: true, nullsFirst: false });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InsumoComValidade[];
}

export function useValidadeInsumos() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const { data: insumos = [], isLoading: loading } = useQuery({
    queryKey: [...VALIDADES_QUERY_KEY, workspaceId],
    queryFn: () => fetchInsumosComValidade(workspaceId),
    staleTime: 1000 * 60 * 5,
  });

  const vencidos = insumos.filter((i) => i.status_validade === "vencido");
  const proximos = insumos.filter((i) => i.status_validade === "proximo");
  const ok = insumos.filter((i) => i.status_validade === "ok");

  /** Registra a perda: cria uma despesa e zera o estoque do insumo */
  const registrarPerda = useMutation({
    mutationFn: async ({ insumoId, descricao, valor, categoriaId }: {
      insumoId: string;
      descricao: string;
      valor: number;
      categoriaId?: string;
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      // Cria despesa de perda
      const { error: despesaError } = await supabase.from("despesas").insert([{
        user_id: userId,
        workspace_id: workspaceId,
        descricao: `[PERDA] ${descricao}`,
        valor,
        data: new Date().toISOString().split("T")[0],
        categoria_id: categoriaId ?? null,
        observacoes: "Registrado automaticamente — insumo vencido",
      }]);
      if (despesaError) throw despesaError;

      // Zera estoque do insumo
      const { error: estoqueError } = await supabase
        .from("itens_mercado")
        .update({ quantidade_estoque: 0 })
        .eq("id", insumoId);
      if (estoqueError) throw estoqueError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VALIDADES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["despesas"] });
      toast({ title: "Perda registrada", description: "Despesa criada e estoque zerado." });
    },
    onError: (err) => {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  return {
    insumos,
    vencidos,
    proximos,
    ok,
    loading,
    registrarPerda: registrarPerda.mutateAsync,
  };
}
