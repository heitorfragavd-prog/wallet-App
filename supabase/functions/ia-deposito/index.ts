import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, file_url } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada no env");

    const systemPrompt = `Você é um assistente financeiro especialista em OCR e leitura de comprovantes.
Analise as informações fornecidas e extraia os detalhes do depósito/aporte de investimento.
Informações desejadas:
- valor (number): o valor financeiro do aporte/depósito.
- investimento_nome (string): nome do ativo, título, fundo ou tipo de investimento (Ex: CDB Itaú, MXRF11, Tesouro Direto, BTC).
- instituicao (string): banco, corretora ou instituição onde foi feito o depósito (Ex: Itaú, Banco Inter, XP Investimentos, Mercado Pago).
- data (string): data em formato yyyy-mm-dd (Ex: 2026-08-06). Se não encontrar, retorne a data de hoje.

Responda APENAS com um objeto JSON válido, sem markdown:
{"valor": 500.00, "investimento_nome": "CDB Banco Inter", "instituicao": "Inter", "data": "2026-08-06", "confianca": 0.95}`;

    let content: any = [];
    if (file_url) {
      content = [
        { type: "text", text: "Por favor, extraia os dados deste comprovante de investimento." },
        { type: "image_url", image_url: { url: file_url } }
      ];
    } else {
      content = `Extraia os dados de investimento deste texto: "${text}"`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: content }
        ],
        temperature: 0.2,
      }),
    });

    const resData = await response.json();
    let textResult = resData.choices[0].message.content.trim();
    
    // Remover blocos de código se a IA os adicionou
    if (textResult.startsWith("```json")) {
      textResult = textResult.substring(7);
    }
    if (textResult.endsWith("```")) {
      textResult = textResult.substring(0, textResult.length - 3);
    }

    const result = JSON.parse(textResult.trim());

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
