import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";

export interface WebhookManutencao {
  id: string;
  nome: string;
  url: string;
  ativo: boolean;
  dias_antecedencia_padrao: number;
  retry_attempts: number;
  retry_delay_seconds: number;
  auth_header?: string;
  created_at: string;
  updated_at: string;
}

interface CriarWebhookInput {
  nome: string;
  url: string;
  ativo?: boolean;
  dias_antecedencia_padrao?: number;
  retry_attempts?: number;
  retry_delay_seconds?: number;
  auth_header?: string;
}

interface AtualizarWebhookInput {
  id: string;
  nome?: string;
  url?: string;
  ativo?: boolean;
  dias_antecedencia_padrao?: number;
  retry_attempts?: number;
  retry_delay_seconds?: number;
  auth_header?: string;
}

export const useWebhooksManutencao = () => {
  const [webhooks, setWebhooks] = useState<WebhookManutencao[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('webhooks_manutencao')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar webhooks:', error);
        toast({
          title: "Erro",
          description: "Erro ao carregar webhooks de manutenção",
          variant: "destructive"
        });
        return;
      }

      setWebhooks(data || []);
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar webhooks de manutenção",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const criarWebhook = async (input: CriarWebhookInput) => {
    try {
      const { data, error } = await supabase
        .from('webhooks_manutencao')
        .insert([{
          nome: input.nome,
          url: input.url,
          ativo: input.ativo ?? true,
          dias_antecedencia_padrao: input.dias_antecedencia_padrao ?? 7,
          retry_attempts: input.retry_attempts ?? 3,
          retry_delay_seconds: input.retry_delay_seconds ?? 300,
          auth_header: input.auth_header
        }])
        .select()
        .single();

      if (error) {
        console.error('Erro ao criar webhook:', error);
        toast({
          title: "Erro",
          description: "Erro ao criar webhook de manutenção",
          variant: "destructive"
        });
        return null;
      }

      setWebhooks(prev => [data, ...prev]);
      toast({
        title: "Sucesso",
        description: "Webhook de manutenção criado com sucesso!"
      });

      return data;
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar webhook de manutenção",
        variant: "destructive"
      });
      return null;
    }
  };

  const atualizarWebhook = async (input: AtualizarWebhookInput) => {
    try {
      const updateData: any = {};
      
      if (input.nome !== undefined) updateData.nome = input.nome;
      if (input.url !== undefined) updateData.url = input.url;
      if (input.ativo !== undefined) updateData.ativo = input.ativo;
      if (input.dias_antecedencia_padrao !== undefined) {
        updateData.dias_antecedencia_padrao = input.dias_antecedencia_padrao;
      }
      if (input.retry_attempts !== undefined) {
        updateData.retry_attempts = input.retry_attempts;
      }
      if (input.retry_delay_seconds !== undefined) {
        updateData.retry_delay_seconds = input.retry_delay_seconds;
      }
      if (input.auth_header !== undefined) {
        updateData.auth_header = input.auth_header;
      }

      const { data, error } = await supabase
        .from('webhooks_manutencao')
        .update(updateData)
        .eq('id', input.id)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar webhook:', error);
        toast({
          title: "Erro",
          description: "Erro ao atualizar webhook de manutenção",
          variant: "destructive"
        });
        return null;
      }

      setWebhooks(prev => prev.map(w => w.id === input.id ? data : w));
      toast({
        title: "Sucesso",
        description: "Webhook de manutenção atualizado com sucesso!"
      });

      return data;
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar webhook de manutenção",
        variant: "destructive"
      });
      return null;
    }
  };

  const excluirWebhook = async (id: string) => {
    try {
      const { error } = await supabase
        .from('webhooks_manutencao')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Erro ao excluir webhook:', error);
        toast({
          title: "Erro",
          description: "Erro ao excluir webhook de manutenção",
          variant: "destructive"
        });
        return false;
      }

      setWebhooks(prev => prev.filter(w => w.id !== id));
      toast({
        title: "Sucesso",
        description: "Webhook de manutenção excluído com sucesso!"
      });

      return true;
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao excluir webhook de manutenção",
        variant: "destructive"
      });
      return false;
    }
  };

  const testarWebhook = async (id: string) => {
    try {
      const webhook = webhooks.find(w => w.id === id);
      if (!webhook) {
        toast({
          title: "Erro",
          description: "Webhook não encontrado",
          variant: "destructive"
        });
        return false;
      }

      // Payload de teste
      const payloadTeste = {
        tipo: 'teste',
        mensagem: 'Este é um teste de webhook de manutenção',
        timestamp: new Date().toISOString(),
        webhook_id: id
      };

      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (webhook.auth_header) {
        headers['Authorization'] = webhook.auth_header;
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadTeste)
      });

      if (!response.ok) {
        toast({
          title: "Erro no Teste",
          description: `Webhook retornou status ${response.status}`,
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Sucesso",
        description: "Webhook testado com sucesso!"
      });

      return true;
    } catch (error) {
      console.error('Erro ao testar webhook:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao testar webhook",
        variant: "destructive"
      });
      return false;
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  return {
    webhooks,
    loading,
    fetchWebhooks,
    criarWebhook,
    atualizarWebhook,
    excluirWebhook,
    testarWebhook,
    refetch: fetchWebhooks
  };
};
