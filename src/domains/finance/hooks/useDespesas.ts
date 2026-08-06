import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Despesa as DespesaType, PaymentMethod } from "../types";

export interface Despesa extends Omit<DespesaType, "tags" | "anexos"> {
  updated_at?: string;
  workspace_id?: string;
  subcategoria_id?: string | null;
  centro_custo_id?: string | null;
  contato_id?: string | null;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
  tags?: Array<{ id: string; nome: string; cor?: string }>;
}

export const DESPESAS_QUERY_KEY = ["despesas"] as const;

export interface DespesasQueryParams {
  startDate?: string | null;
  endDate?: string | null;
  workspaceId?: string | null;
}

// ─── Fetcher puro (sem React) ───────────────────────────────────────────
async function fetchDespesas(params: DespesasQueryParams = {}): Promise<Despesa[]> {
  const { startDate, endDate, workspaceId } = params;
  console.log("[fetchDespesas Hook Call]", { startDate, endDate, workspaceId });

  let despesasQuery = supabase
    .from("despesas")
    .select("*, categorias!despesas_categoria_id_fkey(nome, cor, icone), despesa_tags (tags (id, nome, cor))");

  if (workspaceId) despesasQuery = despesasQuery.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
  if (startDate) despesasQuery = despesasQuery.gte("data", startDate);
  if (endDate) despesasQuery = despesasQuery.lte("data", endDate);

  let transacoesQuery = supabase
    .from("transacoes")
    .select("*, categorias(nome, cor, icone)")
    .eq("tipo", "despesa");

  if (workspaceId) transacoesQuery = transacoesQuery.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
  if (startDate) transacoesQuery = transacoesQuery.gte("data", startDate);
  if (endDate) transacoesQuery = transacoesQuery.lte("data", endDate);

  try {
    const [despesasResp, transacoesResp] = await Promise.all([
      despesasQuery,
      transacoesQuery
    ]);

    console.log("[fetchDespesas DB Success]", { 
      despesasRawCount: despesasResp.data?.length || 0,
      transacoesRawCount: transacoesResp.data?.length || 0 
    });

    const mappedDespesas = (despesasResp.data ?? []).map((d) => ({
      ...d,
      tags: (d as any).despesa_tags?.map((dt: any) => dt.tags).filter(Boolean) ?? [],
    }));

    const mappedTransacoes = transacoesResp.data ?? [];

    const res = [...mappedDespesas, ...mappedTransacoes].sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
    ) as Despesa[];

    console.log("[fetchDespesas Hook Finish Success]", { finalCount: res.length });
    return res;
  } catch (err: any) {
    console.error("[fetchDespesas Hook Exception]", err);
    throw err;
  }
}

// ─── Tag helpers ─────────────────────────────────────────────────
async function addTagsToDespesa(despesaId: string, tagNames: string[]) {
  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id, nome")
    .in("nome", tagNames);
  if (tagsError) throw tagsError;

  const { error } = await supabase.from("despesa_tags").insert(
    tags.map((tag) => ({ despesa_id: despesaId, tag_id: tag.id }))
  );
  if (error) throw error;
}

async function updateDespesaTags(despesaId: string, tagNames: string[]) {
  await supabase.from("despesa_tags").delete().eq("despesa_id", despesaId);
  if (tagNames.length > 0) await addTagsToDespesa(despesaId, tagNames);
}

// ─── Hook ─────────────────────────────────────────────────────
export const useDespesas = (params: DespesasQueryParams = {}) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const currentWorkspaceId = activeWorkspace?.id || null;
  const { startDate = null, endDate = null } = params;

  // ── Query — queryKey inclui datas e workspaceId
  const { data: despesas = [], isLoading: loading } = useQuery({
    queryKey: [...DESPESAS_QUERY_KEY, { startDate, endDate, workspaceId: currentWorkspaceId }],
    queryFn: () => fetchDespesas({ startDate, endDate, workspaceId: currentWorkspaceId }),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // ── Mutations
  const createDespesa = useMutation({
    mutationFn: async ({
      despesa,
      tagNames,
    }: {
      despesa: Omit<Despesa, "id" | "user_id" | "created_at" | "updated_at" | "categorias">;
      tagNames?: string[];
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      let faturaIdToLink = (despesa as any).fatura_id || null;

      // Se for cartão de crédito e fatura_id não veio preenchido, calcula automaticamente por período de fechamento
      if (!faturaIdToLink && despesa.conta_id) {
        try {
          const { data: contaObj } = await supabase
            .from("contas_usuario")
            .select("id, tipo, dia_fechamento, dia_vencimento")
            .eq("id", despesa.conta_id)
            .maybeSingle();

          if (contaObj && contaObj.tipo === "cartao_credito") {
            const { determinarFaturaParaData, calcularPeriodoFatura } = await import("./useFaturasCartao");
            const { mes_fatura, ano_fatura } = determinarFaturaParaData(despesa.data, contaObj.dia_fechamento);

            const { data: faturaExistente } = await supabase
              .from("faturas_cartao")
              .select("id")
              .eq("cartao_id", contaObj.id)
              .eq("mes_fatura", mes_fatura)
              .eq("ano_fatura", ano_fatura)
              .maybeSingle();

            if (faturaExistente) {
              faturaIdToLink = faturaExistente.id;
            } else {
              const periodo = calcularPeriodoFatura(contaObj, mes_fatura, ano_fatura);
              const { data: novaFatura } = await supabase
                .from("faturas_cartao")
                .insert({
                  user_id: userId,
                  workspace_id: currentWorkspaceId || null,
                  cartao_id: contaObj.id,
                  mes_fatura,
                  ano_fatura,
                  data_inicio: periodo.data_inicio,
                  data_fechamento: periodo.data_fechamento,
                  data_vencimento: periodo.data_vencimento,
                  valor_total: 0,
                  status: "aberta",
                })
                .select("id")
                .maybeSingle();

              if (novaFatura) faturaIdToLink = novaFatura.id;
            }
          }
        } catch (e) {
          logger.warn("useDespesas", "Aviso ao calcular fatura automática:", String(e));
        }
      }

      const { data, error } = await supabase
        .from("despesas")
        .insert([{ ...despesa, fatura_id: faturaIdToLink, user_id: userId, workspace_id: currentWorkspaceId }])
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      if (tagNames?.length) await addTagsToDespesa(data.id, tagNames);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESPESAS_QUERY_KEY });
      toast({ title: "Despesa criada", description: "Despesa criada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDespesas", "Erro ao criar despesa", { error: String(error) });
      toast({ title: "Erro ao criar despesa", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  const updateDespesa = useMutation({
    mutationFn: async ({
      id,
      updates,
      tagNames,
    }: {
      id: string;
      updates: Partial<Despesa>;
      tagNames?: string[];
    }) => {
      const { data, error } = await supabase
        .from("despesas")
        .update(updates)
        .eq("id", id)
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      if (tagNames !== undefined) await updateDespesaTags(id, tagNames);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESPESAS_QUERY_KEY });
      toast({ title: "Despesa atualizada", description: "Despesa atualizada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDespesas", "Erro ao atualizar despesa", { error: String(error) });
      toast({ title: "Erro ao atualizar despesa", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  const deleteDespesa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("despesas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESPESAS_QUERY_KEY });
      toast({ title: "Despesa removida", description: "Despesa removida com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDespesas", "Erro ao remover despesa", { error: String(error) });
      toast({ title: "Erro ao remover despesa", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  // ── Filtros e utilitários (derivações puras do cache)
  const filterByPaymentMethod = (paymentMethod: PaymentMethod | null) => {
    if (paymentMethod === null) return despesas.filter((d) => !d.metodo_pagamento);
    return despesas.filter((d) => d.metodo_pagamento === paymentMethod);
  };

  const filterByAccount = (accountId: string) =>
    despesas.filter((d) => d.conta_id === accountId);

  const filterByTags = (tagNames: string[]) => {
    if (!tagNames.length) return despesas;
    return despesas.filter((d) =>
      tagNames.every((name) => d.tags?.some((t) => t.nome === name))
    );
  };

  const searchDespesas = (searchTerm: string) => {
    if (!searchTerm.trim()) return despesas;
    const term = searchTerm.toLowerCase();
    return despesas.filter(
      (d) =>
        d.descricao.toLowerCase().includes(term) ||
        d.categorias?.nome.toLowerCase().includes(term) ||
        (d.observacoes && d.observacoes.toLowerCase().includes(term))
    );
  };

  const getDespesaTags = async (despesaId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from("despesa_tags")
        .select("tags (nome)")
        .eq("despesa_id", despesaId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.map((item: any) => item.tags?.nome).filter(Boolean);
    } catch (error) {
      logger.error("useDespesas", "Erro ao buscar tags da despesa", { error: String(error) });
      return [];
    }
  };

  return {
    despesas,
    loading,
    createDespesa: (
      despesa: Omit<Despesa, "id" | "user_id" | "created_at" | "updated_at" | "categorias">,
      tagNames?: string[]
    ) => createDespesa.mutateAsync({ despesa, tagNames }),
    updateDespesa: (id: string, updates: Partial<Despesa>, tagNames?: string[]) =>
      updateDespesa.mutateAsync({ id, updates, tagNames }),
    deleteDespesa: (id: string) => deleteDespesa.mutateAsync(id),
    refetch: () => qc.invalidateQueries({ queryKey: DESPESAS_QUERY_KEY }),
    filterByPaymentMethod,
    filterByAccount,
    filterByTags,
    searchDespesas,
    getDespesaTags,
  };
};