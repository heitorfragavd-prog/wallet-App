import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { PagamentoDivida } from "../types";

export const usePagamentosDivida = (dividaId?: string) => {
  const [pagamentos, setPagamentos] = useState<PagamentoDivida[]>([]);
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
        .select('*')
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

  const createPagamento = async (
    dividaId: string,
    pagamento: Omit<PagamentoDivida, 'id' | 'user_id' | 'divida_id' | 'created_at'>
  ) => {
    try {
      // Buscar a dívida para validar o saldo restante
      const { data: divida, error: dividaError } = await supabase
        .from('dividas')
        .select('valor_restante')
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

      const { data, error } = await supabase
        .from('pagamentos_dividas')
        .insert([{
          divida_id: dividaId,
          user_id: userData.user?.id,
          ...pagamento,
        }])
        .select()
        .single();

      if (error) throw error;

      setPagamentos(prev => [data, ...prev]);
      
      toast({
        title: "Pagamento registrado",
        description: "Pagamento registrado com sucesso!",
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
    fetchPagamentos();
  }, [dividaId]);

  return {
    pagamentos,
    loading,
    createPagamento,
    deletePagamento,
    refetch: fetchPagamentos
  };
};
