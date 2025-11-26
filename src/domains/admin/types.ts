/**
 * Admin Domain Types
 */

export interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
  limits: PlanLimits;
  created_at: string;
}

export interface PlanLimits {
  max_transactions: number;
  max_vehicles: number;
  max_goals: number;
  ai_queries_per_month: number;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'expired';
  expires_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
}
