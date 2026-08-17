import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface ComparativoMes {
  mes: string;
  receitas: number;
  despesas: number;
  saldo: number;
  variacaoReceitas: number;
  variacaoDespesas: number;
}

const PAGE_SIZE = 1000;

async function fetchSomaValores(buildQuery: () => any): Promise<number> {
  let total = 0;
  try {
    for (let offset = 0; offset < 50000; offset += PAGE_SIZE) {
      const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      total += rows.reduce((acc: number, r: any) => acc + Number(r.valor || 0), 0);
      if (rows.length < PAGE_SIZE) break;
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error("Não foi possível carregar os dados do comparativo mensal");
  }
  return total;
}

export function useComparativoPeriodos(quantidadeMeses: number = 6) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  return useQuery<ComparativoMes[]>({
    queryKey: ["comparativo", workspaceId, quantidadeMeses],
    queryFn: async () => {
      const hoje = new Date();
      const resultado: ComparativoMes[] = [];

      for (let i = quantidadeMeses - 1; i >= 0; i--) {
        const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const ano = data.getFullYear();
        const mes = data.getMonth() + 1;
        const mesPad = String(mes).padStart(2, "0");
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const startDate = `${ano}-${mesPad}-01`;
        const endDate = `${ano}-${mesPad}-${String(ultimoDia).padStart(2, "0")}T23:59:59`;

        const applyFilter = (q: any) => {
          let query = q;
          if (workspaceId) {
            query = query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
          }
          return query.gte("data", startDate).lte("data", endDate);
        };

        const [somaRec, somaTransRec, somaDesp, somaTransDesp] = await Promise.all([
          fetchSomaValores(() => applyFilter(supabase.from("receitas").select("valor"))),
          fetchSomaValores(() => applyFilter(supabase.from("transacoes").select("valor").eq("tipo", "receita"))),
          fetchSomaValores(() => applyFilter(supabase.from("despesas").select("valor"))),
          fetchSomaValores(() => applyFilter(supabase.from("transacoes").select("valor").eq("tipo", "despesa"))),
        ]);

        const totalReceitas = somaRec + somaTransRec;
        const totalDespesas = somaDesp + somaTransDesp;

        const mesAnterior = resultado[resultado.length - 1];
        const varRec = mesAnterior?.receitas > 0 ? ((totalReceitas - mesAnterior.receitas) / mesAnterior.receitas) * 100 : 0;
        const varDesp = mesAnterior?.despesas > 0 ? ((totalDespesas - mesAnterior.despesas) / mesAnterior.despesas) * 100 : 0;

        resultado.push({
          mes: `${mesPad}/${ano}`,
          receitas: totalReceitas,
          despesas: totalDespesas,
          saldo: totalReceitas - totalDespesas,
          variacaoReceitas: Number(varRec.toFixed(1)),
          variacaoDespesas: Number(varDesp.toFixed(1)),
        });
      }

      return resultado;
    },
    staleTime: 1000 * 60 * 5,
  });
}
