import { supabase } from '@/integrations/supabase/client';

export interface InsumoFichaTecnica {
  id?: string;
  insumoNome: string;
  quantidade: number;
  unidadeMedida: string;
  custoUnitario: number;
  custoTotal: number;
}

export interface FichaTecnicaCardapio {
  id: string;
  produtoCardapioId: string;
  eyemobileCode: string | null;
  nomeProduto: string;
  categoria: string;
  precoVenda: number;
  custoTotal: number;
  margemBrutaPercent: number;
  statusMargem: 'excelente' | 'boa' | 'atencao' | 'perigoso' | 'sem_ficha' | 'sem_preco';
  qtdInsumos: number;
  insumos: InsumoFichaTecnica[];
}

export class CeoRecipeCardService {
  /**
   * Calcula o custo total e a margem percentual de um produto a partir de seus insumos
   */
  public static calculateRecipeCost(
    insumos: { quantidade: number; custo_unitario: number }[],
    precoVenda: number = 0
  ): { custoTotal: number; margemBrutaPercent: number } {
    const custoTotal = Math.round(
      insumos.reduce((acc, item) => acc + (Number(item.quantidade) || 0) * (Number(item.custo_unitario) || 0), 0) * 100
    ) / 100;

    const margemBrutaPercent = precoVenda > 0
      ? Math.round(((precoVenda - custoTotal) / precoVenda) * 1000) / 10
      : 0;

    return { custoTotal, margemBrutaPercent };
  }

  /**
   * Obtém todas as fichas técnicas cadastradas para o cardápio do workspace
   */
  public static async getRecipeCards(workspaceId: string): Promise<FichaTecnicaCardapio[]> {
    // 1. Buscar produtos do cardápio com vínculo ao Eyemobile
    const { data: produtos, error: pErr } = await supabase
      .from('produtos_cardapio')
      .select('id, nome, preco_venda, eyemobile_product_id, categoria, ativo')
      .eq('workspace_id', workspaceId)
      .eq('ativo', true)
      .order('nome');

    if (pErr) throw pErr;
    if (!produtos || produtos.length === 0) return [];

    const produtoIds = produtos.map((p) => p.id);

    // 2. Buscar insumos das fichas técnicas
    const { data: fichas, error: fErr } = await supabase
      .from('fichas_tecnicas')
      .select('id, produto_id, insumo_nome, quantidade, unidade_medida, custo_unitario')
      .in('produto_id', produtoIds)
      .order('insumo_nome');

    if (fErr) throw fErr;

    const fichasPorProduto = new Map<string, InsumoFichaTecnica[]>();
    for (const f of fichas || []) {
      const list = fichasPorProduto.get(f.produto_id) || [];
      const qtd = Number(f.quantidade) || 0;
      const custoUnit = Number(f.custo_unitario) || 0;
      list.push({
        id: f.id,
        insumoNome: f.insumo_nome,
        quantidade: qtd,
        unidadeMedida: f.unidade_medida,
        custoUnitario: custoUnit,
        custoTotal: Math.round(qtd * custoUnit * 100) / 100,
      });
      fichasPorProduto.set(f.produto_id, list);
    }

    return produtos.map((p) => {
      const insumos = fichasPorProduto.get(p.id) || [];
      const precoVenda = Number(p.preco_venda) || 0;
      const { custoTotal, margemBrutaPercent } = this.calculateRecipeCost(
        insumos.map((i) => ({ quantidade: i.quantidade, custo_unitario: i.custoUnitario })),
        precoVenda
      );

      let statusMargem: FichaTecnicaCardapio['statusMargem'] = 'sem_ficha';
      if (precoVenda === 0) {
        statusMargem = 'sem_preco';
      } else if (insumos.length === 0) {
        statusMargem = 'sem_ficha';
      } else if (margemBrutaPercent >= 65) {
        statusMargem = 'excelente';
      } else if (margemBrutaPercent >= 50) {
        statusMargem = 'boa';
      } else if (margemBrutaPercent >= 30) {
        statusMargem = 'atencao';
      } else {
        statusMargem = 'perigoso';
      }

      return {
        id: p.id,
        produtoCardapioId: p.id,
        eyemobileCode: p.eyemobile_product_id,
        nomeProduto: p.nome,
        categoria: p.categoria,
        precoVenda,
        custoTotal,
        margemBrutaPercent,
        statusMargem,
        qtdInsumos: insumos.length,
        insumos,
      };
    });
  }

  /**
   * Obtém ficha técnica por código de produto Eyemobile
   */
  public static async getRecipeCardByEyemobileCode(
    workspaceId: string,
    eyemobileCode: string
  ): Promise<FichaTecnicaCardapio | null> {
    const cards = await this.getRecipeCards(workspaceId);
    return cards.find((c) => c.eyemobileCode === eyemobileCode) || null;
  }
}
