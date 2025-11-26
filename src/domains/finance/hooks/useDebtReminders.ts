import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { DebtReminder } from "../types";

/**
 * Calculates the trigger timestamp based on due date and reminder hours
 * @param dueDate - The debt due date (YYYY-MM-DD format)
 * @param reminderHours - Hours before due date to trigger reminder
 * @returns ISO timestamp string for when the reminder should trigger
 */
export const calculateTriggerAt = (dueDate: string, reminderHours: number): string => {
  const dueDateObj = new Date(dueDate);
  // Set to start of day in local timezone, then convert to UTC
  dueDateObj.setHours(0, 0, 0, 0);
  const triggerTime = new Date(dueDateObj.getTime() - reminderHours * 60 * 60 * 1000);
  return triggerTime.toISOString();
};

export const useDebtReminders = () => {
  const [reminders, setReminders] = useState<DebtReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchReminders = async () => {
    try {
      const { data, error } = await supabase
        .from('debt_reminders')
        .select(`
          *,
          dividas (
            descricao,
            credor,
            valor_total,
            valor_restante,
            data_vencimento,
            parcelas,
            parcelas_pagas
          )
        `)
        .order('trigger_at', { ascending: true });

      // If table doesn't exist (42P01, PGRST116, PGRST205) or relationship error, just return empty array
      if (error && (error.code === '42P01' || error.code === 'PGRST116' || error.code === 'PGRST205')) {
        setReminders([]);
        return;
      }

      if (error) throw error;
      setReminders((data || []) as DebtReminder[]);
    } catch (error) {
      // Silently handle table not found errors - the migration may not have been applied yet
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === '42P01' || errorCode === 'PGRST116' || errorCode === 'PGRST205') {
        setReminders([]);
        return;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: "Erro ao carregar lembretes",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  const getReminderByDebtId = async (dividaId: string): Promise<DebtReminder | null> => {
    try {
      const { data, error } = await supabase
        .from('debt_reminders')
        .select(`
          *,
          dividas (
            descricao,
            credor,
            valor_total,
            valor_restante,
            data_vencimento,
            parcelas,
            parcelas_pagas
          )
        `)
        .eq('divida_id', dividaId)
        .maybeSingle();

      // If table doesn't exist, return null silently
      if (error && (error.code === '42P01' || error.code === 'PGRST116' || error.code === 'PGRST205')) {
        return null;
      }

      if (error) throw error;
      return data as DebtReminder | null;
    } catch (error) {
      // Silently handle table not found errors
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === '42P01' || errorCode === 'PGRST116' || errorCode === 'PGRST205') {
        return null;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: "Erro ao buscar lembrete",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  };

  const createReminder = async (
    dividaId: string,
    reminderHours: number,
    dueDate: string
  ) => {
    try {
      const triggerAt = calculateTriggerAt(dueDate, reminderHours);
      const userId = (await supabase.auth.getUser()).data.user?.id;

      const { data, error } = await supabase
        .from('debt_reminders')
        .insert([{
          divida_id: dividaId,
          user_id: userId,
          reminder_hours: reminderHours,
          trigger_at: triggerAt,
          status: 'pending'
        }])
        .select(`
          *,
          dividas (
            descricao,
            credor,
            valor_total,
            valor_restante,
            data_vencimento,
            parcelas,
            parcelas_pagas
          )
        `)
        .single();

      if (error) throw error;
      setReminders(prev => [data as DebtReminder, ...prev]);

      toast({
        title: "Lembrete criado",
        description: "Lembrete configurado com sucesso!",
      });

      return { data: data as DebtReminder, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: "Erro ao criar lembrete",
        description: errorMessage,
        variant: "destructive",
      });
      return { data: null, error };
    }
  };


  const updateReminder = async (
    id: string,
    reminderHours: number,
    dueDate: string
  ) => {
    try {
      const triggerAt = calculateTriggerAt(dueDate, reminderHours);

      // Reset status to pending when updating reminder hours (Requirement 4.3)
      const { data, error } = await supabase
        .from('debt_reminders')
        .update({
          reminder_hours: reminderHours,
          trigger_at: triggerAt,
          status: 'pending',
          sent_at: null,
          error_message: null
        })
        .eq('id', id)
        .select(`
          *,
          dividas (
            descricao,
            credor,
            valor_total,
            valor_restante,
            data_vencimento,
            parcelas,
            parcelas_pagas
          )
        `)
        .single();

      if (error) throw error;
      setReminders(prev => prev.map(r => r.id === id ? data as DebtReminder : r));

      toast({
        title: "Lembrete atualizado",
        description: "Lembrete atualizado com sucesso!",
      });

      return { data: data as DebtReminder, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: "Erro ao atualizar lembrete",
        description: errorMessage,
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      const { error } = await supabase
        .from('debt_reminders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setReminders(prev => prev.filter(r => r.id !== id));

      toast({
        title: "Lembrete removido",
        description: "Lembrete removido com sucesso!",
      });

      return { error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: "Erro ao remover lembrete",
        description: errorMessage,
        variant: "destructive",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  return {
    reminders,
    loading,
    createReminder,
    updateReminder,
    deleteReminder,
    getReminderByDebtId,
    refetch: fetchReminders
  };
};
