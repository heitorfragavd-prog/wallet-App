/**
 * Finance Service
 * 
 * Lógica de negócios para operações financeiras, cálculo de resumos
 * e motor de parcelamento (geração de parcelas de transações e dívidas).
 * Independente de React para facilitar testes unitários.
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

export interface CreateTransactionParams {
  userId: string;
  workspaceId?: string;
  tipo: "receita" | "despesa";
  descricao: string;
  valorTotal: number;
  dataInicial: string; // YYYY-MM-DD
  categoriaId?: string;
  totalParcelas?: number;
}

export interface CreateDebtParams {
  userId: string;
  workspaceId?: string;
  descricao: string;
  valorTotal: number;
  dataVencimentoInicial: string;
  credor: string;
  categoriaId?: string;
  totalParcelas?: number;
}

class FinanceService {
  /**
   * Helper para adicionar N meses a uma data YYYY-MM-DD
   */
  private addMonths(dateStr: string, monthsToAdd: number): string {
    const date = new Date(dateStr + "T00:00:00");
    date.setMonth(date.getMonth() + monthsToAdd);
    return date.toISOString().split("T")[0];
  }

  /**
   * Calculate financial summary for a user and optional active workspace
   */
  async getSummary(userId: string, workspaceId?: string): Promise<FinanceSummary> {
    try {
      logger.info('FinanceService', 'Calculating financial summary', { userId, workspaceId });

      let queryReceitas = supabase.from('receitas').select('valor').eq('user_id', userId);
      let queryDespesas = supabase.from('despesas').select('valor').eq('user_id', userId);

      if (workspaceId) {
        queryReceitas = queryReceitas.eq('workspace_id', workspaceId);
        queryDespesas = queryDespesas.eq('workspace_id', workspaceId);
      }

      const [receitasResult, despesasResult] = await Promise.all([
        queryReceitas,
        queryDespesas,
      ]);

      const totalReceitas = receitasResult.data?.reduce((sum, r) => sum + (r.valor || 0), 0) || 0;
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
      logger.error('FinanceService', 'Error calculating summary', { error, userId, workspaceId });
      throw error;
    }
  }

  /**
   * Get monthly financial data for charts, scoped by workspace
   */
  async getMonthlyData(userId: string, months: number = 6, workspaceId?: string): Promise<MonthlyData[]> {
    try {
      logger.info('FinanceService', 'Getting monthly data', { userId, months, workspaceId });

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      let queryReceitas = supabase
        .from('receitas')
        .select('valor, data')
        .eq('user_id', userId)
        .gte('data', startDate.toISOString());

      let queryDespesas = supabase
        .from('despesas')
        .select('valor, data')
        .eq('user_id', userId)
        .gte('data', startDate.toISOString());

      if (workspaceId) {
        queryReceitas = queryReceitas.eq('workspace_id', workspaceId);
        queryDespesas = queryDespesas.eq('workspace_id', workspaceId);
      }

      const [receitasResult, despesasResult] = await Promise.all([
        queryReceitas,
        queryDespesas,
      ]);

      // Group by month
      const monthlyMap = new Map<string, MonthlyData>();

      receitasResult.data?.forEach((r) => {
        const month = new Date(r.data).toISOString().slice(0, 7);
        const existing = monthlyMap.get(month) || { month, receitas: 0, despesas: 0 };
        existing.receitas += r.valor || 0;
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
      logger.error('FinanceService', 'Error getting monthly data', { error, userId, workspaceId });
      throw error;
    }
  }

  /**
   * Motor de Parcelamento: Criar transação (única ou parcelada)
   */
  async createTransaction(params: CreateTransactionParams) {
    const totalParcelas = params.totalParcelas && params.totalParcelas > 1 ? params.totalParcelas : 1;
    const valorParcela = parseFloat((params.valorTotal / totalParcelas).toFixed(2));

    try {
      logger.info('FinanceService', 'Creating transaction', { params, totalParcelas, valorParcela });

      // Se for parcela única
      if (totalParcelas === 1) {
        const { data, error } = await supabase
          .from('transacoes')
          .insert({
            user_id: params.userId,
            workspace_id: params.workspaceId || null,
            tipo: params.tipo,
            descricao: params.descricao,
            valor: params.valorTotal,
            data: params.dataInicial,
            categoria_id: params.categoriaId || null,
            parcela_atual: 1,
            total_parcelas: 1,
          })
          .select()
          .single();

        if (error) throw error;
        return [data];
      }

      // Se for parcelada (> 1)
      const createdRecords = [];
      let parentId: string | null = null;

      for (let i = 1; i <= totalParcelas; i++) {
        const dataParcela = this.addMonths(params.dataInicial, i - 1);
        const descParcela = `${params.descricao} (${i}/${totalParcelas})`;

        const { data, error } = await supabase
          .from('transacoes')
          .insert({
            user_id: params.userId,
            workspace_id: params.workspaceId || null,
            tipo: params.tipo,
            descricao: descParcela,
            valor: valorParcela,
            data: dataParcela,
            categoria_id: params.categoriaId || null,
            parcela_atual: i,
            total_parcelas: totalParcelas,
            parent_id: parentId,
          })
          .select()
          .single();

        if (error) throw error;

        // Na primeira iteração, definimos o parent_id como o id da primeira parcela
        if (i === 1 && data) {
          parentId = data.id;
          // Atualiza o parent_id da própria 1ª parcela para apontar para ela mesma
          await supabase
            .from('transacoes')
            .update({ parent_id: parentId })
            .eq('id', parentId);
        }

        createdRecords.push(data);
      }

      return createdRecords;
    } catch (error) {
      logger.error('FinanceService', 'Error creating installment transaction', { error, params });
      throw error;
    }
  }

  /**
   * Motor de Parcelamento: Criar dívida (única ou parcelada)
   */
  async createDebt(params: CreateDebtParams) {
    const totalParcelas = params.totalParcelas && params.totalParcelas > 1 ? params.totalParcelas : 1;
    const valorParcela = parseFloat((params.valorTotal / totalParcelas).toFixed(2));

    try {
      logger.info('FinanceService', 'Creating debt', { params, totalParcelas, valorParcela });

      if (totalParcelas === 1) {
        const { data, error } = await supabase
          .from('dividas')
          .insert({
            user_id: params.userId,
            workspace_id: params.workspaceId || null,
            descricao: params.descricao,
            valor_total: params.valorTotal,
            valor_pago: 0,
            valor_restante: params.valorTotal,
            data_vencimento: params.dataVencimentoInicial,
            credor: params.credor,
            categoria_id: params.categoriaId || null,
            parcelas: 1,
            parcelas_pagas: 0,
            parcela_atual: 1,
            total_parcelas: 1,
          })
          .select()
          .single();

        if (error) throw error;
        return [data];
      }

      const createdRecords = [];
      let parentId: string | null = null;

      for (let i = 1; i <= totalParcelas; i++) {
        const dataVencimento = this.addMonths(params.dataVencimentoInicial, i - 1);
        const descParcela = `${params.descricao} (${i}/${totalParcelas})`;

        const { data, error } = await supabase
          .from('dividas')
          .insert({
            user_id: params.userId,
            workspace_id: params.workspaceId || null,
            descricao: descParcela,
            valor_total: valorParcela,
            valor_pago: 0,
            valor_restante: valorParcela,
            data_vencimento: dataVencimento,
            credor: params.credor,
            categoria_id: params.categoriaId || null,
            parcelas: 1,
            parcelas_pagas: 0,
            parcela_atual: i,
            total_parcelas: totalParcelas,
            parent_id: parentId,
          })
          .select()
          .single();

        if (error) throw error;

        if (i === 1 && data) {
          parentId = data.id;
          await supabase
            .from('dividas')
            .update({ parent_id: parentId })
            .eq('id', parentId);
        }

        createdRecords.push(data);
      }

      return createdRecords;
    } catch (error) {
      logger.error('FinanceService', 'Error creating installment debt', { error, params });
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
}

export const financeService = new FinanceService();
