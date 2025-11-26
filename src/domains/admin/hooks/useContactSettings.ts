import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";

interface ContactSettings {
  email: string | null;
  phone: string | null;
  loading: boolean;
  saving: boolean;
}

export const useContactSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ContactSettings>({
    email: null,
    phone: null,
    loading: true,
    saving: false,
  });

  const fetchSettings = async () => {
    setSettings(prev => ({ ...prev, loading: true }));
    
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['contact_email', 'contact_phone']);

      if (error) throw error;
      
      const email = data?.find(s => s.key === 'contact_email')?.value || null;
      const phone = data?.find(s => s.key === 'contact_phone')?.value || null;
      
      setSettings(prev => ({ 
        ...prev, 
        email,
        phone,
        loading: false 
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: "Erro ao carregar configurações",
        description: errorMessage,
        variant: "destructive",
      });
      setSettings(prev => ({ ...prev, loading: false }));
    }
  };

  const saveContactEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    setSettings(prev => ({ ...prev, saving: true }));

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: email || null })
        .eq('key', 'contact_email');

      if (error) throw error;

      setSettings(prev => ({ 
        ...prev, 
        email: email || null, 
        saving: false 
      }));

      toast({
        title: "Configuração salva",
        description: "Email de contato atualizado com sucesso!",
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setSettings(prev => ({ ...prev, saving: false }));
      toast({
        title: "Erro ao salvar",
        description: errorMessage,
        variant: "destructive",
      });
      return { success: false, error: errorMessage };
    }
  };

  const saveContactPhone = async (phone: string): Promise<{ success: boolean; error?: string }> => {
    setSettings(prev => ({ ...prev, saving: true }));

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: phone || null })
        .eq('key', 'contact_phone');

      if (error) throw error;

      setSettings(prev => ({ 
        ...prev, 
        phone: phone || null, 
        saving: false 
      }));

      toast({
        title: "Configuração salva",
        description: "Telefone de contato atualizado com sucesso!",
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setSettings(prev => ({ ...prev, saving: false }));
      toast({
        title: "Erro ao salvar",
        description: errorMessage,
        variant: "destructive",
      });
      return { success: false, error: errorMessage };
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    email: settings.email,
    phone: settings.phone,
    loading: settings.loading,
    saving: settings.saving,
    saveContactEmail,
    saveContactPhone,
    refetch: fetchSettings,
  };
};
