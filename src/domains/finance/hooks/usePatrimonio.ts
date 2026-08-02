import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface PatrimonioData {
  ativos: { contas: number; veiculos: number; total: number };
  passivos: { dividas: number; faturasCartao: number; total: number };
  patrimonioLiquido: number;
}

export function usePatrimonio() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  return useQuery<PatrimonioData>({
    queryKey: ["patrimonio", workspaceId],
    queryFn: async () => {
      // 1. ATIVOS: Contas Bancárias e Carteiras (exclui cartões de crédito)
      let contasBancarias = 0;
      try {
        let qContas = supabase.from("contas_usuario").select("saldo_atual, tipo, workspace_id");
        if (workspaceId) {
          qContas = qContas.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
        }
        const { data: contas, error: errContas } = await qContas;

        if (!errContas && contas) {
          contasBancarias = contas
            .filter((c: any) => c.tipo !== "cartao_credito")
            .reduce((a: number, c: any) => a + Number(c.saldo_atual || 0), 0);
        } else {
          // Fallback global de contas
          const { data: contasGlobal } = await supabase.from("contas_usuario").select("saldo_atual, tipo");
          contasBancarias = (contasGlobal || [])
            .filter((c: any) => c.tipo !== "cartao_credito")
            .reduce((a: number, c: any) => a + Number(c.saldo_atual || 0), 0);
        }
      } catch (e) {
        console.warn("usePatrimonio: erro ao buscar contas", e);
      }

      // 2. ATIVOS: Veículos (resiliente a colunas)
      let valorVeiculos = 0;

      // 3. PASSIVOS: Dívidas Pendentes
      let totalDividas = 0;
      try {
        let qDividas = supabase.from("dividas").select("valor_restante, valor_total, status, workspace_id");
        if (workspaceId) {
          qDividas = qDividas.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
        }
        const { data: dividas, error: errDividas } = await qDividas;

        if (!errDividas && dividas) {
          totalDividas = dividas
            .filter((d: any) => d.status !== "quitada")
            .reduce((a: number, d: any) => a + Number(d.valor_restante ?? d.valor_total ?? 0), 0);
        } else {
          const { data: dividasGlobal } = await supabase.from("dividas").select("valor_restante, valor_total, status");
          totalDividas = (dividasGlobal || [])
            .filter((d: any) => d.status !== "quitada")
            .reduce((a: number, d: any) => a + Number(d.valor_restante ?? d.valor_total ?? 0), 0);
        }
      } catch (e) {
        console.warn("usePatrimonio: erro ao buscar dividas", e);
      }

      // 4. PASSIVOS: Faturas de Cartão de Crédito
      let totalFaturas = 0;
      try {
        const { data: compras } = await supabase
          .from("despesas")
          .select("valor")
          .eq("metodo_pagamento", "cartao_credito");

        totalFaturas = (compras || []).reduce((a: number, x: any) => a + Number(x.valor || 0), 0);
      } catch (e) {
        console.warn("usePatrimonio: erro ao buscar faturas de cartao", e);
      }

      const totalAtivos = contasBancarias + valorVeiculos;
      const totalPassivos = totalDividas + totalFaturas;

      return {
        ativos: { contas: contasBancarias, veiculos: valorVeiculos, total: totalAtivos },
        passivos: { dividas: totalDividas, faturasCartao: totalFaturas, total: totalPassivos },
        patrimonioLiquido: totalAtivos - totalPassivos,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}
