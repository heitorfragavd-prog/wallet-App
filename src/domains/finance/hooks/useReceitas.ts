import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { Receita as ReceitaType, PaymentMethod } from "../types";

export interface Receita extends Omit<ReceitaType, "tags" | "anexos"> {
  updated_at?: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
  tags?: Array<{ id: string; nome: string; cor?: string }>;
}

export const RECEITAS_QUERY_KEY = ["receitas"] as const;

export interface ReceitasQueryParams {
  startDate?: string | null;
  endDate?: string | null;
}

async function fetchAllRows<T>(
  buildQuery: () => ReturnType<typeof supabase.from>,
  applyFilters: (q: any) => any,
  columns: string,
  maxRows: number = 2000
): Promise<T[]> {
  try {
    const { data, error } = await applyFilters(buildQuery().select(columns)).limit(maxRows);
    if (error) {
      console.warn("Error fetching rows:", error.message);
      return [];
    }
    return (data as T[]) ?? [];
  } catch (err) {
    console.warn("Exception fetching rows:", err);
    return [];
  }
}


// ─── Fetcher puro ─────────────────────────────────────────────────
// Regra de Consolidação:
// 1. Eyemobile/PDV: Apenas transações em DINHEIRO / CASH / ESPECIE
// 2. Divipay / Demais fontes: Transações digitais normais
async function fetchReceitas(params: ReceitasQueryParams = {}): Promise<Receita[]> {
  const { startDate, endDate } = params;

  const applyFilters = (q: ReturnType<typeof supabase.from>) => {
    let query = q;
    if (startDate) query = query.gte("data", startDate);
    if (endDate) query = query.lte("data", endDate);
    return query;
  };

  const RECEITAS_COLS = "id, user_id, valor, descricao, data, created_at, updated_at, categoria_id, conta_id, metodo_pagamento, observacoes, categorias (nome, cor, icone)";
  const TRANSACOES_COLS = "id, user_id, tipo, valor, descricao, data, created_at, updated_at, categoria_id, conta_id, metodo_pagamento, observacoes, categorias (nome, cor, icone)";

  const buildReceitas = () => supabase.from("receitas");
  const buildTransacoes = () => supabase.from("transacoes");

  const [receitasResp, transacoesResp] = await Promise.all([
    fetchAllRows<any>(buildReceitas, applyFilters, RECEITAS_COLS, 15000),
    fetchAllRows<any>(buildTransacoes, (q) => applyFilters(q).eq("tipo", "receita"), TRANSACOES_COLS, 15000),
  ]);


  const mappedReceitas = (receitasResp ?? []).map((r) => ({
    ...r,
    tipo: "receita",
  }));

  // Filtragem estrita para evitar duplicidade com Eyemobile PDV x Divipay:
  // Se for proveniente de vendas PDV / Eyemobile, aceitar SOMENTE pagamentos em Dinheiro.
  const filteredTransacoes = (transacoesResp ?? []).filter((t) => {
    const isEyemobilePDV = t.descricao?.toLowerCase().includes("eyemobile") || 
                           t.observacoes?.toLowerCase().includes("eyemobile") ||
                           t.descricao?.toLowerCase().includes("pdv");
    if (isEyemobilePDV) {
      const metodo = (t.metodo_pagamento || "").toUpperCase();
      const isDinheiro = metodo === "DINHEIRO" || metodo === "CASH" || metodo === "ESPECIE" || metodo === "MONEY";
      return isDinheiro;
    }
    return true;
  });

  return [...mappedReceitas, ...filteredTransacoes].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  ) as Receita[];
}


// ─── Tag helpers ──────────────────────────────────────────────────
async function addTagsToReceita(receitaId: string, tagNames: string[]) {
  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id, nome")
    .in("nome", tagNames);
  if (tagsError) throw tagsError;

  const { error } = await supabase.from("receita_tags").insert(
    tags.map((tag) => ({ receita_id: receitaId, tag_id: tag.id }))
  );
  if (error) throw error;
}

async function updateReceitaTags(receitaId: string, tagNames: string[]) {
  await supabase.from("receita_tags").delete().eq("receita_id", receitaId);
  if (tagNames.length > 0) await addTagsToReceita(receitaId, tagNames);
}

// ─── Hook ─────────────────────────────────────────────────────────
export const useReceitas = (params: ReceitasQueryParams = {}) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { startDate = null, endDate = null } = params;

  const { data: receitas = [], isLoading: loading } = useQuery({
    queryKey: [...RECEITAS_QUERY_KEY, { startDate, endDate }],
    queryFn: () => fetchReceitas({ startDate, endDate }),
    // Keep results hot in cache for 10 min so re-clicking a date range is instant
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  const createReceita = useMutation({
    mutationFn: async ({
      receita,
      tagNames,
    }: {
      receita: Omit<Receita, "id" | "user_id" | "created_at" | "updated_at" | "categorias">;
      tagNames?: string[];
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("receitas")
        .insert([{ ...receita, user_id: userId }])
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      if (tagNames?.length) await addTagsToReceita(data.id, tagNames);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEITAS_QUERY_KEY });
      toast({ title: "Receita criada", description: "Receita criada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useReceitas", "Erro ao criar receita", { error: String(error) });
      toast({ title: "Erro ao criar receita", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  const updateReceita = useMutation({
    mutationFn: async ({
      id,
      updates,
      tagNames,
    }: {
      id: string;
      updates: Partial<Receita>;
      tagNames?: string[];
    }) => {
      const { data, error } = await supabase
        .from("receitas")
        .update(updates)
        .eq("id", id)
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      if (tagNames !== undefined) await updateReceitaTags(id, tagNames);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEITAS_QUERY_KEY });
      toast({ title: "Receita atualizada", description: "Receita atualizada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useReceitas", "Erro ao atualizar receita", { error: String(error) });
      toast({ title: "Erro ao atualizar receita", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  const deleteReceita = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("receitas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEITAS_QUERY_KEY });
      toast({ title: "Receita removida", description: "Receita removida com sucesso!" });
    },
    onError: (error) => {
      logger.error("useReceitas", "Erro ao remover receita", { error: String(error) });
      toast({ title: "Erro ao remover receita", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  // ── Filtros e utilitários
  const filterByPaymentMethod = (paymentMethod: PaymentMethod | null) => {
    if (paymentMethod === null) return receitas.filter((r) => !r.metodo_pagamento);
    return receitas.filter((r) => r.metodo_pagamento === paymentMethod);
  };

  const filterByAccount = (accountId: string) =>
    receitas.filter((r) => r.conta_id === accountId);

  const filterByTags = (tagNames: string[]) => {
    if (!tagNames.length) return receitas;
    return receitas.filter((r) =>
      tagNames.every((name) => r.tags?.some((t) => t.nome === name))
    );
  };

  const searchReceitas = (searchTerm: string) => {
    if (!searchTerm.trim()) return receitas;
    const term = searchTerm.toLowerCase();
    return receitas.filter(
      (r) =>
        r.descricao.toLowerCase().includes(term) ||
        r.categorias?.nome.toLowerCase().includes(term) ||
        (r.observacoes && r.observacoes.toLowerCase().includes(term))
    );
  };

  const getReceitaTags = async (receitaId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from("receita_tags")
        .select("tags (nome)")
        .eq("receita_id", receitaId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.map((item: any) => item.tags?.nome).filter(Boolean);
    } catch (error) {
      logger.error("useReceitas", "Erro ao buscar tags da receita", { error: String(error) });
      return [];
    }
  };

  return {
    receitas,
    loading,
    createReceita: (
      receita: Omit<Receita, "id" | "user_id" | "created_at" | "updated_at" | "categorias">,
      tagNames?: string[]
    ) => createReceita.mutateAsync({ receita, tagNames }),
    updateReceita: (id: string, updates: Partial<Receita>, tagNames?: string[]) =>
      updateReceita.mutateAsync({ id, updates, tagNames }),
    deleteReceita: (id: string) => deleteReceita.mutateAsync(id),
    refetch: () => qc.invalidateQueries({ queryKey: RECEITAS_QUERY_KEY }),
    filterByPaymentMethod,
    filterByAccount,
    filterByTags,
    searchReceitas,
    getReceitaTags,
  };
};