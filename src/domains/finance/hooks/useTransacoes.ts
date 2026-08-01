import { useState, useEffect, useCallback } from "react";
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

const POSTGREST_PAGE_SIZE = 1000;

export const useTransacoes = (params: TransacoesQueryParams = {}) => {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const { startDate = null, endDate = null, limit = 2000 } = params;

  const fetchTransacoes = useCallback(async () => {
    setLoading(true);
    try {
      const CATEGORIAS_EMBED = `categorias!categoria_id (nome, cor, icone)`;

      const applyCommon = (query: any) => {
        let q = query;
        if (activeWorkspace?.id) {
          q = q.or(`workspace_id.eq.${activeWorkspace.id},workspace_id.is.null`);
        }
        if (startDate) q = q.gte("data", startDate);
        if (endDate) q = q.lte("data", endDate);
        return q.order("data", { ascending: false }).limit(limit);
      };

      // Consulta rápida otimizada de 1 requisição por tabela
      const [transacoesResp, receitasResp, despesasResp] = await Promise.all([
        applyCommon(supabase.from("transacoes").select(`*, ${CATEGORIAS_EMBED}`)),
        applyCommon(supabase.from("receitas").select(`*, ${CATEGORIAS_EMBED}`)),
        applyCommon(supabase.from("despesas").select(`*, ${CATEGORIAS_EMBED}`)),
      ]);

      const mapTransacoes = (transacoesResp.data || []).map((t: any) => ({ ...t, tipo: t.tipo }));
      const mapReceitas = (receitasResp.data || []).map((r: any) => ({ ...r, tipo: "receita" as const }));
      const mapDespesas = (despesasResp.data || []).map((d: any) => ({ ...d, tipo: "despesa" as const }));

      const allTransacoes = [...mapTransacoes, ...mapReceitas, ...mapDespesas];

      // Ordenar por data de lançamento (mais recentes primeiro)
      const sortedTransacoes = allTransacoes.sort((a, b) =>
        new Date(b.data || b.created_at).getTime() - new Date(a.data || a.created_at).getTime()
      );

      setTransacoes(sortedTransacoes as Transacao[]);
    } catch (error) {
      console.error("useTransacoes: Erro ao carregar transações:", error);
      toast({
        title: "Erro ao carregar transações",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, toast, startDate, endDate, limit]);

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

        await fetchTransacoes();
        toast({
          title: "Transações parceladas criadas",
          description: `${transacao.total_parcelas} parcelas geradas com sucesso!`,
        });
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
      setTransacoes((prev) => [data as Transacao, ...prev]);

      toast({
        title: "Transação criada",
        description: "Transação criada com sucesso!",
      });

      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao criar transação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const updateTransacao = async (id: string, updates: Partial<Transacao>) => {
    try {
      const { data, error } = await supabase
        .from("transacoes")
        .update(updates)
        .eq("id", id)
        .select(`*, categorias!categoria_id (nome, cor, icone)`)
        .single();

      if (error) throw error;
      setTransacoes((prev) => prev.map((t) => (t.id === id ? (data as Transacao) : t)));

      toast({
        title: "Transação atualizada",
        description: "Transação atualizada com sucesso!",
      });

      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao atualizar transação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteTransacao = async (id: string) => {
    try {
      const { error } = await supabase
        .from("transacoes")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setTransacoes((prev) => prev.filter((t) => t.id !== id));

      toast({
        title: "Transação removida",
        description: "Transação removida com sucesso!",
      });

      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover transação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchTransacoes();
  }, [fetchTransacoes]);

  const receitas = transacoes.filter((t) => t.tipo === "receita");
  const despesas = transacoes.filter((t) => t.tipo === "despesa");

  return {
    transacoes,
    receitas,
    despesas,
    loading,
    createTransacao,
    updateTransacao,
    deleteTransacao,
    refetch: fetchTransacoes,
  };
};