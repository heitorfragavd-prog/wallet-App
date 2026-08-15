import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export function useMediaMensalDespesas() {
  const { activeWorkspace } = useWorkspace();

  return useQuery({
    queryKey: ["media-mensal-despesas", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return 0;

      // Pegar a data exata de 6 meses atrás
      const hoje = new Date();
      const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 6, hoje.getDate());
      const dataFormatada = seisMesesAtras.toISOString().split('T')[0];

      // Busca despesas dos últimos 6 meses
      const despesasQuery = supabase
        .from("despesas")
        .select("valor")
        .eq("workspace_id", activeWorkspace.id)
        .gte("data", dataFormatada);

      // Busca transações de despesa dos últimos 6 meses
      const transacoesQuery = supabase
        .from("transacoes")
        .select("valor")
        .eq("workspace_id", activeWorkspace.id)
        .eq("tipo", "despesa")
        .gte("data", dataFormatada);

      const [despesasResp, transacoesResp] = await Promise.all([
        despesasQuery,
        transacoesQuery,
      ]);

      if (despesasResp.error) {
        console.error("Erro ao buscar despesas para média:", despesasResp.error);
        throw despesasResp.error;
      }
      if (transacoesResp.error) {
        console.error("Erro ao buscar transações para média:", transacoesResp.error);
        throw transacoesResp.error;
      }

      const totalDespesasVal = (despesasResp.data ?? []).reduce((acc, curr) => acc + Number(curr.valor), 0);
      const totalTransacoesVal = (transacoesResp.data ?? []).reduce((acc, curr) => acc + Number(curr.valor), 0);

      // Soma todos os gastos e divide por 6 meses para obter a média mensal real
      return (totalDespesasVal + totalTransacoesVal) / 6;
    },
    enabled: !!activeWorkspace?.id,
  });
}
