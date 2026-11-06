import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CeoFinancialMetricsService,
  classificarNaturezaResultado,
  classificarCentroCustoOperacional,
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
  not: (col: string, op: string, val: unknown) => MockQueryBuilder;
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
  historico_custo_produto: [],
  delivery_orders: [],
};

function setupMockDatabase(db: Partial<typeof mockDatabase> = {}) {
  mockDatabase = {
    transacoes: [],
    despesas: [],
    fichas_tecnicas: [],
    produtos_eyemobile: [],
    historico_custo_produto: [],
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
      currentRows = currentRows.filter((r) => {
        const rowVal = String(r[col] || '');
        return rowVal >= String(val || '');
      });
      return builder;
    });
    builder.lte = vi.fn().mockImplementation((col: string, val: unknown) => {
      currentRows = currentRows.filter((r) => {
        const rowVal = String(r[col] || '');
        return rowVal <= String(val || '');
      });
      return builder;
    });
    builder.not = vi.fn().mockImplementation(() => builder);
    builder.order = vi.fn().mockImplementation(() => builder);

    builder.range = vi.fn().mockImplementation((from: number, to: number) => {
      const paged = currentRows.slice(from, to + 1);
      return Promise.resolve({ data: paged, error: null });
    });

    builder.then = (resolve: (val: { data: MockRow[]; count: number; error: unknown }) => void) => {
      resolve({ data: currentRows, count: currentRows.length, error: null });
    };

    return builder;
  });
}

describe('CeoNetProfit — Auditoria Canônica do Lucro Líquido Real', () => {
  const testWorkspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Classificação Contábil e Prevenção de Duplicidades', () => {
    it('segrega compras de estoque de revenda para não debitar duplamente com CMV', () => {
      expect(classificarNaturezaResultado('Estoque', 'Compra de bebidas atacado SPAL')).toBe('compra_estoque');
      expect(classificarNaturezaResultado('Mercadorias para revenda', 'Fardo Coca-Cola 350ml')).toBe('compra_estoque');
      expect(classificarNaturezaResultado('Fornecedores de Bebidas', 'Caixa de cerveja Heineken')).toBe('compra_estoque');
    });

    it('identifica retiradas de sócios como destinação de resultado patrimonial', () => {
      expect(classificarNaturezaResultado('Sócios', 'Retirada de Pró-labore dos Sócios')).toBe('retirada_socios');
      expect(classificarNaturezaResultado('Financeiro', 'Distribuição de Lucros do mês')).toBe('retirada_socios');
      expect(classificarNaturezaResultado('Geral', 'Adiantamento a Sócios')).toBe('retirada_socios');
    });

    it('classifica despesas financeiras e tributos sobre resultado separadamente', () => {
      expect(classificarNaturezaResultado('Bancário', 'Tarifa bancária pacote conta')).toBe('financeira');
      expect(classificarNaturezaResultado('Bancário', 'Juros bancários limite cheque especial')).toBe('financeira');
      expect(classificarNaturezaResultado('Tributos', 'IRPJ sobre o Lucro')).toBe('tributo_resultado');
      expect(classificarNaturezaResultado('Tributos', 'CSLL trimestral')).toBe('tributo_resultado');
    });

    it('classifica despesas operacionais em centros de custos canônicos', () => {
      expect(classificarCentroCustoOperacional('RH', 'Salário atendente balcão')).toBe('Pessoal & Pró-labore');
      expect(classificarCentroCustoOperacional('Imóvel', 'Aluguel do ponto comercial')).toBe('Ocupação & Estrutura');
      expect(classificarCentroCustoOperacional('Contas', 'Conta de Luz Enel')).toBe('Utilidades');
      expect(classificarCentroCustoOperacional('Contas', 'Internet fibra ótica')).toBe('Utilidades');
      expect(classificarCentroCustoOperacional('Serviços', 'Honorários contabilidade mensal')).toBe('Serviços & Assessoria');
      expect(classificarCentroCustoOperacional('Meios de Pagamento', 'Taxa de maquininha Stone')).toBe('Taxas de Meios de Pagamento');
      expect(classificarCentroCustoOperacional('Canais', 'Comissão delivery iFood')).toBe('Taxas de Delivery');
      expect(classificarCentroCustoOperacional('Operação', 'Manutenção preventiva geladeira')).toBe('Manutenção & Operação');
    });
  });

  describe('2. Apuração do Lucro Líquido Real com CMV por NF e Despesas', () => {
    it('calcula Lucro Líquido Real positivo com CMV auditado e despesas operacionais', async () => {
      setupMockDatabase({
        produtos_eyemobile: [
          {
            workspace_id: testWorkspaceId,
            codigo: '2032394',
            descricao: 'REFRIGERANTE 350ML',
            custo_atual: 1.83,
            preco_venda: 7.00,
          },
          {
            workspace_id: testWorkspaceId,
            codigo: '2032242',
            descricao: 'Coca ks',
            custo_atual: 1.70,
            preco_venda: 7.00,
          },
        ],
        historico_custo_produto: [
          {
            workspace_id: testWorkspaceId,
            produto_codigo: '2032394',
            custo_unitario: 1.83,
            data_compra: '2026-07-02',
            fornecedor: 'SPAL Bebidas',
          },
          {
            workspace_id: testWorkspaceId,
            produto_codigo: '2032242',
            custo_unitario: 1.70,
            data_compra: '2026-08-21',
            fornecedor: 'SPAL Bebidas',
          },
        ],
        transacoes: [
          {
            id: 't-1',
            workspace_id: testWorkspaceId,
            tipo: 'receita',
            valor: 140.0,
            data: '2026-11-04T15:30:00Z',
            itens: [
              { id: '2032394', product_name: 'REFRIGERANTE 350ML', quantity: 10, total: 70.0 },
              { id: '2032242', product_name: 'Coca ks', quantity: 10, total: 70.0 },
            ],
          },
          {
            id: 't-desp-1',
            workspace_id: testWorkspaceId,
            tipo: 'despesa',
            valor: 50.0,
            data: '2026-11-04T16:00:00Z',
            descricao: 'Conta de Luz Enel',
            categoria_id: 'cat-energia',
            categorias: { nome: 'Energia Elétrica' },
          },
          {
            id: 't-estoque-1',
            workspace_id: testWorkspaceId,
            tipo: 'despesa',
            valor: 500.0,
            data: '2026-11-04T12:00:00Z',
            descricao: 'Compra de estoque de fardos de bebidas para revenda',
            categoria_id: 'cat-estoque',
            categorias: { nome: 'Estoque para revenda' },
          },
        ],
        despesas: [
          {
            id: 'd-1',
            workspace_id: testWorkspaceId,
            valor: 30.0,
            data: '2026-11-04',
            descricao: 'Internet fibra',
            status: 'pago',
            categoria_id: 'cat-net',
            categorias: { nome: 'Internet' },
          },
        ],
      });

      const report = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        mes: 11,
        ano: 2026,
      });

      expect(report.dadosIndisponiveis).toBeFalsy();
      expect(report.faturamentoBruto).toBe(140.0);
      expect(report.receitaLiquida).toBe(140.0);

      // CMV Real: 10 * 1.83 + 10 * 1.70 = 18.30 + 17.00 = 35.30
      expect(report.cmvReal).toBe(35.3);
      expect(report.lucroBruto).toBe(104.7); // 140 - 35.30

      // Despesas Operacionais: 50 (luz) + 30 (net) = 80.
      // O estoque de 500.00 NÃO foi deduzido da despesa operacional (evitou duplicidade com o CMV!)
      expect(report.despesasOperacionais).toBe(80.0);
      expect(report.despesasExcluidasDuplicidade.comprasEstoqueExcluidas).toBe(500.0);

      // Resultado Operacional / Lucro Líquido: 104.70 - 80.00 = 24.70
      expect(report.resultadoOperacional).toBe(24.7);
      expect(report.lucroLiquido).toBe(24.7);
      expect(report.statusConfiabilidade).toBe('confirmado');
      expect(report.coberturaCustosPercent).toBe(100);
    });

    it('calcula Prejuízo Real negativo quando as despesas superam a receita', async () => {
      setupMockDatabase({
        transacoes: [
          {
            id: 't-1',
            workspace_id: testWorkspaceId,
            tipo: 'receita',
            valor: 100.0,
            data: '2026-11-02T10:00:00Z',
          },
        ],
        despesas: [
          {
            id: 'd-aluguel',
            workspace_id: testWorkspaceId,
            valor: 350.0,
            data: '2026-11-02',
            descricao: 'Aluguel do imóvel comercial',
            status: 'pago',
            categorias: { nome: 'Aluguel' },
          },
        ],
      });

      const report = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        mes: 11,
        ano: 2026,
      });

      expect(report.faturamentoBruto).toBe(100.0);
      expect(report.despesasOperacionais).toBe(350.0);
      // Prejuízo real de -250.00 sem truncar em 0
      expect(report.lucroLiquido).toBe(-250.0);
      expect(report.margemLiquidaPercent).toBe(-250.0);
    });

    it('sinaliza resultado parcial quando parte dos produtos vendidos não possui custo', async () => {
      setupMockDatabase({
        produtos_eyemobile: [
          {
            workspace_id: testWorkspaceId,
            codigo: '2032394',
            descricao: 'REFRIGERANTE 350ML',
            custo_atual: 1.83,
            preco_venda: 7.00,
          },
          // Segundo produto NÃO possui custo_atual
          {
            workspace_id: testWorkspaceId,
            codigo: 'SEM_CUSTO_1',
            descricao: 'Salgado Frito',
            custo_atual: 0,
            preco_venda: 10.00,
          },
        ],
        transacoes: [
          {
            id: 't-1',
            workspace_id: testWorkspaceId,
            tipo: 'receita',
            valor: 24.0,
            data: '2026-11-03T12:00:00Z',
            itens: [
              { id: '2032394', product_name: 'REFRIGERANTE 350ML', quantity: 2, total: 14.0 },
              { id: 'SEM_CUSTO_1', product_name: 'Salgado Frito', quantity: 1, total: 10.0 },
            ],
          },
        ],
      });

      const report = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        mes: 11,
        ano: 2026,
      });

      expect(report.statusConfiabilidade).toBe('parcial');
      expect(report.produtosVendidosSemCusto.length).toBe(1);
      expect(report.produtosVendidosSemCusto[0].nome).toBe('Salgado Frito');
      expect(report.coberturaCustosPercent).toBeGreaterThan(0);
      expect(report.coberturaCustosPercent).toBeLessThan(100);
    });

    it('retorna dados_insuficientes para mês sem qualquer movimentação', async () => {
      setupMockDatabase({
        transacoes: [],
        despesas: [],
      });

      const report = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        mes: 5,
        ano: 2025,
      });

      expect(report.statusConfiabilidade).toBe('dados_insuficientes');
      expect(report.faturamentoBruto).toBe(0);
      expect(report.lucroLiquido).toBe(0);
    });

    it('trata falha de rede/banco retornando dadosIndisponiveis: true de forma resiliente', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Supabase network connection timeout');
      });

      const report = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        mes: 11,
        ano: 2026,
      });

      expect(report.dadosIndisponiveis).toBe(true);
      expect(report.erroMensagem).toContain('Supabase network connection timeout');
    });
  });
});
