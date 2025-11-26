import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { isValidWhatsAppNumber, sanitizeWhatsAppNumber } from "../utils/validation";

interface WhatsAppSettings {
  whatsappNumber: string | null;
  loading: boolean;
  saving: boolean;
}

export const useWhatsAppSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<WhatsAppSettings>({
    whatsappNumber: null,
    loading: true,
    saving: false,
  });

  const fetchSettings = async () => {
    setSettings(prev => ({ ...prev, loading: true }));
    
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'whatsapp_number')
        .single();

      if (error) throw error;
      
      setSettings(prev => ({ 
        ...prev, 
        whatsappNumber: data?.value || null, 
        loading: false 
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: "Erro ao carregar configuração",
        description: errorMessage,
        variant: "destructive",
      });
      setSettings(prev => ({ ...prev, loading: false }));
    }
  };

  const saveWhatsAppNumber = async (number: string): Promise<{ success: boolean; error?: string }> => {
    // Sanitize and validate number before saving
    const sanitized = sanitizeWhatsAppNumber(number);
    
    if (sanitized && !isValidWhatsAppNumber(sanitized)) {
      toast({
        title: "Número inválido",
        description: "Por favor, insira um número válido com 10-15 dígitos",
        variant: "destructive",
      });
      return { success: false, error: "Número inválido" };
    }

    setSettings(prev => ({ ...prev, saving: true }));

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: sanitized || null })
        .eq('key', 'whatsapp_number');

      if (error) throw error;

      setSettings(prev => ({ 
        ...prev, 
        whatsappNumber: sanitized || null, 
        saving: false 
      }));

      toast({
        title: "Configuração salva",
        description: "Número do WhatsApp atualizado com sucesso!",
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
    whatsappNumber: settings.whatsappNumber,
    loading: settings.loading,
    saving: settings.saving,
    saveWhatsAppNumber,
    refetch: fetchSettings,
    isValidWhatsAppNumber,
  };
};
