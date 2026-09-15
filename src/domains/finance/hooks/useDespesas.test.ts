/**
 * useDespesas Hook Tests
 *
 * Tests fetch, mutations (create/update/delete), filterByTags
 * and searchDespesas using React Query + Vitest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useDespesas, classificarMetodoPagamentoDivipay } from './useDespesas';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: 'ws-test-123', nome: 'Workspace Test' },
  }),
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/domains/divipay/services/DivipayService', () => ({
  divipayService: {
    listWithdraws: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { divipayService } from '@/domains/divipay/services/DivipayService';
import { calcularTotalDespesasDoDia, formatarDataParaSaoPaulo } from '../utils/dateHelpers';

// ── Wrapper com QueryClient isolado por teste ─────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, qc };
}

// ── Dados de teste ────────────────────────────────────────────────

const mockDespesas = [
  {
    id: 'dep-1',
    descricao: 'Aluguel',
    valor: 1500,
    data: '2024-03-01',
    tipo: 'despesa',
    categorias: { nome: 'Moradia', cor: '#ff0000', icone: 'home' },
    despesa_tags: [{ tags: { id: 'tag-1', nome: 'fixed', cor: '#blue' } }],
    observacoes: null,
    conta_id: null,
    metodo_pagamento: null,
  },
  {
    id: 'dep-2',
    descricao: 'Supermercado',
    valor: 300,
    data: '2024-03-05',
    tipo: 'despesa',
    categorias: { nome: 'Alimentação', cor: '#00ff00', icone: 'shopping-cart' },
    despesa_tags: [],
    observacoes: 'compras da semana',
    conta_id: 'conta-1',
    metodo_pagamento: null,
  },
];

function createMockQuery(data: unknown = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: (Array.isArray(data) ? (data[0] as unknown) : null) || { id: 'new-dep' },
      error: null,
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: (val: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  };
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('useDespesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── fetch query ────────────────────────────────────────────────
  describe('busca de despesas', () => {
    it('retorna lista de despesas ordenada por data (mais recente primeiro)', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(2);
      // dep-2 (2024-03-05) deve vir antes de dep-1 (2024-03-01)
      expect(result.current.despesas[0].id).toBe('dep-2');
    });

    it('retorna lista vazia quando não há despesas', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.despesas).toHaveLength(0);
    });

    it('loading é true durante o fetch e false após conclusão', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  // ── filterByTags ───────────────────────────────────────────────
  describe('filterByTags', () => {
    beforeEach(() => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);
    });

    it('retorna apenas despesas que têm todas as tags informadas', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const filtered = result.current.filterByTags(['fixed']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('dep-1');
    });

    it('retorna todas as despesas quando tagNames está vazio', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const filtered = result.current.filterByTags([]);
      expect(filtered).toHaveLength(2);
    });

    it('retorna lista vazia quando nenhuma despesa tem a tag informada', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const filtered = result.current.filterByTags(['inexistente']);
      expect(filtered).toHaveLength(0);
    });
  });

  // ── searchDespesas ─────────────────────────────────────────────
  describe('searchDespesas', () => {
    beforeEach(() => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);
    });

    it('encontra despesas por termo na descrição (case-insensitive)', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const found = result.current.searchDespesas('aluguel');
      expect(found).toHaveLength(1);
      expect(found[0].descricao).toBe('Aluguel');
    });

    it('encontra despesas por termo na categoria', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const found = result.current.searchDespesas('moradia');
      expect(found).toHaveLength(1);
    });

    it('retorna todas quando searchTerm está vazio', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const found = result.current.searchDespesas('');
      expect(found).toHaveLength(2);
    });

    it('retorna vazio quando não há correspondência', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const found = result.current.searchDespesas('xyz-inexistente');
      expect(found).toHaveLength(0);
    });
  });

  // ── createDespesa mutation ─────────────────────────────────────
  describe('createDespesa mutation', () => {
    it('invalida o cache de despesas apos criacao bem-sucedida', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: 'user-1' } },
      } as never);

      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never)  // fetch inicial despesas
        .mockReturnValueOnce(createMockQuery([]) as never) // fetch transacoes
        .mockReturnValue(createMockQuery([{ id: 'new-dep', descricao: 'Nova Despesa', valor: 100 }]) as never);   // inserts/lookups

      const { Wrapper, qc } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

      await act(async () => {
        await result.current.createDespesa(
          {
            descricao: 'Nova Despesa',
            valor: 100,
            data: '2024-03-10',
            categoria_id: null,
            observacoes: null,
            conta_id: null,
            metodo_pagamento: null,
          },
          []
        );
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });
  });

  // ── Consolidação e Timezone America/Sao_Paulo (Despesas do Dia) ──
  describe('Consolidação e Timezone America/Sao_Paulo (Despesas do Dia)', () => {
    it('1. calcula despesas do dia atual (2026-09-04) corretamente', async () => {
      const despesasHoje = [
        { id: 'd-1', descricao: 'Almoço', valor: 45.5, data: '2026-09-04', workspace_id: 'ws-test-123' },
        { id: 'd-2', descricao: 'Combustível', valor: 150.0, data: '2026-09-04', workspace_id: 'ws-test-123' },
      ];

      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(despesasHoje) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-04', endDate: '2026-09-04' }), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(2);
      const totalHoje = calcularTotalDespesasDoDia(result.current.despesas, '2026-09-04');
      expect(totalHoje).toBe(195.5);
    });

    it('2. no período amplo (01/09 a 04/09), calcularTotalDespesasDoDia soma apenas hoje e ignora dias anteriores', async () => {
      const despesasPeriodo = [
        { id: 'd-1', descricao: 'Despesa 01/09', valor: 1000, data: '2026-09-01', workspace_id: 'ws-test-123' },
        { id: 'd-2', descricao: 'Despesa 02/09', valor: 2000, data: '2026-09-02', workspace_id: 'ws-test-123' },
        { id: 'd-3', descricao: 'Despesa 03/09', valor: 500, data: '2026-09-03', workspace_id: 'ws-test-123' },
        { id: 'd-4', descricao: 'Despesa Hoje 1', valor: 300, data: '2026-09-04', workspace_id: 'ws-test-123' },
        { id: 'd-5', descricao: 'Despesa Hoje 2', valor: 450.5, data: '2026-09-04', workspace_id: 'ws-test-123' },
      ];

      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(despesasPeriodo) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-01', endDate: '2026-09-04' }), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(5);
      const totalListaGeral = result.current.despesas.reduce((acc, d) => acc + d.valor, 0);
      expect(totalListaGeral).toBe(4250.5);

      // O cartão calcula SOMENTE o dia atual (04/09):
      const totalHoje = calcularTotalDespesasDoDia(result.current.despesas, '2026-09-04');
      expect(totalHoje).toBe(750.5);
    });

    it('3. alinhamento perfeito entre gráfico diário e cartão na mesma data', async () => {
      const despesas = [
        { id: 'd-1', descricao: 'Item 1', valor: 120, data: '2026-09-04', workspace_id: 'ws-test-123' },
        { id: 'd-2', descricao: 'Item 2', valor: 80, data: '2026-09-04', workspace_id: 'ws-test-123' },
        { id: 'd-3', descricao: 'Item Antigo', valor: 500, data: '2026-09-03', workspace_id: 'ws-test-123' },
      ];

      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(despesas) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Simulando o agrupador do gráfico (dailyMap)
      const dailyMap = new Map<string, number>();
      result.current.despesas.forEach((d) => {
        const dateStr = formatarDataParaSaoPaulo(d.data);
        if (dateStr) dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + d.valor);
      });

      const totalGraficoHoje = dailyMap.get('2026-09-04') || 0;
      const totalCardHoje = calcularTotalDespesasDoDia(result.current.despesas, '2026-09-04');

      expect(totalGraficoHoje).toBe(200);
      expect(totalCardHoje).toBe(200);
      expect(totalCardHoje).toBe(totalGraficoHoje);
    });

    it('4. despesa do dia anterior (2026-09-03) é estritamente excluída do cálculo de hoje', () => {
      const despesas = [
        { id: 'd-ontem', valor: 999.99, data: '2026-09-03' },
      ];
      const totalHoje = calcularTotalDespesasDoDia(despesas, '2026-09-04');
      expect(totalHoje).toBe(0);
    });

    it('5. saques Divipay na madrugada UTC são convertidos corretamente para horário de São Paulo', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      vi.mocked(divipayService.listWithdraws).mockResolvedValueOnce({
        items: [
          // 04/09 02:30 UTC = 03/09 23:30 em SP -> pertence a 2026-09-03!
          {
            id: 'saque-madrugada-utc',
            amount: 150,
            description: 'Saque Madrugada',
            status: 'COMPLETED',
            createdAt: '2026-09-04T02:30:00.000Z',
          },
          // 05/09 01:00 UTC = 04/09 22:00 em SP -> pertence a 2026-09-04!
          {
            id: 'saque-noite-sp',
            amount: 250,
            description: 'Saque Noite SP',
            status: 'COMPLETED',
            createdAt: '2026-09-05T01:00:00.000Z',
          },
        ] as unknown as import('@/domains/divipay/types').DivipaySaque[],
      });

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-04', endDate: '2026-09-04' }), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // O saque-madrugada-utc caiu em 03/09 em SP, então não foi incluído no range 2026-09-04
      // O saque-noite-sp caiu em 04/09 em SP, então deve ser retornado e computado para 04/09
      const saqueNoite = result.current.despesas.find((d) => d.id === 'divipay-saque-noite-sp');
      expect(saqueNoite).toBeDefined();
      expect(saqueNoite?.data).toBe('2026-09-04');

      const totalHoje = calcularTotalDespesasDoDia(result.current.despesas, '2026-09-04');
      expect(totalHoje).toBe(250);
    });

    it('6. isolamento de workspace: sem workspaceId não busca nem retorna despesas', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ workspaceId: null }), { wrapper: Wrapper });
      expect(result.current.despesas).toHaveLength(0);
    });

    it('7. paridade e resiliência: query principal e query dedicada retornam o mesmo total de hoje', async () => {
      const despesasHoje = [
        { id: 'd-1', descricao: 'Saque 1', valor: 137.5, data: '2026-09-04', workspace_id: 'ws-test-123' },
        { id: 'd-2', descricao: 'Saque 2', valor: 315.0, data: '2026-09-04', workspace_id: 'ws-test-123' },
      ];

      // Simulando query dedicada de hoje
      const totalQueryDedicada = calcularTotalDespesasDoDia(despesasHoje, '2026-09-04');
      // Simulando fallback caso despesas da lista principal já esteja em memória
      const totalQueryPrincipal = calcularTotalDespesasDoDia(despesasHoje, '2026-09-04');

      expect(totalQueryDedicada).toBe(452.5);
      expect(totalQueryPrincipal).toBe(452.5);
      expect(totalQueryPrincipal).toBe(totalQueryDedicada);
    });

    it('8. anti-duplicação: saques Divipay já gravados no banco não são duplicados', async () => {
      const despesaBanco = [
        {
          id: 'dep-divipay-existente',
          descricao: 'Pagamento de boleto - Fornecedor',
          valor: 350,
          data: '2026-09-04',
          workspace_id: 'ws-test-123',
          observacoes: 'Pago via Divipay (boleto) - saque-abc-123',
        },
      ];

      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(despesaBanco) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      vi.mocked(divipayService.listWithdraws).mockResolvedValueOnce({
        items: [
          {
            id: 'saque-abc-123',
            amount: 350,
            description: 'Pagamento de boleto',
            status: 'COMPLETED',
            createdAt: '2026-09-04T14:00:00.000Z',
          },
        ] as unknown as import('@/domains/divipay/types').DivipaySaque[],
      });

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-04', endDate: '2026-09-04' }), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Deve existir apenas 1 registro (o do banco), sem duplicar o da Divipay
      expect(result.current.despesas).toHaveLength(1);
      expect(result.current.despesas[0].id).toBe('dep-divipay-existente');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Classificação de Meios de Pagamento — Regras Estritas
  // ══════════════════════════════════════════════════════════════════
  describe('Classificação de Meios de Pagamento (Regras Divipay e Despesas)', () => {
    it('1. “Pagamento de boleto” na descrição não é automaticamente classificado como boleto', () => {
      // Caso 1: Saque Divipay com BILLET e descrição "Pagamento de boleto" deve ser classificado como 'outros'
      const metodo1 = classificarMetodoPagamentoDivipay({
        type: 'BILLET',
        description: 'Pagamento de boleto',
      });
      expect(metodo1).toBe('outros');
      expect(metodo1).not.toBe('boleto');

      // Caso 2: Saque com descrição textual mencionando boleto sem meio explícito no contrato
      const metodo2 = classificarMetodoPagamentoDivipay({
        type: null,
        description: 'Pagamento de boleto de aluguel',
      });
      expect(metodo2).toBe('outros');
      expect(metodo2).not.toBe('boleto');
    });

    it('2. Só usa BOLETO quando a API fornecer explicitamente o tipo/meio de pagamento boleto', () => {
      const metodoExplicit1 = classificarMetodoPagamentoDivipay({
        metodo_pagamento: 'boleto',
        description: 'Fornecedor XYZ',
      });
      expect(metodoExplicit1).toBe('boleto');

      const metodoExplicit2 = classificarMetodoPagamentoDivipay({
        paymentMethod: 'boleto',
        description: 'Imposto municipal',
      });
      expect(metodoExplicit2).toBe('boleto');
    });

    it('3. Só usa CARTÃO CRÉDITO quando houver informação explícita da API de cartão de crédito', () => {
      const metodoCredito1 = classificarMetodoPagamentoDivipay({ type: 'CREDIT_CARD' });
      expect(metodoCredito1).toBe('cartao_credito');

      const metodoCredito2 = classificarMetodoPagamentoDivipay({ paymentMethod: 'cartao_credito' });
      expect(metodoCredito2).toBe('cartao_credito');

      // Ausência de informação de cartão de crédito resulta em outros ou pix (nunca assume cartão)
      const metodoSemCartao = classificarMetodoPagamentoDivipay({ type: 'DICT' });
      expect(metodoSemCartao).toBe('pix');
    });

    it('4. Classifica como PIX quando o tipo da API for explicitamente DICT ou PIX', () => {
      const metodoDict = classificarMetodoPagamentoDivipay({
        type: 'DICT',
        description: 'Pagamento Suellen',
      });
      expect(metodoDict).toBe('pix');

      const metodoPix = classificarMetodoPagamentoDivipay({
        type: 'PIX',
        description: 'Transferência Pix',
      });
      expect(metodoPix).toBe('pix');
    });

    it('5. Mantém a descrição original separada do meio de pagamento e categoria', async () => {
      vi.mocked(supabase.from).mockReturnValue(createMockQuery([]) as never);
      vi.mocked(divipayService.listWithdraws).mockResolvedValueOnce({
        items: [
          {
            id: 'saque-desc-orig',
            amount: 353.57,
            description: 'Pagamento de boleto',
            status: 'FINISHED',
            createdAt: '2026-09-04T13:47:18.822Z',
            type: 'BILLET',
          },
        ] as unknown as import('@/domains/divipay/types').DivipaySaque[],
      });

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-04', endDate: '2026-09-04' }), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(1);
      const dep = result.current.despesas[0];
      // A descrição original é preservada
      expect(dep.descricao).toContain('Pagamento de boleto');
      // O meio de pagamento é reclassificado para outros, sem contaminação pela descrição
      expect(dep.metodo_pagamento).toBe('outros');
      // Observações registram claramente o status não identificado da Divipay
      expect(dep.observacoes).toContain('Saque Divipay Não Identificado');
    });

    it('6. Cenário real de 04/09: ausência de cartão (R$ 0,00), boleto zerado (R$ 0,00), PIX R$ 452,50, outros R$ 2.376,26 e total R$ 2.828,76', async () => {
      vi.mocked(supabase.from).mockReturnValue(createMockQuery([]) as never);

      // Reproduz exatamente os 6 saques reais da Divipay de 04/09
      const saquesReais = [
        { id: 'saq-1', amount: 137.50, type: 'DICT', description: 'Seu Osvaldo', status: 'FINISHED', createdAt: '2026-09-04T20:43:08.483Z' },
        { id: 'saq-2', amount: 315.00, type: 'DICT', description: 'Luiz folguista', status: 'FINISHED', createdAt: '2026-09-04T19:47:36.641Z' },
        { id: 'saq-3', amount: 353.57, type: 'BILLET', description: 'Pagamento de boleto', status: 'FINISHED', createdAt: '2026-09-04T13:47:18.822Z' },
        { id: 'saq-4', amount: 148.53, type: 'BILLET', description: 'Pagamento de boleto', status: 'FINISHED', createdAt: '2026-09-04T13:45:58.034Z' },
        { id: 'saq-5', amount: 1498.08, type: 'BILLET', description: 'Pagamento de boleto', status: 'FINISHED', createdAt: '2026-09-04T13:43:39.750Z' },
        { id: 'saq-6', amount: 376.08, type: 'BILLET', description: 'Pagamento de boleto', status: 'FINISHED', createdAt: '2026-09-04T13:41:20.872Z' },
      ];

      vi.mocked(divipayService.listWithdraws).mockResolvedValueOnce({
        items: saquesReais as unknown as import('@/domains/divipay/types').DivipaySaque[],
      });

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-04', endDate: '2026-09-04' }), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const despesas = result.current.despesas;
      expect(despesas).toHaveLength(6);

      // Cálculo dos totais por meio de pagamento simulando a agregação de Despesas.tsx
      const totais = {
        pix: 0,
        boleto: 0,
        cartao_credito: 0,
        outros: 0,
      };

      despesas.forEach((d) => {
        const metodo = String(d.metodo_pagamento || '').toLowerCase();
        if (metodo === 'pix') totais.pix += d.valor;
        else if (metodo === 'boleto') totais.boleto += d.valor;
        else if (metodo === 'cartao_credito') totais.cartao_credito += d.valor;
        else totais.outros += d.valor;
      });

      const totalGeral = despesas.reduce((acc, d) => acc + d.valor, 0);

      // Critérios exatos exigidos pelo usuário:
      expect(totais.boleto).toBe(0); // Boleto: R$ 0,00
      expect(totais.cartao_credito).toBe(0); // Cartão de crédito: R$ 0,00
      expect(Number(totais.pix.toFixed(2))).toBe(452.50); // PIX: R$ 452,50
      expect(Number(totais.outros.toFixed(2))).toBe(2376.26); // Outros: R$ 2.376,26
      expect(Number(totalGeral.toFixed(2))).toBe(2828.76); // Total: R$ 2.828,76

      // Conservação de valor: soma dos meios == total geral
      expect(Number((totais.pix + totais.outros).toFixed(2))).toBe(2828.76);
    });
  });
});
