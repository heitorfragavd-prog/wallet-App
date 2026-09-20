/**
 * test-webhook-core.ts
 *
 * Módulo puro de processamento e validação de permissões para test-webhook.
 */
import { isAllowedWebhookUrl, validateSafeExternalUrl } from "./ssrf-validator.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function processTestWebhook(
  req: Request,
  supabaseAdmin: any
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Token de autenticação ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Consulta estrita à role no banco (nunca user_metadata)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Acesso negado: apenas administradores podem testar webhooks" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: webhookSetting, error: webhookError } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "webhook_url")
      .single();

    if (webhookError || !webhookSetting?.value) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Webhook URL não configurada",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const webhookUrl = webhookSetting.value;

    const urlCheck = await validateSafeExternalUrl(webhookUrl, { enforceAllowlist: true });
    if (!urlCheck.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `URL de webhook rejeitada por segurança: ${urlCheck.reason || "bloqueio SSRF"}`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Webhook validado com sucesso",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Erro interno",
        details: err.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}