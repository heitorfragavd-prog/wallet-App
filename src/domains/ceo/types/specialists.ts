/**
 * CONTRATO DOS SETE AGENTES ESPECIALIZADOS DO WALLET CEO 3.0 (FRONTEND)
 */

export type SpecialistAgentId =
  | "financeiro"
  | "fiscal"
  | "vendas_pdv"
  | "estoque"
  | "rh"
  | "inteligencia_competitiva"
  | "operacoes";

export interface SpecialistAgentContract {
  id: SpecialistAgentId;
  name: string;
  department: string;
  description: string;
  capabilities: string[];
  allowedTools: string[];
  requiredRole: "owner" | "admin" | "member";
  canMutateState: boolean;
  deterministicFirst: boolean;
  defaultModel: "gemini-2.5-flash" | "gpt-4o-mini" | "gpt-4o";
  maxComplexity: 1 | 2 | 3;
}

export interface SpecialistRoutingPlan {
  primarySpecialist: SpecialistAgentId;
  coordinatingCeo: boolean;
  contributingSpecialists: SpecialistAgentId[];
  complexityLevel: 1 | 2 | 3;
  model: string;
  isDeterministicPossible: boolean;
  rationale: string;
}
