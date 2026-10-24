import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { isAuthorizedCronCaller, unauthorizedResponse } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface ClaimedTelegramUpdate {
  update_id: number;
  chat_id: number | null;
  payload: Record<string, unknown> | null;
  attempt_count: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 1. Fail-closed: autorização obrigatória (service_role ou CRON_SECRET em tempo constante)
  if (!isAuthorizedCronCaller(req)) {
    return unauthorizedResponse("Unauthorized: Cron secret or service role key required", corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const supabaseServiceKey = getSupabaseSecretKey();

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[telegram-reprocess-worker] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurado.");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2. Reconciliação prévia: move leases expirados para pending_retry
    await supabaseAdmin.rpc("reconciliar_telegram_updates_abandonados", {
      p_bot_id: "default",
      p_lease_seconds: 300,
      p_max_attempts: 3,
    });

    // 3. Reivindica lote de updates pendentes com SKIP LOCKED e payload preservado
    const { data: updates, error: fetchErr } = await supabaseAdmin.rpc(
      "recuperar_telegram_updates_para_reprocessamento",
      {
        p_bot_id: "default",
        p_max_batch: 10,
        p_lease_seconds: 180,
      }
    );

    if (fetchErr) {
      console.error("[telegram-reprocess-worker] Erro ao recuperar updates:", fetchErr.message);
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claimedUpdates: ClaimedTelegramUpdate[] = updates || [];
    if (claimedUpdates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "Nenhum update pendente para reprocessar" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processedCount = 0;
    let failedCount = 0;

    for (const item of claimedUpdates) {
      if (!item.payload) {
        console.warn(`[telegram-reprocess-worker] Update ${item.update_id} sem payload. Encaminhando para dead_letter.`);
        await supabaseAdmin.rpc("falhar_telegram_update", {
          p_update_id: item.update_id,
          p_bot_id: "default",
          p_error_message: "Payload ausente para reprocessamento",
          p_expected_attempt: item.attempt_count,
        });
        failedCount++;
        continue;
      }

      try {
        // 4. Encaminha para o processador telegram-webhook com cabeçalho de reprocessamento autenticado
        const webhookUrl = `${rtrim(supabaseUrl, "/")}/functions/v1/telegram-webhook`;
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "x-telegram-reprocess": "true",
            "x-telegram-attempt-count": String(item.attempt_count),
          },
          body: JSON.stringify(item.payload),
        });

        if (res.ok) {
          processedCount++;
          console.log(`[telegram-reprocess-worker] Update ${item.update_id} reprocessado com sucesso (attempt ${item.attempt_count}).`);
        } else {
          failedCount++;
          const errText = await res.text();
          console.error(`[telegram-reprocess-worker] Update ${item.update_id} falhou com status ${res.status}:`, errText.slice(0, 200));
        }
      } catch (postErr: unknown) {
        failedCount++;
        const errMsg = postErr instanceof Error ? postErr.message : String(postErr);
        console.error(`[telegram-reprocess-worker] Exceção de rede ao reprocessar update ${item.update_id}:`, errMsg);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        claimed: claimedUpdates.length,
        processed: processedCount,
        failed: failedCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[telegram-reprocess-worker] Erro interno fatal:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function rtrim(s: string, char: string): string {
  while (s.endsWith(char)) s = s.slice(0, -1);
  return s;
}
