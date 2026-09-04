import { describe, it, expect, vi, beforeEach } from 'vitest';
import { divipayService } from './DivipayService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';

describe('DivipayService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('invoke error handling & responses', () => {
    it('lança erro e registra log quando o Edge Function retorna erro de transporte (500)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: new Error('Internal Server Error 500'),
      });

      await expect(divipayService.getBalance()).rejects.toThrow('Internal Server Error 500');
    });

    it('lança erro quando a API retorna success: false com mensagem de erro (ex: 401 ou 429)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Rate limit exceeded (429): Muitas requisições',
        },
        error: null,
      });

      await expect(divipayService.getBalance()).rejects.toThrow('Rate limit exceeded (429): Muitas requisições');
    });
  });

  describe('getBalance', () => {
    it('normaliza objeto único retornado pela API /api/me para array de saldos', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: 'acc-123',
            name: 'Conta Empresarial',
            balance: 5430.5,
            balanceBlocked: 100.0,
            balanceLocked: 50.0,
          },
        },
        error: null,
      });

      const balances = await divipayService.getBalance();

      expect(balances).toHaveLength(1);
      expect(balances[0].id).toBe('acc-123');
      expect(balances[0].name).toBe('Conta Empresarial');
      expect(balances[0].balance).toBe(5430.5);
      expect(balances[0].balanceBlocked).toBe(100.0);
      expect(balances[0].balanceLocked).toBe(50.0);
    });

    it('suporta array com múltiplas contas bancárias', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: [
            { id: '1', nome: 'Principal', saldo: 1000 },
            { id: '2', nome: 'Reserva', saldo: 2500 },
          ],
        },
        error: null,
      });

      const balances = await divipayService.getBalance();

      expect(balances).toHaveLength(2);
      expect(balances[0].name).toBe('Principal');
      expect(balances[0].balance).toBe(1000);
      expect(balances[1].name).toBe('Reserva');
      expect(balances[1].balance).toBe(2500);
    });
  });

  describe('cancelPixCharge', () => {
    it('cancela cobrança Pix retornando status e id', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: { success: true, id: 'ch-999' },
        },
        error: null,
      });

      const res = await divipayService.cancelPixCharge('ch-999');

      expect(res.success).toBe(true);
      expect(res.id).toBe('ch-999');
    });
  });

  describe('validatePixKey', () => {
    it('valida chave Pix e mapeia dados do recebedor', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            consultId: 'cons-01',
            key: 'user@example.com',
            type: 'EMAIL',
            ownerName: 'Maria Silva',
            document: '12345678900',
            bankName: 'Banco Inter',
          },
        },
        error: null,
      });

      const res = await divipayService.validatePixKey('user@example.com');

      expect(res.consultId).toBe('cons-01');
      expect(res.key).toBe('user@example.com');
      expect(res.ownerName).toBe('Maria Silva');
      expect(res.ownerDocument).toBe('12345678900');
    });
  });

  describe('Autenticação e Permissão de Usuário', () => {
    it('lança erro "Usuário não autenticado" ao tentar buscar configuração sem login ativo', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: null },
      });

      await expect(divipayService.getConfig()).rejects.toThrow('Usuário não autenticado');
    });
  });
});
