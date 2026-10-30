import { supabase } from '@/integrations/supabase/client';
import { GrowthOpportunity, CommercialExperiment, ExperimentDecision } from '../types';

export interface CeoQueryResult<T> {
  data: T[];
  isConfigured: boolean;
  error?: string;
}

export interface CeoMutationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class CeoRepository {
  /**
   * Consulta oportunidades de crescimento persistidas para o workspace ativo
   */
  static async listOpportunities(workspaceId: string): Promise<CeoQueryResult<GrowthOpportunity>> {
    if (!workspaceId) {
      return { data: [], isConfigured: true };
    }

    try {
      const { data, error } = await supabase
        .from('wallet_growth_opportunities')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return { data: [], isConfigured: false, error: 'Tabela wallet_growth_opportunities não migrada no banco de dados.' };
        }
        return { data: [], isConfigured: true, error: error.message };
      }

      if (!data) return { data: [], isConfigured: true };

      const opportunities: GrowthOpportunity[] = data.map((d: Record<string, unknown>) => ({
        id: String(d.id),
        workspace_id: String(d.workspace_id),
        department: d.department as GrowthOpportunity['department'],
        title: String(d.title || ''),
        problem_description: String(d.problem_description || ''),
        description: String(d.problem_description || ''),
        hypothesis: String(d.hypothesis || ''),
        recommended_action: String(d.recommended_action || ''),
        estimated_financial_impact: Number(d.estimated_financial_impact || 0),
        potential_monthly_gain: Number(d.estimated_financial_impact || 0),
        confidence_score: Number(d.confidence_score || 0.8),
        status: d.status as GrowthOpportunity['status'],
        evidence_data: (d.evidence_data as GrowthOpportunity['evidence_data']) || { source: 'database', has_sufficient_data: true },
        limitations_notes: d.limitations_notes ? String(d.limitations_notes) : undefined,
        created_at: String(d.created_at || new Date().toISOString()),
        updated_at: String(d.updated_at || new Date().toISOString()),
      }));

      return { data: opportunities, isConfigured: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { data: [], isConfigured: false, error: errorMsg || 'Erro inesperado ao consultar oportunidades.' };
    }
  }

  /**
   * Salva uma oportunidade identificada pelo motor analítico
   */
  static async saveOpportunity(opp: GrowthOpportunity): Promise<CeoMutationResult<GrowthOpportunity>> {
    try {
      const payload = {
        workspace_id: opp.workspace_id,
        department: opp.department,
        title: opp.title,
        problem_description: opp.problem_description || opp.description || opp.title,
        hypothesis: opp.hypothesis,
        recommended_action: opp.recommended_action,
        estimated_financial_impact: opp.estimated_financial_impact || opp.potential_monthly_gain || 0,
        confidence_score: opp.confidence_score,
        status: opp.status || 'identificada',
        evidence_data: opp.evidence_data,
        limitations_notes: opp.limitations_notes,
      };

      const { data, error } = await supabase
        .from('wallet_growth_opportunities')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: {
          ...opp,
          id: data.id,
          created_at: data.created_at,
          updated_at: data.updated_at,
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Consulta experimentos comerciais reais do laboratório
   */
  static async listExperiments(workspaceId: string): Promise<CeoQueryResult<CommercialExperiment>> {
    if (!workspaceId) {
      return { data: [], isConfigured: true };
    }

    try {
      const { data, error } = await supabase
        .from('wallet_commercial_experiments')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('start_date', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return { data: [], isConfigured: false, error: 'Tabela wallet_commercial_experiments não migrada no banco de dados.' };
        }
        return { data: [], isConfigured: true, error: error.message };
      }

      if (!data) return { data: [], isConfigured: true };

      const experiments: CommercialExperiment[] = data.map((d: Record<string, unknown>) => {
        const targetMetrics = d.target_metrics as Record<string, unknown> | undefined;
        const observedResults = d.observed_results as Record<string, unknown> | undefined;

        return {
          id: String(d.id),
          workspace_id: String(d.workspace_id),
          opportunity_id: d.opportunity_id ? String(d.opportunity_id) : undefined,
          name: String(d.name || ''),
          title: String(d.name || ''),
          hypothesis: String(d.hypothesis || ''),
          department: (d.department as CommercialExperiment['department']) || 'commercial_growth',
          target_kpi: String(d.target_kpi || targetMetrics?.target_metric_name || 'Faturamento Incremental'),
          baseline_value: String(d.baseline_value || targetMetrics?.baseline_value || '0'),
          current_value: String(d.current_value || observedResults?.current_value || 'Em medição'),
          target_value: String(d.target_value || targetMetrics?.expected_value || 'Meta'),
          start_date: String(d.start_date || new Date().toISOString()),
          end_date: d.end_date ? String(d.end_date) : undefined,
          responsible_person: String(d.responsible_person || 'Gestão Rodo Point'),
          target_metrics: d.target_metrics as CommercialExperiment['target_metrics'],
          observed_results: d.observed_results as CommercialExperiment['observed_results'],
          measured_financial_impact: Number(d.measured_financial_impact || 0),
          decision: d.decision as CommercialExperiment['decision'],
          decision_rationale: d.decision_rationale ? String(d.decision_rationale) : undefined,
          status: d.status as CommercialExperiment['status'],
          created_at: String(d.created_at || new Date().toISOString()),
          updated_at: String(d.updated_at || new Date().toISOString()),
        };
      });

      return { data: experiments, isConfigured: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { data: [], isConfigured: false, error: errorMsg };
    }
  }

  /**
   * Registra um novo experimento no banco de dados
   */
  static async createExperiment(
    exp: Partial<CommercialExperiment> & { workspace_id: string; title: string; hypothesis: string }
  ): Promise<CeoMutationResult<CommercialExperiment>> {
    try {
      const payload: Record<string, unknown> = {
        workspace_id: exp.workspace_id,
        opportunity_id: exp.opportunity_id || null,
        name: exp.title || exp.name,
        hypothesis: exp.hypothesis,
        department: exp.department || 'commercial_growth',
        target_kpi: exp.target_kpi || 'Faturamento Incremental',
        baseline_value: String(exp.baseline_value || '0'),
        current_value: String(exp.current_value || 'Em medição'),
        target_value: String(exp.target_value || 'Meta'),
        start_date: exp.start_date || new Date().toISOString().slice(0, 10),
        end_date: exp.end_date || null,
        responsible_person: exp.responsible_person || 'Gestão Rodo Point',
        status: exp.status || 'planejado',
        decision: exp.decision || 'pendente',
        decision_rationale: exp.decision_rationale || null,
      };

      const { data, error } = await supabase
        .from('wallet_commercial_experiments')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: {
          id: data.id,
          workspace_id: data.workspace_id,
          opportunity_id: data.opportunity_id,
          title: data.name,
          name: data.name,
          hypothesis: data.hypothesis,
          department: data.department,
          target_kpi: data.target_kpi,
          baseline_value: data.baseline_value,
          current_value: data.current_value,
          target_value: data.target_value,
          start_date: data.start_date,
          end_date: data.end_date,
          responsible_person: data.responsible_person,
          decision: data.decision,
          decision_rationale: data.decision_rationale,
          status: data.status,
          created_at: data.created_at,
          updated_at: data.updated_at,
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Alias de conveniência para salvar experimento
   */
  static async saveExperiment(
    exp: Partial<CommercialExperiment> & { workspace_id: string; title: string; hypothesis: string }
  ): Promise<CeoMutationResult<CommercialExperiment>> {
    return this.createExperiment(exp);
  }

  /**
   * Atualiza status de um experimento ou encerra com decisão executiva
   */
  static async updateExperiment(
    experimentId: string,
    updates: {
      status?: CommercialExperiment['status'];
      decision?: ExperimentDecision;
      decision_rationale?: string;
      current_value?: string | number;
      measured_financial_impact?: number;
    }
  ): Promise<CeoMutationResult<void>> {
    try {
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.status) payload.status = updates.status;
      if (updates.decision) payload.decision = updates.decision;
      if (updates.decision_rationale) payload.decision_rationale = updates.decision_rationale;
      if (updates.current_value !== undefined) payload.current_value = String(updates.current_value);
      if (updates.measured_financial_impact !== undefined) payload.measured_financial_impact = updates.measured_financial_impact;

      const { error } = await supabase
        .from('wallet_commercial_experiments')
        .update(payload)
        .eq('id', experimentId);

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
   * Alias de conveniência para atualizar status e registrar decisão
   */
  static async updateExperimentStatus(
    experimentId: string,
    status: CommercialExperiment['status'],
    decision?: {
      decision?: 'approved' | 'rejected' | 'inconclusive' | 'extended';
      decision_date?: string;
      rationale?: string;
    }
  ): Promise<CeoMutationResult<void>> {
    return this.updateExperiment(experimentId, {
      status,
      decision: decision?.decision as ExperimentDecision,
      decision_rationale: decision?.rationale,
    });
  }
}
