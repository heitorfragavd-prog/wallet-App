import { useState, useCallback, useRef } from "react";
import type { LlmMessage, ExecutedToolRecord } from "../../../../supabase/functions/_shared/ai/orchestrator-core";
import {
  WalletAiOrchestratorClient,
  WalletAiOrchestratorError,
} from "../services/WalletAiOrchestratorClient";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ExecutedToolRecord[];
  createdAt: Date;
  isError?: boolean;
}

export interface UseWalletAgentChatOptions {
  workspaceId?: string;
  client?: WalletAiOrchestratorClient;
  model?: string;
  onError?: (error: Error) => void;
}

export function useWalletAgentChat(options: UseWalletAgentChatOptions) {
  const { workspaceId, client, model, onError } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText) return;

      if (!workspaceId) {
        const err = new Error("Workspace não selecionado para o chat.");
        onError?.(err);
        return;
      }

      if (!client) {
        const err = new Error("Cliente do assistente de IA não inicializado.");
        onError?.(err);
        return;
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        role: "user",
        content: trimmedText,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setCurrentStatus("Consultando assistente financeiro...");

      try {
        const outgoingMessages: LlmMessage[] = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await client.sendMessage({
          workspaceId,
          messages: outgoingMessages,
          model,
        });

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + 1),
          role: "assistant",
          content: response.message?.content ?? (typeof response.message === "string" ? response.message : ""),
          toolCalls: response.toolCalls,
          createdAt: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setCurrentStatus("");
      } catch (err: unknown) {
        const error =
          err instanceof WalletAiOrchestratorError
            ? err
            : new Error(err instanceof Error ? err.message : "Erro desconhecido ao consultar IA.");

        const errorMessage: ChatMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + 2),
          role: "assistant",
          content: `Desculpe, ocorreu um erro ao processar sua solicitação: ${error.message}`,
          createdAt: new Date(),
          isError: true,
        };

        setMessages((prev) => [...prev, errorMessage]);
        onError?.(error);
      } finally {
        setIsLoading(false);
        setCurrentStatus("");
      }
    },
    [workspaceId, client, messages, model, onError],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setCurrentStatus("");
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    currentStatus,
    sendMessage,
    clearChat,
  };
}
