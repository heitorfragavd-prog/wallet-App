/**
 * Centralized Token & Cost Calculator for Wallet AI
 * 
 * Regras:
 * - Tabela/config única de preços por milhão de tokens (USD).
 * - Não espalhar preços em handlers.
 * - Registro consistente de provider, model, tokens e estimatedCostUsd.
 * - Modelos desconhecidos: NÃO fingir custo zero, retornar -1 (unknown/unavailable).
 */

import type { AllowedModel } from "./model-policy.ts";

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  provider: "openai" | "google";
}

export const MODEL_PRICING: Record<AllowedModel, ModelPricing> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.60, provider: "openai" },
  "gpt-4o": { inputPerMillion: 2.50, outputPerMillion: 10.00, provider: "openai" },
  "o3-mini": { inputPerMillion: 1.10, outputPerMillion: 4.40, provider: "openai" },
  "gemini-2.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.30, provider: "google" },
  "gemini-3.6-flash": { inputPerMillion: 0.075, outputPerMillion: 0.30, provider: "google" },
  "gemini-3.7-flash": { inputPerMillion: 0.075, outputPerMillion: 0.30, provider: "google" },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.30, provider: "google" },
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.00, provider: "google" },
  "whisper-1": { inputPerMillion: 0.00, outputPerMillion: 0.00, provider: "openai" },
};

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostTelemetryRecord {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  duration_ms: number;
  correlation_id: string;
  workspace_id: string;
  conversation_id?: string;
  cost_status: "known" | "unknown";
}

export function isModelPricingAvailable(model: string): boolean {
  return typeof (MODEL_PRICING as Record<string, ModelPricing>)[model] !== "undefined";
}

/**
 * Retorna o custo estimado em USD.
 * Se o modelo não tiver precificação configurada, retorna -1 (não finge custo zero).
 */
export function calculateEstimatedCost(
  model: string,
  usage?: Partial<TokenUsage> | null,
): number {
  if (!usage) return 0;
  const promptTokens = Math.max(0, usage.promptTokens ?? 0);
  const completionTokens = Math.max(0, usage.completionTokens ?? 0);

  const pricing = (MODEL_PRICING as Record<string, ModelPricing>)[model];
  if (!pricing) {
    // Modelo desconhecido: não fingir zero!
    return -1;
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
  const total = inputCost + outputCost;

  return Math.round(total * 1_000_000) / 1_000_000;
}

export function createCostTelemetryRecord(params: {
  model: string;
  usage?: Partial<TokenUsage> | null;
  durationMs: number;
  correlationId: string;
  workspaceId: string;
  conversationId?: string;
}): CostTelemetryRecord {
  const promptTokens = Math.max(0, params.usage?.promptTokens ?? 0);
  const completionTokens = Math.max(0, params.usage?.completionTokens ?? 0);
  const totalTokens = Math.max(0, params.usage?.totalTokens ?? (promptTokens + completionTokens));

  const pricing = (MODEL_PRICING as Record<string, ModelPricing>)[params.model];
  const isKnown = Boolean(pricing);
  const provider = pricing?.provider ?? "unknown";

  const rawCost = calculateEstimatedCost(params.model, {
    promptTokens,
    completionTokens,
    totalTokens,
  });

  return {
    provider,
    model: params.model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: rawCost >= 0 ? rawCost : null,
    duration_ms: Math.max(0, Math.round(params.durationMs)),
    correlation_id: params.correlationId,
    workspace_id: params.workspaceId,
    conversation_id: params.conversationId,
    cost_status: isKnown ? "known" : "unknown",
  };
}

export interface BudgetEvaluationInput {
  hardLimitActive: boolean;
  monthlyBudgetUsd: number;
  totalCostUsd: number | null;
  readError?: boolean;
}

export interface BudgetEvaluationResult {
  hardLimitExceeded: boolean;
  alertTriggered?: '50%' | '80%' | '100%';
  failClosedReason?: string;
  isReadError?: boolean;
}

/**
 * Avaliação determinística e fail-safe de limite e orçamento de IA.
 * Regras:
 * 1. Se houver erro de leitura e hard limit estiver ativo -> FAIL-CLOSED (hardLimitExceeded: true).
 * 2. Se houver erro de leitura e hard limit inativo -> FAIL-OPEN (não bloqueia o workspace).
 * 3. Ausência de telemetria no mês (null) -> consumo zero, não bloqueia.
 * 4. Hard limit ativo e custo >= orçamento -> hardLimitExceeded: true.
 * 5. Sem hard limit ativo -> hardLimitExceeded: false com disparos de alertas informativos.
 */
export function evaluateAiBudgetGuardrail(input: BudgetEvaluationInput): BudgetEvaluationResult {
  if (input.readError) {
    if (input.hardLimitActive) {
      return {
        hardLimitExceeded: true,
        isReadError: true,
        failClosedReason: 'telemetry_read_error_with_active_hard_limit',
      };
    }
    return {
      hardLimitExceeded: false,
      isReadError: true,
    };
  }

  const currentCost = input.totalCostUsd ?? 0;
  const budget = input.monthlyBudgetUsd > 0 ? input.monthlyBudgetUsd : 10;

  if (input.hardLimitActive && currentCost >= budget) {
    return {
      hardLimitExceeded: true,
    };
  }

  const percentConsumed = budget > 0 ? (currentCost / budget) * 100 : 0;
  if (percentConsumed >= 100) {
    return { hardLimitExceeded: false, alertTriggered: '100%' };
  }
  if (percentConsumed >= 80) {
    return { hardLimitExceeded: false, alertTriggered: '80%' };
  }
  if (percentConsumed >= 50) {
    return { hardLimitExceeded: false, alertTriggered: '50%' };
  }

  return { hardLimitExceeded: false };
}

