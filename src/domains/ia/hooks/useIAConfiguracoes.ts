/**
 * useIAConfiguracoes - SEGURO (Etapa 1.2)
 * api_key NUNCA retorna ao browser.
 * Usa rpc("get_ia_config_status") em vez de SELECT direto.
 * Ver migration: 20260826120000_ia_config_api_key_protection.sql
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { logger } from '@/core/logging/LoggerService';

interface IAConfiguracaoSafe {
  id?: string;
  modelo: string;
  /** True se length(trim(api_key)) > 0 no banco. NAO e o valor da chave. */
  api_key_configurada: boolean;
}

export const useIAConfiguracoes = () => {
  const [configuracao, setConfiguracao] = useState<IAConfiguracaoSafe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => { fetchConfiguracao(); }, []);

  const fetchConfiguracao = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // SEGURO: rpc() SECURITY DEFINER - api_key nunca chega ao browser
      const { data, error } = await supabase.rpc('get_ia_config_status').maybeSingle();
      if (error) throw error;
      if (data) {
        setConfiguracao({
          id: (data as { id: string }).id,
          modelo: (data as { modelo: string }).modelo || 'gpt-4o-mini',
          api_key_configurada: Boolean((data as { api_key_configurada: boolean }).api_key_configurada),
        });
      } else {
        setConfiguracao(null);
      }
    } catch (error) {
      logger.error('useIAConfiguracoes', 'Erro ao buscar configuracoes', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const salvarConfiguracao = async (apiKey: string, modelo: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario nao autenticado');
      let error;
      if (configuracao?.id) {
        const { error: e } = await supabase.from('ia_configuracoes').update({ api_key: apiKey, modelo }).eq('id', configuracao.id);
        error = e;
      } else {
        const { error: e } = await supabase.from('ia_configuracoes').insert({ user_id: user.id, api_key: apiKey, modelo });
        error = e;
      }
      if (error) throw error;
      await fetchConfiguracao();
      toast({ title: 'Configuracao salva', description: 'Chave API e modelo OpenAI configurados!' });
    } catch (error) {
      logger.error('useIAConfiguracoes', 'Erro ao salvar', { error: error instanceof Error ? error.message : String(error) });
      toast({ title: 'Erro', description: 'Erro ao salvar configuracao.', variant: 'destructive' });
    }
  };

  return {
    configuracao,
    isLoading,
    salvarConfiguracao,
    /** True se api_key configurada e nao-vazia. NAO expoe valor da chave. */
    isConfigured: configuracao?.api_key_configurada === true,
  };
};