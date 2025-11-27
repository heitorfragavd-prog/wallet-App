import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { Despesa as DespesaType, PaymentMethod } from "../types";

export interface Despesa extends Omit<DespesaType, 'tags' | 'anexos'> {
  updated_at?: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
}

export const useDespesas = () => {
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDespesas = async () => {
    try {
      // Buscar dados da tabela despesas
      const { data: despesasData, error: despesasError } = await supabase
        .from('despesas')
        .select(`
          *,
          categorias (nome, cor, icone)
        `);

      if (despesasError) throw despesasError;

      // Buscar dados da tabela transacoes com tipo despesa
      const { data: transacoesData, error: transacoesError } = await supabase
        .from('transacoes')
        .select(`
          *,
          categorias (nome, cor, icone)
        `)
        .eq('tipo', 'despesa');

      if (transacoesError) throw transacoesError;

      // Combinar os dados
      const allDespesas = [
        ...(despesasData || []),
        ...(transacoesData || [])
      ];

      // Ordenar por data
      const sortedDespesas = allDespesas.sort((a, b) => 
        new Date(b.data).getTime() - new Date(a.data).getTime()
      );

      setDespesas(sortedDespesas);
    } catch (error) {
      toast({
        title: "Erro ao carregar despesas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createDespesa = async (
    despesa: Omit<Despesa, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'categorias'>,
    tagNames?: string[]
  ) => {
    try {
      const { data, error } = await supabase
        .from('despesas')
        .insert([{
          ...despesa,
          user_id: (await supabase.auth.getUser()).data.user?.id
        }])
        .select(`
          *,
          categorias (nome, cor, icone)
        `)
        .single();

      if (error) throw error;

      // Add tag relationships if provided
      if (tagNames && tagNames.length > 0) {
        await addTagsToDespesa(data.id, tagNames);
      }

      setDespesas(prev => [data, ...prev]);
      
      toast({
        title: "Despesa criada",
        description: "Despesa criada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao criar despesa",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const updateDespesa = async (
    id: string,
    updates: Partial<Despesa>,
    tagNames?: string[]
  ) => {
    try {
      const { data, error } = await supabase
        .from('despesas')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          categorias (nome, cor, icone)
        `)
        .single();

      if (error) throw error;

      // Update tag relationships if provided
      if (tagNames !== undefined) {
        await updateDespesaTags(id, tagNames);
      }

      setDespesas(prev => prev.map(despesa => despesa.id === id ? data : despesa));
      
      toast({
        title: "Despesa atualizada",
        description: "Despesa atualizada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao atualizar despesa",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteDespesa = async (id: string) => {
    try {
      const { error } = await supabase
        .from('despesas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setDespesas(prev => prev.filter(despesa => despesa.id !== id));
      
      toast({
        title: "Despesa removida",
        description: "Despesa removida com sucesso!",
      });
      
      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover despesa",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  const filterByPaymentMethod = (paymentMethod: PaymentMethod | null) => {
    if (paymentMethod === null) {
      return despesas.filter(d => !d.metodo_pagamento);
    }
    return despesas.filter(d => d.metodo_pagamento === paymentMethod);
  };

  const filterByAccount = (accountId: string) => {
    return despesas.filter(d => d.conta_id === accountId);
  };

  const addTagsToDespesa = async (despesaId: string, tagNames: string[]) => {
    try {
      // Get tag IDs from tag names
      const { data: tags, error: tagsError } = await supabase
        .from('tags')
        .select('id, nome')
        .in('nome', tagNames);

      if (tagsError) throw tagsError;

      // Create tag relationships
      const tagRelations = tags.map(tag => ({
        despesa_id: despesaId,
        tag_id: tag.id
      }));

      const { error: relError } = await supabase
        .from('despesa_tags')
        .insert(tagRelations);

      if (relError) throw relError;
    } catch (error) {
      console.error('Error adding tags to despesa:', error);
    }
  };

  const updateDespesaTags = async (despesaId: string, tagNames: string[]) => {
    try {
      // Remove existing tag relationships
      await supabase
        .from('despesa_tags')
        .delete()
        .eq('despesa_id', despesaId);

      // Add new tag relationships
      if (tagNames.length > 0) {
        await addTagsToDespesa(despesaId, tagNames);
      }
    } catch (error) {
      console.error('Error updating despesa tags:', error);
    }
  };

  const getDespesaTags = async (despesaId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('despesa_tags')
        .select(`
          tags (nome)
        `)
        .eq('despesa_id', despesaId);

      if (error) throw error;
      return data.map((item: any) => item.tags.nome);
    } catch (error) {
      console.error('Error fetching despesa tags:', error);
      return [];
    }
  };

  const filterByTags = (tagNames: string[]) => {
    if (tagNames.length === 0) {
      return despesas;
    }
    // This would require fetching tag relationships - implement when needed
    return despesas;
  };

  const searchDespesas = (searchTerm: string) => {
    if (!searchTerm.trim()) {
      return despesas;
    }

    const term = searchTerm.toLowerCase();
    return despesas.filter(d => 
      d.descricao.toLowerCase().includes(term) ||
      d.categorias?.nome.toLowerCase().includes(term) ||
      (d.observacoes && d.observacoes.toLowerCase().includes(term))
    );
  };

  useEffect(() => {
    fetchDespesas();
  }, []);

  return {
    despesas,
    loading,
    createDespesa,
    updateDespesa,
    deleteDespesa,
    refetch: fetchDespesas,
    filterByPaymentMethod,
    filterByAccount,
    filterByTags,
    searchDespesas,
    getDespesaTags,
  };
};