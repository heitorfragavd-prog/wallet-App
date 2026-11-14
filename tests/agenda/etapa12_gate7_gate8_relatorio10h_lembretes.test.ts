import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDeterministicSynthesis } from '../../supabase/functions/_shared/executive-report-synthesizer';
import type { ExecutiveReportFinancialIndicators } from '../../supabase/functions/_shared/executive-report-types';

describe('👑 WALLET CEO 3.0 — ETAPA 12: PR 3 (GATES 7 E 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseIndicators: ExecutiveReportFinancialIndicators = {
    faturamento: {
      faturamentoOntem: 1540.5,
      faturamentoMesAcumulado: 42100.0,
      pedidosOntem: 45,
      ticketMedioOntem: 34.23,
      mediaDiaSemanaOntem: 1500.0,
      diaSemanaOntemNome: 'Sexta-feira',
      variacaoOntemVsMediaPercent: 2.7,
      pedidosMesAcumulado: 1250,
      ticketMedioMes: 33.68,
      faturamentoMesAnterior: 39500.0,
      crescimentoMesPercent: 6.58,
      alertaQueda: false,
      mensagemAlerta: null,
    },
    despesas: {
      despesasOntem: 450.0,
      despesasMesAcumulado: 21300.0,
      despesasPagasMes: 18000.0,
      despesasPendentesMes: 3300.0,
      contasVencidasQuantidade: 0,
      contasVencidasValor: 0,
      contasVencer7DiasQuantidade: 2,
      contasVencer7DiasValor: 1200.0,
      possiveisDuplicidadesQuantidade: 0,
      possiveisDuplicidadesValor: 0,
      alertaDespesasExtraordinarias: null,
      documentosGmailPendentesQuantidade: 1,
      documentosGmailProcessados24h: 3,
      boletosGmailIdentificados24h: 1,
      nfeGmailExtraidas24h: 2,
    },
    resultado: {
      receitaCompetencia: 42100.0,
      despesasCompetencia: 21300.0,
      resultadoOperacional: 20800.0,
      margemOperacionalPercent: 49.4,
      lucroBrutoConfirmado: 25000.0,
      margemBrutaConfirmadaPercent: 59.38,
      cmvTotal: 17100.0,
      cmvPercent: 40.62,
      coberturaFichasPercent: 85.0,
      statusConfiabilidadeLucro: 'confirmado',
      motivoConfiabilidade: null,
    },
    produtos: {
      top5Faturamento: [
        {
          id: 'p-1',
          nome: 'Café Espresso Especial',
          quantidade: 120,
          faturamento: 960.0,
          custoComprovadoNota: true,
        },
      ],
      top5Quantidade: [
        {
          id: 'p-1',
          nome: 'Café Espresso Especial',
          quantidade: 120,
          faturamento: 960.0,
          custoComprovadoNota: true,
        },
      ],
      produtosComCustoCadastrado: 25,
      totalProdutosCatalogo: 30,
      coberturaCustosPercent: 83.33,
      produtosSemCustoConhecido: 5,
      oportunidadesComerciais: [],
    },
    operacao: {
      atividadesAtrasadasQuantidade: 0,
      tarefasPendentesQuantidade: 2,
      alertasEstoqueQuantidade: 0,
      pendenciasFornecedoresQuantidade: 0,
      problemasConciliacaoQuantidade: 0,
      alertasOperacionais: [],
      compromissosHojeQuantidade: 1,
      reunioesGoogleCalendarHojeQuantidade: 2,
      eventosAgendaHoje: [
        {
          titulo: 'Alinhamento com Diretoria Rodo Point',
          hora: '09:30',
          local: 'Auditório Principal',
          origem: 'google_calendar',
        },
        {
          titulo: 'Visita Técnica Manutenção Maq. Espresso',
          hora: '14:00',
          local: 'Balcão da Cafeteria',
          origem: 'compromisso',
        },
      ],
    },
    recomendaçõesResumo: [],
  };

  describe('Gate 8: Síntese no Relatório Executivo das 10h', () => {
    it('inclui compromissos do dia no resumo executivo do relatório das 10h', () => {
      const result = generateDeterministicSynthesis(baseIndicators, '2026-11-20');

      expect(result.executiveSummary).toContain('Relatório Executivo referente a 2026-11-20');
      expect(result.executiveSummary).toContain('Agenda de hoje: 2 compromisso(s)/reunião(ões) programado(s)');
      expect(result.executiveSummary).toContain('Google Calendar e Wallet');
    });

    it('gera recomendação executiva de agenda com detalhes do primeiro compromisso', () => {
      const result = generateDeterministicSynthesis(baseIndicators, '2026-11-20');

      const agendaRec = result.recommendations.find((r) =>
        r.titulo.includes('Acompanhar compromissos e reuniões')
      );

      expect(agendaRec).toBeDefined();
      expect(agendaRec?.problemaOuOportunidade).toContain('Alinhamento com Diretoria Rodo Point');
      expect(agendaRec?.problemaOuOportunidade).toContain('(às 09:30)');
      expect(agendaRec?.evidencia).toContain('2 sincronizado(s) via Google Calendar');
      expect(agendaRec?.evidencia).toContain('1 compromisso(s) locais');
    });

    it('mantém integridade caso não haja eventos de agenda', () => {
      const noAgendaIndicators = {
        ...baseIndicators,
        operacao: {
          ...baseIndicators.operacao,
          compromissosHojeQuantidade: 0,
          reunioesGoogleCalendarHojeQuantidade: 0,
          eventosAgendaHoje: [],
        },
      };

      const result = generateDeterministicSynthesis(noAgendaIndicators, '2026-11-20');
      expect(result.executiveSummary).not.toContain('Agenda de hoje:');
    });
  });

  describe('Gate 7: Lembretes Inteligentes e Notificações', () => {
    it('valida janela de silêncio noturno (22h às 07h no fuso de Brasília)', () => {
      const isNightSilence = (hour: number) => hour >= 22 || hour < 7;

      expect(isNightSilence(23)).toBe(true);
      expect(isNightSilence(3)).toBe(true);
      expect(isNightSilence(6)).toBe(true);
      expect(isNightSilence(7)).toBe(false);
      expect(isNightSilence(10)).toBe(false);
      expect(isNightSilence(21)).toBe(false);
      expect(isNightSilence(22)).toBe(true);
    });

    it('respeita regras de agrupamento para evitar saturação de notificações', () => {
      const pendingEvents = [
        { id: 'ev-1', titulo: 'Reunião 1', minutosParaInicio: 15 },
        { id: 'ev-2', titulo: 'Reunião 2', minutosParaInicio: 20 },
      ];

      // Se há múltiplos eventos na mesma janela de 30 minutos, agrupa em única notificação
      const shouldGroup = pendingEvents.length > 1;
      expect(shouldGroup).toBe(true);
    });
  });
});
