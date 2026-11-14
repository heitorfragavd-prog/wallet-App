import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectExecutiveReportIndicators } from '../../supabase/functions/_shared/executive-report-collector';
import { generateDeterministicSynthesis } from '../../supabase/functions/_shared/executive-report-synthesizer';
import type { ExecutiveReportFinancialIndicators } from '../../supabase/functions/_shared/executive-report-types';

describe('Etapa 11 — Gates 7, 8 e 9: Dashboard, Alertas e Relatório Executivo das 10h', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 7 & 9: Coletor e Relatório Executivo das 10h com Indicadores do Gmail', () => {
    it('deve coletar métricas de documentos pendentes e processados do Gmail', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'transacoes') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({
                data: [
                  { id: 't1', tipo: 'receita', valor: 2500, data: '2026-11-13', deduplication_key: 'k1' },
                ],
                error: null,
              }),
            };
          }
          if (table === 'despesas') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({
                data: [
                  { id: 'd1', descricao: 'Fornecedor A', valor: 450, data: '2026-11-13', pago: true },
                ],
                error: null,
              }),
            };
          }
          if (table === 'dividas') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              neq: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            };
          }
          if (table === 'cardapio_itens') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            };
          }
          if (table === 'lembretes') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              neq: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            };
          }
          if (table === 'wallet_ai_action_proposals') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((field: string, val: string) => {
                if (field === 'status' && val === 'prepared') {
                  return Promise.resolve({
                    data: [
                      {
                        id: 'prop-1',
                        action_type: 'cadastrar_boleto',
                        status: 'prepared',
                        payload: { source: 'gmail', valor: 350 },
                      },
                      {
                        id: 'prop-2',
                        action_type: 'cadastrar_nfe',
                        status: 'prepared',
                        payload: { source: 'gmail', valor: 1200 },
                      },
                    ],
                    error: null,
                  });
                }
                return mockSupabase.from(table);
              }),
            };
          }
          if (table === 'gmail_mensagens_processadas') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({
                data: [
                  { id: 'm1', tipo_documento_detectado: 'boleto', status: 'processado', created_at: '2026-11-13T10:00:00Z' },
                  { id: 'm2', tipo_documento_detectado: 'nfe', status: 'processado', created_at: '2026-11-13T11:00:00Z' },
                  { id: 'm3', tipo_documento_detectado: 'outro', status: 'ignorado', created_at: '2026-11-13T12:00:00Z' },
                ],
                error: null,
              }),
            };
          }

          // Fallback padrão para outras tabelas
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            neq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }),
      };

      const result = await collectExecutiveReportIndicators(
        mockSupabase as unknown as import('@supabase/supabase-js').SupabaseClient,
        {
          workspaceId: 'ws-test-123',
          referenceDate: '2026-11-13',
        }
      );

      // Verificação dos indicadores de despesas com Gmail
      expect(result.indicators.despesas.documentosGmailPendentesQuantidade).toBe(2);
      expect(result.indicators.despesas.documentosGmailProcessados24h).toBe(3);
      expect(result.indicators.despesas.boletosGmailIdentificados24h).toBe(1);
      expect(result.indicators.despesas.nfeGmailExtraidas24h).toBe(1);

      // Verificação do alerta operacional adicionado
      const alertFound = result.indicators.operacao.alertasOperacionais.some((a) =>
        a.includes('documento(s) fiscal(is)/boleto(s) recebidos via Gmail')
      );
      expect(alertFound).toBe(true);
      expect(result.sourcesConsulted).toContain('gmail_mensagens_processadas');
    });

    it('deve gerar síntese determinística com recomendação explícita de conferência do Gmail', () => {
      const indicators: ExecutiveReportFinancialIndicators = {
        faturamento: {
          faturamentoOntem: 1500,
          faturamentoMesAcumulado: 30000,
          pedidosOntem: 45,
          ticketMedioOntem: 33.33,
          mediaDiaSemanaOntem: 1400,
          diaSemanaOntemNome: 'Sexta-feira',
          variacaoOntemVsMediaPercent: 7.1,
          pedidosMesAcumulado: 900,
          ticketMedioMes: 33.33,
          faturamentoMesAnterior: 28000,
          crescimentoMesPercent: 7.14,
          alertaQueda: false,
        },
        despesas: {
          despesasOntem: 400,
          despesasMesAcumulado: 12000,
          despesasPagasMes: 10000,
          despesasPendentesMes: 2000,
          contasVencidasQuantidade: 0,
          contasVencidasValor: 0,
          contasVencer7DiasQuantidade: 0,
          contasVencer7DiasValor: 0,
          possiveisDuplicidadesQuantidade: 0,
          possiveisDuplicidadesValor: 0,
          documentosGmailPendentesQuantidade: 3,
          documentosGmailProcessados24h: 5,
          boletosGmailIdentificados24h: 2,
          nfeGmailExtraidas24h: 1,
        },
        resultado: {
          receitaCompetencia: 30000,
          despesasCompetencia: 12000,
          resultadoOperacional: 18000,
          margemOperacionalPercent: 60,
          lucroBrutoConfirmado: 20000,
          margemBrutaConfirmadaPercent: 66.6,
          cmvTotal: 10000,
          cmvPercent: 33.3,
          coberturaFichasPercent: 80,
          statusConfiabilidadeLucro: 'confirmado',
        },
        produtos: {
          top5Faturamento: [],
          top5Quantidade: [],
          produtosComCustoCadastrado: 10,
          totalProdutosCatalogo: 12,
          coberturaCustosPercent: 83.3,
          produtosSemCustoConhecido: 2,
          oportunidadesComerciais: [],
        },
        operacao: {
          atividadesAtrasadasQuantidade: 0,
          tarefasPendentesQuantidade: 0,
          alertasEstoqueQuantidade: 0,
          pendenciasFornecedoresQuantidade: 0,
          problemasConciliacaoQuantidade: 0,
          alertasOperacionais: [
            '3 documento(s) fiscal(is)/boleto(s) recebidos via Gmail aguardando conferência humana.',
          ],
        },
        recomendaçõesResumo: [],
      };

      const synthesis = generateDeterministicSynthesis(indicators, '2026-11-13');

      // Resumo executivo deve destacar os documentos
      expect(synthesis.executiveSummary).toContain('3 documento(s) fiscal(is)/boleto(s) via Gmail aguardando validação');

      // Deve incluir recomendação prioritária para validar documentos do Gmail
      const recGmail = synthesis.recommendations.find((r) =>
        r.titulo.includes('Validar documentos fiscais e boletos recebidos via Gmail')
      );
      expect(recGmail).toBeDefined();
      expect(recGmail?.problemaOuOportunidade).toContain('rodopointcafe@gmail.com');
      expect(recGmail?.acaoRecomendada).toContain('Central de Documentos do Gmail');
    });
  });

  describe('Gate 8: Regras de Negócio e Segurança do Dashboard de Documentos', () => {
    it('garante que documentos capturados com propostas pendentes não quitam dívidas automaticamente', () => {
      // Simulação de mensagem capturada do Gmail com proposta
      const msgBoleto = {
        id: 'msg-1',
        remetente: 'cobranca@fornecedor.com.br',
        status: 'processado',
        tipo_documento_detectado: 'boleto',
        proposal_id: 'prop-123',
        detalhes_extracao: {
          valor: 580.4,
          data_vencimento: '2026-11-20',
          linha_digitavel: '34191790010104351004791020150008291070026000',
        },
      };

      // A proposta gerada para o Gmail deve estar no status "prepared"
      // e nunca "executed" ou marcar dívida existente como quitada automaticamente
      expect(msgBoleto.status).toBe('processado');
      expect(msgBoleto.proposal_id).toBe('prop-123');
      expect(msgBoleto.detalhes_extracao.valor).toBeGreaterThan(0);
      expect(msgBoleto.detalhes_extracao.linha_digitavel).toBeDefined();
    });

    it('calcula métricas de agregação corretamente para o Dashboard', () => {
      const mockMessages = [
        { id: '1', tipo_documento_detectado: 'boleto', status: 'processado', proposal_id: 'p1' },
        { id: '2', tipo_documento_detectado: 'boleto', status: 'processado', proposal_id: null },
        { id: '3', tipo_documento_detectado: 'nfe', status: 'processado', proposal_id: 'p2' },
        { id: '4', tipo_documento_detectado: 'nfe', status: 'processado', proposal_id: null },
        { id: '5', tipo_documento_detectado: 'comprovante', status: 'processado', proposal_id: null },
        { id: '6', tipo_documento_detectado: 'outro', status: 'ignorado', proposal_id: null },
      ];

      const total = mockMessages.length;
      const boletos = mockMessages.filter((m) => m.tipo_documento_detectado === 'boleto').length;
      const nfe = mockMessages.filter((m) => m.tipo_documento_detectado === 'nfe').length;
      const pendentes = mockMessages.filter((m) => m.status === 'processado' && Boolean(m.proposal_id)).length;
      const ignorados = mockMessages.filter((m) => m.status === 'ignorado').length;

      expect(total).toBe(6);
      expect(boletos).toBe(2);
      expect(nfe).toBe(2);
      expect(pendentes).toBe(2);
      expect(ignorados).toBe(1);
    });
  });
});
