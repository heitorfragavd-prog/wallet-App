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
  tipo: 'receita' | 'despesa';
  descricao: string;
  valor: number;
  data: string;
  parcela_atual?: number;
  total_parcelas?: number;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
}

export interface TransacoesQueryParams {
  startDate?: string | null;
  endDate?: string | null;
}

// O PostgREST devolve no máximo 1000 linhas por requisição (max-rows do
// servidor). Sem paginação, meses cheios de vendas/despesas vinham cortados.
const POSTGREST_PAGE_SIZE = 1000;
const MAX_ROWS = 100000;

async function fetchAllPages(buildQuery: () => any): Promise<any[]> {
  const all: any[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += POSTGREST_PAGE_SIZE) {
    const { data, error } = await buildQuery().range(offset, offset + POSTGREST_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < POSTGREST_PAGE_SIZE) break;
  }
  return all;
}

export const useTransacoes = (params: TransacoesQueryParams = {}) => {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const { startDate = null, endDate = null } = params;

  const fetchTransacoes = useCallback(async () => {
    setLoading(true);
    try {
      const CATEGORIAS_EMBED = `categorias!categoria_id (nome, cor, icone)`;

      const applyCommon = (query: any) => {
        let q = query;
        // Filtrar por Workspace ativo se existir
        if (activeWorkspace) q = q.eq('workspace_id', activeWorkspace.id);
        // Filtro de período no servidor: evita baixar 60 mil linhas
        // para mostrar um único mês (Dashboard passa o dateRange).
        if (startDate) q = q.gte('data', startDate);
        if (endDate) q = q.lte('data', endDate);
        return q.order('data', { ascending: false });
      };

      const [transacoesData, receitasData, despesasData] = await Promise.all([
        fetchAllPages(() => applyCommon(supabase.from('transacoes').select(`*, ${CATEGORIAS_EMBED}`))),
        fetchAllPages(() => applyCommon(supabase.from('receitas').select(`*, ${CATEGORIAS_EMBED}`))),
        fetchAllPages(() => applyCommon(supabase.from('despesas').select(`*, ${CATEGORIAS_EMBED}`))),
      ]);

      // Combinar todos os dados
      const allTransacoes = [
        ...(transacoesData || []).map(t => ({ ...t, tipo: t.tipo })),
        ...(receitasData || []).map(r => ({ ...r, tipo: 'receita' as const })),
        ...(despesasData || []).map(d => ({ ...d, tipo: 'despesa' as const }))
      ];

      // Ordenar por data de criação (último cadastro primeiro)
      const sortedTransacoes = allTransacoes.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setTransacoes(sortedTransacoes as Transacao[]);
    } catch (error) {
      toast({
        title: "Erro ao carregar transações",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, toast, startDate, endDate]);

  const createTransacao = async (
    transacao: Omit<Transacao, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'categorias'> & { total_parcelas?: number }
  ) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      // Se tiver mais de 1 parcela, utilizar o motor de parcelamento do FinanceService
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

      // Lançamento de parcela única
      const { data, error } = await supabase
        .from('transacoes')
        .insert([{
          ...transacao,
          user_id: user.id,
          workspace_id: activeWorkspace?.id || null,
          parcela_atual: 1,
          total_parcelas: 1,
        }])
        .select(`
          *,
          categorias!categoria_id (nome, cor, icone)
        `)
        .single();

      if (error) throw error;
      setTransacoes(prev => [data as Transacao, ...prev]);
      
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
        .from('transacoes')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          categorias!categoria_id (nome, cor, icone)
        `)
        .single();

      if (error) throw error;
      setTransacoes(prev => prev.map(transacao => transacao.id === id ? data as Transacao : transacao));
      
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
        .from('transacoes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTransacoes(prev => prev.filter(transacao => transacao.id !== id));
      
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

  // Filtros para compatibilidade
  const receitas = transacoes.filter(t => t.tipo === 'receita');
  const despesas = transacoes.filter(t => t.tipo === 'despesa');

  return {
    transacoes,
    receitas,
    despesas,
    loading,
    createTransacao,
    updateTransacao,
    deleteTransacao,
    refetch: fetchTransacoes
  };
};