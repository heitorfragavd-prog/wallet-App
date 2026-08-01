/**
 * Finance Service
 * 
 * Business logic for financial operations.
 * Independent of React for testability.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";

export interface FinanceSummary {
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
  percentualGasto: number;
}

export interface MonthlyData {
  month: string;
  receitas: number;
  despesas: number;
}

class FinanceService {
  /**
   * Calculate financial summary for a user
   */
  async getSummary(userId: string): Promise<FinanceSummary> {
    try {
      logger.info('FinanceService', 'Calculating financial summary with consolidation rule', { userId });

      const [receitasResult, transacoesReceitaResult, despesasResult] = await Promise.all([
        supabase.from('receitas').select('valor').eq('user_id', userId),
        supabase.from('transacoes').select('valor, descricao, observacoes, metodo_pagamento').eq('user_id', userId).eq('tipo', 'receita'),
        supabase.from('despesas').select('valor').eq('user_id', userId),
      ]);

      const totalReceitasDiretas = receitasResult.data?.reduce((sum, r) => sum + (r.valor || 0), 0) || 0;

      // Filtrar apenas dinheiro se for do Eyemobile/PDV
      const totalTransacoesReceita = transacoesReceitaResult.data?.reduce((sum, t) => {
        const isEyemobilePDV = t.descricao?.toLowerCase().includes("eyemobile") || 
                               t.observacoes?.toLowerCase().includes("eyemobile") ||
                               t.descricao?.toLowerCase().includes("pdv");
        if (isEyemobilePDV) {
          const metodo = (t.metodo_pagamento || "").toUpperCase();
          const isDinheiro = metodo === "DINHEIRO" || metodo === "CASH" || metodo === "ESPECIE" || metodo === "MONEY";
          return isDinheiro ? sum + (t.valor || 0) : sum;
        }
        return sum + (t.valor || 0);
      }, 0) || 0;

      const totalReceitas = totalReceitasDiretas + totalTransacoesReceita;
      const totalDespesas = despesasResult.data?.reduce((sum, d) => sum + (d.valor || 0), 0) || 0;
      const saldo = totalReceitas - totalDespesas;
      const percentualGasto = totalReceitas > 0 ? (totalDespesas / totalReceitas) * 100 : 0;

      return {
        totalReceitas,
        totalDespesas,
        saldo,
        percentualGasto,
      };
    } catch (error) {
      logger.error('FinanceService', 'Error calculating summary', { error, userId });
      throw error;
    }
  }

  /**
   * Get monthly financial data for charts
   */
  async getMonthlyData(userId: string, months: number = 6): Promise<MonthlyData[]> {
    try {
      logger.info('FinanceService', 'Getting monthly data with consolidation rule', { userId, months });

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const [receitasResult, transacoesReceitaResult, despesasResult] = await Promise.all([
        supabase
          .from('receitas')
          .select('valor, data')
          .eq('user_id', userId)
          .gte('data', startDate.toISOString()),
        supabase
          .from('transacoes')
          .select('valor, data, descricao, observacoes, metodo_pagamento')
          .eq('user_id', userId)
          .eq('tipo', 'receita')
          .gte('data', startDate.toISOString()),
        supabase
          .from('despesas')
          .select('valor, data')
          .eq('user_id', userId)
          .gte('data', startDate.toISOString()),
      ]);

      const monthlyMap = new Map<string, MonthlyData>();

      receitasResult.data?.forEach((r) => {
        const month = new Date(r.data).toISOString().slice(0, 7);
        const existing = monthlyMap.get(month) || { month, receitas: 0, despesas: 0 };
        existing.receitas += r.valor || 0;
        monthlyMap.set(month, existing);
      });

      transacoesReceitaResult.data?.forEach((t) => {
        const isEyemobilePDV = t.descricao?.toLowerCase().includes("eyemobile") || 
                               t.observacoes?.toLowerCase().includes("eyemobile") ||
                               t.descricao?.toLowerCase().includes("pdv");
        if (isEyemobilePDV) {
          const metodo = (t.metodo_pagamento || "").toUpperCase();
          const isDinheiro = metodo === "DINHEIRO" || metodo === "CASH" || metodo === "ESPECIE" || metodo === "MONEY";
          if (!isDinheiro) return;
        }

        const month = new Date(t.data).toISOString().slice(0, 7);
        const existing = monthlyMap.get(month) || { month, receitas: 0, despesas: 0 };
        existing.receitas += t.valor || 0;
        monthlyMap.set(month, existing);
      });

      despesasResult.data?.forEach((d) => {
        const month = new Date(d.data).toISOString().slice(0, 7);
        const existing = monthlyMap.get(month) || { month, receitas: 0, despesas: 0 };
        existing.despesas += d.valor || 0;
        monthlyMap.set(month, existing);
      });

      return Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    } catch (error) {
      logger.error('FinanceService', 'Error getting monthly data', { error, userId });
      throw error;
    }
  }

  /**
   * Calculate balance for a specific period
   */
  calculateBalance(receitas: number, despesas: number): number {
    return receitas - despesas;
  }

  /**
   * Calculate percentage of budget used
   */
  calculateBudgetUsage(spent: number, budget: number): number {
    if (budget <= 0) return 0;
    return Math.min((spent / budget) * 100, 100);
  }

  /**
   * Motor de parcelamento de DÍVIDAS: gera N linhas na tabela `dividas`,
   * uma por parcela, com vencimentos mensais (dia preservado, com clamp
   * para meses curtos) e ajuste de centavos na última parcela.
   * Sem ele, criar dívida parcelada quebrava com
   * "financeService.createDebt is not a function".
   */
  async createDebt(params: {
    userId: string;
    workspaceId?: string | null;
    descricao: string;
    valorTotal: number;
    dataVencimentoInicial: string;
    credor: string;
    categoriaId?: string | null;
    contaId?: string | null;
    documentoFavorecido?: string | null;
    valorTaxa?: number;
    totalParcelas: number;
  }): Promise<{ id: string }> {
    const {
      userId,
      workspaceId,
      descricao,
      valorTotal,
      dataVencimentoInicial,
      credor,
      categoriaId,
      contaId,
      documentoFavorecido,
      valorTaxa,
      totalParcelas,
    } = params;

    try {
      logger.info('FinanceService', 'Criando dívida parcelada', { userId, totalParcelas, valorTotal });

      const parentId = crypto.randomUUID();
      const valorParcela = Math.floor((valorTotal / totalParcelas) * 100) / 100;
      const base = new Date(`${dataVencimentoInicial}T12:00:00`);
      const diaBase = base.getDate();

      const rows = Array.from({ length: totalParcelas }, (_, i) => {
        // Vencimento mensal preservando o dia, com clamp para meses curtos
        const venc = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const ultimoDia = new Date(venc.getFullYear(), venc.getMonth() + 1, 0).getDate();
        venc.setDate(Math.min(diaBase, ultimoDia));
        const vencStr = `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, '0')}-${String(venc.getDate()).padStart(2, '0')}`;

        // Última parcela absorve a diferença de centavos do arredondamento
        const ehUltima = i === totalParcelas - 1;
        const valor = ehUltima
          ? Math.round((valorTotal - valorParcela * (totalParcelas - 1)) * 100) / 100
          : valorParcela;

        return {
          user_id: userId,
          workspace_id: workspaceId || null,
          descricao: `${descricao} (${i + 1}/${totalParcelas})`,
          credor,
          documento_favorecido: documentoFavorecido || null,
          categoria_id: categoriaId || null,
          conta_id: contaId || null,
          valor_total: valor,
          valor_pago: 0,
          valor_restante: valor,
          valor_taxa: valorTaxa ?? 0,
          data_vencimento: vencStr,
          parcelas: totalParcelas,
          parcelas_pagas: 0,
          parcela_atual: i + 1,
          total_parcelas: totalParcelas,
          parent_id: parentId,
          status: new Date(`${vencStr}T23:59:59`) < new Date() ? 'vencida' : 'pendente',
        };
      });

      const { data, error } = await supabase.from('dividas').insert(rows).select('id');
      if (error) throw error;
      return { id: String(data?.[0]?.id ?? '') };
    } catch (error) {
      logger.error('FinanceService', 'Erro ao criar dívida parcelada', { error, userId });
      throw error;
    }
  }

  /**
   * Motor de parcelamento de TRANSAÇÕES: gera N linhas na tabela
   * `transacoes`, uma por parcela, com datas mensais e ajuste de centavos
   * na última parcela. Usado por useTransacoes quando totalParcelas > 1.
   */
  async createTransaction(params: {
    userId: string;
    workspaceId?: string | null;
    tipo: 'receita' | 'despesa';
    descricao: string;
    valorTotal: number;
    dataInicial: string;
    categoriaId?: string | null;
    totalParcelas: number;
  }): Promise<{ id: string }> {
    const { userId, workspaceId, tipo, descricao, valorTotal, dataInicial, categoriaId, totalParcelas } = params;

    try {
      logger.info('FinanceService', 'Criando transação parcelada', { userId, tipo, totalParcelas, valorTotal });

      const parentId = crypto.randomUUID();
      const valorParcela = Math.floor((valorTotal / totalParcelas) * 100) / 100;
      const base = new Date(`${dataInicial}T12:00:00`);
      const diaBase = base.getDate();

      const rows = Array.from({ length: totalParcelas }, (_, i) => {
        const dataParcela = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const ultimoDia = new Date(dataParcela.getFullYear(), dataParcela.getMonth() + 1, 0).getDate();
        dataParcela.setDate(Math.min(diaBase, ultimoDia));
        const dataStr = `${dataParcela.getFullYear()}-${String(dataParcela.getMonth() + 1).padStart(2, '0')}-${String(dataParcela.getDate()).padStart(2, '0')}`;

        const ehUltima = i === totalParcelas - 1;
        const valor = ehUltima
          ? Math.round((valorTotal - valorParcela * (totalParcelas - 1)) * 100) / 100
          : valorParcela;

        return {
          user_id: userId,
          workspace_id: workspaceId || null,
          tipo,
          descricao: `${descricao} (${i + 1}/${totalParcelas})`,
          valor,
          data: dataStr,
          categoria_id: categoriaId || null,
          parcela_atual: i + 1,
          total_parcelas: totalParcelas,
          parent_id: parentId,
        };
      });

      const { data, error } = await supabase.from('transacoes').insert(rows).select('id');
      if (error) throw error;
      return { id: String(data?.[0]?.id ?? '') };
    } catch (error) {
      logger.error('FinanceService', 'Erro ao criar transação parcelada', { error, userId });
      throw error;
    }
  }
}

export const financeService = new FinanceService();
