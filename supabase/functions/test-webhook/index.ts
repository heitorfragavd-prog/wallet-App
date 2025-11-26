// Edge Function para testar conectividade do webhook
// Evita problemas de CORS ao fazer a chamada do servidor

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Criar cliente Supabase com service_role (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Buscar webhook URL configurada
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

    // Payload de teste com estrutura idêntica ao evento real
    const testPayload = {
      event: "debt_reminder",
      timestamp: new Date().toISOString(),
      is_test: true,
      user: {
        name: "João da Silva (Teste)",
        phone: "11999999999",
        email: "teste@exemplo.com",
      },
      debt: {
        id: "00000000-0000-0000-0000-000000000000",
        description: "Cartão de Crédito (Teste)",
        creditor: "Banco Exemplo",
        total_amount: 1500.00,
        remaining_amount: 750.00,
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        installments: 12,
        installments_paid: 6,
      },
      reminder: {
        id: "00000000-0000-0000-0000-000000000001",
        hours_before: 24,
        trigger_time: new Date().toISOString(),
      },
    };

    // Enviar POST para webhook com timeout de 10 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (webhookResponse.ok) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Webhook respondeu corretamente",
            status: webhookResponse.status,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      } else {
        const errorText = await webhookResponse.text();
        return new Response(
          JSON.stringify({
            success: false,
            error: `Webhook retornou status ${webhookResponse.status}`,
            details: errorText.substring(0, 200),
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);

      const errorMessage =
        fetchError.name === "AbortError"
          ? "Timeout ao conectar ao webhook (>10s)"
          : fetchError.message;

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
