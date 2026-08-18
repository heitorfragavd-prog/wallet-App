import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  WalletAiOrchestratorClient,
  WalletAiOrchestratorError,
  type SendMessagePayload,
} from "./WalletAiOrchestratorClient";

describe("WalletAiOrchestratorClient", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve enviar requisição autenticada sem injetar user_id no body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          message: {
            role: "assistant",
            content: "Seu faturamento em agosto foi de R$ 25.000,00.",
          },
          toolCalls: [],
          iterations: 1,
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
          estimatedCostUsd: 0.0001,
        }),
    });

    const client = new WalletAiOrchestratorClient({
      baseUrl: "https://edge.test/wallet-ai-orchestrator",
      getAccessToken: () => Promise.resolve("valid-token-123"),
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const payload: SendMessagePayload = {
      workspaceId: validWorkspaceId,
      messages: [{ role: "user", content: "Quanto faturei?" }],
    };

    const response = await client.sendMessage(payload);

    expect(response.message.content).toBe("Seu faturamento em agosto foi de R$ 25.000,00.");
    expect(response.usage.totalTokens).toBe(120);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://edge.test/wallet-ai-orchestrator",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer valid-token-123",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quanto faturei?" }],
          model: undefined,
        }),
      }),
    );
  });

  it("deve lançar erro se o token de acesso não estiver disponível", async () => {
    const client = new WalletAiOrchestratorClient({
      baseUrl: "https://edge.test/wallet-ai-orchestrator",
      getAccessToken: () => Promise.resolve(null),
    });

    await expect(
      client.sendMessage({
        workspaceId: validWorkspaceId,
        messages: [{ role: "user", content: "Olá" }],
      }),
    ).rejects.toThrowError(WalletAiOrchestratorError);
  });

  it("deve tratar resposta de erro do servidor", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "workspace_forbidden" }),
    });

    const client = new WalletAiOrchestratorClient({
      baseUrl: "https://edge.test/wallet-ai-orchestrator",
      getAccessToken: () => Promise.resolve("valid-token"),
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.sendMessage({
        workspaceId: validWorkspaceId,
        messages: [{ role: "user", content: "Olá" }],
      }),
    ).rejects.toThrowError(WalletAiOrchestratorError);
  });
});
