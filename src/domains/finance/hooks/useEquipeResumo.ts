import { useQuery } from '@tanstack/react-query';

import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';

export type EquipeResumo = {
  pendentes: number;
  processando: number;
  pagosNoMes: number;
  falhas: number;
  totalPendente: number;
  proximoVencimento: string | null;
};

const EMPTY_SUMMARY: EquipeResumo = {
  pendentes: 0,
  processando: 0,
  pagosNoMes: 0,
  falhas: 0,
  totalPendente: 0,
  proximoVencimento: null,
};

export function useEquipeResumo() {
  const { activeWorkspace } = useWorkspace();

  return useQuery({
    queryKey: ['equipe-resumo', activeWorkspace?.id],
    queryFn: async (): Promise<EquipeResumo> => {
      if (!activeWorkspace?.id) return EMPTY_SUMMARY;
      const { data, error } = await supabase
        .from('colaborador_acertos' as never)
        .select('status, valor_total, vencimento, updated_at')
        .eq('workspace_id', activeWorkspace.id);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{
        status: string;
        valor_total: number;
        vencimento: string;
        updated_at: string;
      }>;
      const currentMonth = new Date().toISOString().slice(0, 7);
      const pendingDueDates = rows
        .filter((row) => row.status === 'pendente')
        .map((row) => row.vencimento)
        .sort();

      return {
        pendentes: rows.filter((row) => row.status === 'pendente').length,
        processando: rows.filter((row) => row.status === 'processando').length,
        pagosNoMes: rows.filter(
          (row) => ['pago', 'ajustado'].includes(row.status) && row.updated_at.startsWith(currentMonth),
        ).length,
        falhas: rows.filter((row) => row.status === 'falhou').length,
        totalPendente: rows
          .filter((row) => row.status === 'pendente')
          .reduce((total, row) => total + Number(row.valor_total), 0),
        proximoVencimento: pendingDueDates[0] ?? null,
      };
    },
    enabled: Boolean(activeWorkspace?.id),
  });
}
