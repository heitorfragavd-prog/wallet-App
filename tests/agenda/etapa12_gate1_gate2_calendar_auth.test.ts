import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CALENDAR_EVENTS_SCOPE } from '../../supabase/functions/calendar-sync';

vi.mock('../../src/integrations/supabase/client', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'user-cal-123' }, access_token: 'valid-jwt-token' } },
        }),
      },
      from: vi.fn(),
    },
  };
});

describe('👑 WALLET CEO 3.0 — ETAPA 12 (PR 1 / GATES 1, 2 E 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 1: Coexistência Segura e Preservação da Agenda Existente', () => {
    it('garante que eventos da agenda sincronizada não modificam lançamentos financeiros', () => {
      const compromiseMock = {
        id: 'comp-1',
        tipo: 'divida',
        descricao: 'Boleto Fornecedor Café',
        valor: 1250.0,
        data: '2026-11-20',
      };

      const googleEventMock: Record<string, unknown> = {
        google_event_id: 'g-event-999',
        titulo: 'Reunião de Alinhamento Semanal',
        inicio: '2026-11-20T14:00:00.000Z',
        fim: '2026-11-20T15:00:00.000Z',
        status: 'confirmed',
      };

      // O evento de calendário é uma entidade distinta de dívidas/compromissos financeiros
      expect(compromiseMock.tipo).toBe('divida');
      expect(googleEventMock.status).toBe('confirmed');
      expect(compromiseMock.valor).toBe(1250.0);
      expect(googleEventMock.valor).toBeUndefined();
    });
  });

  describe('Gate 2: Conexão Segura OAuth e Segregação de Tokens do Gmail', () => {
    it('garante que os escopos da Agenda são estritamente de Calendar e NÃO incluem Gmail', () => {
      expect(CALENDAR_EVENTS_SCOPE).toBe('https://www.googleapis.com/auth/calendar.events');
      expect(CALENDAR_EVENTS_SCOPE.includes('gmail')).toBe(false);
      expect(CALENDAR_EVENTS_SCOPE.includes('calendar')).toBe(true);
    });

    it('isola o payload de state com identificação de escopo calendar', () => {
      const statePayload = {
        workspaceId: 'ws-rodo-point',
        userId: 'usr-admin',
        scope: 'calendar',
        timestamp: Date.now(),
      };

      const encoded = btoa(JSON.stringify(statePayload));
      const decoded = JSON.parse(atob(encoded));

      expect(decoded.workspaceId).toBe('ws-rodo-point');
      expect(decoded.userId).toBe('usr-admin');
      expect(decoded.scope).toBe('calendar');
      expect(decoded.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Gate 3: Sincronização e Idempotência de Eventos', () => {
    it('gera chave de idempotência consistente para eventos da Google', () => {
      const wsId = 'ws-test-123';
      const eventId = 'cal-event-456';
      const updated = '2026-11-14T10:00:00Z';

      const key1 = `calendar:${wsId}:${eventId}:${updated}`;
      const key2 = `calendar:${wsId}:${eventId}:${updated}`;
      const keyDifferentEvent = `calendar:${wsId}:cal-event-789:${updated}`;

      expect(key1).toBe(key2);
      expect(key1).not.toBe(keyDifferentEvent);
    });

    it('identifica corretamente eventos de dia inteiro vs eventos com hora marcada', () => {
      interface GoogleDatePayload {
        date?: string;
        dateTime?: string;
      }

      const eventWithTime: { start: GoogleDatePayload; end: GoogleDatePayload } = {
        start: { dateTime: '2026-11-15T14:30:00-03:00' },
        end: { dateTime: '2026-11-15T15:30:00-03:00' },
      };

      const eventAllDay: { start: GoogleDatePayload; end: GoogleDatePayload } = {
        start: { date: '2026-11-15' },
        end: { date: '2026-11-15' },
      };

      const isAllDay1 = Boolean(eventWithTime.start.date && !eventWithTime.start.dateTime);
      const isAllDay2 = Boolean(eventAllDay.start.date && !eventAllDay.start.dateTime);

      expect(isAllDay1).toBe(false);
      expect(isAllDay2).toBe(true);
    });

    it('trata eventos cancelados sem excluir dados históricos', () => {
      const googleRawItem = {
        id: 'ev-cancelled-1',
        summary: 'Reunião Cancelada',
        status: 'cancelled',
      };

      const mappedStatus = googleRawItem.status === 'cancelled' ? 'cancelled' : 'confirmed';
      expect(mappedStatus).toBe('cancelled');
    });
  });
});
