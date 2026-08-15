import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { financeService } from "@/domains/finance/services/FinanceService";

export interface Transacao {
  id: string;
  user_id: string;
  workspace_id?: string;
  categoria_id?: string;
  tipo: "receita" | "despesa";
  descricao: string;
  valor: number;
  data: string;
  parcela_atual?: number;
  total_parcelas?: number;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  metodo_pagamento?: string;
  conta_id?: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
}

export interface TransacoesQueryParams {
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
}

const fetchTransacoesData = async (params: TransacoesQueryParams, workspaceId?: string) => {
  const { startDate = null, endDate = null, limit = 2000 } = params;
  const CATEGORIAS_EMBED = `categorias!categoria_id (nome, cor, icone)`;

  const applyCommon = (query: any) => {
    let q = query;
    if (workspaceId) {
      q = q.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
    }
    if (startDate) q = q.gte("data", startDate);
    if (endDate) q = q.lte("data", endDate);
    return q.order("data", { ascending: false }).limit(limit);
  };

  const [transacoesResp, receitasResp, despesasResp] = await Promise.all([
    applyCommon(supabase.from("transacoes").select(`*, ${CATEGORIAS_EMBED}`)),
    applyCommon(supabase.from("receitas").select(`*, ${CATEGORIAS_EMBED}`)),
    applyCommon(supabase.from("despesas").select(`*, ${CATEGORIAS_EMBED}`)),
  ]);

  const mapTransacoes = (transacoesResp.data || []).map((t: any) => ({ ...t, tipo: t.tipo }));
  const mapReceitas = (receitasResp.data || []).map((r: any) => ({ ...r, tipo: "receita" as const }));
  const mapDespesas = (despesasResp.data || []).map((d: any) => ({ ...d, tipo: "despesa" as const }));

  const allTransacoes = [...mapTransacoes, ...mapReceitas, ...mapDespesas];

  return allTransacoes.sort((a, b) =>
    new Date(b.data || b.created_at).getTime() - new Date(a.data || a.created_at).getTime()
  ) as Transacao[];
};

export const useTransacoes = (params: TransacoesQueryParams = {}) => {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const { startDate = null, endDate = null, limit = 2000 } = params;

  const queryKey = ["transacoes", activeWorkspace?.id, startDate, endDate, limit];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchTransacoesData(params, activeWorkspace?.id),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const createTransacao = async (
    transacao: Omit<Transacao, "id" | "user_id" | "created_at" | "updated_at" | "categorias"> & { total_parcelas?: number }
  ) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      if (transacao.total_parcelas && transacao.total_parcelas > 1) {
        await financeService.createTransaction({
          userId: user.id,
          workspaceId: activeWorkspace?.id,
          tipo: transacao.tipo,
          descricao: transacao.descricao,
          valorTotal: transacao.valor,
          dataInicial: transacao.data,
          categoriaId: transacao.categoria_id,
          totalParcelas: transacao.total_parcelas,
        });
        await qc.invalidateQueries({ queryKey: ["transacoes"] });
        toast({ title: "Transações parceladas criadas", description: `${transacao.total_parcelas} parcelas geradas com sucesso!` });
        return { data: true, error: null };
      }

      const { data, error } = await supabase
        .from("transacoes")
        .insert([{
          ...transacao,
          user_id: user.id,
          workspace_id: activeWorkspace?.id || null,
          parcela_atual: 1,
          total_parcelas: 1,
        }])
        .select(`*, categorias!categoria_id (nome, cor, icone)`)
        .single();

      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["transacoes"] });
      toast({ title: "Transação criada", description: "Transação criada com sucesso!" });
      return { data, error: null };
    } catch (error) {
      toast({ title: "Erro ao criar transação", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
      return { data: null, error };
    }
  };

  const updateTransacao = async (id: string, updates: Partial<Transacao>) => {
    try {
      const { data, error } = await supabase.from("transacoes").update(updates).eq("id", id).select(`*, categorias!categoria_id (nome, cor, icone)`).single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["transacoes"] });
      toast({ title: "Transação atualizada", description: "Transação atualizada com sucesso!" });
      return { data, error: null };
    } catch (error) {
      toast({ title: "Erro ao atualizar transação", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
      return { data: null, error };
    }
  };

  const deleteTransacao = async (id: string) => {
    try {
      const { error } = await supabase.from("transacoes").delete().eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["transacoes"] });
      toast({ title: "Transação removida", description: "Transação removida com sucesso!" });
      return { error: null };
    } catch (error) {
      toast({ title: "Erro ao remover transação", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
      return { error };
    }
  };

  const transacoes = query.data ?? [];
  const receitas = transacoes.filter((t) => t.tipo === "receita");
  const despesas = transacoes.filter((t) => t.tipo === "despesa");

  return {
    transacoes,
    receitas,
    despesas,
    loading: query.isLoading,
    createTransacao,
    updateTransacao,
    deleteTransacao,
    refetch: () => qc.invalidateQueries({ queryKey: ["transacoes"] }),
  };
};