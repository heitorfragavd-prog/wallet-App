import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProfile } from './useProfile';

// ── Mocks ────────────────────────────────────────────────────────

const mockUser = { id: 'user-uuid-1', email: 'investidor@teste.com' };

vi.mock('@/domains/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: vi.fn(),
    },
  },
}));

import { useAuth } from '@/domains/auth/hooks/useAuth';

describe('useProfile Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carrega o perfil com sucesso quando retornado pelo banco', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      loading: false,
      session: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const mockProfileData = {
      id: 'profile-uuid-1',
      user_id: mockUser.id,
      name: 'Investidor Teste',
      email: 'investidor@teste.com',
      telefone: '11999999999',
      endereco: 'Rua das Finanças, 100',
      avatar_url: null,
      organization_name: 'Minha Empresa',
      role: 'user',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    };

    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: mockProfileData,
      error: null,
    });

    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockReturnValue({ select: selectMock });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toEqual(mockProfileData);
    expect(result.current.error).toBeNull();
  });

  it('não realiza consulta e encerra loading quando usuário não está autenticado', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      session: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('aciona fallback defensivo estritamente em erro de coluna inexistente no schema (Postgres 42703)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      loading: false,
      session: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42703',
        message: 'column profiles.endereco does not exist',
      },
    });

    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockReturnValue({ select: selectMock });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).not.toBeNull();
    expect(result.current.profile?.user_id).toBe(mockUser.id);
    expect(result.current.profile?.role).toBe('user');
    expect(result.current.profile?.role).not.toBe('admin');
    expect(result.current.error).toBeNull();
  });

  it('aciona fallback defensivo em erro de PostgREST schema cache (PGRST204)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      loading: false,
      session: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST204',
        message: "Could not find the 'endereco' column of 'profiles' in the schema cache",
      },
    });

    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockReturnValue({ select: selectMock });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).not.toBeNull();
    expect(result.current.profile?.role).toBe('user');
    expect(result.current.error).toBeNull();
  });

  it('NÃO aciona fallback defensivo para erros de permissão/autorização (42501 permission denied)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      loading: false,
      session: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for table profiles',
      },
    });

    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockReturnValue({ select: selectMock });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('permission denied for table profiles');
  });

  it('NÃO aciona fallback defensivo para erros de tabela inexistente (42P01)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      loading: false,
      session: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42P01',
        message: 'relation "profiles" does not exist',
      },
    });

    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockReturnValue({ select: selectMock });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('relation "profiles" does not exist');
  });
});