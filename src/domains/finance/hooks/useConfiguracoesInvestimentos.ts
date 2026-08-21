import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { INVESTIMENTOS_QUERY_KEY } from "./useInvestimentos";

export interface ConfiguracaoInvestimento {
  id: string;
  user_id: string;
  workspace_id?: string;
  mostrar_liquido_ir: boolean;
  mostrar_real_ipca: boolean;
  taxa_ipca_anual: number;
  alerta_desbalanceamento: number;
  sweep_caixa_minimo?: number;
  created_at?: string;
}

export const CONFIGS_QUERY_KEY = ["configuracoes_investimentos"] as const;

export function useConfiguracoesInvestimentos() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const workspaceId = activeWorkspace?.id;

  const { data: configuracoes, isLoading } = useQuery({
    queryKey: [...CONFIGS_QUERY_KEY, workspaceId],
    queryFn: async (): Promise<ConfiguracaoInvestimento> => {
      if (!workspaceId) throw new Error("Workspace não selecionado");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar configuração
      const { data, error } = await supabase
        .from("configuracoes_investimentos")
        .select("*")
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) {
        logger.error("useConfiguracoesInvestimentos", "Erro ao buscar configurações", { error: error.message });
        throw error;
      }

      if (!data) {
        // Criar configuração padrão
        const { data: newConfig, error: insertError } = await supabase
          .from("configuracoes_investimentos")
          .insert({
            user_id: user.id,
            workspace_id: workspaceId,
            mostrar_liquido_ir: false,
            mostrar_real_ipca: false,
            taxa_ipca_anual: 4.5,
            alerta_desbalanceamento: 10.0,
            sweep_caixa_minimo: 2000,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        return newConfig as ConfiguracaoInvestimento;
      }

      return data as ConfiguracaoInvestimento;
    },
    enabled: !!workspaceId,
  });

  const saveConfiguracao = useMutation({
    mutationFn: async (payload: Partial<ConfiguracaoInvestimento>) => {
      if (!workspaceId) throw new Error("Workspace não selecionado");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("configuracoes_investimentos")
        .update(payload)
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIGS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Configurações de investimentos salvas!",
      });
    },
    onError: (err: any) => {
      logger.error("useConfiguracoesInvestimentos", "Erro ao salvar configurações", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao salvar configurações: ${err.message}`,
      });
    },
  });

  const atualizarCotacoes = async (): Promise<boolean> => {
    try {
      toast({
        title: "Atualizando cotações",
        description: "Buscando cotações atualizadas da B3 e Cripto...",
      });

      const resp = await supabase.functions.invoke("atualizar-cotacoes", {
        body: {},
      });

      if (resp.error) throw resp.error;

      if (resp.data?.success) {
        queryClient.invalidateQueries({ queryKey: INVESTIMENTOS_QUERY_KEY });
        toast({
          title: "Cotações atualizadas",
          description: `Atualizadas ${resp.data.updatedCount} cotações com sucesso!`,
        });
        return true;
      }
      throw new Error(resp.data?.error || "Erro desconhecido");
    } catch (err: any) {
      logger.error("useConfiguracoesInvestimentos", "Erro ao atualizar cotações", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro na atualização",
        description: err.message || "Erro ao conectar com API de cotações",
      });
      return false;
    }
  };

  return {
    configuracoes,
    isLoading,
    saveConfiguracao,
    atualizarCotacoes,
  };
}
