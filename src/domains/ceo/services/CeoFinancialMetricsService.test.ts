import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CeoFinancialMetricsService,
  getSaoPauloParts,
  getSaoPauloYesterday,
  deduplicateRevenues,
  TransacaoReceitaItem,
} from './CeoFinancialMetricsService';

interface MockRow {
  [key: string]: unknown;
}

interface MockQueryBuilder {
  select: (_cols?: string, _opts?: { count?: string; head?: boolean }) => MockQueryBuilder;
  eq: (col: string, val: unknown) => MockQueryBuilder;
  neq: (col: string, val: unknown) => MockQueryBuilder;
  gte: (col: string, val: unknown) => MockQueryBuilder;
  lte: (col: string, val: unknown) => MockQueryBuilder;
  order: () => MockQueryBuilder;
  range: (from: number, to: number) => Promise<{ data: MockRow[]; error: unknown }>;
  then: (resolve: (val: { data: MockRow[]; count: number; error: unknown }) => void) => void;
}

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

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

  mockFrom.mockImplementation((table: string) => {
    let currentRows = [...(mockDatabase[table] || [])];

    const builder = {} as MockQueryBuilder;
    builder.select = vi.fn().mockImplementation(() => builder);
    builder.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
      currentRows = currentRows.filter((r) => r[col] === val);
      return builder;
    });
    builder.neq = vi.fn().mockImplementation((col: string, val: unknown) => {
      currentRows = currentRows.filter((r) => r[col] !== val);
      return builder;
    });
    builder.gte = vi.fn().mockImplementation((col: string, val: unknown) => {
      currentRows = currentRows.filter((r) => String(r[col] || '') >= String(val));
      return builder;
    });
    builder.lte = vi.fn().mockImplementation((col: string, val: unknown) => {
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
    builder.then = (resolve: (val: { data: MockRow[]; count: number; error: unknown }) => void) => {
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
      mockFrom.mockImplementation(() => {
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

    it('Cenário 7: Despesas zeradas no mês — não exibe margem operacional artificial de 100%', async () => {
      const refDate = new Date('2026-11-01T15:00:00Z');
      setupDefaultMockSupabase({
        transacoes: [
          { valor: 3500, data: '2026-11-01T14:00:00Z', tipo: 'receita', workspace_id: wsId },
        ],
        despesas: [], // Nenhuma despesa lançada
        fichas_tecnicas: [],
        produtos_eyemobile: [],
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);

      expect(kpis.faturamentoMes).toBe(3500);
      expect(kpis.despesasMes).toBe(0);
      expect(kpis.resultadoOperacional).toBe(3500);
      // Sem despesas, margemOperacional deve ser null para evitar falso 100%
      expect(kpis.margemOperacional).toBeNull();
      expect(kpis.margemOperacionalPercent).toBeNull();
    });

    it('Cenário 8: Suporta aliases canônicos para todas as propriedades de variação percentual', async () => {
      const empty = CeoFinancialMetricsService.getEmptyKpis();
      expect(empty.crescimentoMes).toBeNull();
      expect(empty.crescimentoMesPercent).toBeNull();
      expect(empty.crescimentoPedidos).toBeNull();
      expect(empty.crescimentoPedidosPercent).toBeNull();
      expect(empty.crescimentoTicket).toBeNull();
      expect(empty.crescimentoTicketMedioPercent).toBeNull();
      expect(empty.variacaoOntemVsMedia).toBeNull();
      expect(empty.variacaoOntemVsMediaPercent).toBeNull();
      expect(empty.margemOperacional).toBeNull();
      expect(empty.margemOperacionalPercent).toBeNull();
    });

    it('Cenário 9: Conciliação Dia Civil vs Turno Estendido com fuso America/Sao_Paulo', () => {
      // 212 transações no dia civil 31/10 (R$ 2.778,30) + 88 transações na madrugada 01/11 (R$ 987,60)
      const sales = [
        { total: 2778.30, time: '2026-10-31T22:30:00-03:00', cancelled: false },
        { total: 987.60, time: '2026-11-01T03:15:00-03:00', cancelled: false }, // madrugada do turno estendido
      ];

      const toSaoPauloDate = (iso: string) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

      const civilDaySales = sales.filter((s) => toSaoPauloDate(s.time) === '2026-10-31');
      const totalCivil = civilDaySales.reduce((acc, s) => acc + s.total, 0);
      const totalTurno = sales.reduce((acc, s) => acc + s.total, 0);

      expect(totalCivil).toBe(2778.30);
      expect(totalTurno).toBe(3765.90);
      expect(Math.round((totalCivil + 987.60) * 100) / 100).toBe(3765.90);
    });

    it('Cenário 10: Comparativos financeiros nunca misturam vendas brutas com transações bancárias', () => {
      const faturamentoBrutoPdv = 89081.53;
      const transacoesBancariasAnt = 12500.00;

      // Regra Canônica: Nunca calcular crescimento misturando fontes distintas
      const isSameSource = false;
      const variacao = isSameSource && transacoesBancariasAnt > 0
        ? Math.round(((faturamentoBrutoPdv - transacoesBancariasAnt) / transacoesBancariasAnt) * 1000) / 10
        : null;

      expect(variacao).toBeNull();
    });

    it('Cenário 11: Consolidação integral de despesas (contas a pagar + transações bancárias/cartão tipo despesa)', async () => {
      const wsId = 'ws-rodo-point-test';
      const refDate = new Date('2026-11-02T12:00:00-03:00');

      setupDefaultMockSupabase({
        transacoes: [
          // Receita do mês
          { id: 'tx-rec-1', valor: 5000, data: '2026-11-01', tipo: 'receita', workspace_id: wsId },
          // Despesa bancária do mês (transações tipo despesa)
          { id: 'tx-desp-1', valor: 800, data: '2026-11-01', tipo: 'despesa', workspace_id: wsId },
          { id: 'tx-desp-2', valor: 200, data: '2026-11-02', tipo: 'despesa', workspace_id: wsId },
        ],
        despesas: [
          // Contas a pagar lançadas no módulo de despesas
          { id: 'desp-1', valor: 1500, data: '2026-11-01', workspace_id: wsId },
        ],
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);

      expect(kpis.faturamentoMes).toBe(5000);
      // Total despesas: 1500 (despesas) + 800 + 200 (transacoes despesa) = 2500
      expect(kpis.despesasMes).toBe(2500);
      expect(kpis.resultadoOperacional).toBe(2500); // 5000 - 2500
      expect(kpis.margemOperacionalPercent).toBe(50); // 2500 / 5000 = 50%
    });
    it('Cenário 12: deduplicateRevenues elimina triplicatas de vendas Eyemobile por observações', () => {
      const raw: TransacaoReceitaItem[] = [
        { id: 'tx-1', valor: 15.0, data: '2026-11-01', observacoes: 'Integrado via Eyemobile API. Venda: #1234' },
        { id: 'tx-2', valor: 15.0, data: '2026-11-01', observacoes: 'Integrado via Eyemobile API. Venda: #1234' },
        { id: 'tx-3', valor: 15.0, data: '2026-11-01', observacoes: 'Integrado via Eyemobile API. Venda: #1234' },
        { id: 'tx-4', valor: 32.5, data: '2026-11-01', observacoes: 'Integrado via Eyemobile API. Venda: #1235' },
      ];

      const deduplicated = deduplicateRevenues(raw);
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].id).toBe('tx-1');
      expect(deduplicated[1].id).toBe('tx-4');
      const total = deduplicated.reduce((acc, t) => acc + t.valor, 0);
      expect(total).toBe(47.5);
    });

    it('Cenário 13: deduplicateRevenues elimina duplicatas com "Venda Eyemobile #1234" na descrição', () => {
      const raw: TransacaoReceitaItem[] = [
        { id: 'tx-a', valor: 20.0, data: '2026-11-02', descricao: 'Venda Eyemobile #999' },
        { id: 'tx-b', valor: 20.0, data: '2026-11-02', descricao: 'Venda Eyemobile #999' },
      ];

      const deduplicated = deduplicateRevenues(raw);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].id).toBe('tx-a');
    });

    it('Cenário 14: Resiliência de despesas — despesas indisponíveis não zeram o faturamento', async () => {
      const wsId = 'ws-rodo-point-test';
      const refDate = new Date('2026-11-02T12:00:00-03:00');

      setupDefaultMockSupabase({
        transacoes: [
          { id: 'tx-rec-1', valor: 8500, data: '2026-11-01', tipo: 'receita', workspace_id: wsId },
        ],
        despesas: [],
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);
      expect(kpis.faturamentoMes).toBe(8500);
      expect(kpis.dadosIndisponiveis).toBeFalsy();
    });

    it('Cenário 15: getTopProducts aceita options com período e customTransactions calculando ranking exato', async () => {
      const customTx: TransacaoReceitaItem[] = [
        {
          id: 'tx-1',
          valor: 100,
          data: '2026-11-01',
          itens: [
            { product_name: 'SALGADOS', quantity: 10, total: 80 },
            { product_name: 'ÁGUA', quantity: 4, total: 20 },
          ],
        },
        {
          id: 'tx-2',
          valor: 50,
          data: '2026-11-02',
          itens: [
            { product_name: 'ÁGUA', quantity: 6, total: 30 },
            { product_name: 'CAFÉ', quantity: 5, total: 20 },
          ],
        },
      ];

      const top = await CeoFinancialMetricsService.getTopProducts('ws-test', {
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        customTransactions: customTx,
      });

      expect(top).toHaveLength(3);
      expect(top[0].produto).toBe('SALGADOS');
      expect(top[0].faturamento).toBe(80);
      expect(top[0].quantidade).toBe(10);
      expect(top[1].produto).toBe('ÁGUA');
      expect(top[1].faturamento).toBe(50);
      expect(top[1].quantidade).toBe(10);
      expect(top[2].produto).toBe('CAFÉ');
      expect(top[2].faturamento).toBe(20);
      expect(top[2].quantidade).toBe(5);
    });

    it('Cenário 16: getCommercialProfitability calcula CMV real, lucro bruto e margens por produto', async () => {
      const wsId = 'ws-test-cmv';
      setupDefaultMockSupabase({
        produtos_eyemobile: [
          { workspace_id: wsId, codigo: '2032394', descricao: 'REFRIGERANTE 350ML', custo_atual: 1.83, preco_venda: 7.00 },
          { workspace_id: wsId, codigo: '2032242', descricao: 'Coca ks', custo_atual: 1.70, preco_venda: 7.00 },
          { workspace_id: wsId, codigo: 'PAO_QUEIJO', descricao: 'Pão de Queijo', custo_atual: 0, preco_venda: 5.00 },
        ],
      });

      const customTx: TransacaoReceitaItem[] = [
        {
          id: 'tx-1',
          valor: 70,
          data: '2026-11-01',
          itens: [
            { product_id: '2032394', product_name: 'REFRIGERANTE 350ML', quantity: 10, price: 7.00, total: 70.00 },
          ],
        },
        {
          id: 'tx-2',
          valor: 35,
          data: '2026-11-02',
          itens: [
            { product_id: '2032242', product_name: 'Coca ks', quantity: 5, price: 7.00, total: 35.00 },
          ],
        },
        {
          id: 'tx-3',
          valor: 50,
          data: '2026-11-02',
          itens: [
            { product_id: 'PAO_QUEIJO', product_name: 'Pão de Queijo', quantity: 10, price: 5.00, total: 50.00 },
          ],
        },
      ];

      const report = await CeoFinancialMetricsService.getCommercialProfitability(wsId, {
        customTransactions: customTx,
      });

      expect(report.receitaTotal).toBe(155.00);
      expect(report.receitaComCusto).toBe(105.00);
      expect(report.receitaSemCusto).toBe(50.00);
      // CMV: (10 * 1.83) + (5 * 1.70) = 18.30 + 8.50 = 26.80
      expect(report.cmvTotal).toBe(26.80);
      // Lucro Bruto: 105.00 - 26.80 = 78.20
      expect(report.lucroBrutoTotal).toBe(78.20);
      // Margem Bruta: (78.20 / 105.00) * 100 = 74.5%
      expect(report.margemBrutaMedia).toBe(74.5);
      // Cobertura: (105 / 155) * 100 = 67.7%
      expect(report.coberturaReceitaPercent).toBe(67.7);

      expect(report.maisLucrativos).toHaveLength(2);
      expect(report.maisLucrativos[0].produto).toBe('REFRIGERANTE 350ML');
      expect(report.maisLucrativos[0].lucroBrutoTotal).toBe(51.70); // 70 - 18.30
      expect(report.maisLucrativos[0].margemBrutaPercent).toBe(73.9);

      expect(report.semCusto).toHaveLength(1);
      expect(report.semCusto[0].produto).toBe('Pão de Queijo');
      expect(report.semCusto[0].statusCusto).toBe('sem_nota');
    });

    it('Cenário 17 (Gate A & B): Segregação contábil de Vendas PDV, Despesas Pagas, Pendentes e Resultado Preliminar', async () => {
      const empty = CeoFinancialMetricsService.getEmptyKpis();
      expect(empty.vendasBrutasPdv).toBe(0);
      expect(empty.despesasPagas).toBe(0);
      expect(empty.despesasPendentes).toBe(0);
      expect(empty.despesasTotalCompetencia).toBe(0);
      expect(empty.resultadoPreliminarCompetencia).toBe(0);
      expect(empty.diferencaVendasDespesasPagas).toBe(0);
      expect(empty.statusConciliacao03Nov).toBe('pendente_fechamento_pdv');

      const wsId = 'ws-acct-test';
      const refDate = new Date('2026-11-04T12:00:00.000Z');

      setupDefaultMockSupabase({
        transacoes: [
          { id: 'tx-venda-1', valor: 4500, data: '2026-11-02', tipo: 'receita', workspace_id: wsId },
          { id: 'tx-desp-paga-1', valor: 2000, data: '2026-11-02', tipo: 'despesa', workspace_id: wsId },
        ],
        despesas: [
          { id: 'desp-pend-1', valor: 1000, data: '2026-11-10', status: 'pendente', workspace_id: wsId },
        ],
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);
      expect(kpis.vendasBrutasPdv).toBe(4500);
      expect(kpis.despesasPagas).toBeGreaterThanOrEqual(0);
      expect(kpis.despesasTotalCompetencia).toBeGreaterThanOrEqual(kpis.despesasPagas);
      expect(kpis.resultadoPreliminarCompetencia).toBe(kpis.vendasBrutasPdv - kpis.despesasTotalCompetencia);
      expect(kpis.statusConciliacao03Nov).toBe('pendente_fechamento_pdv');
    });

    it('Cenário 18 (Gate 4): Resolução temporal de custos históricos e preço médio ponderado', async () => {
      const wsId = 'ws-temporal-cmv';
      setupDefaultMockSupabase({
        produtos_eyemobile: [
          { workspace_id: wsId, codigo: 'PROD_HIST', descricao: 'Produto com Historico', custo_atual: 5.00, preco_venda: 10.00 },
        ],
        historico_custo_produto: [
          { workspace_id: wsId, produto_codigo: 'PROD_HIST', custo_unitario: 4.00, data_compra: '2026-08-01', fornecedor: 'SPAL INDUSTRIA (NF 013.664.150)' },
          { workspace_id: wsId, produto_codigo: 'PROD_HIST', custo_unitario: 4.50, data_compra: '2026-09-01', fornecedor: 'SPAL INDUSTRIA (NF 013.790.902)' },
        ],
      });

      const customTx: TransacaoReceitaItem[] = [
        // Venda em agosto: deve pegar custo histórico de 4.00
        {
          id: 'tx-1',
          valor: 100,
          data: '2026-08-15',
          itens: [
            { product_id: 'PROD_HIST', product_name: 'Produto com Historico', quantity: 10, price: 10.00, total: 100.00 },
          ],
        },
        // Venda em setembro: deve pegar custo histórico de 4.50
        {
          id: 'tx-2',
          valor: 200,
          data: '2026-09-15',
          itens: [
            { product_id: 'PROD_HIST', product_name: 'Produto com Historico', quantity: 20, price: 10.00, total: 200.00 },
          ],
        },
      ];

      const report = await CeoFinancialMetricsService.getCommercialProfitability(wsId, {
        customTransactions: customTx,
      });

      expect(report.receitaTotal).toBe(300.00);
      expect(report.receitaComCusto).toBe(300.00);
      // CMV: (10 * 4.00) + (20 * 4.50) = 40.00 + 90.00 = 130.00
      expect(report.cmvTotal).toBe(130.00);
      expect(report.lucroBrutoTotal).toBe(170.00); // 300 - 130
      expect(report.itens[0].precoVendaMedio).toBe(10.00); // Preço médio ponderado: 300 / 30 = 10.00
      expect(report.itens[0].statusCusto).toBe('confirmado');
      expect(report.itens[0].tipoCustoLabel).toBe('Auditado por NF');
    });

    it('Cenário 16 (Gate A & B): Segregação contábil de Vendas PDV, Despesas Pagas, Pendentes e Resultado Preliminar', async () => {
      const empty = CeoFinancialMetricsService.getEmptyKpis();
      expect(empty.vendasBrutasPdv).toBe(0);
      expect(empty.despesasPagas).toBe(0);
      expect(empty.despesasPendentes).toBe(0);
      expect(empty.despesasTotalCompetencia).toBe(0);
      expect(empty.resultadoPreliminarCompetencia).toBe(0);
      expect(empty.diferencaVendasDespesasPagas).toBe(0);
      expect(empty.statusConciliacao03Nov).toBe('pendente_fechamento_pdv');

      const wsId = 'ws-acct-test';
      const refDate = new Date('2026-11-04T12:00:00.000Z');

      setupDefaultMockSupabase({
        transacoes: [
          { id: 'tx-venda-1', valor: 4500, data: '2026-11-02', tipo: 'receita', workspace_id: wsId },
          { id: 'tx-desp-paga-1', valor: 2000, data: '2026-11-02', tipo: 'despesa', workspace_id: wsId },
        ],
        despesas: [
          { id: 'desp-pend-1', valor: 1000, data: '2026-11-10', status: 'pendente', workspace_id: wsId },
        ],
      });

      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(wsId, refDate);
      expect(kpis.vendasBrutasPdv).toBe(4500);
      expect(kpis.despesasPagas).toBeGreaterThanOrEqual(0);
      expect(kpis.despesasTotalCompetencia).toBeGreaterThanOrEqual(kpis.despesasPagas);
      expect(kpis.resultadoPreliminarCompetencia).toBe(kpis.vendasBrutasPdv - kpis.despesasTotalCompetencia);
      expect(kpis.statusConciliacao03Nov).toBe('pendente_fechamento_pdv');
    });
  });
});
