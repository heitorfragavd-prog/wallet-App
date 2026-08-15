import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Tratar preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Token de autorização não fornecido ou inválido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Criar cliente com token autenticado do usuário para repassar auth.uid() à RPC
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada. Faça login novamente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Obter payload da requisição
    const body = await req.json();
    const {
      workspace_id,
      cartao_id,
      mes_referencia,
      vencimento,
      total_lancamentos,
      total_fatura,
      ajustes_fatura,
      hash_documento,
      transacoes,
    } = body;

    if (!cartao_id || !mes_referencia || !transacoes || !Array.isArray(transacoes)) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios ausentes ou inválidos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Executar a RPC Atômica com a sessão real do usuário (auth.uid() no PostgreSQL)
    const { data: rpcResult, error: rpcError } = await userClient.rpc("importar_fatura_atomica", {
      p_workspace_id: workspace_id || null,
      p_cartao_id: cartao_id,
      p_mes_referencia: mes_referencia,
      p_vencimento: vencimento || null,
      p_total_lancamentos: total_lancamentos || 0,
      p_total_fatura: total_fatura || 0,
      p_ajustes_fatura: ajustes_fatura || 0,
      p_hash_documento: hash_documento || null,
      p_transacoes: transacoes,
    });

    if (rpcError) {
      console.error("[importar-fatura] Erro na RPC:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message || "Falha ao processar importação no banco de dados." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(rpcResult),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[importar-fatura] Erro inesperado:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Erro interno no servidor ao importar fatura." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
