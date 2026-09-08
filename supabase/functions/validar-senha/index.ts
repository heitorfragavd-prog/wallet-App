import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { mode, user_id, senha } = await req.json();

    if (!user_id || !senha) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Usar user_id como salt
    const hash = await hashPassword(senha, user_id);

    if (mode === "cadastrar") {
      const { error } = await supabaseAdmin
        .from("senha_investimentos")
        .upsert({
          user_id,
          senha_hash: hash,
          tentativas_falhas: 0,
          bloqueado_ate: null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, token: "invest_jwt_" + crypto.randomUUID() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (mode === "validar") {
      const { data, error } = await supabaseAdmin
        .from("senha_investimentos")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return new Response(JSON.stringify({ valido: false, error: "Senha não cadastrada" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Verificar bloqueio
      if (data.bloqueado_ate) {
        const bloqueadoAte = new Date(data.bloqueado_ate);
        if (new Date() < bloqueadoAte) {
          return new Response(JSON.stringify({ valido: false, bloqueado: true, error: "Acesso bloqueado por tentativas falhas." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      const match = hash === data.senha_hash;

      if (match) {
        // Sucesso: resetar tentativas
        await supabaseAdmin
          .from("senha_investimentos")
          .update({ tentativas_falhas: 0, bloqueado_ate: null })
          .eq("user_id", user_id);

        return new Response(JSON.stringify({ valido: true, token: "invest_jwt_" + crypto.randomUUID() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } else {
        // Falha: incrementar tentativas
        const novasTentativas = (data.tentativas_falhas || 0) + 1;
        const bloqueado = novasTentativas >= 3;
        const bloqueadoAte = bloqueado ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;

        await supabaseAdmin
          .from("senha_investimentos")
          .update({
            tentativas_falhas: novasTentativas,
            bloqueado_ate: bloqueadoAte,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user_id);

        return new Response(JSON.stringify({
          valido: false,
          tentativasRestantes: Math.max(0, 3 - novasTentativas),
          bloqueado,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Modo inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
