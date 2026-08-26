/**
 * useIAConfiguracoes — Configurações da IA Legada (openai-proxy)
 *
 * SEGURANÇA (Etapa 1.1):
 *   A api_key NÃO é mais retornada ao browser.
 *   O frontend recebe apenas { modelo, api_key_configurada: boolean }.
 *
 *   Fluxo de leitura: select('id, modelo') — nunca select('api_key') ou select('*').
 *   A api_key é lida exclusivamente pela Edge Function (openai-proxy) via service_role,
 *   que então a usa server-side para chamar a API da OpenAI.
 *
 *   Fluxo de escrita: INSERT/UPDATE enviam a chave para o banco (user_id + RLS).
 *   Isso é necessário para que o usuário configure sua chave. Após salvar, a chave
 *   NÃO é relida pelo hook.
 *
 *   Como o frontend sabe se há chave configurada:
 *     A query retorna a linha com id e modelo se existir uma configuração.
 *     api_key_configurada = true quando a linha existe (independente do valor da chave).
 *     NÃO enviamos o valor, hash ou parte da chave ao browser.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { logger } from '@/core/logging/LoggerService';

interface IAConfiguracaoSafe {
  id?: string;
  /** Modelo de LLM escolhido (ex: "gpt-4o-mini") */
  modelo: string;
  /** True se há uma api_key configurada no banco para este usuário. NÃO é o valor da chave. */
  api_key_configurada: boolean;
}

export const useIAConfiguracoes = () => {
  const [configuracao, setConfiguracao] = useState<IAConfiguracaoSafe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfiguracao();
  }, []);

  const fetchConfiguracao = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // ✅ SEGURO: nunca selecionar api_key nem usar select('*')
      // A existência da linha já é suficiente para saber se está configurada.
      const { data, error } = await supabase
        .from('ia_configuracoes')
        .select('id, modelo')          // <-- apenas campos não-sensíveis
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfiguracao({
          id: data.id,
          modelo: data.modelo || 'gpt-4o-mini',
          // A linha existe → há uma api_key configurada (não sabemos o valor — intencional)
          api_key_configurada: true,
        });
      } else {
        setConfiguracao(null);
      }
    } catch (error) {
      logger.error('useIAConfiguracoes', 'Erro ao buscar configurações', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const salvarConfiguracao = async (apiKey: string, modelo: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let error;
      if (configuracao?.id) {
        // Atualizar configuração existente — api_key vai para o banco, não fica em memória do hook
        const { error: updateError } = await supabase
          .from('ia_configuracoes')
          .update({ api_key: apiKey, modelo })
          .eq('id', configuracao.id);
        error = updateError;
      } else {
        // Criar nova configuração
        const { error: insertError } = await supabase
          .from('ia_configuracoes')
          .insert({ user_id: user.id, api_key: apiKey, modelo });
        error = insertError;
      }

      if (error) throw error;

      // Após salvar, apenas recarrega metadados (sem trazer a chave de volta)
      await fetchConfiguracao();

      toast({
        title: 'Configuração salva',
        description: 'Chave API e modelo OpenAI configurados com sucesso!',
      });
    } catch (error) {
      logger.error('useIAConfiguracoes', 'Erro ao salvar configuração', {
        error: error instanceof Error ? error.message : String(error),
      });
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configuração. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  return {
    configuracao,
    isLoading,
    salvarConfiguracao,
    /**
     * True se o usuário tem api_key configurada no banco.
     * NÃO expõe o valor da chave.
     */
    isConfigured: configuracao?.api_key_configurada === true,
  };
};