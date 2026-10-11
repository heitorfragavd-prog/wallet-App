import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isAuthorizedCronCaller, unauthorizedResponse } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Exigir chamada autorizada de backend (service_role ou CRON_SECRET)
  if (!isAuthorizedCronCaller(req)) {
    return unauthorizedResponse("Unauthorized: Cron secret or service role key required to relay WhatsApp messages", corsHeaders);
  }

  try {
    const { telefone, mensagem } = await req.json();

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
        number: String(telefone || "").replace(/\D/g, ""),
        text: mensagem,
      }),
    });

    if (!response.ok) throw new Error("Falha ao enviar");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
