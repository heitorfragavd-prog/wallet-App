import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useManutencoesCustomizadas } from './useManutencoesCustomizadas';
import { supabase } from '@/integrations/supabase/client';

// Mock do Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

// Mock do useToast
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('useManutencoesCustomizadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchCustomizadas', () => {
    it('deve buscar manutenções customizadas com sucesso', async () => {
      const mockCustomizadas = [
        {
          id: 'custom-1',
          veiculo_id: 'veiculo-123',
          nome: 'Troca de Pneus',
          sistema: 'Rodas',
          intervalo_km: 40000,
          data_prevista: null,
          ativo: true,
        },
        {
          id: 'custom-2',
          veiculo_id: 'veiculo-123',
          nome: 'Limpeza de Bicos',
          sistema: 'Motor',
          intervalo_km: 15000,
          data_prevista: null,
          ativo: true,
        },
      ];

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: mockCustomizadas,
              error: null,
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.customizadas).toHaveLength(2);
      expect(result.current.customizadas[0].nome).toBe('Troca de Pneus');
      expect(result.current.customizadas[1].nome).toBe('Limpeza de Bicos');
    });

    it('deve buscar todas as customizadas quando veiculoId não é fornecido', async () => {
      const mockCustomizadas = [
        {
          id: 'custom-1',
          veiculo_id: 'veiculo-123',
          nome: 'Troca de Pneus',
          sistema: 'Rodas',
          intervalo_km: 40000,
          ativo: true,
        },
        {
          id: 'custom-2',
          veiculo_id: 'veiculo-456',
          nome: 'Limpeza de Bicos',
          sistema: 'Motor',
          intervalo_km: 15000,
          ativo: true,
        },
      ];

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockCustomizadas,
            error: null,
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() => useManutencoesCustomizadas());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.customizadas).toHaveLength(2);
    });

    it('deve retornar array vazio quando não há customizadas', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.customizadas).toHaveLength(0);
    });
  });

  describe('adicionarCustomizada', () => {
    it('deve adicionar manutenção customizada sem lembrete', async () => {
      const mockUser = { id: 'user-123' };
      const mockCustomizada = {
        id: 'custom-novo',
        veiculo_id: 'veiculo-123',
        nome: 'Troca de Pneus',
        sistema: 'Rodas',
        intervalo_km: 40000,
        data_prevista: null,
        ativo: true,
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser as any },
        error: null,
      });

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'manutencoes_customizadas') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockCustomizada,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let customizadaAdicionada: any;
      await act(async () => {
        customizadaAdicionada = await result.current.adicionarCustomizada({
          veiculo_id: 'veiculo-123',
          nome: 'Troca de Pneus',
          sistema: 'Rodas',
          intervalo_km: 40000,
          criar_lembrete: false,
        });
      });

      expect(customizadaAdicionada).toBeDefined();
      expect(customizadaAdicionada.id).toBe('custom-novo');
      expect(customizadaAdicionada.nome).toBe('Troca de Pneus');
      expect(result.current.customizadas).toHaveLength(1);
    });

    it('deve adicionar manutenção customizada com lembrete', async () => {
      const mockUser = { id: 'user-123' };
      const mockCustomizada = {
        id: 'custom-novo',
        veiculo_id: 'veiculo-123',
        nome: 'Inspeção Anual',
        sistema: 'Geral',
        intervalo_km: null,
        data_prevista: '2025-12-01',
        ativo: true,
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser as any },
        error: null,
      });

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'manutencoes_customizadas') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockCustomizada,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'lembretes_manutencao') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: { id: 'lembrete-novo' },
              error: null,
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.adicionarCustomizada({
          veiculo_id: 'veiculo-123',
          nome: 'Inspeção Anual',
          sistema: 'Geral',
          data_prevista: '2025-12-01',
          criar_lembrete: true,
          dias_antecedencia: 15,
        });
      });

      expect(result.current.customizadas).toHaveLength(1);
    });

    it('deve adicionar manutenção customizada apenas com nome (campos opcionais)', async () => {
      const mockUser = { id: 'user-123' };
      const mockCustomizada = {
        id: 'custom-novo',
        veiculo_id: 'veiculo-123',
        nome: 'Manutenção Especial',
        sistema: null,
        intervalo_km: null,
        data_prevista: null,
        ativo: true,
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser as any },
        error: null,
      });

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'manutencoes_customizadas') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockCustomizada,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let customizadaAdicionada: any;
      await act(async () => {
        customizadaAdicionada = await result.current.adicionarCustomizada({
          veiculo_id: 'veiculo-123',
          nome: 'Manutenção Especial',
        });
      });

      expect(customizadaAdicionada).toBeDefined();
      expect(customizadaAdicionada.nome).toBe('Manutenção Especial');
      expect(customizadaAdicionada.sistema).toBeNull();
      expect(customizadaAdicionada.intervalo_km).toBeNull();
    });

    it('não deve criar lembrete se criar_lembrete for false', async () => {
      const mockUser = { id: 'user-123' };
      const mockCustomizada = {
        id: 'custom-novo',
        veiculo_id: 'veiculo-123',
        nome: 'Inspeção',
        data_prevista: '2025-12-01',
        ativo: true,
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser as any },
        error: null,
      });

      let lembreteInsertCalled = false;

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'manutencoes_customizadas') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockCustomizada,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'lembretes_manutencao') {
          return {
            insert: vi.fn().mockImplementation(() => {
              lembreteInsertCalled = true;
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.adicionarCustomizada({
          veiculo_id: 'veiculo-123',
          nome: 'Inspeção',
          data_prevista: '2025-12-01',
          criar_lembrete: false,
        });
      });

      expect(lembreteInsertCalled).toBe(false);
    });
  });

  describe('atualizarCustomizada', () => {
    it('deve atualizar nome da customizada', async () => {
      const mockCustomizadaInicial = {
        id: 'custom-1',
        veiculo_id: 'veiculo-123',
        nome: 'Troca de Pneus',
        sistema: 'Rodas',
        intervalo_km: 40000,
        ativo: true,
      };

      const mockCustomizadaAtualizada = {
        ...mockCustomizadaInicial,
        nome: 'Troca de Pneus Completa',
      };

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'manutencoes_customizadas') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [mockCustomizadaInicial],
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: mockCustomizadaAtualizada,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.atualizarCustomizada({
          id: 'custom-1',
          nome: 'Troca de Pneus Completa',
        });
      });

      expect(result.current.customizadas[0].nome).toBe('Troca de Pneus Completa');
    });

    it('deve atualizar múltiplos campos', async () => {
      const mockCustomizadaInicial = {
        id: 'custom-1',
        veiculo_id: 'veiculo-123',
        nome: 'Manutenção',
        sistema: 'Motor',
        intervalo_km: 10000,
        ativo: true,
      };

      const mockCustomizadaAtualizada = {
        ...mockCustomizadaInicial,
        nome: 'Manutenção Completa',
        sistema: 'Geral',
        intervalo_km: 15000,
      };

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'manutencoes_customizadas') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [mockCustomizadaInicial],
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: mockCustomizadaAtualizada,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.atualizarCustomizada({
          id: 'custom-1',
          nome: 'Manutenção Completa',
          sistema: 'Geral',
          intervalo_km: 15000,
        });
      });

      expect(result.current.customizadas[0].nome).toBe('Manutenção Completa');
      expect(result.current.customizadas[0].sistema).toBe('Geral');
      expect(result.current.customizadas[0].intervalo_km).toBe(15000);
    });

    it('deve desativar customizada', async () => {
      const mockCustomizadaInicial = {
        id: 'custom-1',
        veiculo_id: 'veiculo-123',
        nome: 'Manutenção',
        ativo: true,
      };

      const mockCustomizadaAtualizada = {
        ...mockCustomizadaInicial,
        ativo: false,
      };

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'manutencoes_customizadas') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [mockCustomizadaInicial],
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: mockCustomizadaAtualizada,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.atualizarCustomizada({
          id: 'custom-1',
          ativo: false,
        });
      });

      expect(result.current.customizadas[0].ativo).toBe(false);
    });
  });

  describe('removerCustomizada', () => {
    it('deve remover customizada e cancelar lembretes', async () => {
      const mockCustomizada = {
        id: 'custom-1',
        veiculo_id: 'veiculo-123',
        nome: 'Troca de Pneus',
        sistema: 'Rodas',
        intervalo_km: 40000,
        ativo: true,
      };

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'manutencoes_customizadas') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [mockCustomizada],
                  error: null,
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          };
        }
        if (table === 'lembretes_manutencao') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() =>
        useManutencoesCustomizadas('veiculo-123')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.customizadas).toHaveLength(1);

      await act(async () => {
        await result.current.removerCustomizada('custom-1');
      });

      expect(result.current.customizadas).toHaveLength(0);
    });
  });
});
