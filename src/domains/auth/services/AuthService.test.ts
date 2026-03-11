/**
 * AuthService Unit Tests
 *
 * Tests sign up, sign in, sign out, resetPassword and getSession
 * using Vitest + vi.mock for Supabase isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from './AuthService';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/core/errors/ErrorService', () => ({
  errorService: {
    handle: vi.fn((err) => ({ code: 'UNKNOWN', message: String(err) })),
    getUserMessage: vi.fn(() => 'Ocorreu um erro. Tente novamente.'),
  },
}));

// Importa o mock APÓS os vi.mock para evitar hoisting issues
import { supabase } from '@/integrations/supabase/client';

// ── Helpers ───────────────────────────────────────────────────────

const mockAuthSuccess = (method: keyof typeof supabase.auth) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.auth[method] as any).mockResolvedValue({ error: null });
};

const mockAuthError = (method: keyof typeof supabase.auth, message = 'Auth error') => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.auth[method] as any).mockResolvedValue({
    error: { message, name: 'AuthApiError', status: 400 },
  });
};

// ── Tests ─────────────────────────────────────────────────────────

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // window.location.origin precisa existir em JSDOM
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost' },
      writable: true,
    });
  });

  // ── signUp ─────────────────────────────────────────────────────
  describe('signUp', () => {
    const params = {
      email: 'test@example.com',
      password: 'Senha@123',
      name: 'Test User',
      organizationName: 'ACME',
      telefone: '11999999999',
    };

    it('retorna success: true quando Supabase não retorna erro', async () => {
      mockAuthSuccess('signUp');
      const result = await authService.signUp(params);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('retorna success: false quando Supabase retorna erro', async () => {
      mockAuthError('signUp', 'Email já cadastrado');
      const result = await authService.signUp(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('chama supabase.auth.signUp com email e password corretos', async () => {
      mockAuthSuccess('signUp');
      await authService.signUp(params);
      expect(supabase.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: params.email, password: params.password })
      );
    });

    it('retorna success: false quando Supabase lança exceção inesperada', async () => {
      vi.mocked(supabase.auth.signUp).mockRejectedValue(new Error('Network error'));
      const result = await authService.signUp(params);
      expect(result.success).toBe(false);
    });
  });

  // ── signIn ─────────────────────────────────────────────────────
  describe('signIn', () => {
    const params = { email: 'test@example.com', password: 'Senha@123' };

    it('retorna success: true com credenciais válidas', async () => {
      mockAuthSuccess('signInWithPassword');
      const result = await authService.signIn(params);
      expect(result.success).toBe(true);
    });

    it('retorna success: false com email/senha inválidos', async () => {
      mockAuthError('signInWithPassword', 'Invalid login credentials');
      const result = await authService.signIn(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('chama signInWithPassword com os parâmetros corretos', async () => {
      mockAuthSuccess('signInWithPassword');
      await authService.signIn(params);
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: params.email,
        password: params.password,
      });
    });

    it('trata exceção inesperada e retorna success: false', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockRejectedValue(new Error('Network'));
      const result = await authService.signIn(params);
      expect(result.success).toBe(false);
    });
  });

  // ── signOut ────────────────────────────────────────────────────
  describe('signOut', () => {
    it('retorna success: true quando signed out com sucesso', async () => {
      mockAuthSuccess('signOut');
      const result = await authService.signOut();
      expect(result.success).toBe(true);
    });

    it('retorna success: false quando Supabase retorna erro', async () => {
      mockAuthError('signOut', 'Session not found');
      const result = await authService.signOut();
      expect(result.success).toBe(false);
    });

    it('trata exceção inesperada', async () => {
      vi.mocked(supabase.auth.signOut).mockRejectedValue(new Error('Network'));
      const result = await authService.signOut();
      expect(result.success).toBe(false);
    });
  });

  // ── resetPassword ──────────────────────────────────────────────
  describe('resetPassword', () => {
    const email = 'test@example.com';

    it('retorna success: true quando email de reset é enviado', async () => {
      mockAuthSuccess('resetPasswordForEmail');
      const result = await authService.resetPassword(email);
      expect(result.success).toBe(true);
    });

    it('retorna success: false quando email não é encontrado', async () => {
      mockAuthError('resetPasswordForEmail', 'User not found');
      const result = await authService.resetPassword(email);
      expect(result.success).toBe(false);
    });

    it('inclui redirectTo na chamada ao Supabase', async () => {
      mockAuthSuccess('resetPasswordForEmail');
      await authService.resetPassword(email);
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        email,
        expect.objectContaining({ redirectTo: expect.stringContaining('/login') })
      );
    });

    it('trata exceção inesperada', async () => {
      vi.mocked(supabase.auth.resetPasswordForEmail).mockRejectedValue(new Error('Network'));
      const result = await authService.resetPassword(email);
      expect(result.success).toBe(false);
    });
  });

  // ── getSession ─────────────────────────────────────────────────
  describe('getSession', () => {
    it('retorna session quando há sessão ativa', async () => {
      const mockSession = { access_token: 'token123', user: { id: 'user-1' } };
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      } as never);

      const result = await authService.getSession();
      expect(result.session).toEqual(mockSession);
      expect(result.error).toBeNull();
    });

    it('retorna session: null quando não há sessão', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as never);

      const result = await authService.getSession();
      expect(result.session).toBeNull();
    });

    it('retorna error quando Supabase retorna erro', async () => {
      const mockError = { message: 'Session error' };
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: mockError,
      } as never);

      const result = await authService.getSession();
      expect(result.error).toEqual(mockError);
    });

    it('trata exceção inesperada e retorna session: null', async () => {
      vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error('Network'));
      const result = await authService.getSession();
      expect(result.session).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });
});
