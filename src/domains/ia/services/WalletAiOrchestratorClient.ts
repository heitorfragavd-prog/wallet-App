import type { LlmMessage, LlmUsage, ExecutedToolRecord } from "../../../../supabase/functions/_shared/ai/orchestrator-core";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";

export interface SendMessagePayload {
  workspaceId: string;
  messages: LlmMessage[];
  model?: string;
  conversationId?: string;
  correlationId?: string;
}

export interface OrchestratorClientResponse {
  message: LlmMessage;
  toolCalls: ExecutedToolRecord[];
  actionProposals?: ActionProposal[];
  iterations: number;
  usage: LlmUsage;
  estimatedCostUsd: number;
  loopDetected: boolean;
  maxIterationsReached: boolean;
  conversationId?: string;
  correlationId?: string;
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
    this.fetchImpl = customFetch
      ? (input, init) => customFetch(input, init)
      : (input, init) => globalThis.fetch(input, init);
  }

  async sendMessage(payload: SendMessagePayload): Promise<OrchestratorClientResponse> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new WalletAiOrchestratorError(
        "WALLET_AI_AUTH_ERROR",
        "Sessão de usuário não encontrada para autenticar a requisição.",
      );
    }

    const correlationId = payload.correlationId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Correlation-Id": correlationId,
    };

    const requestBody: Record<string, unknown> = {
      workspace_id: payload.workspaceId,
      messages: payload.messages,
      model: payload.model,
    };
    if (payload.conversationId) {
      requestBody.conversation_id = payload.conversationId;
    }
    if (payload.correlationId) {
      requestBody.correlation_id = payload.correlationId;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });
    } catch {
      // Fallback gracioso para openai-proxy se o endpoint principal apresentar erro de rede
      const proxyUrl = this.baseUrl.replace("wallet-ai-orchestrator", "openai-proxy");
      response = await this.fetchImpl(proxyUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          messages: payload.messages,
          model: payload.model || "gpt-4o-mini",
        }),
      });
    }

    // Se o orchestrator V2 ainda não estiver publicado no Supabase (404), usa proxy existente
    if (response.status === 404) {
      const proxyUrl = this.baseUrl.replace("wallet-ai-orchestrator", "openai-proxy");
      const fallbackResp = await this.fetchImpl(proxyUrl, {
        method: "POST",
        headers: requestHeaders,
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
            correlationId,
          };
        }
      }
    }

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json.success === false) {
      const errorCode = json.code ?? json.error ?? "WALLET_AI_TOOL_ERROR";
      throw new WalletAiOrchestratorError(
        errorCode,
        `Falha na execução do assistente: ${errorCode}`,
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
      actionProposals: json.action_proposals ?? [],
      iterations: json.iterations ?? 1,
      usage: json.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedCostUsd: json.estimatedCostUsd ?? 0,
      loopDetected: json.loopDetected ?? false,
      maxIterationsReached: json.maxIterationsReached ?? false,
      conversationId: json.conversation_id,
      correlationId: json.correlation_id || response.headers?.get?.("x-correlation-id") || correlationId,
    };
  }
}
