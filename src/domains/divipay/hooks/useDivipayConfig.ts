import { useCallback, useEffect, useState } from "react";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { DivipayConfig, DivipayEnvironment } from "@/domains/divipay/types";

export const DIVIPAY_CONFIG_QUERY_KEY = ["divipay-config"] as const;

export function useDivipayConfig() {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const [config, setConfig] = useState<DivipayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!workspaceId) {
      setConfig(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await divipayService.getConfig(workspaceId);
      setConfig(data);
    } catch (err: unknown) {
      logger.error("useDivipayConfig", "Erro ao carregar configuração", { error: err instanceof Error ? err.message : String(err) });
      toast({
        title: "Erro",
        description: "Não foi possível carregar a configuração do Divipay.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  const saveCredentials = useCallback(
    async (clientId: string, clientSecret: string, environment: DivipayEnvironment) => {
      if (!workspaceId) {
        toast({
          title: "Erro",
          description: "Workspace não selecionado.",
          variant: "destructive",
        });
        return;
      }
      try {
        setSaving(true);
        logger.info("useDivipayConfig", "Salvando credenciais Divipay", { environment, workspaceId });
        const updated = await divipayService.saveConfig({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          environment,
          workspace_id: workspaceId,
        }, workspaceId);
        // Garante reset local da configuracao
        setConfig(updated);
        toast({
          title: "Sucesso",
          description: "Credenciais do Divipay salvas com sucesso.",
        });
        return updated;
      } catch (err: unknown) {
        logger.error("useDivipayConfig", "Erro ao salvar credenciais", { error: err instanceof Error ? err.message : String(err) });
        toast({
          title: "Erro",
          description: err instanceof Error ? err.message : "Erro ao salvar credenciais.",
          variant: "destructive",
        });
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [workspaceId, toast]
  );

  const toggleEnvironment = useCallback(
    async () => {
      if (!config) return null;
      const next: DivipayEnvironment = config.environment === "production" ? "sandbox" : "production";
      return saveCredentials(config.client_id ?? "", config.client_secret ?? "", next);
    },
    [config, saveCredentials]
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    saving,
    refetch: fetchConfig,
    saveCredentials,
    toggleEnvironment,
  };
}
