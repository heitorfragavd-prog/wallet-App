import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { pergunta, userId } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    const inicioMes = new Date().toISOString().slice(0, 7) + "-01";

    const [receitas, despesas, saldo] = await Promise.all([
      supabaseAdmin.from("receitas").select("valor, descricao, data").eq("user_id", userId).gte("data", inicioMes),
      supabaseAdmin.from("despesas").select("valor, descricao, data").eq("user_id", userId).gte("data", inicioMes),
      supabaseAdmin.from("contas_usuario").select("saldo_atual").eq("user_id", userId),
    ]);

    const totalReceitas = (receitas.data || []).reduce((a, r) => a + (r.valor || 0), 0);
    const totalDespesas = (despesas.data || []).reduce((a, d) => a + (d.valor || 0), 0);
    const saldoAtual = (saldo.data || []).reduce((a, c) => a + (c.saldo_atual || 0), 0);

    const contexto = `Dados financeiros do usuario (mes atual):
- Receitas: R$ ${totalReceitas.toFixed(2)}
- Despesas: R$ ${totalDespesas.toFixed(2)}
- Saldo em contas: R$ ${saldoAtual.toFixed(2)}
- Saldo do mes: R$ ${(totalReceitas - totalDespesas).toFixed(2)}

Pergunta: "${pergunta}"

Responda de forma natural, amigavel e objetiva em portugues do Brasil.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Voce e um assistente financeiro pessoal. Seja direto, pratico e amigavel." },
          { role: "user", content: contexto },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    const resposta = data.choices[0].message.content;

    return new Response(JSON.stringify({ resposta }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ resposta: "Desculpe, ocorreu um erro. Tente novamente." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
