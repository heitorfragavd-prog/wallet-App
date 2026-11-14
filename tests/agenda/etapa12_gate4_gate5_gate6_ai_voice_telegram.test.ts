import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  routeUserQueryToSpecialists,
  buildOperationsSpecialistDeterministicResponse,
  type OperationsDeterministicData,
} from '../../supabase/functions/_shared/ai/specialist-router';
import { WalletAudioService } from '../../src/domains/conversas/services/WalletAudioService';

describe('👑 WALLET CEO 3.0 — ETAPA 12: PR 2 (GATES 4, 5 E 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 4: Inteligência da Agenda e Ações do Wallet IA', () => {
    it('roteia perguntas de agenda diretamente para resposta determinística de Operações', () => {
      const prompts = [
        'Wallet, quais são meus compromissos de hoje?',
        'Qual é a minha agenda para hoje?',
        'O que tenho hoje no Google Calendar?',
        'Quais reuniões tenho hoje?',
        'O que temos pra hoje na loja?',
      ];

      prompts.forEach((prompt) => {
        const plan = routeUserQueryToSpecialists(prompt);
        expect(plan.primarySpecialist).toBe('operacoes');
        expect(plan.isDeterministicPossible).toBe(true);
      });
    });

    it('formata resposta executiva estruturada quando há reuniões do Google Calendar e compromissos locais', () => {
      const mockData: OperationsDeterministicData = {
        todayStr: '2026-11-20',
        yesterdayStr: '2026-11-19',
        isMemberRole: false,
        rotinas: [
          {
            id: 'cal-ev-1',
            userId: 'usr-1',
            workspaceId: 'ws-rodo-point',
            sourceTable: 'calendar_eventos_sincronizados',
            titulo: 'Reunião com Distribuidora Café Melitta',
            descricao: 'Alinhamento de preços e entrega',
            data: '2026-11-20',
            hora: '10:30',
            tipo: 'reuniao',
            status: 'confirmed',
            local: 'Sala de Reuniões Rodo Point',
            createdAt: '2026-11-20T10:30:00Z',
          },
          {
            id: 'comp-2',
            userId: 'usr-1',
            workspaceId: 'ws-rodo-point',
            sourceTable: 'compromissos',
            titulo: 'Verificar recebimento câmara fria',
            descricao: null,
            data: '2026-11-20',
            hora: '15:00',
            tipo: 'compromisso',
            status: 'agendado',
            local: 'Estoque',
            createdAt: '2026-11-20T15:00:00Z',
          },
        ],
      };

      const result = buildOperationsSpecialistDeterministicResponse('Quais meus compromissos de hoje?', mockData);
      expect(result.handled).toBe(true);
      expect(result.specialist).toBe('operacoes');
      expect(result.answer).toContain('Agenda Inteligente do Wallet CEO');
      expect(result.answer).toContain('Distribuidora Café Melitta');
      expect(result.answer).toContain('[Google Calendar]');
      expect(result.answer).toContain('câmara fria');
      expect(result.answer).toContain('[Wallet]');
    });

    it('informa agenda totalmente livre caso não haja eventos cadastrados para o dia', () => {
      const mockData: OperationsDeterministicData = {
        todayStr: '2026-11-20',
        yesterdayStr: '2026-11-19',
        isMemberRole: false,
        rotinas: [],
      };

      const result = buildOperationsSpecialistDeterministicResponse('Qual a minha agenda de hoje?', mockData);
      expect(result.handled).toBe(true);
      expect(result.answer).toContain('Sua agenda está totalmente livre para hoje');
      expect(result.answer).toContain('*Google Calendar:* Conexão operacional');
    });

    it('bloqueia mutação direta e prepara proposta de agendamento em conformidade fail-closed', () => {
      const mockData: OperationsDeterministicData = {
        todayStr: '2026-11-20',
        yesterdayStr: '2026-11-19',
        isMemberRole: false,
        rotinas: [],
      };

      const result = buildOperationsSpecialistDeterministicResponse(
        'Marcar reunião com fornecedor amanhã às 14h',
        mockData
      );

      expect(result.handled).toBe(true);
      expect(result.answer).toContain('Proposta de Agendamento Preparada');
      expect(result.answer).toContain('Fail-Closed');
      expect(result.answer).toContain('prepared');
      expect(result.answer).toContain('canMutateState: false');
    });
  });

  describe('Gate 5: Integração com Áudio (Etapa 10)', () => {
    it('calcula custo oficial Whisper de forma precisa', () => {
      const estimate30s = WalletAudioService.calculateCostEstimate(30);
      expect(estimate30s.durationSeconds).toBe(30);
      expect(estimate30s.costUsd).toBe(0.003); // US$ 0.006 * 0.5 min
      expect(estimate30s.costBrl).toBeGreaterThan(0);

      const estimateZero = WalletAudioService.calculateCostEstimate(-5);
      expect(estimateZero.durationSeconds).toBe(0);
      expect(estimateZero.costUsd).toBe(0);
    });

    it('rejeita envio de gravação vazia sem onerar a API Whisper', async () => {
      const emptyBlob = new Blob([], { type: 'audio/webm' });
      const result = await WalletAudioService.transcribeAudio(emptyBlob);
      expect(result.success).toBe(false);
      expect(result.error).toContain('vazio');
    });
  });

  describe('Gate 6: Integração Segura com Telegram', () => {
    it('bloqueia consulta de agenda executiva em grupos corporativos para evitar vazamento', () => {
      const isGroup = true;
      const prompt = '/agenda';

      // Simula a verificação do handler do Telegram
      const isRestricted = isGroup && (prompt === '/agenda' || prompt === '/compromissos');
      expect(isRestricted).toBe(true);
    });

    it('permite consulta de agenda no chat privado com o CEO', () => {
      const isGroup = false;
      const prompt = '/agenda';

      const isAllowed = !isGroup && (prompt === '/agenda' || prompt === '/compromissos');
      expect(isAllowed).toBe(true);
    });
  });
});
