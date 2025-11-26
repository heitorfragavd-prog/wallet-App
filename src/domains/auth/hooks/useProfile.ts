import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/domains/auth/hooks/useAuth";
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
      console.log("Buscando perfil para user_id:", user.id);
      
      const { data, error: supabaseError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      console.log("Resultado da busca:", { data, error: supabaseError });

      if (supabaseError) {
        console.error("Erro ao carregar perfil:", supabaseError);
        setError(new Error(supabaseError.message));
        toast({
          title: "Erro",
          description: `Erro ao carregar dados do perfil: ${supabaseError.message}`,
          variant: "destructive",
        });
        return;
      }

      if (!data) {
        console.warn("Perfil não encontrado para user_id:", user.id);
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

      console.log("Perfil carregado com sucesso:", data);
      setProfile(data);
    } catch (err) {
      console.error("Erro inesperado:", err);
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
        console.error("Erro ao atualizar perfil:", error);
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
      console.error("Erro inesperado:", error);
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
        console.error("Erro ao criar perfil:", error);
        toast({
          title: "Erro",
          description: "Erro ao criar perfil.",
          variant: "destructive",
        });
        return false;
      }

      setProfile(data);
      toast({
        title: "Sucesso",
        description: "Perfil criado com sucesso!",
      });
      return true;
    } catch (error) {
      console.error("Erro inesperado:", error);
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
        console.error("Erro no upload:", uploadError);
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
      console.error("Erro inesperado:", error);
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