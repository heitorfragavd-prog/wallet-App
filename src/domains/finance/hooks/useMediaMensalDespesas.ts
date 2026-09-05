import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getHojeSaoPaulo } from "@/domains/finance/utils/dateHelpers";

/**
 * Hook para cálculo da média mensal de despesas dos últimos 6 meses.
 * 
 * ARQUITETURA DE DADOS:
 * - `despesas`: Lançamentos manuais, contas a pagar e saques operacionais cadastrados no sistema.
 * - `transacoes`: Movimentações financeiras com `tipo = 'despesa'` oriundas de extratos bancários (OFX, Pluggy, etc.).
 * 
 * NOTA SOBRE DEDUPLICAÇÃO:
 * Não há chave estrangeira rígida entre as duas tabelas no banco de dados. Deduplicações heurísticas
 * cegas (por valor + data + descrição) foram expressamente evitadas para não mascarar despesas legítimas
 * idênticas (ex: pagamentos recorrentes ou múltiplos no mesmo dia). O hook agrega os registros de ambas
 * as origens para estimar o fluxo médio real de saída do workspace nos últimos 6 meses.
 * 
 * FUSO HORÁRIO:
 * A data limite é calculada em `America/Sao_Paulo` (YYYY-MM-DD), evitando desvios de timezone
 * que ocorriam ao utilizar `toISOString().split('T')[0]`.
 */
export function useMediaMensalDespesas() {
  const { activeWorkspace } = useWorkspace();

  return useQuery({
    queryKey: ["media-mensal-despesas", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return 0;

      // Pegar a data exata de 6 meses atrás no fuso America/Sao_Paulo (sem desvio por toISOString)
      const hojeSP = getHojeSaoPaulo();
      const [ano, mes, dia] = hojeSP.split("-").map(Number);
      const dataRef = new Date(ano, mes - 1 - 6, dia);
      const dataFormatada = `${dataRef.getFullYear()}-${String(dataRef.getMonth() + 1).padStart(2, "0")}-${String(dataRef.getDate()).padStart(2, "0")}`;

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
