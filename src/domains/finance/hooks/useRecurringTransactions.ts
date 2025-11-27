import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { TransacaoRecorrente } from "../types";

export const useRecurringTransactions = () => {
  const [recorrentes, setRecorrentes] = useState<TransacaoRecorrente[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchRecorrentes = async () => {
    try {
      const { data, error } = await supabase
        .from('transacoes_recorrentes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecorrentes(data || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar transações recorrentes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createRecorrente = async (
    recorrente: Omit<TransacaoRecorrente, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'ultima_execucao'>
  ) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('transacoes_recorrentes')
        .insert([{
          ...recorrente,
          user_id: userData.user?.id
        }])
        .select()
        .single();

      if (error) throw error;
      setRecorrentes(prev => [data, ...prev]);
      
      toast({
        title: "Transação recorrente criada",
        description: "Transação recorrente criada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao criar transação recorrente",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const updateRecorrente = async (
    id: string,
    updates: Partial<TransacaoRecorrente>
  ) => {
    try {
      const { data, error } = await supabase
        .from('transacoes_recorrentes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setRecorrentes(prev => prev.map(rec => rec.id === id ? data : rec));
      
      toast({
        title: "Transação recorrente atualizada",
        description: "Transação recorrente atualizada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao atualizar transação recorrente",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteRecorrente = async (id: string) => {
    try {
      const { error } = await supabase
        .from('transacoes_recorrentes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRecorrentes(prev => prev.filter(rec => rec.id !== id));
      
      toast({
        title: "Transação recorrente removida",
        description: "Transação recorrente removida com sucesso!",
      });
      
      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover transação recorrente",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    return updateRecorrente(id, { ativo });
  };

  const getRecorrentesByTipo = (tipo: 'receita' | 'despesa') => {
    return recorrentes.filter(rec => rec.tipo_transacao === tipo);
  };

  const getAtivos = () => {
    return recorrentes.filter(rec => rec.ativo);
  };

  useEffect(() => {
    fetchRecorrentes();
  }, []);

  return {
    recorrentes,
    loading,
    createRecorrente,
    updateRecorrente,
    deleteRecorrente,
    toggleAtivo,
    getRecorrentesByTipo,
    getAtivos,
    refetch: fetchRecorrentes,
  };
};
