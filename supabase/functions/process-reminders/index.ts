// Edge Function para processar lembretes de dívidas pendentes
// Executado via pg_cron a cada 15 minutos
// URL: https://[seu-projeto].supabase.co/functions/v1/process-reminders

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DebtReminder {
  id: string;
  divida_id: string;
  user_id: string;
  reminder_hours: number;
  trigger_at: string;
  status: string;
}

interface Divida {
  id: string;
  descricao: string;
  credor: string;
  valor_total: number;
  valor_restante: number;
  data_vencimento: string;
  parcelas: number;
  parcelas_pagas: number;
}

interface Profile {
  name: string;
  telefone: string | null;
  email: string;
}

interface WebhookPayload {
  event: "debt_reminder";
  timestamp: string;
  user: {
    name: string;
    phone: string;
    email: string;
  };
  debt: {
    id: string;
    description: string;
    creditor: string;
    total_amount: number;
    remaining_amount: number;
    due_date: string;
    installments: number;
    installments_paid: number;
  };
  reminder: {
    id: string;
    hours_before: number;
    trigger_time: string;
  };
}

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

    console.log("Iniciando processamento de lembretes...");

    // 1. Buscar webhook URL configurada
    const { data: webhookSetting, error: webhookError } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "webhook_url")
      .single();

    if (webhookError || !webhookSetting?.value) {
      console.warn("Webhook URL não configurada, pulando processamento");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Webhook URL não configurada",
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const webhookUrl = webhookSetting.value;
    console.log("Webhook URL configurada:", webhookUrl);

    // 2. Buscar lembretes pendentes onde trigger_at <= now()
    const { data: pendingReminders, error: remindersError } =
      await supabaseAdmin
        .from("debt_reminders")
        .select("*")
        .eq("status", "pending")
        .lte("trigger_at", new Date().toISOString())
        .order("trigger_at", { ascending: true });

    if (remindersError) {
      console.error("Erro ao buscar lembretes:", remindersError);
      throw remindersError;
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      console.log("Nenhum lembrete pendente encontrado");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum lembrete pendente",
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Encontrados ${pendingReminders.length} lembretes pendentes`);

    let processedCount = 0;
    let failedCount = 0;

    // 3. Processar cada lembrete
    for (const reminder of pendingReminders as DebtReminder[]) {
      try {
        console.log(`Processando lembrete ${reminder.id}...`);

        // Buscar dados da dívida
        const { data: divida, error: dividaError } = await supabaseAdmin
          .from("dividas")
          .select("*")
          .eq("id", reminder.divida_id)
          .single();

        if (dividaError || !divida) {
          console.error(
            `Erro ao buscar dívida ${reminder.divida_id}:`,
            dividaError
          );
          await supabaseAdmin
            .from("debt_reminders")
            .update({
              status: "failed",
              error_message: "Dívida não encontrada",
            })
            .eq("id", reminder.id);
          failedCount++;
          continue;
        }

        // Buscar dados do usuário
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("name, telefone, email")
          .eq("user_id", reminder.user_id)
          .single();

        if (profileError || !profile) {
          console.error(
            `Erro ao buscar perfil do usuário ${reminder.user_id}:`,
            profileError
          );
          await supabaseAdmin
            .from("debt_reminders")
            .update({
              status: "failed",
              error_message: "Perfil do usuário não encontrado",
            })
            .eq("id", reminder.id);
          failedCount++;
          continue;
        }

        // Construir payload do webhook
        const payload: WebhookPayload = {
          event: "debt_reminder",
          timestamp: new Date().toISOString(),
          user: {
            name: profile.name,
            phone: profile.telefone || "",
            email: profile.email,
          },
          debt: {
            id: divida.id,
            description: divida.descricao,
            creditor: divida.credor,
            total_amount: divida.valor_total,
            remaining_amount: divida.valor_restante,
            due_date: divida.data_vencimento,
            installments: divida.parcelas,
            installments_paid: divida.parcelas_pagas,
          },
          reminder: {
            id: reminder.id,
            hours_before: reminder.reminder_hours,
            trigger_time: reminder.trigger_at,
          },
        };

        console.log("Payload construído:", JSON.stringify(payload, null, 2));

        // Enviar POST para webhook com timeout de 10 segundos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        try {
          const webhookResponse = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Verificar se resposta foi bem-sucedida (2xx)
          if (webhookResponse.ok) {
            console.log(
              `Webhook enviado com sucesso para lembrete ${reminder.id}`
            );

            // Atualizar status para 'sent'
            await supabaseAdmin
              .from("debt_reminders")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                error_message: null,
              })
              .eq("id", reminder.id);

            processedCount++;
          } else {
            // Webhook retornou erro
            const errorText = await webhookResponse.text();
            console.error(
              `Webhook retornou erro ${webhookResponse.status}: ${errorText}`
            );

            await supabaseAdmin
              .from("debt_reminders")
              .update({
                status: "failed",
                error_message: `HTTP ${webhookResponse.status}: ${errorText.substring(0, 200)}`,
              })
              .eq("id", reminder.id);

            failedCount++;
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);

          // Erro ao enviar webhook (timeout, rede, etc)
          const errorMessage =
            fetchError.name === "AbortError"
              ? "Timeout ao enviar webhook (>10s)"
              : fetchError.message;

          console.error(`Erro ao enviar webhook: ${errorMessage}`);

          await supabaseAdmin
            .from("debt_reminders")
            .update({
              status: "failed",
              error_message: errorMessage.substring(0, 200),
            })
            .eq("id", reminder.id);

          failedCount++;
        }
      } catch (error) {
        console.error(`Erro ao processar lembrete ${reminder.id}:`, error);
        failedCount++;
      }
    }

    console.log(
      `Processamento concluído: ${processedCount} sucesso, ${failedCount} falhas`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Lembretes processados",
        processed: processedCount,
        failed: failedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Erro ao processar lembretes:", error);

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
