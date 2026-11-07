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
      { quantidade: 0.01, custo_unitario: 44.0, insumoNome: 'Café em Grão / Pó Especial (Dose 10g)' },
      { quantidade: 1.0, custo_unitario: 0.05, insumoNome: 'Copo Térmico Descartável 50ml (NF Sellpack 289.329)' },
      { quantidade: 1.0, custo_unitario: 0.11, insumoNome: 'Mexedor Plástico e Sachê Açúcar (NF Sellpack 289.329)' },
    ];

    const res = CeoRecipeCardService.calculateRecipeCost(insumosCafe, 3.0);
    expect(res.custoTotal).toBe(0.6);
    expect(res.margemBrutaPercent).toBe(80.0); // (3.00 - 0.60) / 3.00 = 80%
    expect(res.statusMargem).toBe('excelente');
    expect(res.statusFicha).toBe('com_estimativas');
    expect(res.temInsumoSemCusto).toBe(false);
  });

  it('deve calcular corretamente a receita de salgado tradicional com compra Gerson Salgados', () => {
    // Salgado R$ 8,00: aquisição 2.95 + embalagem 0.05 = 3.00
    const insumosSalgado = [
      { quantidade: 1.0, custo_unitario: 2.95, insumoNome: 'Salgado Frito / Assado Tradicional (Gerson Salgados)' },
      { quantidade: 1.0, custo_unitario: 0.05, insumoNome: 'Embalagem e Guardanapo Térmico (NF Sellpack 289.329)' },
    ];

    const res = CeoRecipeCardService.calculateRecipeCost(insumosSalgado, 8.0);
    expect(res.custoTotal).toBe(3.0);
    expect(res.margemBrutaPercent).toBe(62.5); // (8.00 - 3.00) / 8.00 = 62.5%
    expect(res.statusMargem).toBe('boa');
    expect(res.statusFicha).toBe('com_estimativas');
  });

  it('NÃO deve tratar insumo sem custo como custo zero, evitando inflar a margem', () => {
    // Exemplo: Salgado vendido a R$ 10,00 com 1 insumo embalagem R$ 0,05 e 1 insumo principal SEM CUSTO
    const insumosIncompletos = [
      { quantidade: 1.0, custo_unitario: 0.05, insumoNome: 'Embalagem' },
      { quantidade: 1.0, custo_unitario: null, insumoNome: 'Insumo Misterioso Sem Custo' },
    ];

    const res = CeoRecipeCardService.calculateRecipeCost(insumosIncompletos, 10.0);
    expect(res.temInsumoSemCusto).toBe(true);
    expect(res.qtdInsumosSemCusto).toBe(1);
    expect(res.margemBrutaPercent).toBeNull();
    expect(res.statusMargem).toBe('incompleta'); // NÃO deve ser 'excelente' (99.5%)
    expect(res.statusFicha).toBe('incompleta');
  });

  it('deve retornar margem 0 e status sem_preco quando o preço de venda for zero', () => {
    const insumos = [{ quantidade: 1.0, custo_unitario: 2.0 }];
    const res = CeoRecipeCardService.calculateRecipeCost(insumos, 0);
    expect(res.custoTotal).toBe(2.0);
    expect(res.margemBrutaPercent).toBe(0);
    expect(res.statusMargem).toBe('sem_preco');
  });

  it('deve retornar sem_ficha quando não houver insumos cadastrados', () => {
    const res = CeoRecipeCardService.calculateRecipeCost([], 10.0);
    expect(res.custoTotal).toBe(0);
    expect(res.statusMargem).toBe('sem_ficha');
    expect(res.statusFicha).toBe('sem_ficha');
  });
});
