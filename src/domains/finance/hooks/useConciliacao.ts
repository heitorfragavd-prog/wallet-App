import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface LancamentoConciliacao {
  id: string;
  fonte: "receitas" | "despesas" | "transacoes";
  tipo: "receita" | "despesa";
  descricao: string;
  valor: number;
  data: string;
  conciliado: boolean;
  metodo_pagamento?: string | null;
}

export const CONCILIACAO_QUERY_KEY = ["conciliacao"] as const;

const diffDias = (a: string, b: string) =>
  Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000;

async function fetchLancamentos(mes: string, workspaceId: string | null): Promise<LancamentoConciliacao[]> {
  const startDate = `${mes}-01`;
  const end = new Date(Number(mes.split("-")[0]), Number(mes.split("-")[1]), 0);
  const endDate = end.toISOString().split("T")[0];

  const cols = "id, descricao, valor, data, conciliado, metodo_pagamento";

  let receitasQuery = supabase.from("receitas").select(cols).gte("data", startDate).lte("data", endDate);
  let despesasQuery = supabase.from("despesas").select(cols).gte("data", startDate).lte("data", endDate);
  let transacoesQuery = supabase.from("transacoes").select(`${cols}, tipo`).gte("data", startDate).lte("data", endDate);

  if (workspaceId) {
    receitasQuery = receitasQuery.eq("workspace_id", workspaceId);
    despesasQuery = despesasQuery.eq("workspace_id", workspaceId);
    transacoesQuery = transacoesQuery.eq("workspace_id", workspaceId);
  }

  const [r, d, t] = await Promise.all([receitasQuery, despesasQuery, transacoesQuery]);
  if (r.error) throw r.error;
  if (d.error) throw d.error;
  if (t.error) throw t.error;

  const lancamentos: LancamentoConciliacao[] = [
    ...(r.data ?? []).map((x) => ({ ...x, fonte: "receitas" as const, tipo: "receita" as const })),
    ...(d.data ?? []).map((x) => ({ ...x, fonte: "despesas" as const, tipo: "despesa" as const })),
    ...(t.data ?? []).map((x) => ({
      id: x.id,
      descricao: x.descricao,
      valor: x.valor,
      data: x.data,
      conciliado: x.conciliado,
      metodo_pagamento: x.metodo_pagamento,
      fonte: "transacoes" as const,
      tipo: (x.tipo === "receita" ? "receita" : "despesa") as "receita" | "despesa",
    })),
  ];

  return lancamentos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
}

export const useConciliacao = (mes?: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const currentWorkspaceId = activeWorkspace?.id || null;
  const mesRef = mes || new Date().toISOString().slice(0, 7); // YYYY-MM

  const { data: lancamentos = [], isLoading: loading, refetch } = useQuery({
    queryKey: [...CONCILIACAO_QUERY_KEY, { mes: mesRef, workspaceId: currentWorkspaceId }],
    queryFn: () => fetchLancamentos(mesRef, currentWorkspaceId),
    staleTime: 1000 * 60 * 2,
  });

  const pendentes = lancamentos.filter((l) => !l.conciliado);
  const conciliados = lancamentos.filter((l) => l.conciliado);

  const marcarConciliado = useMutation({
    mutationFn: async ({ id, fonte, conciliado }: { id: string; fonte: LancamentoConciliacao["fonte"]; conciliado: boolean }) => {
      const { error } = await supabase.from(fonte).update({ conciliado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONCILIACAO_QUERY_KEY });
    },
    onError: (error) => {
      logger.error("useConciliacao", "Erro ao marcar conciliado", { error: String(error) });
      toast({ title: "Erro ao conciliar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  /**
   * Conciliação automática: agrupa lançamentos de mesmo tipo + valor igual
   * (± R$ 0,02) e data próxima (± 3 dias) entre fontes diferentes e marca
   * todos como conciliados.
   */
  const conciliarAutomaticamente = useMutation({
    mutationFn: async () => {
      let matches = 0;
      const usados = new Set<string>();

      for (const a of pendentes) {
        if (usados.has(a.id)) continue;
        const parceiro = pendentes.find(
          (b) =>
            b.id !== a.id &&
            !usados.has(b.id) &&
            b.fonte !== a.fonte &&
            b.tipo === a.tipo &&
            Math.abs(Number(b.valor) - Number(a.valor)) <= 0.02 &&
            diffDias(a.data, b.data) <= 3
        );
        if (parceiro) {
          usados.add(a.id);
          usados.add(parceiro.id);
          await supabase.from(a.fonte).update({ conciliado: true }).eq("id", a.id);
          await supabase.from(parceiro.fonte).update({ conciliado: true }).eq("id", parceiro.id);
          matches++;
        }
      }
      return matches;
    },
    onSuccess: (matches) => {
      qc.invalidateQueries({ queryKey: CONCILIACAO_QUERY_KEY });
      toast({
        title: "Conciliação automática concluída",
        description: matches > 0 ? `${matches} par(es) conciliado(s) por valor + data.` : "Nenhum par encontrado para conciliar.",
      });
    },
    onError: (error) => {
      logger.error("useConciliacao", "Erro na conciliação automática", { error: String(error) });
      toast({ title: "Erro na conciliação", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  return {
    lancamentos,
    pendentes,
    conciliados,
    loading,
    refetch,
    mes: mesRef,
    marcarConciliado: marcarConciliado.mutateAsync,
    conciliarAutomaticamente: conciliarAutomaticamente.mutateAsync,
    conciliandoAuto: conciliarAutomaticamente.isPending,
  };
};
