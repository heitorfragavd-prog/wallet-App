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
  private readonly fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(options: WalletAiOrchestratorClientOptions) {
    this.baseUrl = options.baseUrl ?? "/functions/v1/wallet-ai-orchestrator";
    this.getAccessToken = options.getAccessToken;
    const customFetch = options.fetchImpl;
    // Sempre executa fetch no escopo global para evitar 'Illegal invocation' em browsers
    this.fetchImpl = customFetch
      ? (input, init) => customFetch(input, init)
      : (input, init) => globalThis.fetch(input, init);
  }

  async sendMessage(payload: SendMessagePayload): Promise<OrchestratorClientResponse> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new WalletAiOrchestratorError(
        "missing_session",
        "Sessão de usuário não encontrada para autenticar a requisição.",
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
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
    } catch {
      // Fallback para openai-proxy se o endpoint principal apresentar erro de rede
      const proxyUrl = this.baseUrl.replace("wallet-ai-orchestrator", "openai-proxy");
      response = await this.fetchImpl(proxyUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: payload.messages,
          model: payload.model || "gpt-4o-mini",
        }),
      });
    }

    // Se o orchestrator V2 ainda não estiver publicado na nuvem (404), usa o proxy existente
    if (response.status === 404) {
      const proxyUrl = this.baseUrl.replace("wallet-ai-orchestrator", "openai-proxy");
      const fallbackResp = await this.fetchImpl(proxyUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: payload.messages,
          model: payload.model || "gpt-4o-mini",
        }),
      });

      if (fallbackResp.ok) {
        const proxyJson = await fallbackResp.json().catch(() => ({}));
        const choice = proxyJson.choices?.[0];
        if (choice?.message) {
          return {
            message: choice.message,
            toolCalls: [],
            iterations: 1,
            usage: proxyJson.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            estimatedCostUsd: 0,
            loopDetected: false,
            maxIterationsReached: false,
          };
        }
      }
    }

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json.success === false) {
      throw new WalletAiOrchestratorError(
        json.error ?? "orchestrator_request_failed",
        `Falha na execução do assistente: ${json.error ?? response.statusText}`,
        response.status,
      );
    }

    const assistantMessage = json.message || json.choices?.[0]?.message || {
      role: "assistant",
      content: typeof json.resposta === "string" ? json.resposta : (json.text || ""),
    };

    return {
      message: assistantMessage,
      toolCalls: json.toolCalls ?? [],
      iterations: json.iterations ?? 1,
      usage: json.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedCostUsd: json.estimatedCostUsd ?? 0,
      loopDetected: json.loopDetected ?? false,
      maxIterationsReached: json.maxIterationsReached ?? false,
    };
  }
}
