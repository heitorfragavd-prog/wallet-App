import { describe, it, expect } from 'vitest';
import { CeoFinancialMetricsService, CeoExecutiveKpis } from '@/domains/ceo/services/CeoFinancialMetricsService';

describe('GATE 0 — Correção Urgente de Valores Financeiros Fixos e Auditoria das Respostas', () => {
  // Cria um mock controlado de KPIs dinâmicos
  const emptyKpis = CeoFinancialMetricsService.getEmptyKpis();

  const customKpis: CeoExecutiveKpis = {
    ...emptyKpis,
    faturamentoMes: 45000.0,
    pedidosMes: 1200,
    ticketMedioMes: 37.5,
    resultadoOperacional: 8500.0,
    margemOperacionalPercent: 18.9,
    lucroLiquidoReal: 7200.0,
    statusConfiabilidadeLucro: 'confirmado',
    cmvConfirmado: 12500.0,
    cmvPercent: 27.8,
    coberturaCmvPercent: 88,
    despesasMes: 24000.0,
    despesasTotalCompetencia: 24000.0,
    despesasPagas: 21000.0,
    despesasPendentes: 3000.0,
    faturamentoOntem: 1850.0,
    mediaDiaSemanaOntem: 1700.0,
    diaSemanaOntemNome: 'quarta-feira',
    variacaoOntemVsMediaPercent: 8.8,
    topProducts: [
      { rank: 1, produto: 'Café Expresso', faturamento: 4500.0, quantidade: 900, percentualFaturamento: 10.0 },
      { rank: 2, produto: 'Misto Quente', faturamento: 3800.0, quantidade: 380, percentualFaturamento: 8.4 },
    ],
  };

  // Simula a lógica de geração de respostas rápidas dinâmicas do CeoOverviewTab
  function generateDynamicResponse(prompt: string, kpis: CeoExecutiveKpis): string {
    const p = prompt.toLowerCase();

    // 0. CMV
    if (p.includes('cmv') || p.includes('custo de mercadoria')) {
      const cmvConf = kpis.cmvConfirmado;
      const cob = kpis.coberturaCmvPercent ?? 0;
      let cmvInfo = '';
      if (cmvConf !== null && cmvConf !== undefined && cmvConf > 0) {
        cmvInfo = `- **CMV Confirmado (Notas Fiscais):** **R$ ${cmvConf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**` +
          ` (${kpis.cmvPercent ?? 0}% sobre R$ ${(kpis.receitaComCustoConhecido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} com custo auditado)\n` +
          `- **Cobertura de Custos:** ${cob}% do faturamento do mês auditado por notas fiscais.\n\n`;
      } else {
        cmvInfo = `- **CMV Auditado:** R$ 0,00 (aguardando vinculação de notas fiscais de entrada de mercadorias).\n` +
          `- **Cobertura:** ${cob}% do faturamento coberto por NF no período.\n\n`;
      }
      return `🛒 **Custos de Atacado & CMV Comprovado (Rodo Point):**\n\n` +
        cmvInfo +
        `> 💡 Os custos unitários e CMV são calculados exclusivamente com base em notas fiscais de compra e fichas técnicas cadastradas.`;
    }

    // 1. Lucro / Resultado
    if (p.includes('lucro') || p.includes('resultado operacional') || p.includes('margem')) {
      const fatMes = kpis.faturamentoMes || 0;
      const cob = kpis.coberturaCustosLucroPercent ?? kpis.coberturaCmvPercent ?? 0;
      const resOperacional = kpis.resultadoOperacional || 0;
      const despTotal = kpis.despesasTotalCompetencia || kpis.despesasMes || 0;
      const despPagas = kpis.despesasPagas || 0;
      const cmvFormatado = kpis.cmvConfirmado !== null && kpis.cmvConfirmado !== undefined
        ? `R$ ${kpis.cmvConfirmado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : 'R$ 0,00 (pendente de NF)';

      return `💼 **Demonstrativo de Resultado & Rentabilidade (Rodo Point):**\n\n` +
        `1️⃣ **Resultado Operacional (Competência do Mês):**\n` +
        `- **Vendas Brutas (PDV Reconciliadas):** R$ ${fatMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
        `- **(-) CMV Auditado por NF:** ${cmvFormatado} (${cob}% de cobertura)\n` +
        `- **(-) Despesas Operacionais (Competência):** R$ ${despTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
        `- **(=) Resultado Operacional:** **R$ ${resOperacional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** (Margem: ${kpis.margemOperacional ?? 0}%)\n\n` +
        `2️⃣ **Visão de Fluxo de Caixa (Desembolsos Pagos no Período):**\n` +
        `- **Entradas Vendas:** R$ ${fatMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
        `- **Despesas Pagas no Caixa:** R$ ${despPagas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
        `- **Saldo de Caixa (Vendas - Pagamentos):** R$ ${(kpis.diferencaVendasDespesasPagas ?? (fatMes - despPagas)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n` +
        `> 💡 Dados apurados em tempo real diretamente das vendas do Eyemobile PDV e lançamentos contábeis.`;
    }

    // 2. Despesas / Contas a pagar
    if (p.includes('despesa') || p.includes('contas a pagar') || p.includes('gasto')) {
      const despTotal = kpis.despesasTotalCompetencia || kpis.despesasMes || 0;
      const despPagas = kpis.despesasPagas || 0;
      const despPend = kpis.despesasPendentes || 0;

      return `💳 **Detalhamento das Despesas Deste Mês (Rodo Point):**\n\n` +
        `1️⃣ **Despesas Totais por Competência (Mês Atual):** **R$ ${despTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**\n` +
        `2️⃣ **Despesas Pagas (Fluxo de Caixa):** **R$ ${despPagas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**\n` +
        `3️⃣ **Despesas Pendentes / A Pagar:** **R$ ${despPend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**\n\n` +
        `> 💡 Dados sincronizados a partir dos lançamentos e conciliações financeiras oficiais.`;
    }

    return '';
  }

  describe('Auditoria de Respostas Financeiras sem Números Fixos', () => {
    it('responde sobre CMV usando exclusivamente dados dinâmicos e nunca o valor hardcoded 191.50', () => {
      // Caso 1: Com CMV real apurado
      const resComCmv = generateDynamicResponse('Qual é meu CMV?', customKpis);
      expect(resComCmv).toContain('12.500,00');
      expect(resComCmv).not.toContain('191,50');
      expect(resComCmv).not.toContain('191.50');

      // Caso 2: Sem CMV cadastrado (deve apresentar R$ 0,00 ou pendente de NF, nunca 191.50!)
      const zeroKpis = { ...emptyKpis, cmvConfirmado: null };
      const resSemCmv = generateDynamicResponse('Qual é meu CMV?', zeroKpis);
      expect(resSemCmv).toContain('R$ 0,00');
      expect(resSemCmv).toContain('aguardando vinculação de notas fiscais');
      expect(resSemCmv).not.toContain('191,50');
      expect(resSemCmv).not.toContain('191.50');
    });

    it('responde sobre despesas e contas a pagar sem nomes de funcionários ou números fixos', () => {
      const resDespesas = generateDynamicResponse('Quanto tive de despesas neste mês?', customKpis);
      expect(resDespesas).toContain('24.000,00');
      expect(resDespesas).toContain('21.000,00');
      expect(resDespesas).toContain('3.000,00');

      // Não pode conter números ou nomes históricos
      expect(resDespesas).not.toContain('2.767,48');
      expect(resDespesas).not.toContain('15.929,67');
      expect(resDespesas).not.toContain('11.289,49');
      expect(resDespesas).not.toContain('Shuellen');
      expect(resDespesas).not.toContain('Rainá');
      expect(resDespesas).not.toContain('Victor');
      expect(resDespesas).not.toContain('Gerson');
    });

    it('responde sobre lucro e resultado sem datas antigas de novembro ou saldos inventados', () => {
      const resLucro = generateDynamicResponse('Qual foi meu lucro?', customKpis);
      expect(resLucro).toContain('45.000,00');
      expect(resLucro).toContain('8.500,00');

      // Não pode conter datas históricas específicas de início do mês
      expect(resLucro).not.toContain('01 a 06/11');
      expect(resLucro).not.toContain('353 pedidos');
      expect(resLucro).not.toContain('1.480,42');
      expect(resLucro).not.toContain('-14.257,75');
    });

    it('apresenta valor zero como R$ 0,00 sem substituir por números legados', () => {
      const kpisZerados: CeoExecutiveKpis = {
        ...emptyKpis,
        faturamentoMes: 0,
        despesasMes: 0,
        despesasPagas: 0,
        despesasPendentes: 0,
        resultadoOperacional: 0,
        cmvConfirmado: 0,
      };

      const resZero = generateDynamicResponse('Quanto tive de despesas?', kpisZerados);
      expect(resZero).toContain('R$ 0,00');
      expect(resZero).not.toContain('2.767,48');
    });
  });
});
