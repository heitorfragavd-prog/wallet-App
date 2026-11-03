import { useQuery } from '@tanstack/react-query';

import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';

export type PendenciaItemExplicacao = {
  acertoId: string;
  colaboradorId: string;
  colaboradorNome: string;
  tipo: string;
  periodoInicio: string;
  periodoFim: string;
  vencimento: string;
  valor: number;
};

export type EquipeResumo = {
  pendentes: number;
  totalPendente: number;
  processando: number;
  pagosNoMes: number;
  totalPagoNoMes: number;
  falhas: number;
  obrigacoesVencidas: number;
  totalVencido: number;
  proximoVencimento: string | null;
  custoEstimadoEquipe: number;
  mesReferencia: string;
  explicacaoPendencias: PendenciaItemExplicacao[];
};

export function getSaoPauloDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.format(date).split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
    isoDate: parts.join('-'),
    yearMonth: `${parts[0]}-${parts[1]}`,
  };
}

export function formatMonthInSaoPaulo(paidAt: string): string {
  try {
    const d = new Date(paidAt);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    });
    return formatter.format(d); // "YYYY-MM"
  } catch {
    return paidAt.slice(0, 7);
  }
}

const EMPTY_SUMMARY: EquipeResumo = {
  pendentes: 0,
  totalPendente: 0,
  processando: 0,
  pagosNoMes: 0,
  totalPagoNoMes: 0,
  falhas: 0,
  obrigacoesVencidas: 0,
  totalVencido: 0,
  proximoVencimento: null,
  custoEstimadoEquipe: 0,
  mesReferencia: '',
  explicacaoPendencias: [],
};

type UseEquipeResumoOptions = {
  ano?: number;
  mes?: number;
};

export function useEquipeResumo(options?: UseEquipeResumoOptions) {
  const { activeWorkspace } = useWorkspace();
  const spToday = getSaoPauloDateParts();
  const targetYear = options?.ano ?? spToday.year;
  const targetMonth = options?.mes ?? spToday.month;
  const targetYearMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

  return useQuery({
    queryKey: ['equipe-resumo', activeWorkspace?.id, targetYearMonth],
    queryFn: async (): Promise<EquipeResumo> => {
      if (!activeWorkspace?.id) return { ...EMPTY_SUMMARY, mesReferencia: targetYearMonth };

      // 1. Consultar acertos com dados do colaborador
      const { data: acertosData, error: acertosError } = await supabase
        .from('colaborador_acertos' as never)
        .select(`
          id,
          colaborador_id,
          tipo,
          status,
          valor_total,
          vencimento,
          periodo_inicio,
          periodo_fim,
          updated_at,
          colaboradores (
            nome,
            tipo,
            salario_bruto,
            valor_pro_labore
          )
        `)
        .eq('workspace_id', activeWorkspace.id);

      if (acertosError) throw acertosError;

      // 2. Consultar pagamentos liquidados para medir pagamentos reais no mês
      const { data: pagamentosData, error: pagamentosError } = await supabase
        .from('colaborador_pagamentos' as never)
        .select('id, acerto_id, status, origem, valor, paid_at, created_at')
        .eq('workspace_id', activeWorkspace.id)
        .eq('status', 'pago');

      if (pagamentosError) throw pagamentosError;

      // 3. Consultar colaboradores ativos para calcular custo estimado total
      const { data: colabsData, error: colabsError } = await supabase
        .from('colaboradores' as never)
        .select('id, nome, tipo, salario_bruto, valor_pro_labore, status')
        .eq('workspace_id', activeWorkspace.id)
        .neq('status', 'demitido');

      if (colabsError) throw colabsError;

      interface ColabRow {
        id: string;
        nome: string;
        tipo: string;
        salario_bruto: number | null;
        valor_pro_labore: number | null;
        status: string | null;
      }

      const colabs = (colabsData ?? []) as unknown as ColabRow[];
      const custoEstimadoEquipe = colabs.reduce((acc, c) => {
        if (c.tipo === 'socio') {
          return acc + (Number(c.valor_pro_labore) || Number(c.salario_bruto) || 0);
        }
        return acc + (Number(c.salario_bruto) || 0);
      }, 0);

      interface AcertoRow {
        id: string;
        colaborador_id: string;
        tipo: string;
        status: string;
        valor_total: number;
        vencimento: string;
        periodo_inicio: string;
        periodo_fim: string;
        updated_at: string;
        colaboradores?: {
          nome?: string;
          tipo?: string;
          salario_bruto?: number;
          valor_pro_labore?: number;
        } | null;
      }

      const acertos = (acertosData ?? []) as unknown as AcertoRow[];

      interface PagamentoRow {
        id: string;
        acerto_id: string;
        status: string;
        origem: string;
        valor: number;
        paid_at: string | null;
        created_at: string;
      }

      const pagamentos = (pagamentosData ?? []) as unknown as PagamentoRow[];

      // Filtrar pagamentos efetivamente quitados durante o mês selecionado (respeitando America/Sao_Paulo)
      const pagamentosDoMes = pagamentos.filter((p) => {
        const dateToUse = p.paid_at || p.created_at;
        return formatMonthInSaoPaulo(dateToUse) === targetYearMonth;
      });

      const totalPagoNoMes = pagamentosDoMes.reduce(
        (sum, p) => sum + (Number(p.valor) || 0),
        0,
      );

      // Obrigações pendentes (todas as pendentes ativas no workspace)
      const pendentesRows = acertos.filter((row) => row.status === 'pendente');
      const processandoRows = acertos.filter((row) => row.status === 'processando');
      const falhasRows = acertos.filter((row) => row.status === 'falhou');

      const totalPendente = pendentesRows.reduce(
        (sum, row) => sum + (Number(row.valor_total) || 0),
        0,
      );

      // Obrigações vencidas (pendentes cuja data de vencimento é anterior a hoje em SP)
      const vencidasRows = pendentesRows.filter((row) => row.vencimento < spToday.isoDate);
      const totalVencido = vencidasRows.reduce(
        (sum, row) => sum + (Number(row.valor_total) || 0),
        0,
      );

      // Próximo vencimento ordenado ascendentemente
      const pendingDueDates = pendentesRows.map((row) => row.vencimento).sort();

      // Explicação detalhada de cada pendência para total transparência
      const explicacaoPendencias: PendenciaItemExplicacao[] = pendentesRows.map((row) => ({
        acertoId: row.id,
        colaboradorId: row.colaborador_id,
        colaboradorNome: row.colaboradores?.nome || 'Colaborador',
        tipo: row.tipo,
        periodoInicio: row.periodo_inicio,
        periodoFim: row.periodo_fim,
        vencimento: row.vencimento,
        valor: Number(row.valor_total) || 0,
      }));

      return {
        pendentes: pendentesRows.length,
        totalPendente,
        processando: processandoRows.length,
        pagosNoMes: pagamentosDoMes.length,
        totalPagoNoMes,
        falhas: falhasRows.length,
        obrigacoesVencidas: vencidasRows.length,
        totalVencido,
        proximoVencimento: pendingDueDates[0] ?? null,
        custoEstimadoEquipe,
        mesReferencia: targetYearMonth,
        explicacaoPendencias,
      };
    },
    enabled: Boolean(activeWorkspace?.id),
  });
}
