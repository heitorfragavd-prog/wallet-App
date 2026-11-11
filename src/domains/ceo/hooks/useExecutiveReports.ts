/**
 * useExecutiveReports.ts
 *
 * Hook do React Query para consulta e disparo autorizado de Relatórios Executivos Diários.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CeoExecutiveReport } from "../types/executive-report";
import { useToast } from "@/shared/hooks/use-toast";

export function useExecutiveReports(workspaceId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = ["ceo-executive-reports", workspaceId];

  // 1. Busca relatórios executivos do workspace ordenados por data decrescente
  const { data: reports = [], isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<CeoExecutiveReport[]> => {
      if (!workspaceId) return [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: qError } = await (supabase as any)
        .from("ceo_executive_reports")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("reference_date", { ascending: false });

      if (qError) throw qError;
      return (data || []) as unknown as CeoExecutiveReport[];
    },
    enabled: !!workspaceId,
  });

  // 2. Disparo manual autorizado de geração de relatório
  const generateReportMutation = useMutation({
    mutationFn: async (referenceDate?: string) => {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "cron-relatorio-executivo",
        {
          body: {
            workspace_id: workspaceId,
            reference_date: referenceDate,
          },
        }
      );

      if (invokeError) throw invokeError;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Relatório Executivo Processado",
        description: "Os indicadores diários e recomendações foram atualizados com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Erro ao gerar relatório",
        description: msg,
        variant: "destructive",
      });
    },
  });

  return {
    reports,
    isLoading,
    error,
    refetch,
    generateReport: generateReportMutation.mutate,
    isGenerating: generateReportMutation.isPending,
  };
}
