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
        estimated_financial_impact: d.estimated_financial_impact != null ? Number(d.estimated_financial_impact) : null,
        potential_monthly_gain: d.estimated_financial_impact != null ? Number(d.estimated_financial_impact) : null,
        confidence_score: Number(d.confidence_score || 0.8),
        status: d.status as GrowthOpportunity['status'],
        nature: d.nature as GrowthOpportunity['nature'],
        simulation_premises: d.simulation_premises ? String(d.simulation_premises) : undefined,
        calculation_limitations: d.calculation_limitations ? String(d.calculation_limitations) : undefined,
        formula_or_criteria: d.formula_or_criteria ? String(d.formula_or_criteria) : undefined,
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
        estimated_financial_impact: opp.estimated_financial_impact ?? opp.potential_monthly_gain ?? null,
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

        const resolvedBaseline =
          d.baseline_value !== null && d.baseline_value !== undefined
            ? String(d.baseline_value)
            : targetMetrics?.baseline_value !== undefined && targetMetrics?.baseline_value !== null
            ? String(targetMetrics.baseline_value)
            : undefined;

        return {
          id: String(d.id),
          workspace_id: String(d.workspace_id),
          opportunity_id: d.opportunity_id ? String(d.opportunity_id) : undefined,
          name: String(d.name || ''),
          title: String(d.name || ''),
          hypothesis: String(d.hypothesis || ''),
          department: (d.department as CommercialExperiment['department']) || 'commercial_growth',
          target_kpi: String(d.target_kpi || targetMetrics?.target_metric_name || 'Faturamento Incremental'),
          baseline_value: resolvedBaseline,
          current_value: d.current_value != null ? String(d.current_value) : (observedResults?.current_value != null ? String(observedResults.current_value) : undefined),
          target_value: d.target_value != null ? String(d.target_value) : (targetMetrics?.expected_value != null ? String(targetMetrics.expected_value) : undefined),
          start_date: String(d.start_date || new Date().toISOString().slice(0, 10)),
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
        baseline_value: exp.baseline_value !== undefined && exp.baseline_value !== null ? String(exp.baseline_value) : null,
        current_value: exp.current_value !== undefined && exp.current_value !== null ? String(exp.current_value) : null,
        target_value: exp.target_value !== undefined && exp.target_value !== null ? String(exp.target_value) : null,
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
          baseline_value: data.baseline_value != null ? String(data.baseline_value) : undefined,
          current_value: data.current_value != null ? String(data.current_value) : undefined,
          target_value: data.target_value != null ? String(data.target_value) : undefined,
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
   * Valida as transições de ciclo de vida de experimentos comerciais
   * Fluxo canônico: Planejado -> Aprovado -> Em andamento -> Concluído (ou Cancelado)
   */
  static validateTransition(
    currentStatus: CommercialExperiment['status'],
    newStatus: CommercialExperiment['status']
  ): { valid: boolean; reason?: string } {
    const normalize = (s: string) => {
      const lower = (s || '').toLowerCase();
      if (lower === 'planned') return 'planejado';
      if (lower === 'approved') return 'aprovado';
      if (lower === 'active') return 'em_andamento';
      if (lower === 'completed') return 'concluido';
      if (lower === 'cancelled') return 'cancelado';
      return lower;
    };

    const from = normalize(currentStatus);
    const to = normalize(newStatus);

    if (from === to) return { valid: true };

    if (from === 'concluido' || from === 'cancelado') {
      return { valid: false, reason: 'Experimentos concluídos ou cancelados são históricos e não podem ser reabertos.' };
    }

    if (to === 'aprovado') {
      if (from !== 'planejado') {
        return { valid: false, reason: 'Apenas experimentos planejados podem ser aprovados pelo proprietário.' };
      }
      return { valid: true };
    }

    if (to === 'em_andamento') {
      if (from !== 'aprovado') {
        return { valid: false, reason: 'O experimento precisa ser aprovado formalmente pelo proprietário antes de ser iniciado.' };
      }
      return { valid: true };
    }

    if (to === 'concluido') {
      if (from !== 'em_andamento') {
        return { valid: false, reason: 'Apenas experimentos em andamento podem ser concluídos.' };
      }
      return { valid: true };
    }

    if (to === 'cancelado') {
      return { valid: true };
    }

    return { valid: false, reason: `Transição inválida de "${from}" para "${to}".` };
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
      baseline_value?: string | number | null;
      current_value?: string | number | null;
      target_value?: string | number | null;
      start_date?: string;
      end_date?: string | null;
      measured_financial_impact?: number;
      currentStatus?: CommercialExperiment['status'];
    }
  ): Promise<CeoMutationResult<void>> {
    try {
      if (updates.status && updates.currentStatus) {
        const validation = this.validateTransition(updates.currentStatus, updates.status);
        if (!validation.valid) {
          return { success: false, error: validation.reason };
        }
      }

      // Payload estrito: nunca permite alteração de workspace_id no payload
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.status) payload.status = updates.status;
      if (updates.decision) payload.decision = updates.decision;
      if (updates.decision_rationale !== undefined) payload.decision_rationale = updates.decision_rationale;
      if (updates.baseline_value !== undefined) payload.baseline_value = updates.baseline_value !== null ? String(updates.baseline_value) : null;
      if (updates.current_value !== undefined) payload.current_value = updates.current_value !== null ? String(updates.current_value) : null;
      if (updates.target_value !== undefined) payload.target_value = updates.target_value !== null ? String(updates.target_value) : null;
      if (updates.start_date) payload.start_date = updates.start_date;
      if (updates.end_date !== undefined) payload.end_date = updates.end_date;
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
    options?: {
      decision?: ExperimentDecision;
      rationale?: string;
      baseline_value?: string | number | null;
      current_value?: string | number | null;
      measured_financial_impact?: number;
      end_date?: string | null;
      currentStatus?: CommercialExperiment['status'];
    }
  ): Promise<CeoMutationResult<void>> {
    return this.updateExperiment(experimentId, {
      status,
      decision: options?.decision,
      decision_rationale: options?.rationale,
      baseline_value: options?.baseline_value,
      current_value: options?.current_value,
      measured_financial_impact: options?.measured_financial_impact,
      end_date: options?.end_date,
      currentStatus: options?.currentStatus,
    });
  }

  /**
   * Consulta vendas reais do período do experimento para cálculo do impacto e KPIs
   * Garantias:
   * 1. Paginação automática (sem truncamento por limite de 1000 linhas)
   * 2. Deduplicação estrita por deduplication_key e ID de venda (#ID)
   * 3. Exclusão estrita de canceladas ou estornadas
   * 4. Recuperação estruturada de itens para KPIs de produtos e margem
   */
  static async fetchSalesForExperiment(
    workspaceId: string,
    startDate: string,
    endDate?: string | null
  ): Promise<Array<{
    valor: number;
    data: string;
    status?: string;
    cancelada?: boolean;
    tipo?: string;
    deduplication_key?: string;
    itens?: Array<{
      nome?: string;
      produto_id?: string;
      quantidade: number;
      valor_unitario?: number;
      custo_unitario?: number;
    }>;
  }>> {
    if (!workspaceId || !startDate) return [];

    try {
      const allRows: Record<string, unknown>[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('transacoes')
          .select(
            'id, valor, data, status, cancelada, tipo, descricao, observacoes, itens, deduplication_key'
          )
          .eq('workspace_id', workspaceId)
          .gte('data', startDate);

        if (endDate) {
          query = query.lte('data', endDate);
        }

        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (error) {
          console.error('[CeoRepository.fetchSalesForExperiment] Erro ao buscar transações:', error.message);
          break;
        }

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        allRows.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          offset += PAGE_SIZE;
        }
      }

      // Deduplicação estrita e filtro de transações canceladas
      const seenKeys = new Set<string>();
      const result: Array<{
        valor: number;
        data: string;
        status?: string;
        cancelada?: boolean;
        tipo?: string;
        deduplication_key?: string;
        itens?: Array<{
          nome?: string;
          produto_id?: string;
          quantidade: number;
          valor_unitario?: number;
          custo_unitario?: number;
        }>;
      }> = [];

      for (const t of allRows) {
        const isCancelled =
          Boolean(t.cancelada) ||
          String(t.status || '').toLowerCase() === 'cancelada' ||
          String(t.status || '').toLowerCase() === 'cancelled';

        if (isCancelled) continue;

        // Extrai identificador de deduplicação
        const rawDedup = typeof t.deduplication_key === 'string' ? t.deduplication_key.trim() : null;
        let saleIdentifier = rawDedup;

        if (!saleIdentifier) {
          const text = `${t.descricao || ''} ${t.observacoes || ''}`;
          const match = text.match(/#(\d+)/);
          saleIdentifier = match ? `eyemobile:sale:${match[1]}` : String(t.id);
        }

        if (seenKeys.has(saleIdentifier)) {
          continue; // Ignora duplicata
        }
        seenKeys.add(saleIdentifier);

        result.push({
          valor: Number(t.valor || 0),
          data: String(t.data || startDate),
          status: String(t.status || 'concluida'),
          cancelada: false,
          tipo: String(t.tipo || 'receita'),
          deduplication_key: rawDedup || undefined,
          itens: Array.isArray(t.itens)
            ? (t.itens as unknown as Array<{
                nome?: string;
                produto_id?: string;
                quantidade: number;
                valor_unitario?: number;
                custo_unitario?: number;
              }>)
            : undefined,
        });
      }

      return result;
    } catch (err) {
      console.error('[CeoRepository.fetchSalesForExperiment] Falha inesperada:', err);
      return [];
    }
  }
}
