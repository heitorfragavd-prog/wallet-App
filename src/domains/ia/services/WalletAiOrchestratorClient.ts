import type { LlmMessage, LlmUsage, ExecutedToolRecord } from "../../../../supabase/functions/_shared/ai/orchestrator-core";

export interface SendMessagePayload {
  workspaceId: string;
  messages: LlmMessage[];
  model?: string;
}

export interface OrchestratorClientResponse {
  message: LlmMessage;
  toolCalls: ExecutedToolRecord[];
  iterations: number;
  usage: LlmUsage;
  estimatedCostUsd: number;
  loopDetected: boolean;
  maxIterationsReached: boolean;
}

export interface WalletAiOrchestratorClientOptions {
  baseUrl?: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export class WalletAiOrchestratorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "WalletAiOrchestratorError";
  }
}

export class WalletAiOrchestratorClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WalletAiOrchestratorClientOptions) {
    this.baseUrl = options.baseUrl ?? "/functions/v1/wallet-ai-orchestrator";
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async sendMessage(payload: SendMessagePayload): Promise<OrchestratorClientResponse> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new WalletAiOrchestratorError(
        "missing_session",
        "Sessão de usuário não encontrada para autenticar a requisição.",
      );
    }

    const response = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: payload.workspaceId,
        messages: payload.messages,
        model: payload.model,
      }),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json.success === false) {
      throw new WalletAiOrchestratorError(
        json.error ?? "orchestrator_request_failed",
        `Falha na execução do assistente: ${json.error ?? response.statusText}`,
        response.status,
      );
    }

    return {
      message: json.message,
      toolCalls: json.toolCalls ?? [],
      iterations: json.iterations ?? 1,
      usage: json.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedCostUsd: json.estimatedCostUsd ?? 0,
      loopDetected: json.loopDetected ?? false,
      maxIterationsReached: json.maxIterationsReached ?? false,
    };
  }
}
