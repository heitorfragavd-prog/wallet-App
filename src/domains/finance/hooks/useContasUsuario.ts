import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { ContaUsuario } from "../types";

export const useContasUsuario = () => {
  const [contas, setContas] = useState<ContaUsuario[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchContas = async () => {
    try {
      const { data, error } = await supabase
        .from('contas_usuario')
        .select('*')
        .order('nome');

      if (error) throw error;
      setContas(data || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar contas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createConta = async (conta: Omit<ContaUsuario, 'id' | 'user_id' | 'created_at'>) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('contas_usuario')
        .insert([{
          ...conta,
          user_id: userData.user?.id
        }])
        .select()
        .single();

      if (error) throw error;
      setContas(prev => [...prev, data]);
      
      toast({
        title: "Conta criada",
        description: "Conta criada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao criar conta",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const updateConta = async (id: string, updates: Partial<ContaUsuario>) => {
    try {
      const { data, error } = await supabase
        .from('contas_usuario')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setContas(prev => prev.map(conta => conta.id === id ? data : conta));
      
      toast({
        title: "Conta atualizada",
        description: "Conta atualizada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao atualizar conta",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteConta = async (id: string) => {
    try {
      const { error } = await supabase
        .from('contas_usuario')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setContas(prev => prev.filter(conta => conta.id !== id));
      
      toast({
        title: "Conta removida",
        description: "Conta removida com sucesso!",
      });
      
      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover conta",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchContas();
  }, []);

  return {
    contas,
    loading,
    createConta,
    updateConta,
    deleteConta,
    refetch: fetchContas
  };
};
