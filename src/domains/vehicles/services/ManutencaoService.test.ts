import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManutencaoService } from './ManutencaoService';
import { supabase } from '@/integrations/supabase/client';

// Mock do Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('ManutencaoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calcularMediaKmMes', () => {
    it('deve retornar 1000 km/mês quando não há histórico', async () => {
      // Mock: sem histórico de manutenções
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const resultado = await ManutencaoService.calcularMediaKmMes('veiculo-123', 10000);

      expect(resultado).toBe(1000);
    });

    it('deve calcular média corretamente com histórico válido', async () => {
      // Mock: última manutenção há 30 dias com 1500 km rodados
      const dataUltimaManutencao = new Date();
      dataUltimaManutencao.setDate(dataUltimaManutencao.getDate() - 30);

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      data_realizada: dataUltimaManutencao.toISOString(),
                      quilometragem_realizada: 8500,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      // Veículo atual: 10000 km
      // Última manutenção: 8500 km há 30 dias
      // KM rodados: 1500 km
      // Média: 1500 km / 30 dias * 30 = 1500 km/mês
      const resultado = await ManutencaoService.calcularMediaKmMes('veiculo-123', 10000);

      expect(resultado).toBe(1500);
    });

    it('deve retornar 1000 km/mês quando km rodados é negativo', async () => {
      const dataUltimaManutencao = new Date();
      dataUltimaManutencao.setDate(dataUltimaManutencao.getDate() - 30);

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      data_realizada: dataUltimaManutencao.toISOString(),
                      quilometragem_realizada: 12000, // Maior que km atual
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const resultado = await ManutencaoService.calcularMediaKmMes('veiculo-123', 10000);

      expect(resultado).toBe(1000);
    });

    it('deve limitar média mínima a 100 km/mês', async () => {
      // Mock: última manutenção há 365 dias com apenas 50 km rodados
      const dataUltimaManutencao = new Date();
      dataUltimaManutencao.setDate(dataUltimaManutencao.getDate() - 365);

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      data_realizada: dataUltimaManutencao.toISOString(),
                      quilometragem_realizada: 9950,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      // 50 km em 365 dias = ~4 km/mês (muito baixo)
      const resultado = await ManutencaoService.calcularMediaKmMes('veiculo-123', 10000);

      expect(resultado).toBe(100); // Deve ser limitado ao mínimo
    });

    it('deve limitar média máxima a 10000 km/mês', async () => {
      // Mock: última manutenção há 1 dia com 15000 km rodados (irreal)
      const dataUltimaManutencao = new Date();
      dataUltimaManutencao.setDate(dataUltimaManutencao.getDate() - 1);

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      data_realizada: dataUltimaManutencao.toISOString(),
                      quilometragem_realizada: 5000,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      // 15000 km em 1 dia = 450000 km/mês (irreal)
      const resultado = await ManutencaoService.calcularMediaKmMes('veiculo-123', 20000);

      expect(resultado).toBe(10000); // Deve ser limitado ao máximo
    });

    it('deve retornar 1000 km/mês em caso de erro no banco', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const resultado = await ManutencaoService.calcularMediaKmMes('veiculo-123', 10000);

      expect(resultado).toBe(1000);
    });
  });

  describe('calcularProximaManutencao', () => {
    it('deve calcular próxima manutenção quando nunca foi realizada', async () => {
      // Mock: veículo com 5000 km
      const mockFromVeiculo = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { quilometragem: 5000 },
              error: null,
            }),
          }),
        }),
      });

      // Mock: sem histórico de manutenção
      const mockFromManutencao = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: 'No data' },
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'veiculos') return mockFromVeiculo(table);
        if (table === 'manutencoes') return mockFromManutencao(table);
        return mockFromVeiculo(table);
      });

      // Intervalo: 10000 km
      // KM atual: 5000 km
      // Próxima: 10000 km (primeiro múltiplo de 10000 >= 5000)
      // Restante: 5000 km
      const resultado = await ManutencaoService.calcularProximaManutencao(
        'veiculo-123',
        'tipo-123',
        10000
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.kmProxima).toBe(10000);
      expect(resultado?.kmRestante).toBe(5000);
      expect(resultado?.status).toBe('em_dia');
    });

    it('deve calcular próxima manutenção baseada na última realizada', async () => {
      // Mock: veículo com 15000 km
      const mockFromVeiculo = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { quilometragem: 15000 },
              error: null,
            }),
          }),
        }),
      });

      // Mock: última manutenção em 10000 km
      const mockFromManutencao = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { quilometragem_realizada: 10000 },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'veiculos') return mockFromVeiculo(table);
        if (table === 'manutencoes') return mockFromManutencao(table);
        return mockFromVeiculo(table);
      });

      // Última: 10000 km
      // Intervalo: 5000 km
      // Próxima: 15000 km
      // Atual: 15000 km
      // Restante: 0 km (atrasada!)
      const resultado = await ManutencaoService.calcularProximaManutencao(
        'veiculo-123',
        'tipo-123',
        5000
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.kmProxima).toBe(15000);
      expect(resultado?.kmRestante).toBe(0);
      expect(resultado?.status).toBe('atrasada');
    });

    it('deve marcar como pendente quando restam menos de 10% do intervalo', async () => {
      // Mock: veículo com 9600 km
      const mockFromVeiculo = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { quilometragem: 9600 },
              error: null,
            }),
          }),
        }),
      });

      // Mock: última manutenção em 5000 km
      const mockFromManutencao = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { quilometragem_realizada: 5000 },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'veiculos') return mockFromVeiculo(table);
        if (table === 'manutencoes') return mockFromManutencao(table);
        return mockFromVeiculo(table);
      });

      // Última: 5000 km
      // Intervalo: 5000 km
      // Próxima: 10000 km
      // Atual: 9600 km
      // Restante: 400 km (8% do intervalo - pendente!)
      const resultado = await ManutencaoService.calcularProximaManutencao(
        'veiculo-123',
        'tipo-123',
        5000
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.kmProxima).toBe(10000);
      expect(resultado?.kmRestante).toBe(400);
      expect(resultado?.status).toBe('pendente');
    });

    it('deve retornar null em caso de erro ao buscar veículo', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Vehicle not found' },
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const resultado = await ManutencaoService.calcularProximaManutencao(
        'veiculo-invalido',
        'tipo-123',
        5000
      );

      expect(resultado).toBeNull();
    });
  });

  describe('calcularProximasManutencoes', () => {
    it('deve calcular múltiplas manutenções corretamente', async () => {
      // Mock: veículo com 10000 km
      const mockFromVeiculo = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { quilometragem: 10000 },
              error: null,
            }),
          }),
        }),
      });

      // Mock: sem histórico de manutenções
      const mockFromManutencao = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: 'No data' },
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'veiculos') return mockFromVeiculo(table);
        if (table === 'manutencoes') return mockFromManutencao(table);
        return mockFromVeiculo(table);
      });

      const manutencoes = [
        { tipo_manutencao_id: 'tipo-1', intervalo_km: 5000 },
        { tipo_manutencao_id: 'tipo-2', intervalo_km: 10000 },
      ];

      const resultados = await ManutencaoService.calcularProximasManutencoes(
        'veiculo-123',
        manutencoes
      );

      expect(resultados).toHaveLength(2);
      expect(resultados[0].tipo_manutencao_id).toBe('tipo-1');
      expect(resultados[1].tipo_manutencao_id).toBe('tipo-2');
    });

    it('deve filtrar resultados nulos', async () => {
      // Mock que retorna erro para o veículo
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Error' },
            }),
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const manutencoes = [
        { tipo_manutencao_id: 'tipo-1', intervalo_km: 5000 },
      ];

      const resultados = await ManutencaoService.calcularProximasManutencoes(
        'veiculo-invalido',
        manutencoes
      );

      expect(resultados).toHaveLength(0);
    });
  });
});
