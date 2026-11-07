import { supabase } from '@/integrations/supabase/client';

export interface InsumoFichaTecnica {
  id?: string;
  insumoNome: string;
  quantidade: number;
  unidadeMedida: string;
  custoUnitario: number;
  custoTotal: number;
}

export type StatusMargemFicha = 'excelente' | 'boa' | 'atencao' | 'perigoso' | 'sem_ficha' | 'sem_preco' | 'incompleta';
export type StatusFichaTecnica = 'comprovada' | 'com_estimativas' | 'incompleta' | 'sem_ficha';

export interface FichaTecnicaCardapio {
  id: string;
  produtoCardapioId: string;
  eyemobileCode: string | null;
  nomeProduto: string;
  categoria: string;
  precoVenda: number;
  custoTotal: number;
  margemBrutaPercent: number | null;
  statusMargem: StatusMargemFicha;
  statusFicha: StatusFichaTecnica;
  qtdInsumos: number;
  qtdInsumosSemCusto: number;
  temInsumoSemCusto: boolean;
  insumos: InsumoFichaTecnica[];
}

export class CeoRecipeCardService {
  /**
   * Calcula o custo total e a margem percentual de um produto a partir de seus insumos,
   * garantindo que insumos sem custo NÃO sejam tratados como custo zero.
   */
  public static calculateRecipeCost(
    insumos: { quantidade: number; custo_unitario?: number | null; insumoNome?: string }[],
    precoVenda: number = 0
  ): {
    custoTotal: number;
    margemBrutaPercent: number | null;
    temInsumoSemCusto: boolean;
    qtdInsumosSemCusto: number;
    statusMargem: StatusMargemFicha;
    statusFicha: StatusFichaTecnica;
  } {
    if (!insumos || insumos.length === 0) {
      return {
        custoTotal: 0,
        margemBrutaPercent: precoVenda === 0 ? 0 : 0,
        temInsumoSemCusto: false,
        qtdInsumosSemCusto: 0,
        statusMargem: precoVenda === 0 ? 'sem_preco' : 'sem_ficha',
        statusFicha: 'sem_ficha',
      };
    }

    let qtdSemCusto = 0;
    let custoTotal = 0;
    let temEstimativa = false;

    for (const item of insumos) {
      const q = Number(item.quantidade) || 0;
      const c = Number(item.custo_unitario);
      if (item.custo_unitario === null || item.custo_unitario === undefined || isNaN(c) || c <= 0) {
        qtdSemCusto++;
      } else {
        custoTotal += q * c;
      }

      const nome = (item.insumoNome || '').toUpperCase();
      if (
        nome.includes('ESTIMAD') ||
        nome.includes('COTAÇ') ||
        nome.includes('GERSON') ||
        nome.includes('ALIMENTOS') ||
        nome.includes('CAFÉ') ||
        nome.includes('LEITE') ||
        nome.includes('QUEIJO') ||
        nome.includes('SELLPACK')
      ) {
        temEstimativa = true;
      }
    }

    custoTotal = Math.round(custoTotal * 100) / 100;
    const temInsumoSemCusto = qtdSemCusto > 0;

    if (precoVenda === 0) {
      return {
        custoTotal,
        margemBrutaPercent: 0,
        temInsumoSemCusto,
        qtdInsumosSemCusto: qtdSemCusto,
        statusMargem: 'sem_preco',
        statusFicha: temInsumoSemCusto ? 'incompleta' : temEstimativa ? 'com_estimativas' : 'comprovada',
      };
    }

    if (temInsumoSemCusto) {
      // Insumo sem custo NÃO pode ser tratado como custo zero para inflar a margem
      return {
        custoTotal,
        margemBrutaPercent: null,
        temInsumoSemCusto: true,
        qtdInsumosSemCusto: qtdSemCusto,
        statusMargem: 'incompleta',
        statusFicha: 'incompleta',
      };
    }

    const margemBrutaPercent = Math.round(((precoVenda - custoTotal) / precoVenda) * 1000) / 10;
    let statusMargem: StatusMargemFicha = 'perigoso';

    if (margemBrutaPercent >= 65) {
      statusMargem = 'excelente';
    } else if (margemBrutaPercent >= 50) {
      statusMargem = 'boa';
    } else if (margemBrutaPercent >= 30) {
      statusMargem = 'atencao';
    } else {
      statusMargem = 'perigoso';
    }

    const statusFicha: StatusFichaTecnica = temEstimativa ? 'com_estimativas' : 'comprovada';

    return {
      custoTotal,
      margemBrutaPercent,
      temInsumoSemCusto: false,
      qtdInsumosSemCusto: 0,
      statusMargem,
      statusFicha,
    };
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
      const {
        custoTotal,
        margemBrutaPercent,
        temInsumoSemCusto,
        qtdInsumosSemCusto,
        statusMargem,
        statusFicha,
      } = this.calculateRecipeCost(
        insumos.map((i) => ({
          quantidade: i.quantidade,
          custo_unitario: i.custoUnitario,
          insumoNome: i.insumoNome,
        })),
        precoVenda
      );

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
        statusFicha,
        qtdInsumos: insumos.length,
        qtdInsumosSemCusto,
        temInsumoSemCusto,
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
