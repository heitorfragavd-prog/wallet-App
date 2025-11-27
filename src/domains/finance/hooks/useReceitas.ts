import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { Receita as ReceitaType, PaymentMethod } from "../types";

export interface Receita extends Omit<ReceitaType, 'tags' | 'anexos'> {
  updated_at?: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
}

export const useReceitas = () => {
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchReceitas = async () => {
    try {
      // Buscar dados da tabela receitas
      const { data: receitasData, error: receitasError } = await supabase
        .from('receitas')
        .select(`
          *,
          categorias (nome, cor, icone)
        `);

      if (receitasError) throw receitasError;

      // Buscar dados da tabela transacoes com tipo receita
      const { data: transacoesData, error: transacoesError } = await supabase
        .from('transacoes')
        .select(`
          *,
          categorias (nome, cor, icone)
        `)
        .eq('tipo', 'receita');

      if (transacoesError) throw transacoesError;

      // Combinar os dados
      const allReceitas = [
        ...(receitasData || []),
        ...(transacoesData || [])
      ];

      // Ordenar por data
      const sortedReceitas = allReceitas.sort((a, b) => 
        new Date(b.data).getTime() - new Date(a.data).getTime()
      );

      setReceitas(sortedReceitas);
    } catch (error) {
      toast({
        title: "Erro ao carregar receitas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createReceita = async (
    receita: Omit<Receita, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'categorias'>,
    tagNames?: string[]
  ) => {
    try {
      const { data, error } = await supabase
        .from('receitas')
        .insert([{
          ...receita,
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
        await addTagsToReceita(data.id, tagNames);
      }

      setReceitas(prev => [data, ...prev]);
      
      toast({
        title: "Receita criada",
        description: "Receita criada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao criar receita",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const updateReceita = async (
    id: string,
    updates: Partial<Receita>,
    tagNames?: string[]
  ) => {
    try {
      const { data, error } = await supabase
        .from('receitas')
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
        await updateReceitaTags(id, tagNames);
      }

      setReceitas(prev => prev.map(receita => receita.id === id ? data : receita));
      
      toast({
        title: "Receita atualizada",
        description: "Receita atualizada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao atualizar receita",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteReceita = async (id: string) => {
    try {
      const { error } = await supabase
        .from('receitas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setReceitas(prev => prev.filter(receita => receita.id !== id));
      
      toast({
        title: "Receita removida",
        description: "Receita removida com sucesso!",
      });
      
      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover receita",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  const filterByPaymentMethod = (paymentMethod: PaymentMethod | null) => {
    if (paymentMethod === null) {
      return receitas.filter(r => !r.metodo_pagamento);
    }
    return receitas.filter(r => r.metodo_pagamento === paymentMethod);
  };

  const filterByAccount = (accountId: string) => {
    return receitas.filter(r => r.conta_id === accountId);
  };

  const addTagsToReceita = async (receitaId: string, tagNames: string[]) => {
    try {
      // Get tag IDs from tag names
      const { data: tags, error: tagsError } = await supabase
        .from('tags')
        .select('id, nome')
        .in('nome', tagNames);

      if (tagsError) throw tagsError;

      // Create tag relationships
      const tagRelations = tags.map(tag => ({
        receita_id: receitaId,
        tag_id: tag.id
      }));

      const { error: relError } = await supabase
        .from('receita_tags')
        .insert(tagRelations);

      if (relError) throw relError;
    } catch (error) {
      console.error('Error adding tags to receita:', error);
    }
  };

  const updateReceitaTags = async (receitaId: string, tagNames: string[]) => {
    try {
      // Remove existing tag relationships
      await supabase
        .from('receita_tags')
        .delete()
        .eq('receita_id', receitaId);

      // Add new tag relationships
      if (tagNames.length > 0) {
        await addTagsToReceita(receitaId, tagNames);
      }
    } catch (error) {
      console.error('Error updating receita tags:', error);
    }
  };

  const getReceitaTags = async (receitaId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('receita_tags')
        .select(`
          tags (nome)
        `)
        .eq('receita_id', receitaId);

      if (error) throw error;
      return data.map((item: any) => item.tags.nome);
    } catch (error) {
      console.error('Error fetching receita tags:', error);
      return [];
    }
  };

  const filterByTags = (tagNames: string[]) => {
    if (tagNames.length === 0) {
      return receitas;
    }
    // This would require fetching tag relationships - implement when needed
    return receitas;
  };

  const searchReceitas = (searchTerm: string) => {
    if (!searchTerm.trim()) {
      return receitas;
    }

    const term = searchTerm.toLowerCase();
    return receitas.filter(r => 
      r.descricao.toLowerCase().includes(term) ||
      r.categorias?.nome.toLowerCase().includes(term) ||
      (r.observacoes && r.observacoes.toLowerCase().includes(term))
    );
  };

  useEffect(() => {
    fetchReceitas();
  }, []);

  return {
    receitas,
    loading,
    createReceita,
    updateReceita,
    deleteReceita,
    refetch: fetchReceitas,
    filterByPaymentMethod,
    filterByAccount,
    filterByTags,
    searchReceitas,
    getReceitaTags,
  };
};