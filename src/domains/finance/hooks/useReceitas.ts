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

// ─── Fetcher puro ─────────────────────────────────────────────────
async function fetchReceitas(params: ReceitasQueryParams = {}): Promise<Receita[]> {
  const { startDate, endDate } = params;

  let receitasQuery = supabase
    .from("receitas")
    .select("*, categorias!categoria_id (nome, cor, icone), receita_tags (tags (id, nome, cor))");

  if (startDate) receitasQuery = receitasQuery.gte("data", startDate);
  if (endDate) receitasQuery = receitasQuery.lte("data", endDate);

  let transacoesQuery = supabase
    .from("transacoes")
    .select("*, categorias!categoria_id (nome, cor, icone)")
    .eq("tipo", "receita");

  if (startDate) transacoesQuery = transacoesQuery.gte("data", startDate);
  if (endDate) transacoesQuery = transacoesQuery.lte("data", endDate);

  const [receitasResp, transacoesResp] = await Promise.all([receitasQuery, transacoesQuery]);

  if (receitasResp.error) throw receitasResp.error;
  if (transacoesResp.error) throw transacoesResp.error;

  const mappedReceitas = (receitasResp.data ?? []).map((r) => ({
    ...r,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tags: (r as any).receita_tags?.map((rt: any) => rt.tags).filter(Boolean) ?? [],
  }));

  return [...mappedReceitas, ...(transacoesResp.data ?? [])].sort(
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
    staleTime: 1000 * 60 * 2,
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