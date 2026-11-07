import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { formatarDataParaSaoPaulo, getHojeSaoPaulo } from "../utils/dateHelpers";

export function useMediaMensalDespesas() {
  const { activeWorkspace } = useWorkspace();

  return useQuery({
    queryKey: ["media-mensal-despesas", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return 0;

      // Coexistência e consolidação financeira gerencial:
      // A média mensal deve refletir as saídas operacionais reais e quitadas (status = 'pago').
      // Para evitar distorções de mês corrente incompleto e flutuação de dias parciais,
      // a média avalia os últimos 6 meses fechados completos (ou os meses com dados existentes).
      const hojeSP = getHojeSaoPaulo();
      const [ano, mes] = hojeSP.split("-").map(Number);

      // Início: 1º dia de 6 meses atrás
      // Fim: Último dia do mês anterior ao corrente
      const inicioData = new Date(ano, mes - 1 - 6, 1);
      const fimData = new Date(ano, mes - 1, 0);

      const dataInicioFormatada = formatarDataParaSaoPaulo(inicioData);
      const dataFimFormatada = formatarDataParaSaoPaulo(fimData);

      // Busca despesas quitadas dos últimos 6 meses fechados (excluindo faturas de cartão)
      const despesasQuery = supabase
        .from("despesas")
        .select("valor, data")
        .eq("workspace_id", activeWorkspace.id)
        .eq("status", "pago")
        .is("fatura_id", null)
        .gte("data", dataInicioFormatada)
        .lte("data", dataFimFormatada);

      // Busca transações de despesa quitadas dos últimos 6 meses fechados
      const transacoesQuery = supabase
        .from("transacoes")
        .select("valor, data")
        .eq("workspace_id", activeWorkspace.id)
        .eq("tipo", "despesa")
        .gte("data", dataInicioFormatada)
        .lte("data", dataFimFormatada);

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
      const totalGeral = totalDespesasVal + totalTransacoesVal;

      if (totalGeral === 0) return 0;

      // Conta quantos meses distintos possuem dados para normalizar a média
      const mesesComDados = new Set<string>();
      (despesasResp.data ?? []).forEach((d) => {
        if (d.data) mesesComDados.add(String(d.data).slice(0, 7));
      });
      (transacoesResp.data ?? []).forEach((t) => {
        if (t.data) mesesComDados.add(String(t.data).slice(0, 7));
      });

      const divisorMeses = Math.min(6, Math.max(1, mesesComDados.size));

      return totalGeral / divisorMeses;
    },
    enabled: !!activeWorkspace?.id,
  });
}
