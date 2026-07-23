import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { addMonths } from "date-fns";
import { PagamentoDivida } from "../types";
import { calculateTriggerAt } from "./useDebtReminders";

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
  const queryClient = useQueryClient();

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
      setPagamentos((data as PagamentoDividaComDivida[]) || []);
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
      setPagamentos((data as PagamentoDividaComDivida[]) || []);
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
        .select('*, categorias!categoria_id (id, nome)')
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
      //    IMPORTANTE: o status "quitada" só acontece quando TODAS as parcelas forem
      //    pagas (parcelas_pagas >= parcelas). Pagar uma parcela apenas registra o
      //    pagamento daquela parcela e avança a dívida para o mês seguinte.
      const novoValorPago = divida.valor_pago + pagamento.valor;
      const novasParcelasPagas = Math.min(divida.parcelas_pagas + 1, divida.parcelas);
      const todasParcelasPagas = novasParcelasPagas >= divida.parcelas;

      // valor_restante = saldo real (total - pago). Só zera quando tudo quitado.
      const novoValorRestante = todasParcelasPagas ? 0 : Math.max(0, divida.valor_total - novoValorPago);

      const novoStatus: 'pendente' | 'vencida' | 'quitada' = todasParcelasPagas
        ? 'quitada'
        : new Date(divida.data_vencimento) < new Date() ? 'vencida' : 'pendente';

      // Se ainda faltam parcelas, avança a data de vencimento em +1 mês (próxima parcela)
      const novaDataVencimento = todasParcelasPagas
        ? divida.data_vencimento
        : addMonths(new Date(divida.data_vencimento.split('T')[0] + 'T00:00:00'), 1)
            .toISOString()
            .split('T')[0];

      await supabase
        .from('dividas')
        .update({
          valor_pago: novoValorPago,
          valor_restante: Math.max(0, novoValorRestante),
          parcelas_pagas: novasParcelasPagas,
          data_vencimento: novaDataVencimento,
          status: novoStatus,
        })
        .eq('id', dividaId);

      // 2b. Reagendar lembrete para a nova data de vencimento (se houver um ativo)
      if (!todasParcelasPagas) {
        try {
          const { data: reminderExistente } = await supabase
            .from('debt_reminders')
            .select('id, reminder_hours')
            .eq('divida_id', dividaId)
            .maybeSingle();

          if (reminderExistente?.id) {
            const triggerAt = calculateTriggerAt(novaDataVencimento, reminderExistente.reminder_hours);
            await supabase
              .from('debt_reminders')
              .update({
                trigger_at: triggerAt,
                status: 'pending',
                sent_at: null,
                error_message: null,
              })
              .eq('id', reminderExistente.id);
          }
        } catch {
          // Falha silenciosa: a tabela debt_reminders pode não existir ainda
        }
      }

      // 3. O banco de dados (trigger sync_pagamento_divida_to_despesa) sincroniza automaticamente 
      // a despesa do pagamento e a taxa para evitar duplicidade.

      // 4. Invalidar cache de despesas para a nova despesa aparecer na lista
      queryClient.invalidateQueries({ queryKey: ["despesas"] });

      setPagamentos(prev => [data as PagamentoDividaComDivida, ...prev]);
      
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
