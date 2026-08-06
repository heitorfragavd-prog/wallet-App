import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRYPTO_MAP: Record<string, string> = {
  "BTC": "bitcoin",
  "ETH": "ethereum",
  "SOL": "solana",
  "ADA": "cardano",
  "USDT": "tether",
  "XRP": "ripple",
  "LTC": "litecoin",
  "DOGE": "dogecoin",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const brapiToken = Deno.env.get("BRAPI_TOKEN") || "";

    // 1. Buscar todos os investimentos ativos de renda variável ou cripto com ticker preenchido
    const { data: invs, error: fetchErr } = await supabaseAdmin
      .from("investimentos")
      .select("id, codigo_b3, tipo")
      .eq("ativo", true)
      .not("codigo_b3", "is", null);

    if (fetchErr) throw fetchErr;

    let updatedCount = 0;
    const today = new Date().toISOString().split("T")[0];

    for (const inv of (invs || [])) {
      const ticker = inv.codigo_b3!.trim().toUpperCase();
      let precoAtual = 0;
      let source = "";

      if (inv.tipo === "cripto") {
        // Cripto: CoinGecko
        const geckId = CRYPTO_MAP[ticker] || ticker.toLowerCase();
        try {
          const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckId}&vs_currencies=brl`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            precoAtual = data[geckId]?.brl || 0;
            source = "coingecko";
          }
        } catch (e) {
          console.error(`Erro ao buscar cotação da cripto ${ticker}:`, e);
        }
      } else if (inv.tipo === "renda_variavel" || inv.tipo === "fundo") {
        // Ação / FII: Brapi
        try {
          const url = `https://brapi.dev/api/quote/${ticker}?token=${brapiToken}`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            precoAtual = data.results?.[0]?.regularMarketPrice || 0;
            source = "brapi";
          }
        } catch (e) {
          console.error(`Erro ao buscar cotação B3 ${ticker}:`, e);
        }
      }

      if (precoAtual > 0) {
        // 2. Salvar cotação diária
        await supabaseAdmin
          .from("cotacoes_diarias")
          .upsert({
            codigo: ticker,
            tipo: inv.tipo === "cripto" ? "cripto" : "acao", // Simplificado para tipo check constraint
            preco: precoAtual,
            data: today,
            fonte: source,
          }, { onConflict: "codigo,data" });

        // 3. Buscar depósitos para calcular quantidade acumulada
        const { data: deps } = await supabaseAdmin
          .from("depositos_investimentos")
          .select("quantidade")
          .eq("investimento_id", inv.id);

        const totalQtd = (deps || []).reduce((sum, d) => sum + Number(d.quantidade || 0), 0);

        if (totalQtd > 0) {
          const novoValorAtual = totalQtd * precoAtual;

          // 4. Atualizar valor atual do ativo
          await supabaseAdmin
            .from("investimentos")
            .update({ valor_atual: novoValorAtual })
            .eq("id", inv.id);

          updatedCount++;
        }
      }
    }

    return new Response(JSON.stringify({ success: true, updatedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
