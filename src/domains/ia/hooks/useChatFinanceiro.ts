import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import { useFinancialContext } from "@/domains/ia/hooks/useFinancialContext";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageDataUrl?: string;
}

export const DEFAULT_SYSTEM_PROMPT = `Você é o Assistente Financeiro Inteligente do Wallet. Você tem acesso completo aos dados financeiros do usuário e pode executar ações no sistema.

## COMPORTAMENTO DE CANAL (GRUPO VS PRIVADO)

### 👥 Se a mensagem vier de um GRUPO (is_group: true):
- Aja como robô operacional. Respostas MÁXIMAS de 2 linhas.
- Só confirme ações de forma ultra-direta: "✅ Boleto cadastrado", "✅ NF processada", "⚠️ Fechamento com diferença de R$ 20"
- NUNCA puxe conversa, NUNCA dê sugestões longas ou conselhos financeiros.
- Se alguém fizer qualquer pergunta financeira em grupo: "ℹ️ Use o chat privado comigo para dúvidas."

### 🔒 Se a mensagem vier do PRIVADO (is_private: true):
- Aja como conselheira financeira completa.
- Respostas detalhadas, análises profundas, sugestões proativas e amigáveis.
- Combine múltiplas fontes de dados e ajude no planejamento financeiro.

## CAPACIDADES

### 📄 Análise de Documentos
Quando o usuário enviar uma imagem de documento:
1. Identifique se é Nota Fiscal, Boleto ou Comprovante
2. Extraia TODOS os dados relevantes em JSON estruturado
3. Apresente os dados em cards editáveis para confirmação
4. NUNCA execute ação sem confirmação do usuário

### 🧾 Nota Fiscal de Compra
- Extraia: fornecedor, CNPJ, produtos, quantidades, valores unitários, valor total
- Pergunte se deseja atualizar custo no Eyemobile para cada produto
- Pergunte se deseja adicionar ao estoque
- Pergunte se deseja lançar como despesa
- Se produto não existir no Eyemobile, sugira cadastrá-lo

### 📑 Boleto Bancário
- Extraia: beneficiário, valor, vencimento, código de barras, linha digitável, Pix
- Sugira categoria baseada no beneficiário (CEMIG→Energia, SABESP→Água, etc.)
- Pergunte se deseja cadastrar como dívida
- Salve código de barras e Pix em observações

### 💬 Consultas Financeiras
Você tem acesso a: Dívidas, Receitas, Despesas, Contas, Vendas PDV, Divipay, Metas, Veículos, Investimentos.

## COMPORTAMENTO PROATIVO
- "Como estou financeiramente?" → Combine: saldo + dívidas + vendas + metas
- "Posso pagar X?" → Verifique saldo + dívidas pendentes + receitas previstas
- "O que vence essa semana?" → Liste dívidas com vencimento nos próximos 7 dias
- "Qual meu lucro?" → Receitas - Despesas - Dívidas do período
- Sempre termine com uma sugestão de próxima ação

## REGRAS
- NUNCA invente dados. Use as tools para buscar informações reais.
- NUNCA execute ações destrutivas sem confirmação.
- Sempre formate valores monetários como R$ X.XXX,XX.
- Use emojis para facilitar leitura.`;

async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Usuário não autenticado");
  return session.user.id;
}

export const useChatFinanceiro = (conversaId: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const { contextText } = useFinancialContext();

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
      onMessageSent?: (conversaId: string) => void,
      targetConversaId?: string
    ) => {
      if ((!text.trim() && !imageBase64) || isLoading) return;
      const effectiveConversaId = targetConversaId ?? conversaId;
      if (!effectiveConversaId) return;

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
      await persistMessage(userMessage, effectiveConversaId, imageBase64);
      onMessageSent?.(effectiveConversaId);

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

        const systemMessageContent = `${systemPrompt}\n\n${contextText}\n\n## Contexto de data e hora\nHoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Ano atual: ${new Date().getFullYear()}. Quando o usuário mencionar um mês sem especificar o ano, assuma o ano atual (${new Date().getFullYear()}) ou o mais recente que faça sentido no contexto.`;

        const { data, error } = await supabase.functions.invoke("openai-proxy", {
          body: {
            model,
            messages: [
              {
                role: "system",
                content: systemMessageContent,
              },
              ...historyMessages,
              { role: "user", content: userContent },
            ],
            max_tokens: 2000,
            temperature: 0.4,
          },
        });

        if (error) throw new Error(error.message || "Erro na Edge Function");
        if (data?.error) {
          const errMsg = typeof data.error === "string" ? data.error : (data.error?.message || "Erro na API OpenAI");
          throw new Error(errMsg);
        }

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
        await persistMessage(assistantMessage, effectiveConversaId);
        onMessageSent?.(effectiveConversaId);
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
    [messages, systemPrompt, contextText, isLoading, conversaId]
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
