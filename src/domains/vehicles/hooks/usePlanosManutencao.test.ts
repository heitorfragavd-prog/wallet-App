import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePlanosManutencao } from './usePlanosManutencao';
import { supabase } from '@/integrations/supabase/client';
import { ManutencaoService } from '../services/ManutencaoService';

// Mock do Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

// Mock do ManutencaoService
vi.mock('../services/ManutencaoService', () => ({
  ManutencaoService: {
    calcularDataPrevista: vi.fn(),
  },
}));

// Mock do useToast
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('usePlanosManutencao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPlanos', () => {
    it('deve buscar planos de manutenção com sucesso', async () => {
      const mockPlanos = [
        {
          id: 'plano-1',
          veiculo_id: 'veiculo-123',
          tipo_manutencao_id: 'tipo-1',
          intervalo_km: 5000,
          ativo: true,
          tipo_manutencao: {
            id: 'tipo-1',
            nome: 'Troca de Óleo',
            sistema: 'Motor',
          },
        },
        {
          id: 'plano-2',
          veiculo_id: 'veiculo-123',
          tipo_manutencao_id: 'tipo-2',
          intervalo_km: 10000,
          ativo: true,
          tipo_manutencao: {
            id: 'tipo-2',
            nome: 'Revisão Geral',
            sistema: 'Geral',
          },
        },
      ];

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: mockPlanos,
              error: null,
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() => usePlanosManutencao('veiculo-123'));

      // Aguardar carregamento
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.planos).toHaveLength(2);
      expect(result.current.planos[0].id).toBe('plano-1');
      expect(result.current.planos[1].id).toBe('plano-2');
    });

    it('deve buscar todos os planos quando veiculoId não é fornecido', async () => {
      const mockPlanos = [
        {
          id: 'plano-1',
          veiculo_id: 'veiculo-123',
          tipo_manutencao_id: 'tipo-1',
          intervalo_km: 5000,
          ativo: true,
        },
        {
          id: 'plano-2',
          veiculo_id: 'veiculo-456',
          tipo_manutencao_id: 'tipo-2',
          intervalo_km: 10000,
          ativo: true,
        },
      ];

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockPlanos,
            error: null,
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() => usePlanosManutencao());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.planos).toHaveLength(2);
    });

    it('deve retornar array vazio quando não há planos', async () => {
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

      const { result } = renderHook(() => usePlanosManutencao('veiculo-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.planos).toHaveLength(0);
    });
  });

  describe('adicionarPlano', () => {
    it('deve adicionar plano sem lembrete', async () => {
      const mockUser = { id: 'user-123' };
      const mockPlano = {
        id: 'plano-novo',
        veiculo_id: 'veiculo-123',
        tipo_manutencao_id: 'tipo-1',
        intervalo_km: 5000,
        ativo: true,
        tipo_manutencao: {
          id: 'tipo-1',
          nome: 'Troca de Óleo',
          sistema: 'Motor',
        },
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser as any },
        error: null,
      });

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'planos_manutencao_veiculo') {
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
                  data: mockPlano,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() => usePlanosManutencao('veiculo-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let planoAdicionado: any;
      await act(async () => {
        planoAdicionado = await result.current.adicionarPlano({
          veiculo_id: 'veiculo-123',
          tipo_manutencao_id: 'tipo-1',
          intervalo_km: 5000,
          criar_lembrete: false,
        });
      });

      expect(planoAdicionado).toBeDefined();
      expect(planoAdicionado.id).toBe('plano-novo');
      expect(result.current.planos).toHaveLength(1);
    });

    it('deve adicionar plano com lembrete', async () => {
      const mockUser = { id: 'user-123' };
      const mockPlano = {
        id: 'plano-novo',
        veiculo_id: 'veiculo-123',
        tipo_manutencao_id: 'tipo-1',
        intervalo_km: 5000,
        ativo: true,
      };

      const mockDataPrevista = new Date('2025-12-01');

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser as any },
        error: null,
      });

      vi.mocked(ManutencaoService.calcularDataPrevista).mockResolvedValue(
        mockDataPrevista
      );

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'planos_manutencao_veiculo') {
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
                  data: mockPlano,
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

      const { result } = renderHook(() => usePlanosManutencao('veiculo-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.adicionarPlano({
          veiculo_id: 'veiculo-123',
          tipo_manutencao_id: 'tipo-1',
          intervalo_km: 5000,
          criar_lembrete: true,
          dias_antecedencia: 7,
        });
      });

      expect(ManutencaoService.calcularDataPrevista).toHaveBeenCalledWith(
        'veiculo-123',
        5000
      );
    });

    it('deve tratar erro de duplicação', async () => {
      const mockUser = { id: 'user-123' };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser as any },
        error: null,
      });

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'planos_manutencao_veiculo') {
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
                  data: null,
                  error: { code: '23505', message: 'Duplicate key' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const { result } = renderHook(() => usePlanosManutencao('veiculo-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let planoAdicionado: any;
      await act(async () => {
        planoAdicionado = await result.current.adicionarPlano({
          veiculo_id: 'veiculo-123',
          tipo_manutencao_id: 'tipo-1',
          intervalo_km: 5000,
        });
      });

      expect(planoAdicionado).toBeUndefined();
      expect(result.current.planos).toHaveLength(0);
    });
  });

  describe('atualizarPlano', () => {
    it('deve atualizar intervalo_km do plano', async () => {
      const mockPlanoInicial = {
        id: 'plano-1',
        veiculo_id: 'veiculo-123',
        tipo_manutencao_id: 'tipo-1',
        intervalo_km: 5000,
        ativo: true,
      };

      const mockPlanoAtualizado = {
        ...mockPlanoInicial,
        intervalo_km: 7000,
      };

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'planos_manutencao_veiculo') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [mockPlanoInicial],
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: mockPlanoAtualizado,
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

      const { result } = renderHook(() => usePlanosManutencao('veiculo-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.atualizarPlano({
          id: 'plano-1',
          intervalo_km: 7000,
        });
      });

      expect(result.current.planos[0].intervalo_km).toBe(7000);
    });

    it('deve desativar plano', async () => {
      const mockPlanoInicial = {
        id: 'plano-1',
        veiculo_id: 'veiculo-123',
        tipo_manutencao_id: 'tipo-1',
        intervalo_km: 5000,
        ativo: true,
      };

      const mockPlanoAtualizado = {
        ...mockPlanoInicial,
        ativo: false,
      };

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'planos_manutencao_veiculo') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [mockPlanoInicial],
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: mockPlanoAtualizado,
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

      const { result } = renderHook(() => usePlanosManutencao('veiculo-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.atualizarPlano({
          id: 'plano-1',
          ativo: false,
        });
      });

      expect(result.current.planos[0].ativo).toBe(false);
    });
  });

  describe('removerPlano', () => {
    it('deve remover plano e cancelar lembretes', async () => {
      const mockPlano = {
        id: 'plano-1',
        veiculo_id: 'veiculo-123',
        tipo_manutencao_id: 'tipo-1',
        intervalo_km: 5000,
        ativo: true,
      };

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'planos_manutencao_veiculo') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [mockPlano],
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

      const { result } = renderHook(() => usePlanosManutencao('veiculo-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.planos).toHaveLength(1);

      await act(async () => {
        await result.current.removerPlano('plano-1');
      });

      expect(result.current.planos).toHaveLength(0);
    });
  });
});
