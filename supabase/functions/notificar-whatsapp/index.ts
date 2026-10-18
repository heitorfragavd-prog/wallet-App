import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { isAuthorizedCronCaller, unauthorizedResponse, forbiddenResponse, authorizeUserOrService } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { telefone, mensagem, user_id } = body;

    if (!mensagem) {
      return new Response(JSON.stringify({ success: false, error: "mensagem é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Se for cron ou service role, pode disparar para o telefone informado
    const isCron = isAuthorizedCronCaller(req);
    let targetPhone = telefone;

    if (!isCron) {
      // 2. Se for usuário autenticado, validar identidade e restringir envio ao próprio telefone cadastrado
      const authCheck = await authorizeUserOrService(req, user_id, supabaseAdmin);
      if (!authCheck.authorized) {
        return new Response(JSON.stringify({ success: false, error: authCheck.reason }), {
          status: authCheck.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Buscar o telefone do perfil do usuário para impedir envio para números arbitrários (anti-relay spam)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("telefone")
        .eq("user_id", authCheck.userId)
        .maybeSingle();

      const userRegisteredPhone = profile?.telefone ? String(profile.telefone).replace(/\D/g, "") : null;
      const requestedPhone = telefone ? String(telefone).replace(/\D/g, "") : null;

      if (!userRegisteredPhone) {
        return forbiddenResponse("Forbidden: Usuário não possui telefone cadastrado no perfil", corsHeaders);
      }

      if (requestedPhone && requestedPhone !== userRegisteredPhone) {
        return forbiddenResponse("Forbidden: Não é permitido enviar mensagens para telefones de terceiros", corsHeaders);
      }

      targetPhone = userRegisteredPhone;
    }

    if (!targetPhone) {
      return new Response(JSON.stringify({ success: false, error: "Telefone destinatário não informado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Usar API do WhatsApp (Evolution API, WPPConnect ou Twilio)
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "WhatsApp nao configurado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: String(targetPhone).replace(/\D/g, ""),
        text: mensagem,
      }),
    });

    if (!response.ok) throw new Error("Falha ao enviar");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
