import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { PagamentoDivida } from "../types";

export interface PagamentoDividaComDivida extends PagamentoDivida {
  dividas?: {
    descricao: string;
    credor: string;
  };
}

export const usePagamentosDivida = (dividaId?: string) => {
  const [pagamentos, setPagamentos] = useState<PagamentoDividaComDivida[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPagamentos = async () => {
    if (!dividaId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('pagamentos_dividas')
        .select(`
          *,
          dividas (descricao, credor)
        `)
        .eq('divida_id', dividaId)
        .order('data_pagamento', { ascending: false });

      if (error) throw error;
      setPagamentos(data || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar pagamentos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Buscar todos os pagamentos do usuário (para histórico geral)
  const fetchAllPagamentos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pagamentos_dividas')
        .select(`
          *,
          dividas (descricao, credor)
        `)
        .order('data_pagamento', { ascending: false });

      if (error) throw error;
      setPagamentos(data || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar pagamentos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createPagamento = async (
    dividaId: string,
    pagamento: Omit<PagamentoDivida, 'id' | 'user_id' | 'divida_id' | 'created_at'>,
    criarDespesa: boolean = true
  ) => {
    try {
      // Buscar a dívida para validar o saldo restante e obter informações
      const { data: divida, error: dividaError } = await supabase
        .from('dividas')
        .select('*, categorias (id, nome)')
        .eq('id', dividaId)
        .single();

      if (dividaError) throw dividaError;

      // Validar se o pagamento não excede o saldo restante
      if (pagamento.valor > divida.valor_restante) {
        toast({
          title: "Erro ao registrar pagamento",
          description: "O valor do pagamento não pode exceder o saldo restante da dívida",
          variant: "destructive",
        });
        return { data: null, error: new Error("Payment exceeds remaining balance") };
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      // 1. Criar o registro de pagamento da dívida
      const { data, error } = await supabase
        .from('pagamentos_dividas')
        .insert([{
          divida_id: dividaId,
          user_id: userId,
          ...pagamento,
        }])
        .select()
        .single();

      if (error) throw error;

      // 2. Atualizar a dívida (valor_pago, valor_restante, parcelas_pagas, status)
      const novoValorPago = divida.valor_pago + pagamento.valor;
      const novoValorRestante = divida.valor_total - novoValorPago;
      const novasParcelasPagas = divida.parcelas_pagas + 1;
      const novoStatus = novoValorRestante <= 0 ? 'quitada' : 
                         new Date(divida.data_vencimento) < new Date() ? 'vencida' : 'pendente';

      await supabase
        .from('dividas')
        .update({
          valor_pago: novoValorPago,
          valor_restante: Math.max(0, novoValorRestante),
          parcelas_pagas: Math.min(novasParcelasPagas, divida.parcelas),
          status: novoStatus,
        })
        .eq('id', dividaId);

      // 3. Criar despesa correspondente (se habilitado)
      if (criarDespesa) {
        const descricaoDespesa = `Pagamento dívida: ${divida.descricao} (${divida.credor})`;
        
        await supabase
          .from('despesas')
          .insert([{
            user_id: userId,
            descricao: descricaoDespesa,
            valor: pagamento.valor,
            data: pagamento.data_pagamento,
            categoria_id: divida.categoria_id,
            metodo_pagamento: pagamento.metodo_pagamento,
            conta_id: pagamento.conta_id,
            observacoes: pagamento.observacoes || `Pagamento parcial da dívida "${divida.descricao}"`,
          }]);
      }

      setPagamentos(prev => [data, ...prev]);
      
      toast({
        title: "Pagamento registrado",
        description: criarDespesa 
          ? "Pagamento registrado e despesa criada com sucesso!" 
          : "Pagamento registrado com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao registrar pagamento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deletePagamento = async (id: string) => {
    try {
      const { error } = await supabase
        .from('pagamentos_dividas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setPagamentos(prev => prev.filter(p => p.id !== id));
      
      toast({
        title: "Pagamento removido",
        description: "Pagamento removido com sucesso!",
      });
      
      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover pagamento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  useEffect(() => {
    if (dividaId) {
      fetchPagamentos();
    }
  }, [dividaId]);

  return {
    pagamentos,
    loading,
    createPagamento,
    deletePagamento,
    refetch: fetchPagamentos,
    fetchAllPagamentos,
  };
};
