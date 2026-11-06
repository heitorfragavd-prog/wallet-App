import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  CeoFinancialMetricsService,
  RelatorioLucroLiquidoReal,
} from '@/domains/ceo/services/CeoFinancialMetricsService';

export interface UseRealNetProfitOptions {
  mes?: number;
  ano?: number;
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
}

export function useRealNetProfit(options?: UseRealNetProfitOptions) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? '';

  const {
    data,
    isLoading: loading,
    error,
    refetch,
    isFetching,
  } = useQuery<RelatorioLucroLiquidoReal>({
    queryKey: [
      'ceo',
      'real-net-profit',
      workspaceId,
      options?.mes,
      options?.ano,
      options?.startDate,
      options?.endDate,
    ],
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error('Workspace não selecionado');
      }
      return CeoFinancialMetricsService.getRealNetProfit(workspaceId, {
        mes: options?.mes,
        ano: options?.ano,
        startDate: options?.startDate,
        endDate: options?.endDate,
      });
    },
    enabled: Boolean(workspaceId) && (options?.enabled !== false),
    staleTime: 60 * 1000, // 1 minuto de cache fresco
  });

  return {
    relatorio: data,
    loading,
    isFetching,
    error,
    refetch,
  };
}
