import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { isValidWebhookUrl } from "../utils/validation";

interface WebhookSettings {
  webhookUrl: string | null;
  loading: boolean;
  saving: boolean;
  testing: boolean;
}

export const useWebhookSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<WebhookSettings>({
    webhookUrl: null,
    loading: true,
    saving: false,
    testing: false,
  });

  const getWebhookUrl = async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'webhook_url')
        .single();

      if (error) throw error;
      return data?.value || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: "Erro ao carregar configuração",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    }
  };

  const fetchSettings = async () => {
    setSettings(prev => ({ ...prev, loading: true }));
    const webhookUrl = await getWebhookUrl();
    setSettings(prev => ({ ...prev, webhookUrl, loading: false }));
  };


  const saveWebhookUrl = async (url: string): Promise<{ success: boolean; error?: string }> => {
    // Validate URL format before saving
    if (url && !isValidWebhookUrl(url)) {
      toast({
        title: "URL inválida",
        description: "Por favor, insira uma URL válida (HTTP ou HTTPS)",
        variant: "destructive",
      });
      return { success: false, error: "URL inválida" };
    }

    setSettings(prev => ({ ...prev, saving: true }));

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: url || null })
        .eq('key', 'webhook_url');

      if (error) throw error;

      setSettings(prev => ({ ...prev, webhookUrl: url || null, saving: false }));

      toast({
        title: "Configuração salva",
        description: "URL do webhook atualizada com sucesso!",
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

  const testWebhook = async (): Promise<{ success: boolean; error?: string }> => {
    if (!settings.webhookUrl) {
      toast({
        title: "Webhook não configurado",
        description: "Configure uma URL de webhook antes de testar",
        variant: "destructive",
      });
      return { success: false, error: "Webhook não configurado" };
    }

    setSettings(prev => ({ ...prev, testing: true }));

    try {
      // Send a test payload to the webhook
      const testPayload = {
        event: 'webhook_test',
        timestamp: new Date().toISOString(),
        message: 'Teste de conectividade do webhook Wallet'
      };

      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      setSettings(prev => ({ ...prev, testing: false }));

      if (response.ok) {
        toast({
          title: "Teste bem-sucedido",
          description: "O webhook respondeu corretamente!",
        });
        return { success: true };
      } else {
        toast({
          title: "Falha no teste",
          description: `O webhook retornou status ${response.status}`,
          variant: "destructive",
        });
        return { success: false, error: `Status ${response.status}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Não foi possível conectar ao webhook';
      setSettings(prev => ({ ...prev, testing: false }));
      toast({
        title: "Erro no teste",
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
    webhookUrl: settings.webhookUrl,
    loading: settings.loading,
    saving: settings.saving,
    testing: settings.testing,
    getWebhookUrl,
    saveWebhookUrl,
    testWebhook,
    refetch: fetchSettings,
    isValidWebhookUrl,
  };
};
