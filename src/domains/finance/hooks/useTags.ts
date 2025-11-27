import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { Tag } from "../types";

export const useTags = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('nome');

      if (error) throw error;
      setTags(data || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar tags",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createTag = async (tag: Omit<Tag, 'id' | 'user_id' | 'created_at'>) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('tags')
        .insert([{
          ...tag,
          user_id: userData.user?.id
        }])
        .select()
        .single();

      if (error) throw error;
      setTags(prev => [...prev, data]);
      
      toast({
        title: "Tag criada",
        description: "Tag criada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao criar tag",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const getTagSuggestions = (prefix: string): Tag[] => {
    if (!prefix.trim()) {
      return [];
    }
    
    const lowerPrefix = prefix.toLowerCase();
    return tags.filter(tag => 
      tag.nome.toLowerCase().startsWith(lowerPrefix)
    );
  };

  const updateTag = async (id: string, updates: Partial<Tag>) => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setTags(prev => prev.map(tag => tag.id === id ? data : tag));
      
      toast({
        title: "Tag atualizada",
        description: "Tag atualizada com sucesso!",
      });
      
      return { data, error: null };
    } catch (error) {
      toast({
        title: "Erro ao atualizar tag",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const deleteTag = async (id: string) => {
    try {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTags(prev => prev.filter(tag => tag.id !== id));
      
      toast({
        title: "Tag removida",
        description: "Tag removida com sucesso!",
      });
      
      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover tag",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  return {
    tags,
    loading,
    createTag,
    updateTag,
    deleteTag,
    getTagSuggestions,
    refetch: fetchTags
  };
};
