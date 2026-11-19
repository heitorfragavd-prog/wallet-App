import { describe, it, expect } from 'vitest';
import {
  normalizarUnidade,
  validarConversaoEmbalagem,
  converterCustoEmbalagem,
  calcularRateioCustoNotaFiscal,
  calcularMetricasLucroBrutoUnitario,
  calcularEvolucaoCustosProduto,
  diagnosticarMargensCatalogo,
  RegraConversaoEmbalagem,
  TotaisNotaFiscalInput,
  ItemNotaFiscalInput,
  RegistroHistoricoCusto,
  ProdutoCatalogoDiagnosticoInput,
} from './unitCostCalculationService';

describe('UnitCostCalculationService — Motor de Custos, Conversão e Lucro Bruto Unitário', () => {

  // ─── GATE 3: CONVERSÃO SEGURA DE EMBALAGENS (FAIL-CLOSED) ─────────────────
  describe('Gate 3: Conversão Segura de Embalagens', () => {
    it('deve converter unidades idênticas diretamente 1:1 sem necessidade de regra externa', () => {
      const res = validarConversaoEmbalagem('UN', 'un');
      expect(res.valido).toBe(true);
      if (res.valido) {
        expect(res.fatorConversao).toBe(1);
        expect(res.unidadeOrigem).toBe('UN');
        expect(res.unidadeDestino).toBe('UN');
      }
    });

    it('FAIL-CLOSED: deve rejeitar conversão entre unidades distintas sem regra cadastrada (nunca assume fator 1)', () => {
      const res = validarConversaoEmbalagem('CX', 'UN', null);
      expect(res.valido).toBe(false);
      if (!res.valido) {
        expect(res.motivo).toBe('unidades_incompativeis_sem_regra');
        expect(res.mensagem).toContain('Fator 1 não é presumido por segurança');
      }
    });

    it('FAIL-CLOSED: deve rejeitar fator de conversão menor ou igual a zero ou inválido', () => {
      const regraInvalida: RegraConversaoEmbalagem = {
        unidadeOrigem: 'CX',
        unidadeDestino: 'UN',
        fatorConversao: 0,
        evidencia: {
          tipo: 'especificacao_fabricante',
          descricao: 'Caixa com 24 unidades',
          confirmadoPorUsuario: true,
        },
      };

      const res = validarConversaoEmbalagem('CX', 'UN', regraInvalida);
      expect(res.valido).toBe(false);
      if (!res.valido) {
        expect(res.motivo).toBe('fator_invalido');
      }
    });

    it('FAIL-CLOSED: deve rejeitar regra sem evidência documental comprovada (proibido presumir)', () => {
      const regraSemEvidencia: RegraConversaoEmbalagem = {
        unidadeOrigem: 'CX',
        unidadeDestino: 'UN',
        fatorConversao: 24,
        evidencia: {
          tipo: 'especificacao_fabricante',
          descricao: '', // Sem descrição comprobatória
          confirmadoPorUsuario: true,
        },
      };

      const res = validarConversaoEmbalagem('CX', 'UN', regraSemEvidencia);
      expect(res.valido).toBe(false);
      if (!res.valido) {
        expect(res.motivo).toBe('sem_evidencia_conversao');
      }
    });

    it('deve validar com precisão conversão de Cappuccino 3 Corações (CX 50 sachês -> 50 unidades)', () => {
      const regraCappuccino: RegraConversaoEmbalagem = {
        unidadeOrigem: 'CX',
        unidadeDestino: 'SACHE',
        fatorConversao: 50,
        evidencia: {
          tipo: 'especificacao_fabricante',
          descricao: 'CAFE CAPPUCCINO 3 CORACOES CLASSIC SACHE 50X20G na NF 3075523',
          documentoReferencia: 'NF 3075523',
          confirmadoPorUsuario: true,
        },
      };

      const val = validarConversaoEmbalagem('CX', 'SACHE', regraCappuccino);
      expect(val.valido).toBe(true);
      if (val.valido) {
        expect(val.fatorConversao).toBe(50);
      }

      // Custo da caixa R$ 98,50 -> Custo unitário sachê: R$ 1,97
      const conv = converterCustoEmbalagem(98.50, 'CX', 'SACHE', regraCappuccino);
      expect(conv.sucesso).toBe(true);
      expect(conv.custoUnitarioConvertido).toBe(1.97);
    });

    it('deve validar conversão de Açúcar Cristal 3 Corações (CX 400 sachês -> R$ 0,0411 por sachê)', () => {
      const regraAcucar: RegraConversaoEmbalagem = {
        unidadeOrigem: 'CX',
        unidadeDestino: 'SACHE',
        fatorConversao: 400,
        evidencia: {
          tipo: 'especificacao_fabricante',
          descricao: 'ACUCAR 3CORACOES CRISTAL SACHE 400X5G na NF 3075523',
          documentoReferencia: 'NF 3075523',
          confirmadoPorUsuario: true,
        },
      };

      const conv = converterCustoEmbalagem(16.45, 'CX', 'SACHE', regraAcucar);
      expect(conv.sucesso).toBe(true);
      expect(conv.custoUnitarioConvertido).toBeCloseTo(0.0411, 4);
    });

    it('deve validar conversão de Café Coado (CX 10x500g = 5kg -> 500 doses de 10g)', () => {
      const regraCafeCoado: RegraConversaoEmbalagem = {
        unidadeOrigem: 'CX',
        unidadeDestino: 'DOSE',
        fatorConversao: 500, // 5.000g / 10g por dose = 500 doses
        evidencia: {
          tipo: 'ficha_tecnica_padrao',
          descricao: 'Ficha técnica cafeteria: 10g de pó de café por dose de coado',
          documentoReferencia: 'FT-CAFE-01',
          confirmadoPorUsuario: true,
        },
      };

      // Caixa R$ 222,25 -> Dose R$ 0,4445
      const conv = converterCustoEmbalagem(222.25, 'CX', 'DOSE', regraCafeCoado);
      expect(conv.sucesso).toBe(true);
      expect(conv.custoUnitarioConvertido).toBe(0.4445);
    });

    it('deve validar conversão comprovada de Pão de Queijo Xodó Foods (KG -> UN)', () => {
      const regraPaoQueijo: RegraConversaoEmbalagem = {
        unidadeOrigem: 'KG',
        unidadeDestino: 'UN',
        fatorConversao: 11.6133, // 3kg geram ~34.84 pães (86g por pão de queijo lanche)
        evidencia: {
          tipo: 'especificacao_fabricante',
          descricao: 'Pacote 3kg rende ~35 unidades de 86g conforme ficha técnica de padaria',
          documentoReferencia: 'FT-XODO-01',
          confirmadoPorUsuario: true,
        },
      };

      // Custo da NF: R$ 15,67 por KG -> Custo unitário do pão: ~R$ 1,3493
      const conv = converterCustoEmbalagem(15.67, 'KG', 'UN', regraPaoQueijo);
      expect(conv.sucesso).toBe(true);
      expect(conv.custoUnitarioConvertido).toBeCloseTo(1.3493, 3);
    });
  });

  // ─── GATE 4: CUSTO DE AQUISIÇÃO E RATEIO PROPORCIONAL NF ──────────────────
  describe('Gate 4: Rateio Proporcional de Custos e Despesas da NF', () => {
    it('deve ratear frete, seguro, outras despesas e descontos proporcionalmente ao valor dos produtos', () => {
      const totaisNf: TotaisNotaFiscalInput = {
        numeroNf: 'NF-1001',
        dataEmissao: '2026-11-20',
        fornecedorNome: 'Distribuidora Alimentos S/A',
        fornecedorCnpj: '12345678000199',
        valorTotalProdutos: 1000.00,
        valorFreteGlobal: 100.00,   // 10% do total de produtos
        valorSeguroGlobal: 20.00,   // 2% do total de produtos
        outrasDespesasGlobal: 30.00,// 3% do total de produtos
        valorDescontoGlobal: 50.00, // 5% do total de produtos
      };

      const itens: ItemNotaFiscalInput[] = [
        {
          codigoProduto: 'PROD_A',
          descricao: 'Produto A Alto Valor',
          unidade: 'CX',
          quantidade: 10,
          valorUnitario: 80.00,
          valorTotalProdutos: 800.00, // 80% do total
        },
        {
          codigoProduto: 'PROD_B',
          descricao: 'Produto B Menor Valor',
          unidade: 'UN',
          quantidade: 20,
          valorUnitario: 10.00,
          valorTotalProdutos: 200.00, // 20% do total
        },
      ];

      const resultado = calcularRateioCustoNotaFiscal(totaisNf, itens);

      expect(resultado.itens).toHaveLength(2);

      const itemA = resultado.itens[0];
      expect(itemA.pesoRateioPercentual).toBe(80.0);
      expect(itemA.freteRateado).toBe(80.00);      // 80% de 100
      expect(itemA.seguroRateado).toBe(16.00);     // 80% de 20
      expect(itemA.outrasDespesasRateadas).toBe(24.00); // 80% de 30
      expect(itemA.descontoRateado).toBe(40.00);   // 80% de 50
      // Custo Total A = 800 + 80 + 16 + 24 - 40 = 880.00
      expect(itemA.custoTotalAquisicao).toBe(880.00);
      expect(itemA.custoUnitarioAquisicaoCompra).toBe(88.00); // 880 / 10

      const itemB = resultado.itens[1];
      expect(itemB.pesoRateioPercentual).toBe(20.0);
      expect(itemB.freteRateado).toBe(20.00);
      expect(itemB.seguroRateado).toBe(4.00);
      expect(itemB.outrasDespesasRateadas).toBe(6.00);
      expect(itemB.descontoRateado).toBe(10.00);
      // Custo Total B = 200 + 20 + 4 + 6 - 10 = 220.00
      expect(itemB.custoTotalAquisicao).toBe(220.00);
      expect(itemB.custoUnitarioAquisicaoCompra).toBe(11.00); // 220 / 20

      // Total custo aquisição da nota = 880 + 220 = 1100.00
      expect(resultado.custoTotalAquisicaoNota).toBe(1100.00);
    });

    it('deve somar tributos não recuperáveis específicos do item (IPI e ST) ao custo de aquisição', () => {
      const totaisNf: TotaisNotaFiscalInput = {
        dataEmissao: '2026-11-20',
        fornecedorNome: 'Indústria Bebidas',
        fornecedorCnpj: '98765432000188',
        valorTotalProdutos: 500.00,
      };

      const itens: ItemNotaFiscalInput[] = [
        {
          codigoProduto: 'CERVEJA_ESPECIAL',
          descricao: 'Cerveja Especial',
          unidade: 'CX',
          quantidade: 5,
          valorUnitario: 100.00,
          valorTotalProdutos: 500.00,
          valorIpiItem: 25.00, // IPI 5%
          valorStItem: 45.00,  // ST R$ 45
        },
      ];

      const resultado = calcularRateioCustoNotaFiscal(totaisNf, itens);
      const item = resultado.itens[0];
      // Custo = 500 + 25 (IPI) + 45 (ST) = 570.00
      expect(item.tributosAcessorios).toBe(70.00);
      expect(item.custoTotalAquisicao).toBe(570.00);
      expect(item.custoUnitarioAquisicaoCompra).toBe(114.00); // 570 / 5
    });
  });

  // ─── GATE 4: MÉTRICAS DE LUCRO BRUTO, MARGEM BRUTA E MARKUP ───────────────
  describe('Gate 4: Lucro Bruto Unitário, Margem Bruta e Markup (Segregação Rigorosa)', () => {
    it('deve calcular corretamente Lucro Bruto, Margem Bruta % e Markup % em produto saudável', () => {
      // Exemplo real: Pão de Queijo Eyemobile 2032363 (PV R$ 4,50, Custo R$ 1,35)
      const res = calcularMetricasLucroBrutoUnitario({
        custoUnitarioConvertido: 1.35,
        precoVendaAtual: 4.50,
        margemMinimaAlvoPercent: 30.0,
      });

      expect(res.custoUnitarioAquisicao).toBe(1.35);
      expect(res.precoVenda).toBe(4.50);
      // Lucro Bruto = 4.50 - 1.35 = 3.15
      expect(res.lucroBrutoUnitario).toBe(3.15);
      // Margem Bruta % = (3.15 / 4.50) * 100 = 70.0%
      expect(res.margemBrutaPercent).toBe(70.0);
      // Markup % = (3.15 / 1.35) * 100 = 233.3%
      expect(res.markupPercent).toBe(233.3);
      // Multiplicador = 4.50 / 1.35 = 3.33
      expect(res.markupMultiplicador).toBe(3.33);
      expect(res.classificacaoMargem).toBe('saudavel');
    });

    it('deve calcular métricas do Cappuccino 3 Corações quando preenchido com custo de sachê e leite', () => {
      // Custo do sachê: R$ 1,97 + Leite e descartável: R$ 0,75 = R$ 2,72. PV = R$ 7,90
      const res = calcularMetricasLucroBrutoUnitario({
        custoUnitarioConvertido: 2.72,
        precoVendaAtual: 7.90,
      });

      expect(res.custoUnitarioAquisicao).toBe(2.72);
      expect(res.precoVenda).toBe(7.90);
      expect(res.lucroBrutoUnitario).toBe(5.18); // 7.90 - 2.72
      // Margem Bruta = (5.18 / 7.90) * 100 = 65.6%
      expect(res.margemBrutaPercent).toBe(65.6);
      expect(res.classificacaoMargem).toBe('saudavel');
    });

    it('deve sinalizar status "sem_custo" quando o custo for nulo, zero ou inválido', () => {
      const res = calcularMetricasLucroBrutoUnitario({
        custoUnitarioConvertido: 0,
        precoVendaAtual: 10.00,
      });

      expect(res.classificacaoMargem).toBe('sem_custo');
      expect(res.lucroBrutoUnitario).toBe(0);
      expect(res.margemBrutaPercent).toBe(0);
      expect(res.alertaStatus).toContain('Produto sem custo cadastrado');
    });

    it('deve sinalizar "prejuizo" quando o preço de venda for menor que o custo de aquisição', () => {
      const res = calcularMetricasLucroBrutoUnitario({
        custoUnitarioConvertido: 10.00,
        precoVendaAtual: 8.00,
      });

      expect(res.classificacaoMargem).toBe('prejuizo');
      expect(res.lucroBrutoUnitario).toBe(-2.00);
      expect(res.margemBrutaPercent).toBe(-25.0); // (-2 / 8) * 100
      expect(res.alertaStatus).toContain('prejuízo bruto unitário');
    });

    it('deve sinalizar "margem_critica" quando a margem bruta estiver abaixo de 15%', () => {
      const res = calcularMetricasLucroBrutoUnitario({
        custoUnitarioConvertido: 9.00,
        precoVendaAtual: 10.00, // Lucro R$ 1,00, Margem 10%
      });

      expect(res.classificacaoMargem).toBe('margem_critica');
      expect(res.margemBrutaPercent).toBe(10.0);
      expect(res.alertaStatus).toContain('Margem bruta crítica');
    });

    it('deve sinalizar "margem_alerta" quando a margem estiver entre 15% e a meta configurada (ex: 30%)', () => {
      const res = calcularMetricasLucroBrutoUnitario({
        custoUnitarioConvertido: 7.50,
        precoVendaAtual: 10.00, // Lucro R$ 2,50, Margem 25%
        margemMinimaAlvoPercent: 30.0,
      });

      expect(res.classificacaoMargem).toBe('margem_alerta');
      expect(res.margemBrutaPercent).toBe(25.0);
      expect(res.precoVendaSugeridoAlvo).toBeCloseTo(10.71, 2); // 7.50 / 0.70 = 10.71
    });

    it('determinismo: cálculo repetido produz estritamente o mesmo resultado sem mutação', () => {
      const input = { custoUnitarioConvertido: 5.00, precoVendaAtual: 10.00 };
      const run1 = calcularMetricasLucroBrutoUnitario(input);
      const run2 = calcularMetricasLucroBrutoUnitario(input);
      expect(run1).toEqual(run2);
    });
  });

  // ─── GATE 5: HISTÓRICO DE EVOLUÇÃO DE CUSTOS ──────────────────────────────
  describe('Gate 5: Histórico de Evolução dos Custos de Aquisição ao Longo do Tempo', () => {
    it('deve ordenar compras cronologicamente e calcular variações percentuais sucessivas', () => {
      const registros: RegistroHistoricoCusto[] = [
        // Ordem intencionalmente desordenada para testar garantia cronológica
        { produtoCodigo: '2032394', fornecedor: 'SPAL', dataCompra: '2026-10-15', custoUnitarioAquisicao: 1.83, numeroNf: '013.790.902' },
        { produtoCodigo: '2032394', fornecedor: 'SPAL', dataCompra: '2026-08-01', custoUnitarioAquisicao: 1.50, numeroNf: '013.664.150' },
        { produtoCodigo: '2032394', fornecedor: 'SPAL', dataCompra: '2026-09-10', custoUnitarioAquisicao: 1.65, numeroNf: '013.700.111' },
      ];

      const relatorio = calcularEvolucaoCustosProduto(registros, 10.0);

      expect(relatorio.totalComprasRegistradas).toBe(3);
      expect(relatorio.historicoOrdenado[0].dataCompra).toBe('2026-08-01');
      expect(relatorio.historicoOrdenado[0].custoUnitario).toBe(1.50);
      expect(relatorio.historicoOrdenado[0].variacaoVsAnteriorPercent).toBeNull();

      expect(relatorio.historicoOrdenado[1].dataCompra).toBe('2026-09-10');
      expect(relatorio.historicoOrdenado[1].custoUnitario).toBe(1.65);
      // Variação: (1.65 - 1.50) / 1.50 = +10.0%
      expect(relatorio.historicoOrdenado[1].variacaoVsAnteriorPercent).toBe(10.0);
      expect(relatorio.historicoOrdenado[1].alertaAumentoExpressivo).toBe(true);

      expect(relatorio.historicoOrdenado[2].dataCompra).toBe('2026-10-15');
      expect(relatorio.historicoOrdenado[2].custoUnitario).toBe(1.83);
      // Variação: (1.83 - 1.65) / 1.65 = +10.9%
      expect(relatorio.historicoOrdenado[2].variacaoVsAnteriorPercent).toBe(10.9);
      expect(relatorio.historicoOrdenado[2].alertaAumentoExpressivo).toBe(true);

      expect(relatorio.menorCustoHistorico).toBe(1.50);
      expect(relatorio.maiorCustoHistorico).toBe(1.83);
      // Variação total no período: (1.83 - 1.50) / 1.50 = +22.0%
      expect(relatorio.variacaoTotalPeriodoPercent).toBe(22.0);
      expect(relatorio.possuiAumentoRecenteAlerta).toBe(true);
    });

    it('deve retornar relatório consistente para produto com uma única compra', () => {
      const registros: RegistroHistoricoCusto[] = [
        { produtoCodigo: '2032363', fornecedor: 'Xodó Foods', dataCompra: '2026-11-20', custoUnitarioAquisicao: 1.35 },
      ];

      const relatorio = calcularEvolucaoCustosProduto(registros);
      expect(relatorio.totalComprasRegistradas).toBe(1);
      expect(relatorio.primeiroCustoHistorico).toBe(1.35);
      expect(relatorio.ultimoCustoHistorico).toBe(1.35);
      expect(relatorio.variacaoTotalPeriodoPercent).toBe(0);
      expect(relatorio.possuiAumentoRecenteAlerta).toBe(false);
    });
  });

  // ─── GATE 5: DIAGNÓSTICO E SINALIZAÇÃO DE CATÁLOGO ────────────────────────
  describe('Gate 5: Diagnóstico em Lote do Catálogo PDV', () => {
    it('deve identificar precisamente produtos sem custo cadastrado e produtos com margem crítica', () => {
      const catalogo: ProdutoCatalogoDiagnosticoInput[] = [
        { codigo: '2032363', descricao: 'Pão de Queijo', precoVenda: 4.50, custoAtual: 1.35 },
        { codigo: '2030549', descricao: 'Café Coado', precoVenda: 3.00, custoAtual: 0.60 },
        { codigo: '2032215', descricao: 'CAPPUCCINO C/LEITE', precoVenda: 7.90, custoAtual: 0.00 }, // Pendente na auditoria!
        { codigo: '2032401', descricao: 'Salgado Promoção', precoVenda: 4.00, custoAtual: 3.80 },   // Margem crítica 5%
        { codigo: '2099999', descricao: 'Item com Prejuízo', precoVenda: 5.00, custoAtual: 6.00 }, // Prejuízo
      ];

      const diag = diagnosticarMargensCatalogo(catalogo, 30.0);

      expect(diag.totalProdutosAnalisados).toBe(5);
      expect(diag.totalSemCusto).toBe(1);
      expect(diag.totalPrejuizo).toBe(1);
      expect(diag.totalMargemCritica).toBe(1);
      expect(diag.totalSaudavel).toBe(2);

      expect(diag.produtosSemCusto[0].codigo).toBe('2032215');
      expect(diag.produtosSemCusto[0].status).toBe('sem_custo');

      const alertaOuPrejuizo = diag.produtosComMargemBaixaOuPrejuizo;
      expect(alertaOuPrejuizo).toHaveLength(2);
      expect(alertaOuPrejuizo.map(p => p.codigo)).toContain('2099999');
      expect(alertaOuPrejuizo.map(p => p.codigo)).toContain('2032401');

      expect(diag.produtosSaudaveis.map(p => p.codigo)).toContain('2032363');
      expect(diag.produtosSaudaveis.map(p => p.codigo)).toContain('2030549');
    });
  });
});
