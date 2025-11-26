import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";

export interface DebtReminderInfo {
  id: string;
  reminder_hours: number;
  trigger_at: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
}

export interface Divida {
  id: string;
  user_id: string;
  categoria_id?: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  valor_restante: number;
  data_vencimento: string;
  parcelas: number;
  parcelas_pagas: number;
  status: 'pendente' | 'vencida' | 'quitada';
  credor: string;
  created_at: string;
  updated_at: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
  debt_reminders?: DebtReminderInfo[];
}

export const useDividas = () => {
  const [dividas, setDividas] = useState<Divida[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDividas = async () => {
    try {
      // Try to fetch with debt_reminders join first
      const { data, error } = await supabase
        .from('dividas')
        .select(`
          *,
          categorias (nome, cor, icone),
          debt_reminders (id, reminder_hours, trigger_at, status, sent_at)
        `)
        .order('data_vencimento', { ascending: true });

      // If the debt_reminders table doesn't exist (PGRST200, PGRST205 error), fallback to query without it
      if (error && (error.code === 'PGRST200' || error.code === 'PGRST205')) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('dividas')
          .select(`
            *,
            categorias (nome, cor, icone)
          `)
          .order('data_vencimento', { ascending: true });

        if (fallbackError) throw fallbackError;
        setDividas((fallbackData || []) as Divida[]);
        return;
      }

      if (error) throw error;
      setDividas((data || []) as Divida[]);
    } catch (error) {
      toast({
        title: "Erro ao carregar dívidas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createDivida = async (divida: Omit<Divida, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'categorias'>) => {
    try {
      const { data, error } = await supabase
        .from('dividas')
        .insert([{
          ...divida,
          user_id: (await supabase.auth.getUser()).data.user?.id
        }])
        .select(`
          *,
          categorias (nome, cor, icone)
        `)
        .single();

      if (error) throw error;
      setDividas(prev => [data as Divida, ...prev]);
      
      toast({
        title: "Dívida criada",
        description: "Dívida criada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao criar dívida",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const updateDivida = async (id: string, updates: Partial<Divida>) => {
    try {
      const { data, error } = await supabase
        .from('dividas')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          categorias (nome, cor, icone)
        `)
        .single();

      if (error) throw error;
      setDividas(prev => prev.map(divida => divida.id === id ? data as Divida : divida));
      
      toast({
        title: "Dívida atualizada",
        description: "Dívida atualizada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao atualizar dívida",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteDivida = async (id: string) => {
    try {
      const { error } = await supabase
        .from('dividas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setDividas(prev => prev.filter(divida => divida.id !== id));
      
      toast({
        title: "Dívida removida",
        description: "Dívida removida com sucesso!",
      });
      
      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover dívida",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchDividas();
  }, []);

  return {
    dividas,
    loading,
    createDivida,
    updateDivida,
    deleteDivida,
    refetch: fetchDividas
  };
};