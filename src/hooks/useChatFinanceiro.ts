import { useState, useCallback } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageDataUrl?: string;
}

export const DEFAULT_SYSTEM_PROMPT = `Você é um assistente financeiro pessoal especializado. Você tem acesso ao contexto financeiro completo do usuário e deve ajudá-lo a entender e melhorar suas finanças.

Sempre:
- Responda em português brasileiro de forma clara e objetiva
- Use os dados financeiros fornecidos no contexto para dar respostas precisas e personalizadas
- Quando mencionar valores monetários, use o formato R$ X.XXX,XX
- Sugira ações concretas e práticas para melhorar a saúde financeira quando relevante
- Seja empático e motivador ao tratar de assuntos financeiros delicados
- Se não souber algo que não está no contexto, diga claramente que não tem essa informação disponível

Quando o usuário enviar uma imagem de comprovante financeiro (nota fiscal, recibo, extrato, fatura, boleto, etc.):
1. Analise a imagem com atenção e extraia todas as informações financeiras relevantes
2. Responda de forma amigável descrevendo o que encontrou e os dados extraídos
3. Ao final da resposta, inclua EXATAMENTE o seguinte bloco especial (sem nenhum texto após ele):
__REGISTER__{"tipo":"despesa","descricao":"descrição clara","valor":0.00,"data":"YYYY-MM-DD","categoria":"Alimentação"}__END_REGISTER__

Regras para o bloco especial:
- "tipo": use apenas "receita", "despesa" ou "divida"
- "categoria": use um de: Alimentação, Transporte, Saúde, Educação, Lazer, Moradia, Salário, Freelance, Vendas, Serviços, Outros
- "data": formato YYYY-MM-DD. Se não encontrar a data, use a data de hoje
- "valor": apenas o número (ex: 150.50, não "R$ 150,50")`;

export const useChatFinanceiro = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  const sendMessage = useCallback(
    async (
      text: string,
      apiKey: string,
      model: string,
      financialContext: string,
      imageBase64?: string,
      imageMimeType?: string,
      imageDataUrl?: string,
    ) => {
      if ((!text.trim() && !imageBase64) || !apiKey || isLoading) return;

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim() || "Analise esta imagem.",
        timestamp: new Date(),
        imageDataUrl,
      };

      setMessages(prev => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const fullSystemContent = `${systemPrompt}\n\n${financialContext}`;

        const historyMessages = messages.map(m => ({
          role: m.role,
          content: m.content,
        }));

        // Build user content — with or without image
        type TextPart = { type: "text"; text: string };
        type ImagePart = { type: "image_url"; image_url: { url: string; detail: string } };
        type ContentPart = TextPart | ImagePart;

        let userContent: string | ContentPart[];
        if (imageBase64 && imageMimeType) {
          userContent = [
            { type: "text" as const, text: text.trim() || "Analise este comprovante financeiro e extraia os dados para cadastro." },
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

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: fullSystemContent },
              ...historyMessages,
              { role: "user", content: userContent },
            ],
            max_tokens: 1500,
            temperature: 0.4,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error((errData as any).error?.message || `Erro na API: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content as string;

        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, assistantMessage]);
      } catch (error) {
        const errContent = error instanceof Error ? error.message : "Erro desconhecido";
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `⚠️ Erro ao processar: ${errContent}. Verifique sua chave API nas Configurações.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, systemPrompt, isLoading]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    systemPrompt,
    setSystemPrompt,
    sendMessage,
    clearChat,
  };
};
