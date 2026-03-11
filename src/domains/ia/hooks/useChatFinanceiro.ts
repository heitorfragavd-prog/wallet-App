import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageDataUrl?: string;
}

export const DEFAULT_SYSTEM_PROMPT = `Você é um assistente financeiro pessoal especializado. Você tem acesso a ferramentas para consultar e modificar os dados financeiros do usuário em tempo real.

## Regras fundamentais
- Responda sempre em português brasileiro, de forma clara e objetiva
- NUNCA invente dados financeiros — use sempre as ferramentas para buscar informações reais antes de responder
- Quando mencionar valores monetários, use o formato R$ X.XXX,XX
- Sugira ações concretas e práticas para melhorar a saúde financeira quando relevante
- Seja empático e motivador ao tratar de assuntos financeiros delicados
- Para perguntas sobre saúde financeira, combine múltiplas ferramentas para dar uma visão completa

## Ferramentas de consulta disponíveis
- buscar_transacoes: busca transações com filtros por período, tipo e categoria
- consultar_resumo_mensal: resumo financeiro de um mês (receitas, despesas, saldo, top categorias)
- comparar_periodos: compara dois meses mostrando variação % de receitas, despesas e saldo
- consultar_saldos: saldo de todas as contas do usuário (corrente, poupança, carteira, etc)
- consultar_categorias: lista categorias de transações disponíveis para o usuário
- consultar_transacoes_recorrentes: lista gastos e receitas fixos mensais (assinaturas, aluguel, salário)
- projetar_gastos: projeta receitas e despesas dos próximos N meses com base nas recorrências
- consultar_dividas: lista dívidas com status, vencimentos e valores pendentes
- consultar_metas: metas financeiras com progresso, valor alvo e prazo
- consultar_veiculos: veículos do usuário com manutenções pendentes ou atrasadas
- consultar_orcamentos: orçamentos de compras/mercado com itens pendentes

## Ferramentas de cadastro e atualização
- cadastrar_transacao: registra nova receita ou despesa (use consultar_categorias antes para escolher a certa)
- deletar_transacao: remove transação cadastrada incorretamente (apenas com confirmação explícita do usuário)
- cadastrar_divida: registra nova dívida ou financiamento
- atualizar_divida: atualiza status de dívida (ex: marcar como paga, registrar pagamento parcial)
- cadastrar_meta: cria nova meta financeira com valor alvo e prazo
- atualizar_meta: atualiza progresso ou dados de uma meta existente

## Comportamento esperado
- Ao analisar saúde financeira: combine resumo_mensal + saldos + dividas + metas
- Ao projetar futuro: use transacoes_recorrentes + projetar_gastos
- Ao comparar evolução: use comparar_periodos
- Ao cadastrar transação: consulte categorias disponíveis antes para escolher a categoria correta
- Ao receber imagem de comprovante: analise, extraia dados e use cadastrar_transacao automaticamente
- Ao marcar dívida como paga: use atualizar_divida com status "quitada" ou valor_pago atualizado`;


async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");
  return user.id;
}

export const useChatFinanceiro = (conversaId: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  // Carrega histórico sempre que a conversa muda
  useEffect(() => {
    if (!conversaId) {
      setMessages([]);
      return;
    }

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .from("chat_mensagens")
          .select("id, role, conteudo, imagem_base64, created_at")
          .eq("conversa_id", conversaId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        const loaded: ChatMessage[] = (data ?? []).map((row) => ({
          id: row.id,
          role: row.role as "user" | "assistant",
          content: row.conteudo,
          timestamp: new Date(row.created_at),
          imageDataUrl: row.imagem_base64
            ? `data:image/jpeg;base64,${row.imagem_base64}`
            : undefined,
        }));

        setMessages(loaded);
      } catch (err) {
        logger.error("useChatFinanceiro", "Erro ao carregar histórico", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [conversaId]);

  const persistMessage = async (
    msg: ChatMessage,
    conversaIdParam: string,
    imageBase64?: string
  ) => {
    try {
      const userId = await getUserId();
      await supabase.from("chat_mensagens").insert({
        id: msg.id,
        conversa_id: conversaIdParam,
        user_id: userId,
        role: msg.role,
        conteudo: msg.content,
        imagem_base64: imageBase64 ?? null,
      });
    } catch (err) {
      logger.error("useChatFinanceiro", "Erro ao persistir mensagem", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const sendMessage = useCallback(
    async (
      text: string,
      model: string,
      imageBase64?: string,
      imageMimeType?: string,
      imageDataUrl?: string,
      onMessageSent?: (conversaId: string) => void
    ) => {
      if ((!text.trim() && !imageBase64) || isLoading) return;
      if (!conversaId) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim() || "Analise esta imagem.",
        timestamp: new Date(),
        imageDataUrl,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Persiste mensagem do usuário
      await persistMessage(userMessage, conversaId, imageBase64);
      onMessageSent?.(conversaId);

      try {
        const historyMessages = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        type TextPart = { type: "text"; text: string };
        type ImagePart = { type: "image_url"; image_url: { url: string; detail: string } };
        type ContentPart = TextPart | ImagePart;

        let userContent: string | ContentPart[];
        if (imageBase64 && imageMimeType) {
          userContent = [
            {
              type: "text" as const,
              text: text.trim() || "Analise este comprovante financeiro e extraia os dados para cadastro.",
            },
            {
              type: "image_url" as const,
              image_url: {
                url: `data:${imageMimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ];
        } else {
          userContent = text.trim();
        }

        const { data, error } = await supabase.functions.invoke("openai-proxy", {
          body: {
            model,
            messages: [
              { role: "system", content: systemPrompt },
              ...historyMessages,
              { role: "user", content: userContent },
            ],
            max_tokens: 2000,
            temperature: 0.4,
          },
        });

        if (error) throw new Error(error.message || "Erro na Edge Function");
        if (data?.error) throw new Error(data.error.message || "Erro na API OpenAI");

        const content = data?.choices?.[0]?.message?.content as string;
        if (!content) throw new Error("Resposta inválida da API");

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Persiste resposta do assistente
        await persistMessage(assistantMessage, conversaId);
        onMessageSent?.(conversaId);
      } catch (error) {
        logger.error("useChatFinanceiro", "Erro ao enviar mensagem", {
          error: error instanceof Error ? error.message : String(error),
        });
        const errContent = error instanceof Error ? error.message : "Erro desconhecido";
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ Erro ao processar: ${errContent}. Verifique as configurações do chat.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, systemPrompt, isLoading, conversaId]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    systemPrompt,
    setSystemPrompt,
    sendMessage,
    clearChat,
  };
};
