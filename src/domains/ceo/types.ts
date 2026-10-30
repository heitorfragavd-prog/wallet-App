/**
 * Tipos canônicos do domínio Wallet CEO — Diretoria Digital e Estratégia
 */

export type CeoDepartment =
  | 'commercial_growth'
  | 'operations_loss'
  | 'loss_waste' // alias
  | 'profitability'
  | 'cmv_pricing' // alias
  | 'delivery_channels'
  | 'people_productivity'
  | 'staff_productivity' // alias
  | 'finance'
  | 'finance_margins' // alias
  | 'customers_reputation'
  | 'strategy_lab'
  | 'growth_lab'; // alias

export type OpportunityStatus =
  | 'identificada'
  | 'detected'
  | 'em_experimento'
  | 'implantada'
  | 'descartada';

export type OpportunityType =
  | 'combo'
  | 'pricing'
  | 'schedule'
  | 'packaging'
  | 'waste_reduction'
  | 'operations';

export type ExperimentStatus =
  | 'planejado'
  | 'planned'
  | 'em_andamento'
  | 'active'
  | 'concluido'
  | 'completed'
  | 'cancelado'
  | 'cancelled';

export type ExperimentDecision =
  | 'manter'
  | 'ampliar'
  | 'ajustar'
  | 'interromper'
  | 'pendente';

export interface GrowthOpportunity {
  id: string;
  workspace_id: string;
  department: CeoDepartment;
  title: string;
  problem_description: string;
  description?: string; // alias conveniente
  hypothesis: string;
  recommended_action: string;
  estimated_financial_impact: number;
  potential_monthly_gain: number; // alias para exibição
  confidence_score: number; // 0.00 a 1.00
  type?: OpportunityType;
  impact_level?: 'high' | 'medium' | 'low';
  effort_level?: 'easy' | 'moderate' | 'complex';
  status: OpportunityStatus;
  evidence_data: {
    source: string;
    sample_period?: string;
    metrics?: Record<string, number | string>;
    data_quality_notes?: string;
    has_sufficient_data: boolean;
  };
  limitations_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CommercialExperiment {
  id: string;
  workspace_id: string;
  opportunity_id?: string | null;
  name?: string;
  title?: string; // alias
  department?: CeoDepartment;
  hypothesis: string;
  start_date: string; // YYYY-MM-DD ou ISO
  end_date?: string; // YYYY-MM-DD ou ISO
  responsible_person?: string;
  target_kpi?: string;
  baseline_value?: string | number;
  current_value?: string | number;
  target_value?: string | number;
  target_metrics?: {
    target_metric_name: string;
    baseline_value: number;
    expected_value: number;
    unit: string;
  };
  observed_results?: {
    current_value?: number;
    delta_percent?: number;
    notes?: string;
  };
  measured_financial_impact?: number;
  decision?: ExperimentDecision;
  decision_rationale?: string;
  status: ExperimentStatus;
  created_at: string;
  updated_at: string;
}

export interface CeoDepartmentMetric {
  label: string;
  value: string | number;
}

export interface CeoDepartmentSummary {
  department: CeoDepartment;
  title: string;
  score?: number; // 0 a 100
  status: 'otimo' | 'atencao' | 'critico' | 'dados_insuficientes' | 'optimal' | 'attention' | 'critical';
  highlights?: string[];
  opportunities_count?: number;
  metrics?: CeoDepartmentMetric[];
  recommendations?: string[];
}

export interface LossItemAnalysis {
  id?: string;
  category: 'descarte' | 'vencimento' | 'ruptura' | 'inventario' | 'divergencia_caixa';
  product_name?: string;
  quantity?: number;
  unit_cost?: number;
  total_loss_value?: number;
  cost_amount?: number; // alias
  description?: string;
  occurred_at?: string;
  notes?: string;
}

export type OperationalLossEvent = LossItemAnalysis;

export interface ProductSaleInput {
  product_id: string;
  product_name: string;
  name?: string;
  category?: string;
  quantity_sold: number;
  unit_price: number;
  unit_cost: number;
}

export type ProductSalesCMVRecord = ProductSaleInput;

export interface SalesShiftAnalysis {
  shift_name: string; // Ex: 'Manhã (06h-12h)', 'Tarde (12h-18h)', 'Noite (18h-00h)', 'Madrugada'
  total_sales: number;
  order_count: number;
  average_ticket: number;
  items_per_ticket?: number;
}
