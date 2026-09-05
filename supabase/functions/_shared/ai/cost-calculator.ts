/**
 * Centralized Token & Cost Calculator for Wallet AI
 * 
 * Regras:
 * - Tabela/config única de preços por milhão de tokens (USD).
 * - Não espalhar preços em handlers.
 * - Registro consistente de provider, model, tokens e estimatedCostUsd.
 */

import { ALLOWED_MODELS, type AllowedModel, DEFAULT_CHAT_MODEL } from "./model-policy.ts";

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  provider: "openai" | "google";
}

export const MODEL_PRICING: Record<AllowedModel, ModelPricing> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.60, provider: "openai" },
  "gpt-4o": { inputPerMillion: 2.50, outputPerMillion: 10.00, provider: "openai" },
  "o3-mini": { inputPerMillion: 1.10, outputPerMillion: 4.40, provider: "openai" },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.30, provider: "google" },
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.00, provider: "google" },
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
  estimated_cost_usd: number;
  duration_ms: number;
  correlation_id: string;
  workspace_id: string;
  conversation_id?: string;
}

export function calculateEstimatedCost(
  model: string,
  usage?: Partial<TokenUsage> | null,
): number {
  if (!usage) return 0;
  const promptTokens = Math.max(0, usage.promptTokens ?? 0);
  const completionTokens = Math.max(0, usage.completionTokens ?? 0);

  const pricing =
    (MODEL_PRICING as Record<string, ModelPricing>)[model] ??
    MODEL_PRICING[DEFAULT_CHAT_MODEL];

  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
  const total = inputCost + outputCost;

  // Arredondamento seguro para 6 casas decimais
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

  const pricing =
    (MODEL_PRICING as Record<string, ModelPricing>)[params.model] ??
    MODEL_PRICING[DEFAULT_CHAT_MODEL];

  const estimatedCostUsd = calculateEstimatedCost(params.model, {
    promptTokens,
    completionTokens,
    totalTokens,
  });

  return {
    provider: pricing.provider,
    model: params.model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCostUsd,
    duration_ms: Math.max(0, Math.round(params.durationMs)),
    correlation_id: params.correlationId,
    workspace_id: params.workspaceId,
    conversation_id: params.conversationId,
  };
}
