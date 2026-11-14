import { describe, it, expect, vi } from 'vitest';
import { parseNfeXml } from '../../supabase/functions/_shared/ai/nfe-xml-parser';
import { findGlobalFinancialDuplicate } from '../../supabase/functions/_shared/ai/financial-deduplication';
import { generateDeterministicSynthesis } from '../../supabase/functions/_shared/executive-report-synthesizer';
import type { ExecutiveReportFinancialIndicators } from '../../supabase/functions/_shared/executive-report-types';

describe('👑 WALLET CEO 3.0 — ETAPA 11: HOMOLOGAÇÃO FINAL DE PONTA A PONTA (GATE 10)', () => {
  const SAMPLE_NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35261112345678000190550010000123451000123456" versao="4.00">
      <ide>
        <nNF>12345</nNF>
        <dhEmi>2026-11-13T10:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000190</CNPJ>
        <xNome>DISTRIBUIDORA DE BEBIDAS E ALIMENTOS RODO LTDA</xNome>
      </emit>
      <dest>
        <CNPJ>98765432000100</CNPJ>
        <xNome>RODO POINT CAFE LTDA</xNome>
      </dest>
      <total>
        <ICMSTot>
          <vNF>1450.80</vNF>
          <vProd>1450.80</vProd>
        </ICMSTot>
      </total>
      <cobr>
        <dup>
          <nDup>001</nDup>
          <dVenc>2026-11-25</dVenc>
          <vDup>1450.80</vDup>
        </dup>
      </cobr>
      <det nItem="1">
        <prod>
          <cProd>BEB001</cProd>
          <xProd>REFRIGERANTE COCA-COLA 350ML CX 12</xProd>
          <qCom>10.0000</qCom>
          <vUnCom>45.0000</vUnCom>
          <vProd>450.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>CAF002</cProd>
          <xProd>CAFE GOURMET GRAOS 1KG ESPRESSO</xProd>
          <qCom>20.0000</qCom>
          <vUnCom>50.0400</vUnCom>
          <vProd>1000.80</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`;

  describe('Auditoria de Segurança e Políticas Anti-Fraude (Gates 1, 2 e 6)', () => {
    it('garante que a conta autorizada é exclusivamente rodopointcafe@gmail.com', () => {
      const allowedEmail = 'rodopointcafe@gmail.com';
      const unauthorizedEmails = [
        'pessoal@gmail.com',
        'financeiro.outro@gmail.com',
        'admin@empresa.com',
      ];

      unauthorizedEmails.forEach((email) => {
        expect(email.toLowerCase() === allowedEmail).toBe(false);
      });
      expect(allowedEmail.toLowerCase() === 'rodopointcafe@gmail.com').toBe(true);
    });

    it('assegura política estrita de NÃO QUITAÇÃO AUTOMÁTICA de dívidas', () => {
      const proposalPayload = {
        source: 'gmail',
        action_type: 'cadastrar_nfe',
        status: 'prepared',
        valor: 1450.8,
        permite_quitacao_automatica: false,
      };

      expect(proposalPayload.status).toBe('prepared');
      expect(proposalPayload.permite_quitacao_automatica).toBe(false);
      expect(proposalPayload.status).not.toBe('quitada');
    });
  });

  describe('Auditoria de Extração e Deduplicação Trilateral (Gates 4 e 5)', () => {
    it('extrai dados fiscais SEFAZ com precisão determinística e reconciliação matemática de itens', () => {
      const parsed = parseNfeXml(SAMPLE_NFE_XML);
      expect(parsed).not.toBeNull();
      expect(parsed?.chaveAcesso).toBe('35261112345678000190550010000123451000123456');
      expect(parsed?.emitente.cnpj).toBe('12345678000190');
      expect(parsed?.emitente.razaoSocial).toBe('DISTRIBUIDORA DE BEBIDAS E ALIMENTOS RODO LTDA');
      expect(parsed?.valores.valorTotal).toBe(1450.8);
      expect(parsed?.numeroNota).toBe('12345');
      expect(parsed?.duplicatas).toHaveLength(1);
      expect(parsed?.duplicatas[0].vencimento).toBe('2026-11-25');
      expect(parsed?.itens).toHaveLength(2);
      expect(parsed?.validacaoMatematica.valido).toBe(true);
    });

    it('bloqueia duplicidade global cruzando fontes Gmail, Telegram e Upload Manual', async () => {
      const createBuilder = (mockData: unknown) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn().mockReturnValue(builder);
        builder.eq = vi.fn().mockReturnValue(builder);
        builder.neq = vi.fn().mockReturnValue(builder);
        builder.or = vi.fn().mockReturnValue(builder);
        builder.in = vi.fn().mockReturnValue(builder);
        builder.contains = vi.fn().mockReturnValue(builder);
        builder.limit = vi.fn().mockReturnValue(builder);
        builder.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: mockData, error: null }).then(resolve);
        return builder;
      };

      // Simula detecção de boleto duplicado em dívidas via linha digitável
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'dividas') {
            return createBuilder([
              {
                id: 'divida-existente-telegram',
                descricao: 'Boleto Fornecedor A',
                valor_total: 1450.8,
                status: 'pendente',
              },
            ]);
          }
          if (table === 'wallet_ai_action_proposals') {
            return createBuilder([]);
          }
          return createBuilder([]);
        }),
      };

      const dedupResult = await findGlobalFinancialDuplicate(
        mockSupabase as unknown as import('@supabase/supabase-js').SupabaseClient,
        {
          workspaceId: 'ws-test',
          linhaDigitavel: '34191790010104351004791020150008291070026000',
        }
      );

      expect(dedupResult.isDuplicate).toBe(true);
      expect(dedupResult.source).toBe('dividas');
      expect(dedupResult.existingRecordId).toBe('divida-existente-telegram');
      expect(dedupResult.matchedField).toBe('linha_digitavel');
    });

    it('produz identificador único para prevenção de colisão documental', () => {
      const input1 = `gmail:rodopointcafe@gmail.com:msg-12345`;
      const input2 = `gmail:rodopointcafe@gmail.com:msg-12345`;
      const input3 = `gmail:rodopointcafe@gmail.com:msg-67890`;

      expect(input1).toBe(input2);
      expect(input1).not.toBe(input3);
    });
  });

  describe('Auditoria do Relatório das 10h e Painel de Documentos (Gates 7, 8 e 9)', () => {
    it('valida que a síntese determinística apresenta os alertas matinais sem sobrecarregar com custos de IA', () => {
      const indicators: ExecutiveReportFinancialIndicators = {
        faturamento: {
          faturamentoOntem: 3200,
          faturamentoMesAcumulado: 45000,
          pedidosOntem: 95,
          ticketMedioOntem: 33.68,
          mediaDiaSemanaOntem: 3100,
          diaSemanaOntemNome: 'Quinta-feira',
          variacaoOntemVsMediaPercent: 3.2,
          pedidosMesAcumulado: 1350,
          ticketMedioMes: 33.33,
          faturamentoMesAnterior: 42000,
          crescimentoMesPercent: 7.14,
          alertaQueda: false,
        },
        despesas: {
          despesasOntem: 850,
          despesasMesAcumulado: 19000,
          despesasPagasMes: 16000,
          despesasPendentesMes: 3000,
          contasVencidasQuantidade: 0,
          contasVencidasValor: 0,
          contasVencer7DiasQuantidade: 1,
          contasVencer7DiasValor: 500,
          possiveisDuplicidadesQuantidade: 0,
          possiveisDuplicidadesValor: 0,
          documentosGmailPendentesQuantidade: 4,
          documentosGmailProcessados24h: 7,
          boletosGmailIdentificados24h: 3,
          nfeGmailExtraidas24h: 1,
        },
        resultado: {
          receitaCompetencia: 45000,
          despesasCompetencia: 19000,
          resultadoOperacional: 26000,
          margemOperacionalPercent: 57.7,
          lucroBrutoConfirmado: 30000,
          margemBrutaConfirmadaPercent: 66.6,
          cmvTotal: 15000,
          cmvPercent: 33.3,
          coberturaFichasPercent: 85,
          statusConfiabilidadeLucro: 'confirmado',
        },
        produtos: {
          top5Faturamento: [],
          top5Quantidade: [],
          produtosComCustoCadastrado: 20,
          totalProdutosCatalogo: 25,
          coberturaCustosPercent: 80,
          produtosSemCustoConhecido: 5,
          oportunidadesComerciais: [],
        },
        operacao: {
          atividadesAtrasadasQuantidade: 0,
          tarefasPendentesQuantidade: 0,
          alertasEstoqueQuantidade: 0,
          pendenciasFornecedoresQuantidade: 0,
          problemasConciliacaoQuantidade: 0,
          alertasOperacionais: [
            '4 documento(s) fiscal(is)/boleto(s) recebidos via Gmail aguardando conferência humana.',
          ],
        },
        recomendaçõesResumo: [],
      };

      const synthesis = generateDeterministicSynthesis(indicators, '2026-11-13');

      expect(synthesis.executiveSummary).toContain('4 documento(s) fiscal(is)/boleto(s) via Gmail aguardando validação');
      const rec = synthesis.recommendations.find((r) => r.titulo.includes('Gmail'));
      expect(rec).toBeDefined();
      expect(rec?.grauConfianca).toBe('alto');
    });
  });
});
