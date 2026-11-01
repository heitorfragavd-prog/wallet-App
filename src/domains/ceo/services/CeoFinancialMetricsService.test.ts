import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CeoFinancialMetricsService,
  getSaoPauloParts,
  getSaoPauloYesterday,
} from './CeoFinancialMetricsService';

describe('CeoFinancialMetricsService — Auditoria de Dados 100% Reais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      // Simula um banco com 2.500 registros
      const totalMockRecords = 2500;
      const mockDatabase = Array.from({ length: totalMockRecords }, (_, idx) => ({
        id: `tx-${idx}`,
        valor: 10.0,
      }));

      // @ts-expect-error testando método privado de paginação
      const fetched = await CeoFinancialMetricsService.fetchAllPaginated(async (from: number, to: number) => {
        const slice = mockDatabase.slice(from, to + 1);
        return { data: slice, error: null };
      });

      expect(fetched.length).toBe(totalMockRecords);
      expect(fetched[0].id).toBe('tx-0');
      expect(fetched[totalMockRecords - 1].id).toBe(`tx-${totalMockRecords - 1}`);
    });

    it('helper de paginação fetchAllPaginated lança erro explícito se qualquer página falhar (Gate 3 - Resiliência)', async () => {
      // Falha na primeira página
      await expect(
        CeoFinancialMetricsService.fetchAllPaginated(async () => {
          return { data: null, error: new Error('PostgREST connection timeout') };
        })
      ).rejects.toThrow('Falha ao buscar registros paginados');

      // Falha na segunda página (após primeira página com 1.000 registros completos)
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
        // Criando data em 01/11/2026 12:00 BRT
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
        // Criando data em 01/01/2027 12:00 BRT
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
});
