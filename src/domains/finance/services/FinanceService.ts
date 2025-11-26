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
      logger.info('FinanceService', 'Calculating financial summary', { userId });

      const [receitasResult, despesasResult] = await Promise.all([
        supabase.from('receitas').select('valor').eq('user_id', userId),
        supabase.from('despesas').select('valor').eq('user_id', userId),
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
      logger.error('FinanceService', 'Error calculating summary', { error, userId });
      throw error;
    }
  }

  /**
   * Get monthly financial data for charts
   */
  async getMonthlyData(userId: string, months: number = 6): Promise<MonthlyData[]> {
    try {
      logger.info('FinanceService', 'Getting monthly data', { userId, months });

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const [receitasResult, despesasResult] = await Promise.all([
        supabase
          .from('receitas')
          .select('valor, data')
          .eq('user_id', userId)
          .gte('data', startDate.toISOString()),
        supabase
          .from('despesas')
          .select('valor, data')
          .eq('user_id', userId)
          .gte('data', startDate.toISOString()),
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
}

export const financeService = new FinanceService();
