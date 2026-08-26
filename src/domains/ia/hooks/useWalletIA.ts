/**
 * useWalletIA — Hook central da Wallet IA unificada (Etapa 1)
 *
 * Responsabilidade: Orquestrar o envio de mensagens para o motor correto
 * (FAST_QUERY, AGENT_V2, DOCUMENT) de forma totalmente opaca para a interface.
 *
 * A interface só conhece:
 *   - messages (histórico unificado)
 *   - isLoading
 *   - currentStatus (texto amigável do estado atual)
 *   - sendMessage(text, attachments?)
 *   - clearChat()
 *
 * Internamente, o hook usa:
 *   - WalletAIRouter para decidir a rota
 *   - gerarRespostaIA() (Consulta Rápida) para FAST_QUERY
 *   - WalletAiOrchestratorClient para AGENT_V2
 *   - useChatFinanceiro.sendMessage para DOCUMENT/LEGACY
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import { routeMessage, type WalletAIRoute } from "../services/WalletAIRouter";
import {
  WalletAiOrchestratorClient,
  WalletAiOrchestratorError,
} from "../services/WalletAiOrchestratorClient";
import type { ExecutedToolRecord } from "../../../../supabase/functions/_shared/ai/orchestrator-core";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface WalletIAMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  /** Rota que gerou esta mensagem (para observabilidade) */
  routeUsed?: WalletAIRoute;
  /** Ferramentas usadas pelo Agent V2 */
  toolCalls?: ExecutedToolRecord[];
  /** Dados estruturados de visualização (gráfico, KPI, tabela) */
  visualization?: unknown;
  /** Proposta de ação do Agent V2 */
  actionProposal?: unknown;
  /** URL de preview de imagem anexada */
  imageDataUrl?: string;
  isError?: boolean;
  correlationId?: string;
}

export interface WalletIAAttachment {
  type: "image" | "pdf";
  mimeType: string;
  base64: string;
  dataUrl: string;
  name: string;
}

export interface UseWalletIAOptions {
  workspaceId?: string;
  conversaId?: string;
  /** Dados carregados para a Consulta Rápida determinística */
  dadosFinanceiros?: {
    receitas: Array<{ valor: number; data: string; descricao?: string; metodo_pagamento?: string | null }>;
    despesas: Array<{ valor: number; data: string; descricao?: string }>;
    contas: Array<{ nome: string; saldo_atual: number; tipo: string }>;
  };
  /** Modelo a usar no Agent V2 (opcional) */
  model?: string;
  onError?: (error: Error) => void;
  /** Callback para persistência de mensagem (para histórico) */
  onMessagePersist?: (msg: WalletIAMessage, conversaId: string) => Promise<void>;
  /** Callback após cada mensagem enviada (para atualizar ultima_mensagem_em) */
  onMessageSent?: (conversaId: string) => void;
  /** Função de geração de resposta da Consulta Rápida */
  fastQueryFn?: (pergunta: string) => string;
}

// ─── STATUS amigáveis por rota ────────────────────────────────────────────────

const STATUS_MESSAGES: Record<WalletAIRoute, string> = {
  FAST_QUERY: "Consultando seus dados...",
  AGENT_V2: "Analisando com o assistente financeiro...",
  DOCUMENT: "Analisando documento...",
  CONVERSATIONAL: "Preparando resposta...",
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useWalletIA(options: UseWalletIAOptions) {
  const {
    workspaceId,
    conversaId,
    dadosFinanceiros,
    model,
    onError,
    onMessagePersist,
    onMessageSent,
    fastQueryFn,
  } = options;

  const [messages, setMessages] = useState<WalletIAMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cliente do Agent V2 — instanciado uma vez
  const client = useMemo(
    () =>
      new WalletAiOrchestratorClient({
        baseUrl: `${import.meta.env.VITE_SUPABASE_URL || ""}/functions/v1/wallet-ai-orchestrator`,
        getAccessToken: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? null;
        },
      }),
    []
  );

  // ─── Enviar mensagem ──────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, attachments?: WalletIAAttachment[]) => {
      const trimmed = text.trim();
      if (!trimmed && (!attachments || attachments.length === 0)) return;
      if (isLoading) return;

      const correlationId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

      // 1. Montar mensagem do usuário
      const userMessage: WalletIAMessage = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        role: "user",
        content: trimmed || (attachments?.length ? "Analise este arquivo." : ""),
        createdAt: new Date(),
        imageDataUrl: attachments?.find((a) => a.type === "image")?.dataUrl,
        correlationId,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // 2. Persistir mensagem do usuário
      if (onMessagePersist && conversaId) {
        await onMessagePersist(userMessage, conversaId);
      }
      if (onMessageSent && conversaId) {
        onMessageSent(conversaId);
      }

      // 3. Decidir rota
      const routeDecision = routeMessage({
        message: trimmed,
        attachments: attachments?.map((a) => ({ type: a.type, mimeType: a.mimeType })),
        conversationHistory: messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        workspaceId,
      });

      setCurrentStatus(STATUS_MESSAGES[routeDecision.route]);

      logger.info("WalletIA", "Rota selecionada", {
        correlationId,
        route: routeDecision.route,
        reason: routeDecision.reason,
        conversaId,
        workspaceId,
      });

      try {
        let assistantMessage: WalletIAMessage;

        // ── FAST_QUERY ──────────────────────────────────────────────────────
        if (routeDecision.route === "FAST_QUERY" && fastQueryFn && dadosFinanceiros) {
          // Pequeno delay para UX (evitar resposta instantânea que parece automática)
          await new Promise((r) => setTimeout(r, 300));
          const resposta = fastQueryFn(trimmed);

          assistantMessage = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + 1),
            role: "assistant",
            content: resposta,
            createdAt: new Date(),
            routeUsed: "FAST_QUERY",
            correlationId,
          };
        }

        // ── AGENT_V2 (+ DOCUMENT via Agent V2) ─────────────────────────────
        else {
          if (!workspaceId) {
            throw new Error("Workspace não selecionado. Selecione um workspace para continuar.");
          }

          // Construir histórico para o Agent V2 (últimas 10 mensagens)
          const historyForAgent = messages
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content }));

          const response = await client.sendMessage({
            workspaceId,
            messages: [
              ...historyForAgent,
              {
                role: "user",
                content: trimmed || "Analise este arquivo.",
              },
            ],
            model,
          });

          assistantMessage = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + 1),
            role: "assistant",
            content:
              response.message?.content ??
              (typeof response.message === "string" ? response.message : ""),
            createdAt: new Date(),
            routeUsed: routeDecision.route,
            toolCalls: response.toolCalls,
            correlationId,
          };
        }

        setMessages((prev) => [...prev, assistantMessage]);

        // Persistir resposta do assistente
        if (onMessagePersist && conversaId) {
          await onMessagePersist(assistantMessage, conversaId);
        }
        if (onMessageSent && conversaId) {
          onMessageSent(conversaId);
        }
      } catch (error) {
        logger.error("WalletIA", "Erro ao processar mensagem", {
          correlationId,
          route: routeDecision.route,
          error: error instanceof Error ? error.message : String(error),
        });

        const isWorkspaceError = !workspaceId;
        const isOrchestratorError = error instanceof WalletAiOrchestratorError;

        let userFacingContent: string;
        if (isWorkspaceError) {
          userFacingContent = "⚠️ Nenhum workspace selecionado. Selecione um workspace e tente novamente.";
        } else if (isOrchestratorError) {
          userFacingContent = `⚠️ Não consegui concluir esta análise.\n\nCódigo: ${correlationId.slice(0, 8).toUpperCase()}`;
        } else {
          userFacingContent = `⚠️ Erro ao processar sua mensagem.\n\nCódigo: ${correlationId.slice(0, 8).toUpperCase()}`;
        }

        const errorMessage: WalletIAMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + 2),
          role: "assistant",
          content: userFacingContent,
          createdAt: new Date(),
          isError: true,
          routeUsed: routeDecision.route,
          correlationId,
        };

        setMessages((prev) => [...prev, errorMessage]);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setIsLoading(false);
        setCurrentStatus("");
      }
    },
    [
      isLoading,
      messages,
      workspaceId,
      conversaId,
      dadosFinanceiros,
      model,
      client,
      fastQueryFn,
      onError,
      onMessagePersist,
      onMessageSent,
    ]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setCurrentStatus("");
  }, []);

  const loadHistory = useCallback((history: WalletIAMessage[]) => {
    setMessages(history);
  }, []);

  return {
    messages,
    isLoading,
    currentStatus,
    sendMessage,
    clearChat,
    loadHistory,
  };
}
