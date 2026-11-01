import { describe, it, expect, vi } from 'vitest';
import { createQueryToolCatalog } from '../../../../supabase/functions/_shared/ai/query-tools';
import type { FinancialQueryRepository } from '../../../../supabase/functions/_shared/ai/query-tools';
import type { AiExecutionContext } from '../../../../supabase/functions/_shared/ai/auth';

describe('Auditoria de Ferramentas de IA do Wallet CEO 2.0 (Zero Dados Fictícios)', () => {
  const mockContext: AiExecutionContext = {
    userId: 'user-123',
    workspaceId: '2af415b6-76aa-4134-8133-a9b405671c1c',
    correlationId: 'corr-test',
  };

  const createMockRepo = (overrides?: Partial<FinancialQueryRepository>): FinancialQueryRepository => ({
    listRevenues: vi.fn().mockResolvedValue([]),
    listExpenses: vi.fn().mockResolvedValue([]),
    listTransactions: vi.fn().mockResolvedValue([]),
    listBalances: vi.fn().mockResolvedValue([]),
    listDebts: vi.fn().mockResolvedValue([]),
    listSalesPDV: vi.fn().mockResolvedValue([]),
    ...overrides,
  });

  it('consultar_resumo_executivo_ceo não deve conter os valores fictícios auditados', async () => {
    const repo = createMockRepo();
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_resumo_executivo_ceo({}, mockContext);
    const data = result.data as Record<string, unknown>;
    const cmv = data.cmv as Record<string, unknown>;

    expect(data.faturamentoMes).toBe(0);
    expect(data.faturamentoMes).not.toBe(287430.50);

    expect(data.faturamentoOntem).toBe(0);
    expect(data.faturamentoOntem).not.toBe(12845.30);

    expect(data.despesasMes).toBe(0);
    expect(data.despesasMes).not.toBe(45610.25);

    expect(cmv.percentual).toBeNull();
    expect(cmv.percentual).not.toBe(32.4);
    expect(cmv.status).toBe('dados_insuficientes');

    expect(data.workspaceId).toBe(mockContext.workspaceId);
    expect(data.status).toBe('sem_registros_no_periodo');
  });

  it('consultar_analise_comercial_vendas deve calcular a partir do repositório real', async () => {
    const repo = createMockRepo({
      listSalesPDV: vi.fn().mockResolvedValue([
        { id: '1', amount: 50.0, description: 'Venda Eyemobile #1', category: 'PDV', date: '2026-10-30', type: 'receita', account: 'Caixa' },
        { id: '2', amount: 30.0, description: 'Venda Eyemobile #2', category: 'PDV', date: '2026-10-30', type: 'receita', account: 'Caixa' },
      ]),
    });
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_analise_comercial_vendas({}, mockContext);
    const data = result.data as Record<string, unknown>;

    expect(data.vendasTotais).toBe(80.0);
    expect(data.vendasTotais).not.toBe(287430.50);
    expect(data.pedidosTotal).toBe(2);
    expect(data.ticketMedio).toBe(40.0);
    expect(data.topProdutos).toEqual([]); // sem inventar X-Tudo se não há itens
  });

  it('consultar_analise_despesas_ceo não deve retornar dados mockados pré-fabricados', async () => {
    const repo = createMockRepo({
      listExpenses: vi.fn().mockResolvedValue([
        { id: 'e1', amount: 200.0, description: 'Compra de Carne', category: 'Insumos', date: '2026-10-20', type: 'despesa', account: 'Banco' },
      ]),
    });
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_analise_despesas_ceo({}, mockContext);
    const data = result.data as Record<string, unknown>;
    const maiorCategoria = data.maiorCategoria as Record<string, unknown> | undefined;

    expect(data.totalDespesas).toBe(200.0);
    expect(data.totalDespesas).not.toBe(45610.25);
    expect(maiorCategoria?.nome).toBe('Insumos');
    expect(maiorCategoria?.valor).toBe(200.0);
  });

  it('consultar_telemetria_ia não deve conter valores mockados de 48920 tokens ou $0.42 USD', async () => {
    const repo = createMockRepo();
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_telemetria_ia({}, mockContext);
    const data = result.data as Record<string, unknown>;

    expect(data.totalTokensMes).toBe(0);
    expect(data.totalTokensMes).not.toBe(48920);

    expect(data.custoAcumuladoMesUsd).toBe(0.00);
    expect(data.custoAcumuladoMesUsd).not.toBe(0.42);

    expect(data.workspaceId).toBe(mockContext.workspaceId);
  });

  it('consultar_oportunidades_ceo não deve inventar R$ 8.500/mês ou produtos falsos', async () => {
    const repo = createMockRepo();
    const catalog = createQueryToolCatalog(repo, { extended: true });

    const result = await catalog.consultar_oportunidades_ceo({}, mockContext);
    const data = result.data as Record<string, unknown>;
    const orientacoes = data.orientacoesEstruturantes as unknown[];

    expect(data.oportunidades).toEqual([]);
    expect(data.status).toBe('dados_insuficientes');
    expect(orientacoes.length).toBeGreaterThan(0);
  });
});
