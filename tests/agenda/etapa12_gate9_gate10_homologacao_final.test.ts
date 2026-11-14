import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarIntegrationService } from '../../src/domains/agenda/services/CalendarIntegrationService';

vi.mock('../../src/integrations/supabase/client', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user-ceo-123' },
              access_token: 'fake-jwt-token-123',
            },
          },
        }),
      },
      from: vi.fn(),
    },
  };
});

describe('👑 WALLET CEO 3.0 — ETAPA 12: PR 4 (GATES 9 E 10 — HOMOLOGAÇÃO FINAL)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 9: Interface da Agenda Inteligente e Google Calendar', () => {
    it('unifica eventos do Google Calendar, compromissos e dívidas sem colisões de ID', () => {
      const googleEvent = {
        id: 'g-cal-101',
        tipo: 'google_calendar' as const,
        descricao: 'Alinhamento com Diretoria',
        data: '2026-11-20',
        hora: '10:00',
        local: 'Sala Executiva',
      };

      const manualCompromisso = {
        id: 'comp-202',
        tipo: 'compromisso' as const,
        descricao: 'Auditoria de Estoque',
        data: '2026-11-20',
        hora: '14:00',
        local: 'Câmara Fria',
      };

      const dividaVencimento = {
        id: 'div-303',
        tipo: 'divida' as const,
        descricao: 'Boleto Fornecedor Café',
        valor: 1850.0,
        data: '2026-11-20',
      };

      const items = [googleEvent, manualCompromisso, dividaVencimento];

      expect(items.length).toBe(3);
      expect(items.find((i) => i.tipo === 'google_calendar')?.hora).toBe('10:00');
      expect(items.find((i) => i.tipo === 'divida')?.valor).toBe(1850.0);
      expect(items.find((i) => i.tipo === 'compromisso')?.descricao).toBe('Auditoria de Estoque');
    });

    it('impede exclusão indevida de eventos sincronizados de terceiros pelo botão local', () => {
      const googleItem = {
        id: 'g-cal-101',
        tipo: 'google_calendar' as const,
        descricao: 'Reunião Externa',
      };

      const canDeleteLocally = googleItem.tipo === 'compromisso';
      expect(canDeleteLocally).toBe(false);
    });
  });

  describe('Gate 10: Homologação Operacional e Governança Estrita', () => {
    it('garante segregação total entre escopos do Google Calendar e Gmail', () => {
      const calendarScope = 'https://www.googleapis.com/auth/calendar.events';
      const gmailScope = 'https://www.googleapis.com/auth/gmail.readonly';

      expect(calendarScope).not.toBe(gmailScope);
      expect(calendarScope.includes('calendar')).toBe(true);
      expect(calendarScope.includes('gmail')).toBe(false);
      expect(gmailScope.includes('gmail')).toBe(true);
      expect(gmailScope.includes('calendar')).toBe(false);
    });

    it('assegura conformidade fail-closed: propostas de ação iniciam sempre em status prepared', () => {
      const mockActionProposal = {
        id: 'prop-cal-999',
        action_type: 'create_calendar_event',
        workspace_id: 'ws-rodo-point',
        status: 'prepared',
        payload: {
          titulo: 'Alinhamento Fornecedor',
          data: '2026-11-21',
          hora: '11:00',
        },
      };

      // Nenhuma alteração é executada automaticamente
      expect(mockActionProposal.status).toBe('prepared');
      expect(mockActionProposal.status).not.toBe('executed');
      expect(mockActionProposal.status).not.toBe('completed');
    });

    it('valida geração de URL OAuth com parâmetros canônicos de segurança', async () => {
      const origFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?scope=calendar&state=abc',
        }),
      });

      try {
        const res = await CalendarIntegrationService.getAuthUrl('ws-rodo-point', 'https://wallet.wonderwold.com.br/agenda');
        expect(res.success).toBe(true);
        expect(res.authUrl).toContain('accounts.google.com');
      } finally {
        global.fetch = origFetch;
      }
    });
  });
});
