import { describe, it, expect, vi } from 'vitest';
import { CeoRecipeCardService } from './CeoRecipeCardService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('CeoRecipeCardService', () => {
  it('deve calcular corretamente o custo total e margem de uma receita com insumos', () => {
    // Café: 10g café moído (0.01kg * 44 = 0.44) + copo (0.05) + mexedor/açúcar (0.11) = 0.60
    const insumosCafe = [
      { quantidade: 0.01, custo_unitario: 44.0 },
      { quantidade: 1.0, custo_unitario: 0.05 },
      { quantidade: 1.0, custo_unitario: 0.11 },
    ];

    const { custoTotal, margemBrutaPercent } = CeoRecipeCardService.calculateRecipeCost(insumosCafe, 3.0);
    expect(custoTotal).toBe(0.6);
    expect(margemBrutaPercent).toBe(80.0); // (3.00 - 0.60) / 3.00 = 80%
  });

  it('deve calcular corretamente a receita de salgado tradicional com compra Gerson Salgados', () => {
    // Salgado R$ 8,00: aquisição 2.95 + embalagem 0.05 = 3.00
    const insumosSalgado = [
      { quantidade: 1.0, custo_unitario: 2.95 },
      { quantidade: 1.0, custo_unitario: 0.05 },
    ];

    const { custoTotal, margemBrutaPercent } = CeoRecipeCardService.calculateRecipeCost(insumosSalgado, 8.0);
    expect(custoTotal).toBe(3.0);
    expect(margemBrutaPercent).toBe(62.5); // (8.00 - 3.00) / 8.00 = 62.5%
  });

  it('deve retornar margem 0 quando o preço de venda for zero', () => {
    const insumos = [{ quantidade: 1.0, custo_unitario: 2.0 }];
    const { custoTotal, margemBrutaPercent } = CeoRecipeCardService.calculateRecipeCost(insumos, 0);
    expect(custoTotal).toBe(2.0);
    expect(margemBrutaPercent).toBe(0);
  });
});
