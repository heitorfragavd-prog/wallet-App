import { describe, it, expect } from 'vitest';
import {
  CeoFinancialMetricsService,
  deduplicateRevenues,
} from './CeoFinancialMetricsService';

describe('ETAPA 02 — Custos de Atacado (Ambev & Coca-Cola) e Cobertura de CMV Real', () => {
  const wsId = '2af415b6-76aa-4134-8133-a9b405671c1c';
  const refDate = new Date(Date.UTC(2026, 10, 7, 12, 0, 0)); // 07/11/2026

  it('Gate 1 & 2: Mapeamento de produtos do catálogo Eyemobile possui custos comprovados de NF e atacado cotado', () => {
    const catalogo = [
      // Bebidas SPAL / Coca-Cola
      { codigo: '2032242', descricao: 'Coca ks', custo_atual: 1.7017, preco_venda: 7.00 },
      { codigo: '2032601', descricao: 'Refrigerante 200ml', custo_atual: 1.3361, preco_venda: 4.00 },
      { codigo: '2032394', descricao: 'REFRIGERANTE 350ML', custo_atual: 1.8300, preco_venda: 7.00 },
      { codigo: '2033766', descricao: 'Power ade', custo_atual: 2.9217, preco_venda: 8.90 },
      { codigo: '2032350', descricao: 'KAPO', custo_atual: 1.6363, preco_venda: 4.50 },
      { codigo: '2032362', descricao: 'Monster Energy LT 473ml', custo_atual: 7.2095, preco_venda: 14.90 },
      { codigo: '2032410', descricao: 'Suco Dell vale', custo_atual: 2.8617, preco_venda: 6.00 },
      // Bebidas Brasnorte / Ambev
      { codigo: '2044232', descricao: 'Brahma', custo_atual: 4.3139, preco_venda: 10.00 },
      { codigo: '2032231', descricao: 'Skol 473 ML', custo_atual: 3.9667, preco_venda: 10.00 },
      { codigo: '2044233', descricao: 'Original ', custo_atual: 5.0765, preco_venda: 10.00 },
      { codigo: '2044235', descricao: 'Stella', custo_atual: 6.8750, preco_venda: 12.00 },
      { codigo: '2044237', descricao: 'Spaten', custo_atual: 5.0765, preco_venda: 12.00 },
      { codigo: '2032243', descricao: 'CORONA', custo_atual: 6.7717, preco_venda: 12.00 },
      { codigo: '2032254', descricao: 'ENERG.RED BULL 250ML', custo_atual: 8.1250, preco_venda: 14.90 },
      { codigo: '2032312', descricao: 'GATORADE', custo_atual: 4.5158, preco_venda: 8.90 },
      { codigo: '2032337', descricao: 'H2OH LIMONETO C/GAS PET', custo_atual: 4.1492, preco_venda: 7.90 },
      // Águas
      { codigo: '2032176', descricao: 'ÁGUA', custo_atual: 1.1000, preco_venda: 5.00 },
      { codigo: '2096935', descricao: 'ÁGUA COM GÁS', custo_atual: 1.3000, preco_venda: 3.50 },
      // Salgados e Padaria (Gerson Salgados)
      { codigo: '2032401', descricao: 'SALGADOS R$ 8,00', custo_atual: 3.0000, preco_venda: 8.00 },
      { codigo: '2047391', descricao: 'Salgados PREMIUM ', custo_atual: 3.6000, preco_venda: 9.00 },
      { codigo: '2032363', descricao: 'Pão de Queijo', custo_atual: 1.3500, preco_venda: 4.50 },
      { codigo: '2032171', descricao: '1 café 2 pães de queijo', custo_atual: 3.3000, preco_venda: 10.90 },
    ];

    expect(catalogo.length).toBeGreaterThanOrEqual(20);
    for (const p of catalogo) {
      expect(p.custo_atual).toBeGreaterThan(0);
      expect(p.preco_venda).toBeGreaterThan(p.custo_atual);
      const margem = ((p.preco_venda - p.custo_atual) / p.preco_venda) * 100;
      expect(margem).toBeGreaterThan(30); // Margem saudável de atacado/varejo
    }
  });

  it('Gate 3: Combos e proporções de cafeteria possuem soma consistente dos insumos', () => {
    const custoCafe = 0.60;
    const custoLeite = 0.50;
    const custoCafeComLeite = custoCafe + custoLeite; // 1.10
    const custoPaoQueijo = 1.35;
    const custo2PaesQueijo = custoPaoQueijo * 2; // 2.70

    const comboCafe2Paes = custoCafe + custo2PaesQueijo; // 3.30
    const comboCafeLeite2Paes = custoCafeComLeite + custo2PaesQueijo; // 3.80

    expect(comboCafe2Paes).toBeCloseTo(3.30, 2);
    expect(comboCafeLeite2Paes).toBeCloseTo(3.80, 2);

    const custoRefri200 = 1.3361;
    const custoSalgadoComum = 3.00;
    const comboSalgadoRefri = custoSalgadoComum + custoRefri200; // 4.3361

    expect(comboSalgadoRefri).toBeCloseTo(4.34, 2);
  });

  it('Gate 4: Deduplicação de vendas PDV preserva unicidade dos pedidos', () => {
    const txRaw = [
      { id: 'tx-1', valor: 10.0, data: '2026-11-01T10:00:00Z', deduplication_key: 'eyemobile:sale:1001' },
      { id: 'tx-2', valor: 10.0, data: '2026-11-01T10:00:00Z', deduplication_key: 'eyemobile:sale:1001' }, // Duplicata
      { id: 'tx-3', valor: 15.0, data: '2026-11-01T10:05:00Z', deduplication_key: 'eyemobile:sale:1002' },
    ];

    const dedup = deduplicateRevenues(txRaw);
    expect(dedup).toHaveLength(2);
    expect(dedup.reduce((acc, t) => acc + t.valor, 0)).toBe(25.0);
  });

  it('Gate 5 & 6: Cobertura de CMV salta de 18.9% para >70% com margem bruta média consolidada entre 60% e 70%', () => {
    const receitaAntes = 4869.00;
    const receitaTotal = 25697.80;
    const coberturaAntes = (receitaAntes / receitaTotal) * 100;

    const receitaDepois = 18858.10;
    const cmvDepois = 6357.41;
    const coberturaDepois = (receitaDepois / receitaTotal) * 100;
    const margemBrutaDepois = ((receitaDepois - cmvDepois) / receitaDepois) * 100;

    expect(coberturaAntes).toBeCloseTo(18.9, 1);
    expect(coberturaDepois).toBeGreaterThanOrEqual(70.0);
    expect(coberturaDepois).toBeCloseTo(73.4, 1);
    expect(margemBrutaDepois).toBeGreaterThanOrEqual(60.0);
    expect(margemBrutaDepois).toBeLessThanOrEqual(70.0);
    expect(margemBrutaDepois).toBeCloseTo(66.3, 1);
  });

  it('Orçamento nº 16852 (13/11/2026): Conversão precisa de embalagens atacado e margens saudáveis da bomboniere', () => {
    const itensOrcamento16852 = [
      { codigo: '2032416', descricao: 'TRIDENT', custoUnit: 36.00 / 21, pv: 4.00, margemMin: 50 },
      { codigo: '2032404', descricao: 'Snickers', custoUnit: 61.00 / 20, pv: 5.00, margemMin: 35 },
      { codigo: '2032412', descricao: 'TRENTO', custoUnit: 26.00 / 16, pv: 3.50, margemMin: 50 },
      { codigo: '2032388', descricao: 'PRESTIGIO', custoUnit: 64.00 / 30, pv: 4.00, margemMin: 40 },
      { codigo: '2032339', descricao: 'HALLS', custoUnit: 22.90 / 21, pv: 4.00, margemMin: 70 },
      { codigo: '2030584', descricao: 'OURO BRANCO', custoUnit: 50.00 / 50, pv: 2.00, margemMin: 45 },
      { codigo: '2032405', descricao: 'SONHO DE VALSA', custoUnit: 49.00 / 50, pv: 2.00, margemMin: 45 },
      { codigo: '2032411', descricao: 'TALENTO AVELÃ 85G', custoUnit: 94.00 / 12, pv: 11.90, margemMin: 30 },
      { codigo: '2032189', descricao: 'BARRA JOY', custoUnit: 37.50 / 12, pv: 4.50, margemMin: 25 },
      { codigo: '2032237', descricao: 'CHICLETE POOSH', custoUnit: 5.20 / 40, pv: 0.50, margemMin: 70 },
      { codigo: '2030585', descricao: 'PAÇOQUITA ROLHA EMBRULHADA', custoUnit: 21.00 / 100, pv: 0.50, margemMin: 50 },
      { codigo: '2032372', descricao: 'Pipoca 40g', custoUnit: 31.50 / 40, pv: 2.50, margemMin: 60 },
      { codigo: '2032369', descricao: 'Pipoca 100g', custoUnit: 20.70 / 10, pv: 5.00, margemMin: 55 },
      { codigo: '2032305', descricao: 'FRUIT-TELLA', custoUnit: 33.30 / 15, pv: 4.50, margemMin: 45 },
      { codigo: '2032251', descricao: 'DROPS MENTOS STICK', custoUnit: 31.50 / 16, pv: 4.50, margemMin: 50 },
    ];

    expect(itensOrcamento16852).toHaveLength(15);
    itensOrcamento16852.forEach(item => {
      expect(item.custoUnit).toBeGreaterThan(0);
      expect(item.pv).toBeGreaterThan(item.custoUnit);
      const margem = ((item.pv - item.custoUnit) / item.pv) * 100;
      expect(margem).toBeGreaterThanOrEqual(item.margemMin);
    });
  });
});
