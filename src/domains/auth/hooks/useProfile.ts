import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { logger } from "@/core/logging/LoggerService";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type ProfileUpdate = TablesUpdate<"profiles">;

export const useProfile = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Carregar dados do perfil
  const fetchProfile = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      logger.info('useProfile', 'Buscando perfil do usuário');
      
      const { data, error: supabaseError } = await supabase
        .from("profiles")
        .select("id, user_id, name, email, telefone, endereco, avatar_url, organization_name, role, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (supabaseError) {
        logger.error('useProfile', 'Erro ao carregar perfil', { error: supabaseError.message });
        setError(new Error(supabaseError.message));
        toast({
          title: "Erro",
          description: `Erro ao carregar dados do perfil: ${supabaseError.message}`,
          variant: "destructive",
        });
        return;
      }

      if (!data) {
        logger.warn('useProfile', 'Perfil não encontrado, criando automaticamente');
        toast({
          title: "Aviso",
          description: "Perfil não encontrado. Criando perfil...",
          variant: "default",
        });
        // Tentar criar perfil automaticamente
        await createProfile({
          user_id: user.id,
          name: user.email?.split('@')[0] || 'Usuário',
          email: user.email || '',
          role: 'user',
          organization_name: null,
          telefone: null,
          endereco: null,
          avatar_url: null,
        });
        return;
      }

      logger.info('useProfile', 'Perfil carregado com sucesso');
      setProfile(data);
    } catch (err) {
      logger.error('useProfile', 'Erro inesperado ao carregar perfil', { error: err instanceof Error ? err.message : String(err) });
      const errorObj = err instanceof Error ? err : new Error("Erro inesperado");
      setError(errorObj);
      toast({
        title: "Erro",
        description: `Erro inesperado ao carregar perfil: ${errorObj.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Atualizar perfil
  const updateProfile = async (updates: Partial<ProfileUpdate>) => {
    if (!user || !profile) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado.",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        logger.error('useProfile', 'Erro ao atualizar perfil', { error: error.message });
        toast({
          title: "Erro",
          description: "Erro ao atualizar perfil.",
          variant: "destructive",
        });
        return false;
      }

      setProfile(data);
      toast({
        title: "Sucesso",
        description: "Perfil atualizado com sucesso!",
      });
      return true;
    } catch (error) {
      logger.error('useProfile', 'Erro inesperado ao atualizar perfil', { error: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Erro",
        description: "Erro inesperado ao atualizar perfil.",
        variant: "destructive",
      });
      return false;
    }
  };

  // Criar perfil (caso não exista)
  const createProfile = async (profileData: Omit<Profile, "id" | "created_at" | "updated_at">) => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado.",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .insert({
          ...profileData,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) {
        logger.error('useProfile', 'Erro ao criar perfil', { error: error.message });
        toast({
          title: "Erro",
          description: "Erro ao criar perfil.",
          variant: "destructive",
        });
        return false;
      }

      logger.info('useProfile', 'Perfil criado com sucesso');
      setProfile(data);
      toast({
        title: "Sucesso",
        description: "Perfil criado com sucesso!",
      });
      return true;
    } catch (error) {
      logger.error('useProfile', 'Erro inesperado ao criar perfil', { error: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Erro",
        description: "Erro inesperado ao criar perfil.",
        variant: "destructive",
      });
      return false;
    }
  };

  // Upload de avatar
  const uploadAvatar = async (file: File) => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado.",
        variant: "destructive",
      });
      return null;
    }

    try {
      // Gerar nome único para o arquivo
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload do arquivo
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: true
        });

      if (uploadError) {
        logger.error('useProfile', 'Erro no upload do avatar', { error: uploadError.message });
        toast({
          title: "Erro",
          description: "Erro ao fazer upload da imagem.",
          variant: "destructive",
        });
        return null;
      }

      // Obter URL pública da imagem
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Atualizar perfil com nova URL do avatar
      const success = await updateProfile({ avatar_url: publicUrl });
      
      if (success) {
        toast({
          title: "Avatar atualizado",
          description: "Sua foto de perfil foi atualizada com sucesso!",
        });
        return publicUrl;
      }

      return null;
    } catch (error) {
      logger.error('useProfile', 'Erro inesperado no upload do avatar', { error: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Erro",
        description: "Erro inesperado no upload do avatar.",
        variant: "destructive",
      });
      return null;
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  return {
    profile,
    loading,
    error,
    updateProfile,
    createProfile,
    uploadAvatar,
    refetch: fetchProfile,
  };
};