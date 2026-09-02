import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

export interface EyemobileConfig {
  id?: string;
  user_id?: string;
  access_key: string;
  secret_key: string;
  environment: "production" | "staging";
  store_id: string | null;
  default_conta_id: string | null;
  default_categoria_receita_id: string | null;
  default_categoria_taxa_id: string | null;
  auto_sync_sales: boolean;
  auto_sync_stock: boolean;
  last_synced_offset?: number;
  created_at?: string;
  updated_at?: string;
}

export interface EyemobileSyncLog {
  id: string;
  user_id: string;
  type: "SALES" | "STOCK" | "WEBHOOK" | "TEST";
  status: "SUCCESS" | "ERROR" | "WARNING";
  items_processed: number;
  payload: any;
  error_message: string | null;
  created_at: string;
}

export interface SyncProgress {
  isSyncing: boolean;
  mode: string | null;
  currentPage: number;
  totalPages: number | null;
  totalItems: number;
  totalProcessed: number;
  percentComplete: number;
  status: "idle" | "running" | "complete" | "error";
  errorMessage: string | null;
}

export const useEyemobileConfig = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<EyemobileConfig | null>(null);
  const [logs, setLogs] = useState<EyemobileSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    isSyncing: false,
    mode: null,
    currentPage: 0,
    totalPages: null,
    totalItems: 0,
    totalProcessed: 0,
    percentComplete: 0,
    status: "idle",
    errorMessage: null,
  });

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Config
      const { data: configData, error: configError } = await supabase
        .from("eyemobile_config")
        .select("*")
        .maybeSingle();

      if (configError) throw configError;

      if (configData) {
        setConfig({
          id: configData.id,
          user_id: configData.user_id,
          access_key: configData.access_key,
          secret_key: configData.secret_key,
          environment: configData.environment as "production" | "staging",
          store_id: configData.store_id,
          default_conta_id: configData.default_conta_id,
          default_categoria_receita_id: configData.default_categoria_receita_id,
          default_categoria_taxa_id: configData.default_categoria_taxa_id,
          auto_sync_sales: configData.auto_sync_sales,
          auto_sync_stock: configData.auto_sync_stock,
          last_synced_offset: configData.last_synced_offset,
          created_at: configData.created_at,
          updated_at: configData.updated_at,
        });
      } else {
        setConfig(null);
      }

      // 2. Fetch Sync Logs
      const { data: logsData, error: logsError } = await supabase
        .from("eyemobile_sync_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (logsError) throw logsError;
      setLogs((logsData || []) as EyemobileSyncLog[]);

    } catch (error: unknown) {
      logger.error("useEyemobileConfig", "Erro ao carregar configurações do Eyemobile", { error: error.message });
      toast({
        title: "Erro ao carregar configurações",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const saveConfig = async (newConfig: Omit<EyemobileConfig, "id" | "user_id" | "created_at" | "updated_at">) => {
    setSaving(true);
    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado.");

      const payload = {
        ...newConfig,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (config?.id) {
        result = await supabase
          .from("eyemobile_config")
          .update(payload)
          .eq("id", config.id)
          .select()
          .single();
      } else {
        result = await supabase
          .from("eyemobile_config")
          .insert([payload])
          .select()
          .single();
      }

      if (result.error) throw result.error;

      toast({
        title: "Configurações salvas",
        description: "Configuração do Eyemobile atualizada com sucesso!",
      });

      await fetchConfig();
      return { success: true };

    } catch (error: unknown) {
      logger.error("useEyemobileConfig", "Erro ao salvar configurações do Eyemobile", { error: error.message });
      toast({
        title: "Erro ao salvar",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
      return { success: false, error: error.message };
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (keys: { access_key: string; secret_key: string; environment: "production" | "staging" }) => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("eyemobile-sync", {
        body: {
          mode: "TEST",
          access_key: keys.access_key,
          secret_key: keys.secret_key,
          environment: keys.environment
        }
      });

      if (error) {
        console.error("FunctionsHttpError full details:", error);
        const errWithDetails = error as any;
        if (errWithDetails.context) {
          try {
            const bodyText = await errWithDetails.context.text();
            console.error("error response body:", bodyText);
            if (bodyText) {
              const bodyJson = JSON.parse(bodyText);
              if (bodyJson.error) {
                throw new Error(bodyJson.error);
              }
            }
          } catch (e: unknown) {
            console.error("failed to extract body text from context:", e.message);
          }
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Conexão bem-sucedida!",
        description: data?.message || "Conectado ao Eyemobile com sucesso.",
      });

      return { success: true };

    } catch (error: unknown) {
      logger.error("useEyemobileConfig", "Erro ao testar conexão", { error: error.message });
      toast({
        title: "Falha na conexão",
        description: error.message || "Não foi possível conectar ao Eyemobile.",
        variant: "destructive",
      });
      return { success: false, error: error.message };
    } finally {
      setTesting(false);
    }
  };

  const triggerSync = async (syncMode: "SALES" | "STOCK" | "ALL" | "HISTORY") => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("eyemobile-sync", {
        body: { mode: syncMode }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      let msg = "Sincronização concluída!";
      if (syncMode === "SALES" || syncMode === "ALL") {
        msg += ` Vendas: ${data?.salesCount || 0}.`;
      }
      if (syncMode === "STOCK" || syncMode === "ALL") {
        msg += ` Alertas de estoque: ${data?.stockAlerts || 0}.`;
      }
      if (syncMode === "HISTORY") {
        msg = `Histórico sincronizado! Vendas: ${data?.salesCount || 0}.`;
      }

      toast({
        title: syncMode === "HISTORY" ? "Histórico sincronizado" : "Sincronização realizada",
        description: msg,
      });

      await fetchConfig();
      return { success: true, ...data };

    } catch (error: unknown) {
      logger.error("useEyemobileConfig", "Erro ao sincronizar dados", { error: error.message });
      toast({
        title: syncMode === "HISTORY" ? "Erro na sincronização histórica" : "Erro na sincronização",
        description: error.message || "Erro durante o processamento do sync.",
        variant: "destructive",
      });
      return { success: false, error: error.message };
    } finally {
      setSyncing(false);
    }
  };

  // Nova função: sincronização histórica completa com paginação automática
  const triggerFullHistorySync = async () => {
    setSyncing(true);
    try {
      // PRE-FLIGHT: Busca primeira página só para saber total de páginas
      setSyncProgress({
        isSyncing: true,
        mode: "HISTORY",
        currentPage: 0,
        totalPages: null,
        totalItems: 0,
        totalProcessed: 0,
        percentComplete: 0,
        status: "running",
        errorMessage: null,
      });
 
      toast({
        title: "Calculando total de páginas...",
        description: "Fazendo verificação prévia...",
      });
 
      const { data: previewData, error: previewError } = await supabase.functions.invoke("eyemobile-sync", {
        body: { mode: "HISTORY", page: 0, page_size: 100, preview: true }
      });
 
      if (previewError) throw previewError;
      if (previewData?.error) throw new Error(previewData.error);
 
      // Se preview retorna totalPages estimado, usa; senão calcula baseado no hasMore
      let totalPages = previewData?.pagination?.totalPagesEstimated ?? null;
 
      toast({
        title: totalPages ? `Total estimado: ${totalPages} páginas` : "Iniciando sincronização...",
        description: totalPages ? `~${totalPages * 100} vendas` : "Descobrindo total...",
      });
 
      // Agora faz a sincronização real
      let totalSales = 0;
      let totalStock = 0;
      const startPage = Math.floor((config?.last_synced_offset || 0) / 100);
      let totalProcessed = startPage * 100;
      const allErrors: string[] = [];
      let page = startPage;
      let hasMore = true;
 
      while (hasMore) {
        // Atualiza progresso antes da chamada
        setSyncProgress(prev => {
          const resolvedTotalPages = totalPages ?? prev.totalPages;
          const displayTotalPages = resolvedTotalPages ? Math.max(resolvedTotalPages, page + 1) : null;
          return {
            ...prev,
            currentPage: page + 1,
            totalPages: displayTotalPages,
            totalItems: totalSales,
            totalProcessed,
            percentComplete: displayTotalPages ? Math.min(99, Math.round(((page + 1) / displayTotalPages) * 100)) : Math.min(99, prev.percentComplete + 2),
          };
        });
 
        const { data, error } = await supabase.functions.invoke("eyemobile-sync", {
          body: { mode: "HISTORY", page, page_size: 100 }
        });
 
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
 
        const salesCount = data?.salesCount || 0;
        const stockCount = data?.stockAlerts || 0;
        const processedCount = data?.processedCount || 0;
 
        // Atualiza contadores
        totalSales += salesCount;
        totalStock += stockCount;
        totalProcessed += processedCount;
        if (data?.errors?.length) allErrors.push(...data.errors);
 
        const pagination = data?.pagination;
        hasMore = pagination?.hasMore === true;
        const nextPage = page + 1;
 
        // Se não tínhamos totalPages e agora temos da resposta real, atualiza
        if (!totalPages && pagination?.totalPagesEstimated) {
          totalPages = pagination.totalPagesEstimated;
        }
 
        if (hasMore) {
          toast({
            title: "Sincronizando histórico...",
            description: `Página ${nextPage}${totalPages ? ` de ${Math.max(totalPages, nextPage)}` : ''} - Total: ${totalSales} vendas`,
          });
        }
 
        // Atualiza progresso após cada página
        setSyncProgress(prev => {
          const resolvedTotalPages = totalPages ?? prev.totalPages;
          const displayTotalPages = resolvedTotalPages ? Math.max(resolvedTotalPages, nextPage) : null;
          return {
            ...prev,
            currentPage: nextPage,
            totalPages: displayTotalPages,
            totalItems: totalSales,
            totalProcessed,
            percentComplete: hasMore 
              ? (displayTotalPages ? Math.min(99, Math.round((nextPage / displayTotalPages) * 100)) : Math.min(99, prev.percentComplete + 2))
              : 100,
          };
        });
 
        page = nextPage;
        await new Promise(r => setTimeout(r, 100));
      }
 
      const status = allErrors.length === 0 ? "SUCCESS" : (totalSales > 0 || totalStock > 0 ? "WARNING" : "ERROR");
      let msg = `Histórico completo sincronizado! Vendas: ${totalSales}`;
      if (totalStock > 0) msg += `, Estoque: ${totalStock}`;
      if (allErrors.length > 0) msg += ` (${allErrors.length} avisos)`;
 
      toast({
        title: status === "SUCCESS" ? "Histórico sincronizado" : "Histórico sincronizado com avisos",
        description: msg,
        variant: status === "ERROR" ? "destructive" : undefined,
      });
 
      setSyncProgress({
        isSyncing: false,
        mode: null,
        currentPage: 0,
        totalPages: null,
        totalItems: totalSales,
        totalProcessed,
        percentComplete: 100,
        status: status === "SUCCESS" ? "complete" : status === "WARNING" ? "complete" : "error",
        errorMessage: allErrors.length > 0 ? allErrors.join("; ") : null,
      });
 
      await fetchConfig();
      return { success: true, salesCount: totalSales, stockAlerts: totalStock, errors: allErrors };
 
    } catch (error: unknown) {
      logger.error("useEyemobileConfig", "Erro na sincronização histórica completa", { error: error.message });
      toast({
        title: "Erro na sincronização histórica",
        description: error.message || "Erro durante o processamento do sync histórico.",
        variant: "destructive",
      });
 
      setSyncProgress({
        isSyncing: false,
        mode: null,
        currentPage: 0,
        totalPages: null,
        totalItems: 0,
        totalProcessed: 0,
        percentComplete: 0,
        status: "error",
        errorMessage: error.message,
      });
 
      return { success: false, error: error.message };
    } finally {
      setSyncing(false);
    }
  };

  const resetSyncOffset = async () => {
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const user_id = userResp.user?.id;
      if (!user_id) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("eyemobile_config")
        .update({ last_synced_offset: 0 })
        .eq("user_id", user_id);

      if (error) throw error;

      toast({
        title: "Progresso resetado",
        description: "A sincronização recomeçará do início na próxima execução.",
      });

      await fetchConfig();
      return true;
    } catch (err: unknown) {
      toast({
        title: "Erro ao resetar progresso",
        description: err.message,
        variant: "destructive",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    logs,
    loading,
    saving,
    testing,
    syncing,
    syncProgress,
    saveConfig,
    testConnection,
    triggerSync,
    triggerFullHistorySync,
    resetSyncOffset,
    refetch: fetchConfig,
  };
};