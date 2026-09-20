import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuth } from './useAuth';

vi.mock('@/domains/auth/services/AuthService', () => ({
  authService: {
    getSession: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const mockUnsubscribe = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      })),
    },
  },
}));

import { authService } from '@/domains/auth/services/AuthService';
import { supabase } from '@/integrations/supabase/client';

describe('useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inicializa com sessão ativa do usuário e desliga loading', async () => {
    const mockUser = { id: 'usr-1', email: 'teste@wallet.com' };
    const mockSession = { user: mockUser, access_token: 'tok-123' };

    vi.mocked(authService.getSession).mockResolvedValueOnce({
      session: mockSession as never,
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.session).toEqual(mockSession);
  });

  it('sincroniza com alterações de onAuthStateChange', async () => {
    let authCallback: ((event: string, session: unknown) => void) | null = null;
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementationOnce((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    vi.mocked(authService.getSession).mockResolvedValueOnce({
      session: null,
      error: null,
    });

    const { result, unmount } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();

    // Simula evento de login posterior
    const newUser = { id: 'usr-2', email: 'novo@wallet.com' };
    const newSession = { user: newUser, access_token: 'tok-456' };

    act(() => {
      if (authCallback) {
        authCallback('SIGNED_IN', newSession);
      }
    });

    expect(result.current.user).toEqual(newUser);
    expect(result.current.session).toEqual(newSession);

    // Unmount desinscreve o listener
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('executa signIn com sucesso', async () => {
    vi.mocked(authService.getSession).mockResolvedValueOnce({
      session: null,
      error: null,
    });
    vi.mocked(authService.signIn).mockResolvedValueOnce({
      success: true,
      data: { user: { id: 'u1' } } as never,
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.signIn('user@teste.com', 'senha123');
    });

    expect(res?.error).toBeNull();
    expect(authService.signIn).toHaveBeenCalledWith({
      email: 'user@teste.com',
      password: 'senha123',
    });
  });

  it('executa signIn com falha e retorna erro', async () => {
    vi.mocked(authService.getSession).mockResolvedValueOnce({
      session: null,
      error: null,
    });
    vi.mocked(authService.signIn).mockResolvedValueOnce({
      success: false,
      error: 'Credenciais inválidas',
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.signIn('user@teste.com', 'errada');
    });

    expect(res?.error).toBeInstanceOf(Error);
    expect(res?.error?.message).toBe('Credenciais inválidas');
  });

  it('executa signUp com sucesso', async () => {
    vi.mocked(authService.getSession).mockResolvedValueOnce({
      session: null,
      error: null,
    });
    vi.mocked(authService.signUp).mockResolvedValueOnce({
      success: true,
      data: { user: { id: 'u1' } } as never,
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.signUp('user@teste.com', '123456', 'Carlos', 'Empresa', '11999999999');
    });

    expect(res?.error).toBeNull();
  });

  it('executa signOut e resetPassword', async () => {
    vi.mocked(authService.getSession).mockResolvedValueOnce({
      session: null,
      error: null,
    });
    vi.mocked(authService.signOut).mockResolvedValueOnce({ success: true });
    vi.mocked(authService.resetPassword).mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });
    expect(authService.signOut).toHaveBeenCalled();

    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.resetPassword('user@teste.com');
    });
    expect(res?.error).toBeNull();
  });
});
