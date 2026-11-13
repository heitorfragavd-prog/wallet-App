import { supabase } from '@/integrations/supabase/client';
import {
  BusinessGoal,
  BusinessGoalIndicator,
  BusinessGoalPeriodType,
  BusinessGoalStatus,
  BusinessGoalUnit,
} from '../types';
import { CeoRepository } from './CeoRepository';
import { computeRealizedValueFromRecords } from './CeoGoalsEngine';

export interface CeoGoalsQueryResult<T> {
  data: T[];
  isConfigured: boolean;
  error?: string;
}

export interface CeoGoalsMutationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class CeoGoalsRepository {
  /**
   * Consulta metas empresariais do workspace ativo
   */
  static async listGoals(
    workspaceId: string,
    filters?: {
      periodo_tipo?: BusinessGoalPeriodType;
      status?: BusinessGoalStatus;
      ano?: number;
      mes?: number;
    }
  ): Promise<CeoGoalsQueryResult<BusinessGoal>> {
    if (!workspaceId) {
      return { data: [], isConfigured: true };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('wallet_business_goals')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('data_inicio', { ascending: false });

      if (filters?.periodo_tipo) {
        query = query.eq('periodo_tipo', filters.periodo_tipo);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.ano) {
        query = query.eq('ano', filters.ano);
      }
      if (filters?.mes) {
        query = query.eq('mes', filters.mes);
      }

      const { data, error } = await query;

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return {
            data: [],
            isConfigured: false,
            error: 'Tabela wallet_business_goals não migrada no banco de dados.',
          };
        }
        return { data: [], isConfigured: true, error: error.message };
      }

      if (!data) return { data: [], isConfigured: true };

      const goals: BusinessGoal[] = data.map((d: Record<string, unknown>) => ({
        id: String(d.id),
        workspace_id: String(d.workspace_id),
        created_by: String(d.created_by),
        titulo: String(d.titulo || ''),
        indicador: d.indicador as BusinessGoalIndicator,
        periodo_tipo: d.periodo_tipo as BusinessGoalPeriodType,
        data_inicio: String(d.data_inicio),
        data_fim: String(d.data_fim),
        ano: Number(d.ano),
        mes: d.mes != null ? Number(d.mes) : null,
        semana_do_ano: d.semana_do_ano != null ? Number(d.semana_do_ano) : null,
        valor_alvo: Number(d.valor_alvo || 0),
        valor_realizado: Number(d.valor_realizado || 0),
        unidade: (d.unidade as BusinessGoalUnit) || 'BRL',
        categoria_ou_produto: d.categoria_ou_produto ? String(d.categoria_ou_produto) : null,
        eyemobile_product_id: d.eyemobile_product_id ? String(d.eyemobile_product_id) : null,
        status: (d.status as BusinessGoalStatus) || 'ativa',
        descricao: d.descricao ? String(d.descricao) : null,
        observacoes: d.observacoes ? String(d.observacoes) : null,
        history: Array.isArray(d.history) ? (d.history as unknown as BusinessGoal['history']) : [],
        created_at: String(d.created_at || new Date().toISOString()),
        updated_at: String(d.updated_at || new Date().toISOString()),
      }));

      return { data: goals, isConfigured: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { data: [], isConfigured: false, error: errorMsg };
    }
  }

  /**
   * Conecta aos dados financeiros oficiais reais (com deduplicação Eyemobile e filtro de cancelamentos)
   * para computar o valor realizado de uma meta.
   */
  static async fetchGoalRealizedMetric(
    workspaceId: string,
    goal: BusinessGoal
  ): Promise<number> {
    if (!workspaceId || !goal.data_inicio) return goal.valor_realizado || 0;
    try {
      const sales = await CeoRepository.fetchSalesForExperiment(
        workspaceId,
        goal.data_inicio,
        goal.data_fim
      );

      let expenses: Array<{ valor: number; cancelado?: boolean }> = [];
      if (goal.indicador === 'despesas' || goal.indicador === 'resultado_operacional') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: expData } = await (supabase as any)
          .from('transacoes')
          .select('valor, cancelada, status')
          .eq('workspace_id', workspaceId)
          .gte('data', goal.data_inicio)
          .lte('data', goal.data_fim)
          .eq('tipo', 'despesa');

        if (expData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expenses = expData.map((e: any) => ({
            valor: Number(e.valor || 0),
            cancelado: Boolean(e.cancelada) || String(e.status || '').toLowerCase() === 'cancelada',
          }));
        }
      }

      return computeRealizedValueFromRecords({
        indicador: goal.indicador,
        sales: sales.map((s) => ({
          valor_total: s.valor,
          quantidade: s.itens?.reduce((acc, it) => acc + (it.quantidade || 1), 0) || 1,
          categoria: s.itens?.[0]?.nome,
          produto_nome: s.itens?.[0]?.nome,
          eyemobile_product_id: s.itens?.[0]?.produto_id,
          custo_total: s.itens?.reduce(
            (acc, it) => acc + (it.custo_unitario != null ? it.custo_unitario * (it.quantidade || 1) : 0),
            0
          ),
          cancelado: s.cancelada,
          is_combo: Boolean(s.itens?.some((it) => (it.nome || '').toLowerCase().includes('combo'))),
        })),
        expenses,
        categoriaOuProduto: goal.categoria_ou_produto || undefined,
        eyemobileProductId: goal.eyemobile_product_id || undefined,
      });
    } catch (err) {
      console.error('[CeoGoalsRepository.fetchGoalRealizedMetric] Erro ao computar métrica real:', err);
      return goal.valor_realizado || 0;
    }
  }

  /**
   * Cadastra nova meta empresarial no workspace (exige prerrogativa executiva de proprietário/administrador)
   */
  static async createGoal(
    workspaceId: string,
    goal: Omit<BusinessGoal, 'id' | 'created_at' | 'updated_at'>
  ): Promise<CeoGoalsMutationResult<BusinessGoal>> {
    try {
      const authUser = (await supabase.auth.getUser()).data.user;
      if (!authUser) {
        return { success: false, error: 'Usuário não autenticado.' };
      }

      if (!workspaceId) {
        return { success: false, error: 'Workspace ID é obrigatório.' };
      }

      if (goal.valor_alvo < 0) {
        return { success: false, error: 'O valor-alvo da meta deve ser maior ou igual a zero.' };
      }

      if (goal.data_fim < goal.data_inicio) {
        return { success: false, error: 'A data de término não pode ser anterior à data de início.' };
      }

      const initialHistory = [
        {
          date: new Date().toISOString(),
          action: 'created' as const,
          user_id: authUser.id,
          new_target: goal.valor_alvo,
          reason: 'Meta empresarial cadastrada formalmente pela gestão.',
        },
      ];

      const payload = {
        workspace_id: workspaceId,
        created_by: authUser.id,
        titulo: goal.titulo.trim(),
        indicador: goal.indicador,
        periodo_tipo: goal.periodo_tipo,
        data_inicio: goal.data_inicio,
        data_fim: goal.data_fim,
        ano: goal.ano,
        mes: goal.mes ?? null,
        semana_do_ano: goal.semana_do_ano ?? null,
        valor_alvo: goal.valor_alvo,
        valor_realizado: goal.valor_realizado || 0,
        unidade: goal.unidade || 'BRL',
        categoria_ou_produto: goal.categoria_ou_produto || null,
        eyemobile_product_id: goal.eyemobile_product_id || null,
        status: goal.status || 'ativa',
        descricao: goal.descricao || null,
        observacoes: goal.observacoes || null,
        history: initialHistory,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('wallet_business_goals')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data as unknown as BusinessGoal };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Atualiza valor-alvo, status ou observações de meta empresarial
   */
  static async updateGoal(
    goalId: string,
    updates: Partial<Omit<BusinessGoal, 'id' | 'workspace_id' | 'created_at'>>,
    userId: string,
    reason?: string
  ): Promise<CeoGoalsMutationResult<void>> {
    try {
      // 1. Busca meta atual para registrar histórico
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: fetchErr } = await (supabase as any)
        .from('wallet_business_goals')
        .select('*')
        .eq('id', goalId)
        .single();

      if (fetchErr || !current) {
        return { success: false, error: fetchErr?.message || 'Meta não encontrada.' };
      }

      const history = Array.isArray(current.history) ? [...current.history] : [];
      if (updates.valor_alvo !== undefined && updates.valor_alvo !== current.valor_alvo) {
        history.push({
          date: new Date().toISOString(),
          action: 'recalibrated',
          user_id: userId,
          previous_target: current.valor_alvo,
          new_target: updates.valor_alvo,
          reason: reason || 'Recalibração do valor-alvo executivo.',
        });
      }

      if (updates.status && updates.status !== current.status) {
        history.push({
          date: new Date().toISOString(),
          action: updates.status === 'pausada' ? 'paused' : updates.status === 'concluida' ? 'concluded' : 'updated',
          user_id: userId,
          reason: reason || `Status alterado para ${updates.status}.`,
        });
      }

      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        history,
      };

      if (updates.titulo !== undefined) payload.titulo = updates.titulo;
      if (updates.valor_alvo !== undefined) payload.valor_alvo = updates.valor_alvo;
      if (updates.valor_realizado !== undefined) payload.valor_realizado = updates.valor_realizado;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.descricao !== undefined) payload.descricao = updates.descricao;
      if (updates.observacoes !== undefined) payload.observacoes = updates.observacoes;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('wallet_business_goals')
        .update(payload)
        .eq('id', goalId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Pausa uma meta empresarial ativa
   */
  static async pauseGoal(goalId: string, userId: string, reason?: string): Promise<CeoGoalsMutationResult<void>> {
    return this.updateGoal(goalId, { status: 'pausada' }, userId, reason || 'Meta pausada preventivamente.');
  }

  /**
   * Reativa uma meta empresarial pausada
   */
  static async resumeGoal(goalId: string, userId: string, reason?: string): Promise<CeoGoalsMutationResult<void>> {
    return this.updateGoal(goalId, { status: 'ativa' }, userId, reason || 'Meta reativada pela gestão.');
  }

  /**
   * Exclui uma meta empresarial (exige privilégio do proprietário/administrador)
   */
  static async deleteGoal(goalId: string, _userId?: string): Promise<CeoGoalsMutationResult<void>> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('wallet_business_goals')
        .delete()
        .eq('id', goalId);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }
}
