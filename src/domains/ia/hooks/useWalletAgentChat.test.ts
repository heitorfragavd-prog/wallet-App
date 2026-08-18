import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWalletAgentChat } from "./useWalletAgentChat";

describe("useWalletAgentChat Hook", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";

  it("deve inicializar com mensagens vazias e pronto para envio", () => {
    const mockClient = {
      sendMessage: vi.fn(),
    };

    const { result } = renderHook(() =>
      useWalletAgentChat({
        workspaceId: validWorkspaceId,
        client: mockClient as any,
      }),
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentStatus).toBe("");
  });

  it("deve enviar mensagem do usuário e adicionar resposta do assistente", async () => {
    const mockClient = {
      sendMessage: vi.fn().mockResolvedValue({
        message: {
          role: "assistant",
          content: "Seu saldo é R$ 5.000,00",
        },
        toolCalls: [
          {
            tool: "consultar_saldos",
            arguments: {},
            output: { availableBalance: 5000 },
          },
        ],
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        estimatedCostUsd: 0.0001,
      }),
    };

    const { result } = renderHook(() =>
      useWalletAgentChat({
        workspaceId: validWorkspaceId,
        client: mockClient as any,
      }),
    );

    await act(async () => {
      await result.current.sendMessage("Qual meu saldo?");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Qual meu saldo?");
    expect(result.current.messages[1].role).toBe("assistant");
    expect(result.current.messages[1].content).toBe("Seu saldo é R$ 5.000,00");
    expect(result.current.messages[1].toolCalls).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });

  it("deve limpar o chat quando requested", () => {
    const { result } = renderHook(() =>
      useWalletAgentChat({
        workspaceId: validWorkspaceId,
        client: { sendMessage: vi.fn() } as any,
      }),
    );

    act(() => {
      result.current.clearChat();
    });

    expect(result.current.messages).toEqual([]);
  });
});
