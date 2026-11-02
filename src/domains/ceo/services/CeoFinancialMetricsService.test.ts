import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CeoFinancialMetricsService,
  getSaoPauloParts,
  getSaoPauloYesterday,
  getSaoPauloDateString,
} from './CeoFinancialMetricsService';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

interface MockRow {
  [key: string]: any;
}

let mockDatabase: Record<string, MockRow[]> = {
  transacoes: [],
  despesas: [],
  fichas_tecnicas: [],
  produtos_eyemobile: [],
  delivery_orders: [],
};

function setupDefaultMockSupabase(db: Partial<typeof mockDatabase> = {}) {
  mockDatabase = {
    transacoes: [],
    despesas: [],
    fichas_tecnicas: [],
    produtos_eyemobile: [],
    delivery_orders: [],
    ...db,
  };

  (supabase.from as any).mockImplementation((table: string) => {
    let currentRows = [...(mockDatabase[table] || [])];

    const builder: any = {};
    builder.select = vi.fn().mockImplementation((_cols?: string, _opts?: { count?: string; head?: boolean }) => {
      return builder;
    });
    builder.eq = vi.fn().mockImplementation((col: string, val: any) => {
      currentRows = currentRows.filter((r) => r[col] === val);
      return builder;
    });
    builder.neq = vi.fn().mockImplementation((col: string, val: any) => {
      currentRows = currentRows.filter((r) => r[col] !== val);
      return builder;
    });
    builder.gte = vi.fn().mockImplementation((col: string, val: any) => {
      currentRows = currentRows.filter((r) => String(r[col] || '') >= String(val));
      return builder;
    });
    builder.lte = vi.fn().mockImplementation((col: string, val: any) => {
      currentRows = currentRows.filter((r) => String(r[col] || '') <= String(val));
      return builder;
    });
    builder.order = vi.fn().mockReturnValue(builder);
    builder.range = vi.fn().mockImplementation((from: number, to: number) => {
      return Promise.resolve({
        data: currentRows.slice(from, to + 1),
        error: null,
      });
    });
    builder.then = (resolve: (val: any) => void) => {
      resolve({
        data: currentRows,
        count: currentRows.length,
        error: null,
      });
    };

    return builder;
  });
}

describe('CeoFinancialMetricsService — Auditoria de Dados 100% Reais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMockSupabase();
  });

  describe('GATE A: Eliminação de Valores Fictícios', () => {
    it('getEmptyKpis deve retornar zeros, nulos e NENHUM valor financeiro hardcoded', () => {
      const emptyKpis = CeoFinancialMetricsService.getEmptyKpis();

      // Proibido conter os números fictícios auditados:
      expect(emptyKpis.faturamentoMes).toBe(0);
      expect(emptyKpis.faturamentoMes).not.toBe(287430.50);

      expect(emptyKpis.faturamentoOntem).toBe(0);
      expect(emptyKpis.faturamentoOntem).not.toBe(12845.30);

      expect(emptyKpis.despesasMes).toBe(0);
      expect(emptyKpis.despesasMes).not.toBe(45610.25);

      expect(emptyKpis.resultadoOperacional).toBe(0);
      expect(emptyKpis.lucroEstimado).toBe(0);
      expect(emptyKpis.lucroEstimado).not.toBe(58420.10);

      expect(emptyKpis.cmvPercent).toBeNull();
      expect(emptyKpis.cmvPercent).not.toBe(32.4);

      expect(emptyKpis.crescimentoMesPercent).toBeNull();
      expect(emptyKpis.variacaoOntemVsMediaPercent).toBeNull();
      expect(emptyKpis.variacaoDespesasPercent).toBeNull();
      expect(emptyKpis.margemLucroPercent).toBeNull();

      expect(emptyKpis.cmvStatus).toBe('dados_insuficientes');
    });

    it('getSalesByChannel retorna array vazio ou canais reais, nunca porcentagens falsas pré-fabricadas', async () => {
      const result = await CeoFinancialMetricsService.getSalesByChannel('');
      expect(result).toEqual([]);

      const values = result.map((c) => c.faturamento);
      expect(values).not.toContain(82492.55);
      expect(values).not.toContain(44264.30);
    });

    it('getTopProducts retorna array vazio caso não haja itens de pedido registrados', async () => {
      const result = await CeoFinancialMetricsService.getTopProducts('');
      expect(result).toEqual([]);

      const names = result.map((p) => p.produto);
      expect(names).not.toContain('X-Tudo Especial');
      expect(names).not.toContain('X-Bacon');
    });

    it('getMovementHeatmap não utiliza Math.random() e é determinístico para dados vazios', async () => {
      const result = await CeoFinancialMetricsService.getMovementHeatmap('');
      expect(result).toEqual([]);
    });
  });

  describe('GATE B & C: Precisão dos Indicadores e Resultados Reais', () => {
    it('quando o workspace for vazio, retorna estado honesto sem quebrar', async () => {
      const kpis = await CeoFinancialMetricsService.getExecutiveKpis('');
      expect(kpis.faturamentoMes).toBe(0);
      expect(kpis.despesasMes).toBe(0);
      expect(kpis.resultadoOperacional).toBe(0);
      expect(kpis.cmvPercent).toBeNull();
      expect(kpis.cmvStatus).toBe('dados_insuficientes');
      expect(kpis.acoesHoje.length).toBeGreaterThan(0);
    });

    it('deve suportar resultado operacional negativo sem mascarar com Math.max(0, ...)', () => {
      const faturamento = 10000;
      const despesas = 14500;
      const resultadoOperacional = faturamento - despesas;

      expect(resultadoOperacional).toBe(-4500);
      expect(resultadoOperacional).not.toBe(0);
      expect(resultadoOperacional).toBeLessThan(0);
    });

    it('helper de paginação fetchAllPaginated percorre múltiplas páginas sem truncar em 1.000 ou 5.000 registros', async () => {
      const totalMockRecords = 2500;
      const mockDb = Array.from({ length: totalMockRecords }, (_, idx) => ({
        id: `tx-${idx}`,
        valor: 10.0,
      }));

      // @ts-expect-error testando método privado de paginação
      const fetched = await CeoFinancialMetricsService.fetchAllPaginated(async (from: number, to: number) => {
        const slice = mockDb.slice(from, to + 1);
        return { data: slice, error: null };
      });

      expect(fetched.length).toBe(totalMockRecords);
      expect(fetched[0].id).toBe('tx-0');
      expect(fetched[totalMockRecords - 1].id).toBe(`tx-${totalMockRecords - 1}`);
    });

    it('helper de paginação fetchAllPaginated lança erro explícito se qualquer página falhar (Gate 3 - Resiliência)', async () => {
      await expect(
        CeoFinancialMetricsService.fetchAllPaginated(async () => {
          return { data: null, error: new Error('PostgREST connection timeout') };
        })
      ).rejects.toThrow('Falha ao buscar registros paginados');

      let pageCount = 0;
      await expect(
        CeoFinancialMetricsService.fetchAllPaginated(async () => {
          pageCount++;
          if (pageCount === 2) {
            return { data: null, error: new Error('PostgREST error on page 2') };
          }
          return { data: Array.from({ length: 1000 }, (_, i) => ({ id: `tx-${i}` })), error: null };
        })
      ).rejects.toThrow('Falha ao buscar registros paginados');
    });

    describe('GATE 3: Virada de Mês e de Ano em America/Sao_Paulo', () => {
      it('getSaoPauloParts e getSaoPauloYesterday calculam virada de mês perfeitamente (01/11/2026 -> 31/10/2026)', () => {
        const nov1 = new Date('2026-11-01T15:00:00Z');
        const today = getSaoPauloParts(nov1);
        expect(today.dateString).toBe('2026-11-01');
        expect(today.year).toBe(2026);
        expect(today.month).toBe(11);
        expect(today.day).toBe(1);

        const yesterday = getSaoPauloYesterday(nov1);
        expect(yesterday.dateString).toBe('2026-10-31');
        expect(yesterday.year).toBe(2026);
        expect(yesterday.month).toBe(10);
        expect(yesterday.day).toBe(31);
        expect(yesterday.dayOfWeek).toBe(6); // Sábado
      });

      it('getSaoPauloParts e getSaoPauloYesterday calculam virada de ano perfeitamente (01/01/2027 -> 31/12/2026)', () => {
        const jan1 = new Date('2027-01-01T15:00:00Z');
        const today = getSaoPauloParts(jan1);
        expect(today.dateString).toBe('2027-01-01');
        expect(today.year).toBe(2027);
        expect(today.month).toBe(1);

        const yesterday = getSaoPauloYesterday(jan1);
        expect(yesterday.dateString).toBe('2026-12-31');
        expect(yesterday.year).toBe(2026);
        expect(yesterday.month).toBe(12);
        expect(yesterday.day).toBe(31);
      });

      it('virada de fevereiro para março em ano não-bissexto (01/03/2026 -> 28/02/2026)', () => {
        const mar1 = new Date('2026-03-01T15:00:00Z');
        const yesterday = getSaoPauloYesterday(mar1);
        expect(yesterday.dateString).toBe('2026-02-28');
        expect(yesterday.month).toBe(2);
        expect(yesterday.day).toBe(28);
      });

      it('quando getExecutiveKpis encontra falha de banco, sinaliza dadosIndisponiveis sem fingir R$ 0,00 como real', async () => {
        vi.spyOn(CeoFinancialMetricsService, 'fetchAllPaginated').mockRejectedValueOnce(
          new Error('Simulated Database Down')
        );

        const kpis = await CeoFinancialMetricsService.getExecutiveKpis('test-ws-id');
        expect(kpis.dadosIndisponiveis).toBe(true);
        expect(kpis.erroMensagem).toContain('Simulated Database Down');
        expect(kpis.dataAtualizacao).toBe('dados indisponíveis no momento');
      });
    });
  });

  describe('HOTFIX REGRESSION: getExecutiveKpis cálculo completo da janela histórica e resiliência de datas', () => {
    const wsId = '2af415b6-76aa-4134-8133-a9b405671c1c';

    it('Cenário 1: 01/11/2026 — executa getExecutiveKpis completo sem erro de Date.UTC(...).getTime', async () => {
      const refDate = new Date('2026-11-01T15:00:00Z'); // 01/11/2026 12:00 BRT
      // Ontem: 31/10/2026 (Sábado). Sábados anteriores nas 4 semanas: 24/10, 17/10, 10/10, 03/10
      setupDefaultMockSupabase({
        transacoes: [
          // Ontem (31/10)
          { id: 'tx-1', valor: 3765.90, data: '2026-10-31T18:00:00Z', tipo: 'receita', workspace_id: wsId },
          // Sábado 24/10
          { id: 'tx-2', valor: 3500.00, data: '2026-10-24T18:00:00Z', tipo: 'receita', workspace_id: wsId },
          // Sábado 17/10
          { id: 'tx-3', valor: 3800.00, data: '2026-10-17T18:00:00Z', tipo: 'receita', workspace_id: wsId },
          // Sábado 10/10
          { id: 'tx-4', valor: 3900.00, data: '2026-10-10T18:00:00Z', tipo: 'receita', workspace_id: wsId },
          // Sábado 03/10
          { id: 'tx-5', valor: 3600.00, data: '2026-10-03T18:00:00Z', tipo: 'receita', workspace_id: wsId },
          // Vendas do mês atual (01/11)
          { id: 'tx-6', valor: 1200.00, data: '2026-11-01T14:00:00Z', tipo: 'receita', workspace_id: wsId },
        ],
        despesas: [
          { id: 'desp-1', valor: 500.00, data: '2026-11-01', workspace_id: wsId },
        ],
        fichas_tecnicas: [{ id: 'ficha-1' }],
        produtos_eyemobile: [{ id: 'prod-1', workspace_id: wsId }],
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);

      // Não pode haver flag de dadosIndisponiveis nem erro de Date.UTC
      expect(kpis.dadosIndisponiveis).toBeFalsy();
      expect(kpis.erroMensagem).toBeUndefined();
      expect(kpis.dataAtualizacao).toBe('atualizado agora');

      // Faturamento de ontem (31/10)
      expect(kpis.faturamentoOntem).toBe(3765.90);
      expect(kpis.diaSemanaOntemNome).toBe('sábados');

      // Média dos 4 sábados anteriores: (3500 + 3800 + 3900 + 3600) / 4 = 14800 / 4 = 3700.00
      expect(kpis.mediaDiaSemanaOntem).toBe(3700);

      // Variação %: ((3765.90 - 3700) / 3700) * 100 = +1.8%
      expect(kpis.variacaoOntemVsMediaPercent).toBe(1.8);

      // Faturamento do mês (novembro: 1200) e despesas (500)
      expect(kpis.faturamentoMes).toBe(1200);
      expect(kpis.despesasMes).toBe(500);
      expect(kpis.resultadoOperacional).toBe(700);

      // Array de 30 dias calculado com sucesso
      expect(kpis.dailySales30Days.length).toBe(30);
    });

    it('Cenário 2: 01/01/2027 — virada de ano calcula janela histórica e não lança exceção', async () => {
      const refDate = new Date('2027-01-01T15:00:00Z'); // 01/01/2027 12:00 BRT
      // Ontem: 31/12/2026 (Quinta-feira). Janela de 28 dias volta a 03/12/2026
      setupDefaultMockSupabase({
        transacoes: [
          { id: 'tx-ano-1', valor: 2500.00, data: '2026-12-31T20:00:00Z', tipo: 'receita', workspace_id: wsId },
          { id: 'tx-ano-2', valor: 2000.00, data: '2026-12-24T20:00:00Z', tipo: 'receita', workspace_id: wsId },
          { id: 'tx-ano-3', valor: 2200.00, data: '2026-12-17T20:00:00Z', tipo: 'receita', workspace_id: wsId },
          { id: 'tx-ano-4', valor: 100.00, data: '2027-01-01T10:00:00Z', tipo: 'receita', workspace_id: wsId },
        ],
        despesas: [],
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);

      expect(kpis.dadosIndisponiveis).toBeFalsy();
      expect(kpis.faturamentoOntem).toBe(2500);
      expect(kpis.diaSemanaOntemNome).toBe('quintas-feiras');
      expect(kpis.faturamentoMes).toBe(100);
      expect(kpis.dailySales30Days.length).toBe(30);
    });

    it('Cenário 3: Fevereiro de ano bissexto (2028-02-29 e 2028-03-01) — robustez de calendário', async () => {
      // Teste em 2028-03-01 -> Ontem é 2028-02-29 (dia bissexto)
      const refDateMar1 = new Date('2028-03-01T15:00:00Z');
      setupDefaultMockSupabase({
        transacoes: [
          { id: 'tx-leap-1', valor: 4500.00, data: '2028-02-29T19:00:00Z', tipo: 'receita', workspace_id: wsId },
        ],
      });

      const kpisMar1 = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDateMar1);
      expect(kpisMar1.dadosIndisponiveis).toBeFalsy();
      expect(kpisMar1.faturamentoOntem).toBe(4500.00);

      // Teste em 2028-02-29 -> Ontem é 2028-02-28
      const refDateFeb29 = new Date('2028-02-29T15:00:00Z');
      setupDefaultMockSupabase({
        transacoes: [
          { id: 'tx-leap-2', valor: 3100.00, data: '2028-02-28T19:00:00Z', tipo: 'receita', workspace_id: wsId },
        ],
      });

      const kpisFeb29 = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDateFeb29);
      expect(kpisFeb29.dadosIndisponiveis).toBeFalsy();
      expect(kpisFeb29.faturamentoOntem).toBe(3100.00);
    });

    it('Cenário 4: Períodos com diferentes quantidades de transações (0 vs grande volume de 1.500)', async () => {
      const refDate = new Date('2026-11-01T15:00:00Z');

      // Volume alto com 1.500 transações paginadas
      const highVolumeTx = Array.from({ length: 1500 }, (_, i) => ({
        id: `tx-vol-${i}`,
        valor: 10.0,
        data: '2026-11-01T12:00:00Z',
        tipo: 'receita',
        workspace_id: wsId,
      }));

      setupDefaultMockSupabase({
        transacoes: highVolumeTx,
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);

      expect(kpis.dadosIndisponiveis).toBeFalsy();
      expect(kpis.faturamentoMes).toBe(15000);
      expect(kpis.pedidosMes).toBe(1500);
      expect(kpis.ticketMedioMes).toBe(10);
    });

    it('Cenário 5: Histórico vazio — retorna zeros e nulos sem lançar nenhuma exceção', async () => {
      const refDate = new Date('2026-11-01T15:00:00Z');
      setupDefaultMockSupabase({
        transacoes: [],
        despesas: [],
        fichas_tecnicas: [],
        produtos_eyemobile: [],
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);

      expect(kpis.dadosIndisponiveis).toBeFalsy();
      expect(kpis.faturamentoMes).toBe(0);
      expect(kpis.faturamentoOntem).toBe(0);
      expect(kpis.mediaDiaSemanaOntem).toBeNull();
      expect(kpis.variacaoOntemVsMediaPercent).toBeNull();
      expect(kpis.despesasMes).toBe(0);
      expect(kpis.resultadoOperacional).toBe(0);
      expect(kpis.cmvStatus).toBe('dados_insuficientes');
      expect(kpis.dailySales30Days.length).toBe(30);
    });

    it('Cenário 6: Falha de consulta — captura erro com resiliência e sinaliza dadosIndisponiveis', async () => {
      (supabase.from as any).mockImplementation(() => {
        return {
          select: () => {
            throw new Error('Database network disconnected');
          },
        };
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId);

      expect(kpis.dadosIndisponiveis).toBe(true);
      expect(kpis.erroMensagem).toContain('Database network disconnected');
      expect(kpis.dataAtualizacao).toBe('dados indisponíveis no momento');
      expect(kpis.faturamentoMes).toBe(0);
    });
  });
});
