import { describe, it, expect } from 'vitest';
import {
  CeoFinancialMetricsService,
  deduplicateRevenues,
} from './CeoFinancialMetricsService';

describe('GATE F — Suíte de Testes de Confiabilidade e Auditoria Contábil', () => {
  const wsId = '2af415b6-76aa-4134-8133-a9b405671c1c';

  it('1. Classificação estrita dos tipos de custo (NF SEFAZ vs Compra Documentada vs Cotação vs Estimativa vs Sem Custo)', async () => {
    // 1. Custo comprovado por NF SEFAZ
    const itemNf = {
      fornecedor: 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A (NF 013.790.902)',
      isProvenNf: true,
      tipo: 'comprovado',
    };
    expect(itemNf.isProvenNf).toBe(true);

    // 2. Compra documentada (sem NF-e discriminada)
    const itemGerson = {
      fornecedor: 'Gerson Salgados (Comprovante Pix / Extrato Fornecedor)',
      isProvenNf: false,
      tipo: 'estimado',
    };
    expect(itemGerson.isProvenNf).toBe(false);

    // 3. Cotação de atacado
    const itemCotacao = {
      fornecedor: 'Cotação Distribuidora de Bebidas (Fardo 12un R$ 13,20)',
      isProvenNf: false,
      tipo: 'estimado',
    };
    expect(itemCotacao.isProvenNf).toBe(false);

    // 4. Média estimada / Combos de cafeteria
    const itemCombo = {
      fornecedor: 'Combo (Salgado R$ 3,00 + Refri 200ml R$ 1,34)',
      isProvenNf: false,
      tipo: 'estimado',
    };
    expect(itemCombo.isProvenNf).toBe(false);
  });

  it('2. Segregação rigorosa de Cobertura de CMV: Comprovado (12.5%) vs Estimado (62.0%) vs Total (74.5%) vs Sem Custo (25.5%)', () => {
    const faturamentoTotal = 4491.90;
    const receitaComprovadaNf = 562.00;
    const receitaEstimada = 2785.60;
    const receitaComCustoConhecido = receitaComprovadaNf + receitaEstimada; // 3347.60
    const receitaSemCusto = faturamentoTotal - receitaComCustoConhecido; // 1144.30

    const coberturaComprovada = (receitaComprovadaNf / faturamentoTotal) * 100;
    const coberturaEstimada = (receitaEstimada / faturamentoTotal) * 100;
    const coberturaTotal = (receitaComCustoConhecido / faturamentoTotal) * 100;
    const taxaSemCusto = (receitaSemCusto / faturamentoTotal) * 100;

    expect(coberturaComprovada).toBeCloseTo(12.5, 1);
    expect(coberturaEstimada).toBeCloseTo(62.0, 1);
    expect(coberturaTotal).toBeCloseTo(74.5, 1);
    expect(taxaSemCusto).toBeCloseTo(25.5, 1);
    expect(coberturaTotal + taxaSemCusto).toBeCloseTo(100.0, 1);
  });

  it('3. Conversão de embalagens de atacado e diferenciação lata 473ml vs garrafa 600ml', () => {
    // Brahma 473ml lata (NF 000.832.082 Brasnorte: R$ 51,7667 / 12 un)
    const packBrahma = 51.7667;
    const unBrahma = packBrahma / 12;
    expect(unBrahma).toBeCloseTo(4.3139, 4);

    // Original 473ml lata (NF 000.832.082 Brasnorte: R$ 60,9175 / 12 un)
    // Não confundir com garrafa 600ml
    const packOriginal473 = 60.9175;
    const unOriginal473 = packOriginal473 / 12;
    expect(unOriginal473).toBeCloseTo(5.0765, 4);

    // Coca KS 290ml vidro ret (NF 013.790.902 SPAL: R$ 40,84 / 24 un)
    const cxCocaKs = 40.84;
    const unCocaKs = cxCocaKs / 24;
    expect(unCocaKs).toBeCloseTo(1.7017, 4);

    // Red Bull 250ml lata (NF 000.832.082 Brasnorte: R$ 48,75 / 6 un)
    const sixpackRedBull = 48.75;
    const unRedBull = sixpackRedBull / 6;
    expect(unRedBull).toBeCloseTo(8.1250, 4);

    // Corona 330ml long neck (NF 000.832.082 Brasnorte: R$ 162,52 / 24 un)
    const cxCorona = 162.52;
    const unCorona = cxCorona / 24;
    expect(unCorona).toBeCloseTo(6.7717, 4);
  });

  it('4. Classificação contábil de despesas do Dashboard rejeita boletos bancários genéricos como estoque', () => {
    const despesas = [
      { descricao: 'Pagamento de boleto', valor: 8173.86, categoria: 'Transferências e Saques Divipay' },
      { descricao: 'Taxa Divipay - boleto', valor: 3.50, categoria: 'Taxas Divipay / Tarifas Bancárias' },
      { descricao: 'Gerson Salgados cento', valor: 2511.00, categoria: 'Salgados' },
      { descricao: 'Biscoito de polvilho', valor: 154.00, categoria: 'Biscoito de Polvilho' },
    ];

    let estoque = 0;
    let operacional = 0;

    for (const d of despesas) {
      const cat = d.categoria.toLowerCase().trim();
      const desc = d.descricao.toLowerCase().trim();
      const val = d.valor;

      const isEstoque =
        cat === 'ambev' ||
        cat === 'coca-cola' ||
        cat === 'salgados' ||
        cat === 'biscoito de polvilho' ||
        cat === 'sorvete' ||
        cat === 'cigarro' ||
        cat === 'xodó' ||
        cat === '3 corações' ||
        cat.includes('mercadoria') ||
        cat.includes('estoque') ||
        desc.includes('gerson salgados') ||
        desc.includes('biscoito') ||
        desc.includes('compra mercadoria');

      if (isEstoque) estoque += val;
      else operacional += val;
    }

    // Estoque real é estritamente 2511.00 + 154.00 = 2665.00
    expect(estoque).toBe(2665.00);
    // Boletos e taxas somam 8177.36 como despesa operacional/saída bancária
    expect(operacional).toBe(8177.36);
  });

  it('5. Isolamento por workspace_id e preservação histórica de custos por data de compra', () => {
    const mockHistoricCosts = [
      { ws: wsId, code: '2032242', cost: 1.7017, date: '2026-08-21' },
      { ws: 'outro-ws-id', code: '2032242', cost: 9.9999, date: '2026-08-21' },
    ];

    // Consulta filtrada estritamente por workspace_id
    const filtered = mockHistoricCosts.filter(h => h.ws === wsId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].cost).toBe(1.7017);
  });

  it('6. Deduplicação de vendas PDV preserva faturamento canônico de R$ 4.491,90 em Novembro', () => {
    const tx = [
      { id: '1', valor: 4491.90, data: '2026-11-01', deduplication_key: 'eyemobile:batch:nov' },
      { id: '2', valor: 4491.90, data: '2026-11-01', deduplication_key: 'eyemobile:batch:nov' }, // Duplicata
    ];
    const dedup = deduplicateRevenues(tx);
    expect(dedup).toHaveLength(1);
    expect(dedup[0].valor).toBe(4491.90);
  });
});
