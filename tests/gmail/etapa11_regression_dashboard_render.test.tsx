import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  GmailDocumentsDashboard,
  getEmitenteNome,
  getCnpj,
  getValor,
  getDataVencimento,
} from '../../src/domains/gmail/components/GmailDocumentsDashboard';
import { GmailIntegrationService } from '../../src/domains/gmail/services/GmailIntegrationService';
import { ErrorBoundary } from '../../src/shared/components/ErrorBoundary';

vi.mock('../../src/domains/gmail/services/GmailIntegrationService');
vi.mock('../../src/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

describe('🚨 WALLET CEO 3.0 — Regressão Crítica: Renderização e Extração Defensiva do Gmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Helpers de Extração Defensiva (Prevenção de Objetos no JSX)', () => {
    it('extrai nome do emitente a partir de objeto estruturado de NF-e (Xodó Foods / Café Três Corações)', () => {
      const emitenteObj = {
        cnpj: '52315807000117',
        razaoSocial: 'XODO FOODS E DISTRIBUICAO LTDA',
        nomeFantasia: 'XODO FOODS',
      };
      expect(getEmitenteNome(emitenteObj)).toBe('XODO FOODS');

      const emitenteSemFantasia = {
        cnpj: '17467515000107',
        razaoSocial: 'CAFE TRES CORACOES SA',
      };
      expect(getEmitenteNome(emitenteSemFantasia)).toBe('CAFE TRES CORACOES SA');
    });

    it('extrai nome do emitente quando fornecido como string legada ou beneficiário', () => {
      expect(getEmitenteNome('Fornecedor Alpha')).toBe('Fornecedor Alpha');
      expect(getEmitenteNome(null, 'Beneficiário Boleto')).toBe('Beneficiário Boleto');
      expect(getEmitenteNome(undefined, undefined)).toBe('');
    });

    it('extrai CNPJ com resiliência de objeto aninhado ou campo raiz', () => {
      expect(getCnpj({ cnpj: '11222333000199' })).toBe('11222333000199');
      expect(
        getCnpj({
          emitente: { cnpj: '52315807000117' },
        })
      ).toBe('52315807000117');
      expect(getCnpj({})).toBe('');
    });

    it('extrai valor financeiro suportando valor_total de NF-e e valor de boleto', () => {
      expect(getValor({ valor: 150.5 })).toBe(150.5);
      expect(getValor({ valor_total: 470.1 })).toBe(470.1);
      expect(getValor({ valor_total: '658.14' })).toBe(658.14);
      expect(getValor({})).toBeUndefined();
    });

    it('extrai data de vencimento suportando duplicatas de NF-e e campo direto', () => {
      expect(getDataVencimento({ data_vencimento: '2026-11-20' })).toBe('2026-11-20');
      expect(
        getDataVencimento({
          duplicatas: [{ numero: '001', vencimento: '2026-10-30', valor: 658.14 }],
        })
      ).toBe('2026-10-30');
      expect(getDataVencimento({})).toBeNull();
    });
  });

  describe('2. Renderização sem Quebra com Dados Reais do Banco de Dados', () => {
    it('renderiza o dashboard com documentos contendo emitente como objeto sem lançar erro React', async () => {
      vi.mocked(GmailIntegrationService.getIntegration).mockResolvedValue({
        id: 'integ-1',
        workspace_id: 'ws-1',
        user_id: 'user-1',
        email_conectado: 'rodopointcafe@gmail.com',
        status: 'conectado',
        ultimo_sync_em: '2026-11-17T13:34:50.000Z',
        ultima_mensagem_sync_id: '1a151ccc4a2fd080',
        ultimo_history_id: null,
        created_at: '2026-11-17T13:34:31.000Z',
        updated_at: '2026-11-17T13:38:31.000Z',
      });

      vi.mocked(GmailIntegrationService.listProcessedMessages).mockResolvedValue([
        {
          id: 'msg-nfe-1',
          workspace_id: 'ws-1',
          message_id: '1a151ccc4a2fd080',
          thread_id: 'thread-1',
          remetente: 'nfe@xododeminas.com.br',
          destinatario: 'rodopointcafe@gmail.com',
          assunto: 'Nota Fiscal 233767',
          data_email: '2026-10-19T01:35:32.000Z',
          status: 'processado',
          tipo_documento_detectado: 'nfe',
          qtd_anexos: 2,
          proposal_id: 'prop-1',
          detalhes_extracao: {
            emitente: {
              cnpj: '52315807000117',
              razaoSocial: 'XODO FOODS E DISTRIBUICAO LTDA',
              nomeFantasia: 'XODO FOODS',
            },
            valor_total: 470.1,
            duplicatas: [{ numero: '001', vencimento: '2026-10-26', valor: 470.1 }],
            chave_acesso: '31261052315807000117550010002337671083481264',
          },
          idempotency_hash: 'hash-1',
          created_at: '2026-11-17T13:34:50.000Z',
        },
      ]);

      render(<GmailDocumentsDashboard workspaceId="ws-1" />);

      // Não pode haver tela de erro
      expect(screen.queryByText(/Ops! Algo deu errado/i)).not.toBeInTheDocument();

      // Deve encontrar o nome do emitente extraído com sucesso
      expect(await screen.findByText('XODO FOODS')).toBeInTheDocument();
      expect(screen.getByText('CNPJ: 52315807000117')).toBeInTheDocument();
      expect(screen.getByText('Nota Fiscal (NF-e)')).toBeInTheDocument();
      expect(screen.getByText('Aprovar Conta')).toBeInTheDocument();
    });
  });

  describe('3. Codificação UTF-8 Correta no ErrorBoundary', () => {
    it('renderiza o texto em português correto sem mojibake ("seção", "página", "Código")', () => {
      const BombChild = () => {
        throw new Error('Falha simulada');
      };

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary context="Teste">
          <BombChild />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Ops! Algo deu errado/i)).toBeInTheDocument();
      expect(screen.getByText(/Um erro inesperado ocorreu nesta seção\./i)).toBeInTheDocument();
      expect(screen.getByText(/voltar para a página anterior\./i)).toBeInTheDocument();
      expect(screen.getByText(/Código de suporte:/i)).toBeInTheDocument();

      spy.mockRestore();
    });
  });
});
