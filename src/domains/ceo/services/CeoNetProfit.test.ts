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

describe('CeoNetProfit — Auditoria Canônica do Lucro Líquido Real (Hotfix 6)', () => {
  const testWorkspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Classificação Contábil Rigorosa e Prevenção de Duplicidades', () => {
    it('segrega compras de estoque de revenda sem classificar fornecedores de serviços erroneamente', () => {
      // Compras de estoque para revenda confirmadas (devem ser compra_estoque para não duplicar com CMV)
      expect(classificarNaturezaResultado('Estoque', 'Compra de bebidas atacado SPAL')).toBe('compra_estoque');
      expect(classificarNaturezaResultado('Mercadorias para revenda', 'Fardo Coca-Cola 350ml')).toBe('compra_estoque');
      expect(classificarNaturezaResultado('Bebidas para Revenda', 'Caixa de cerveja Ambev')).toBe('compra_estoque');

      // Fornecedores de serviços ou despesas operacionais normais (NÃO devem virar compra de estoque)
      expect(classificarNaturezaResultado('Serviços', 'Pagamento fornecedor de software ERP')).toBe('operacional');
      expect(classificarNaturezaResultado('Manutenção', 'Fornecedor de limpeza e conservação')).toBe('operacional');
      expect(classificarNaturezaResultado('Operacional', 'Fornecedor de suporte de TI')).toBe('operacional');
      expect(classificarNaturezaResultado('Geral', 'Fornecedor de uniformes e segurança')).toBe('operacional');
    });

    it('distingue pró-labore (despesa operacional) de distribuição de lucros (patrimonial)', () => {
      // Pró-labore é remuneração do trabalho dos administradores -> DESPESA OPERACIONAL
      expect(classificarNaturezaResultado('Sócios', 'Pró-labore Heitor')).toBe('operacional');
      expect(classificarNaturezaResultado('RH', 'Pagamento mensal de pró-labore administrativo')).toBe('operacional');
      expect(classificarCentroCustoOperacional('RH', 'Pró-labore sócio')).toBe('Pessoal & Pró-labore');

      // Distribuição de lucros / dividendos -> DESTINAÇÃO PATRIMONIAL (retirada_socios)
      expect(classificarNaturezaResultado('Sócios', 'Distribuição de Lucros do exercício')).toBe('retirada_socios');
      expect(classificarNaturezaResultado('Financeiro', 'Antecipação de dividendos aos sócios')).toBe('retirada_socios');
      expect(classificarNaturezaResultado('Geral', 'Retirada de lucros acumulados')).toBe('retirada_socios');
    });

    it('classifica despesas financeiras, amortizações e tributos sobre resultado separadamente', () => {
      expect(classificarNaturezaResultado('Bancário', 'Tarifa bancária pacote conta PJ')).toBe('financeira');
      expect(classificarNaturezaResultado('Cartões', 'Taxa de maquininha de cartão Stone')).toBe('financeira');
      expect(classificarNaturezaResultado('Empréstimos', 'Amortização de empréstimo (principal)')).toBe('amortizacao_emprestimo');
      expect(classificarNaturezaResultado('Tributos', 'IRPJ sobre o Lucro Real')).toBe('tributo_resultado');
      expect(classificarNaturezaResultado('Tributos', 'CSLL trimestral')).toBe('tributo_resultado');
    });

    it('classifica despesas operacionais em centros de custos canônicos', () => {
      expect(classificarCentroCustoOperacional('RH', 'Salário atendente balcão')).toBe('Pessoal & Pró-labore');
      expect(classificarCentroCustoOperacional('Imóvel', 'Aluguel do ponto comercial')).toBe('Ocupação & Estrutura');
      expect(classificarCentroCustoOperacional('Contas', 'Conta de Luz Cemig')).toBe('Utilidades');
      expect(classificarCentroCustoOperacional('Contas', 'Internet fibra ótica')).toBe('Utilidades');
      expect(classificarCentroCustoOperacional('Serviços', 'Honorários contabilidade mensal')).toBe('Serviços & Assessoria');
      expect(classificarCentroCustoOperacional('Meios de Pagamento', 'Taxa de maquininha Stone')).toBe('Taxas de Meios de Pagamento');
      expect(classificarCentroCustoOperacional('Canais', 'Comissão delivery iFood')).toBe('Taxas de Delivery');
      expect(classificarCentroCustoOperacional('Operação', 'Manutenção preventiva geladeira')).toBe('Manutenção & Operação');
    });
  });

  describe('2. Apuração do Lucro Líquido Real e Auditoria da Coca KS', () => {
    it('comprova dados da Coca KS: custo R$ 1,7017, venda R$ 7,00 e margem 75,7%', async () => {
      setupMockDatabase({
        produtos_eyemobile: [
          {
            workspace_id: testWorkspaceId,
            codigo: '2032242',
            descricao: 'Coca ks',
            custo_atual: 1.7017,
            preco_venda: 7.00,
          },
        ],
        historico_custo_produto: [
          {
            workspace_id: testWorkspaceId,
            produto_codigo: '2032242',
            custo_unitario: 1.7017,
            data_compra: '2026-08-21',
            fornecedor: 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A',
          },
        ],
        transacoes: [
          {
            id: 't-coca-1',
            workspace_id: testWorkspaceId,
            tipo: 'receita',
            valor: 70.0, // 10 unidades vendidas
            data: '2026-11-04T15:30:00Z',
            itens: [
              { id: '2032242', product_name: 'Coca ks', quantity: 10, total: 70.0 },
            ],
          },
        ],
        despesas: [
          {
            id: 'd-1',
            workspace_id: testWorkspaceId,
            valor: 15.0,
            data: '2026-11-04',
            descricao: 'Taxa maquininha Stone',
            categoria_id: 'cat-taxas',
            categorias: { nome: 'Taxas de Cartão' },
          },
        ],
      });

      const relatorio = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        mes: 11,
        ano: 2026,
      });

      expect(relatorio.faturamentoBruto).toBe(70.0);
      expect(relatorio.cmvReal).toBeCloseTo(17.02, 2); // 10 * 1.7017 = 17.017
      expect(relatorio.lucroBruto).toBeCloseTo(52.98, 2); // 70.0 - 17.02 = 52.98
      expect(relatorio.margemBrutaPercent).toBeCloseTo(75.7, 1); // 52.98 / 70.0 = 75.69%
    });

    it('identifica resultado como parcial quando houver produtos vendidos sem custo e mede faturamento pendente', async () => {
      setupMockDatabase({
        produtos_eyemobile: [
          {
            workspace_id: testWorkspaceId,
            codigo: '2032242',
            descricao: 'Coca ks',
            custo_atual: 1.7017,
            preco_venda: 7.00,
          },
          {
            workspace_id: testWorkspaceId,
            codigo: 'PROD-SEM-CUSTO',
            descricao: 'Bolo Caseiro Fatia',
            custo_atual: 0.0, // Sem custo cadastrado
            preco_venda: 8.00,
          },
        ],
        transacoes: [
          {
            id: 't-1',
            workspace_id: testWorkspaceId,
            tipo: 'receita',
            valor: 150.0,
            data: '2026-11-04T15:30:00Z',
            itens: [
              { id: '2032242', product_name: 'Coca ks', quantity: 10, total: 70.0 },
              { id: 'PROD-SEM-CUSTO', product_name: 'Bolo Caseiro Fatia', quantity: 10, total: 80.0 },
            ],
          },
        ],
        despesas: [],
      });

      const relatorio = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        mes: 11,
        ano: 2026,
      });

      // Status deve ser parcial porque 80 reais de vendas não possuem custo de aquisição
      expect(relatorio.statusConfiabilidade).toBe('parcial');
      expect(relatorio.faturamentoVendasSemCusto).toBe(80.0);
      expect(relatorio.produtosVendidosSemCusto.length).toBe(1);
      expect(relatorio.produtosVendidosSemCusto[0].nome).toBe('Bolo Caseiro Fatia');
    });

    it('apura o mês anterior simetricamente com CMV real e identifica quando o mês anterior não teve movimentação', async () => {
      // Mock apenas para o mês atual (novembro); outubro sem transações
      setupMockDatabase({
        produtos_eyemobile: [
          {
            workspace_id: testWorkspaceId,
            codigo: '2032242',
            descricao: 'Coca ks',
            custo_atual: 1.7017,
            preco_venda: 7.00,
          },
        ],
        transacoes: [
          {
            id: 't-nov-1',
            workspace_id: testWorkspaceId,
            tipo: 'receita',
            valor: 700.0,
            data: '2026-11-05T12:00:00Z',
            itens: [
              { id: '2032242', product_name: 'Coca ks', quantity: 100, total: 700.0 },
            ],
          },
        ],
        despesas: [
          {
            id: 'd-nov-1',
            workspace_id: testWorkspaceId,
            valor: 200.0,
            data: '2026-11-05',
            descricao: 'Aluguel do mês',
            categoria_id: 'cat-aluguel',
            categorias: { nome: 'Aluguel' },
          },
        ],
      });

      const relatorio = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        mes: 11,
        ano: 2026,
      });

      // Mês anterior (outubro) não tem movimentação no banco mockado
      expect(relatorio.comparativoMesAnterior.mesAnteriorSemMovimentacao).toBe(true);
      expect(relatorio.comparativoMesAnterior.variacaoPercent).toBeNull();
      expect(relatorio.comparativoMesAnterior.tendencia).toBe('estavel');
    });

    it('GATE 2: exige comprovação tributária e quitação operacional para classificar lucro como definitivo', async () => {
      // Cenário com 100% de cobertura de CMV, mas tributos pendentes de escrituração
      setupMockDatabase({
        produtos_eyemobile: [
          {
            workspace_id: testWorkspaceId,
            codigo: '2032242',
            descricao: 'Coca ks',
            custo_atual: 1.7017,
            preco_venda: 7.00,
          },
        ],
        historico_custo_produto: [
          {
            workspace_id: testWorkspaceId,
            produto_codigo: '2032242',
            custo_unitario: 1.7017,
            data_compra: '2026-08-21',
            fornecedor: 'SPAL Bebidas',
          },
        ],
        transacoes: [
          {
            id: 't-1',
            workspace_id: testWorkspaceId,
            tipo: 'receita',
            valor: 70.0,
            data: '2026-11-04T15:30:00Z',
            itens: [
              { id: '2032242', product_name: 'Coca ks', quantity: 10, total: 70.0 },
            ],
          },
        ],
        despesas: [
          {
            id: 'd-1',
            workspace_id: testWorkspaceId,
            valor: 20.0,
            data: '2026-11-04',
            descricao: 'Limpeza e conservação',
            categoria_id: 'cat-serv',
            categorias: { nome: 'Serviços' },
            status: 'pago',
          },
        ],
      });

      const relatorioPendente = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        mes: 11,
        ano: 2026,
      });

      // Sem tributos sobre o resultado registrados, não pode ser classificado como definitivo
      expect(relatorioPendente.tributosStatus).toBe('pendente_escrituracao');
      expect(relatorioPendente.statusConfiabilidade).toBe('parcial');
      expect(relatorioPendente.lucroLiquidoDefinitivo).toBeNull();
      expect(relatorioPendente.resultadoPreliminarCustosConhecidos).toBeCloseTo(32.98, 2); // 52.98 - 20.0

      // Agora adicionando apuração tributária real quitada
      setupMockDatabase({
        produtos_eyemobile: [
          {
            workspace_id: testWorkspaceId,
            codigo: '2032242',
            descricao: 'Coca ks',
            custo_atual: 1.7017,
            preco_venda: 7.00,
          },
        ],
        historico_custo_produto: [
          {
            workspace_id: testWorkspaceId,
            produto_codigo: '2032242',
            custo_unitario: 1.7017,
            data_compra: '2026-08-21',
            fornecedor: 'SPAL Bebidas',
          },
        ],
        transacoes: [
          {
            id: 't-1',
            workspace_id: testWorkspaceId,
            tipo: 'receita',
            valor: 70.0,
            data: '2026-11-04T15:30:00Z',
            itens: [
              { id: '2032242', product_name: 'Coca ks', quantity: 10, total: 70.0 },
            ],
          },
        ],
        despesas: [
          {
            id: 'd-1',
            workspace_id: testWorkspaceId,
            valor: 20.0,
            data: '2026-11-04',
            descricao: 'Limpeza e conservação',
            categoria_id: 'cat-serv',
            categorias: { nome: 'Serviços' },
            status: 'pago',
          },
          {
            id: 'd-trib-1',
            workspace_id: testWorkspaceId,
            valor: 5.0,
            data: '2026-11-04',
            descricao: 'DAS Simples Nacional apurado',
            categoria_id: 'cat-trib',
            categorias: { nome: 'Tributos' },
            status: 'pago',
          },
        ],
      });

      const relatorioConfirmado = await CeoFinancialMetricsService.getRealNetProfit(testWorkspaceId, {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        mes: 11,
        ano: 2026,
      });

      expect(relatorioConfirmado.tributosStatus).toBe('apurado');
      expect(relatorioConfirmado.statusConfiabilidade).toBe('confirmado');
      expect(relatorioConfirmado.lucroLiquidoDefinitivo).toBeCloseTo(27.98, 2); // 32.98 - 5.0
    });
  });
});
