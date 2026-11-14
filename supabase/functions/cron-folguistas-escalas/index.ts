import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { isAuthorizedCronCaller } from "../_shared/auth-guard.ts";
import {
  getNextWeekendDatesSaoPaulo,
  WeekendDatesSaoPaulo,
} from "../_shared/ai/folguista-parser-shared.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface CronRequestPayload {
  action?: "consulta_segunda" | "confirmacao_sexta";
  workspace_id?: string;
  forcar?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = getSupabaseSecretKey();
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Configurações de infraestrutura ausentes no servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAdmin: any = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Autenticação: verifica se é chamada autorizada por pg_cron ou JWT de admin
  const isCron = isAuthorizedCronCaller(req);
  if (!isCron) {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Acesso não autorizado: credenciais ausentes." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Token de autorização inválido ou expirado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  let payload: CronRequestPayload = {};
  if (req.method === "POST") {
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
  }

  const action = payload.action || "consulta_segunda";
  const forcar = Boolean(payload.forcar);
  const targetWorkspaceId = payload.workspace_id;

  // Busca workspaces a processar
  let wsQuery = supabaseAdmin.from("workspaces").select("id, nome");
  if (targetWorkspaceId) {
    wsQuery = wsQuery.eq("id", targetWorkspaceId);
  }
  const { data: workspaces, error: wsErr } = await wsQuery;

  if (wsErr || !workspaces || workspaces.length === 0) {
    return new Response(
      JSON.stringify({ error: "Nenhum workspace encontrado para processamento." }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const weekend: WeekendDatesSaoPaulo = getNextWeekendDatesSaoPaulo(new Date());
  const executionResults: Array<Record<string, unknown>> = [];

  for (const ws of workspaces) {
    // 1. Busca configurações de escala do workspace
    const { data: config } = await supabaseAdmin
      .from("escalas_config")
      .select("*")
      .eq("workspace_id", ws.id)
      .maybeSingle();

    const isSimulacao = config?.simulacao_modo ?? true;
    const ativoSegunda = config?.ativo_segunda ?? true;
    const ativoSexta = config?.ativo_sexta ?? true;

    // 2. Se a rotina estiver desativada e não for forçada, pula
    if (action === "consulta_segunda" && !ativoSegunda && !forcar) {
      executionResults.push({
        workspace_id: ws.id,
        status: "ignorado_configuracao_desativada",
        action,
      });
      continue;
    }

    if (action === "confirmacao_sexta" && !ativoSexta && !forcar) {
      executionResults.push({
        workspace_id: ws.id,
        status: "ignorado_configuracao_desativada",
        action,
      });
      continue;
    }

    // 3. Execução da Rotina de Segunda-Feira (Consulta de Vagas e Disponibilidade)
    if (action === "consulta_segunda") {
      const idempotencyKey = `consulta_segunda_ws_${ws.id}_${weekend.sabado}`;

      // Verificação de idempotência no servidor (Gate 7)
      if (!forcar) {
        const { data: existingLog } = await supabaseAdmin
          .from("escalas_automacoes_log")
          .select("id, status")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (existingLog) {
          executionResults.push({
            workspace_id: ws.id,
            action,
            idempotente: true,
            mensagem: "Rotina de segunda já executada nesta semana. Disparo ignorado.",
          });
          continue;
        }
      }

      // Busca grupo do Telegram ativo de folguistas
      const { data: grupoFolguistas } = await supabaseAdmin
        .from("telegram_grupos_config")
        .select("id, chat_id, nome_grupo")
        .eq("workspace_id", ws.id)
        .eq("tipo_grupo", "folguistas")
        .eq("ativo", true)
        .maybeSingle();

      // Monta mensagem informativa de consulta
      const textoMensagem =
        `👥 *CONSULTA SEMANAL DE FOLGUISTAS — RODO POINT*\n\n` +
        `Olá equipe! Estamos organizando a escala para o próximo fim de semana:\n\n` +
        `📅 *Sábado, ${weekend.sabadoFormatado}*\n` +
        `• Manhã (Abertura 05:00 às 14:30)\n` +
        `• Noite (Fechamento 15:00 às 23:30)\n\n` +
        `📅 *Domingo, ${weekend.domingoFormatado}*\n` +
        `• Manhã (Abertura 05:00 às 14:30)\n` +
        `• Noite (Fechamento 15:00 às 23:30)\n\n` +
        `Por favor, respondam informando os dias e turnos em que estão disponíveis.\n` +
        `Obrigado!`;

      let telegramSent = false;
      let telegramMsgId = null;
      let telegramError = null;

      // Disparo real via API do Telegram se o modo de simulação estiver desativado (Gate 4)
      if (!isSimulacao && grupoFolguistas?.chat_id && telegramBotToken) {
        try {
          const tgRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: grupoFolguistas.chat_id,
              text: textoMensagem,
              parse_mode: "Markdown",
            }),
          });
          const tgData = await tgRes.json();
          if (tgData?.ok) {
            telegramSent = true;
            telegramMsgId = String(tgData.result?.message_id);
          } else {
            telegramError = tgData?.description || "Erro retornado pela API do Telegram";
          }
        } catch (fetchErr: unknown) {
          telegramError = fetchErr instanceof Error ? fetchErr.message : "Falha na requisição HTTP";
        }
      }

      const statusEnvio = isSimulacao
        ? "simulada"
        : telegramSent
        ? "enviada"
        : telegramError
        ? "falha"
        : "preparada";

      // Grava no log de auditoria
      const { data: logRow, error: logErr } = await supabaseAdmin
        .from("escalas_automacoes_log")
        .upsert(
          {
            workspace_id: ws.id,
            tipo_rotina: "consulta_segunda",
            idempotency_key: idempotencyKey,
            data_fim_semana_inicio: weekend.sabado,
            data_fim_semana_fim: weekend.domingo,
            status: isSimulacao ? "simulada" : (telegramError ? "erro" : "executada"),
            status_envio: statusEnvio,
            telegram_message_id: telegramMsgId,
            api_response: telegramError ? { error: telegramError } : { ok: telegramSent },
            erro_detalhes: telegramError,
            erro_mensagem: telegramError,
            destinatario_tipo: "grupo",
            destinatario_id: grupoFolguistas?.id || null,
            destinatario_nome: grupoFolguistas?.nome_grupo || "Folguistas Rodo Point",
            mensagem_texto: textoMensagem,
            vagas_identificadas: [
              { data: weekend.sabado, diaSemana: "sabado", turno: "manha", horario: "05:00 às 14:30" },
              { data: weekend.sabado, diaSemana: "sabado", turno: "noite", horario: "15:00 às 23:30" },
              { data: weekend.domingo, diaSemana: "domingo", turno: "manha", horario: "05:00 às 14:30" },
              { data: weekend.domingo, diaSemana: "domingo", turno: "noite", horario: "15:00 às 23:30" },
            ],
            enviado_telegram: telegramSent,
          },
          { onConflict: "idempotency_key" }
        )
        .select("id")
        .single();

      executionResults.push({
        workspace_id: ws.id,
        action,
        sucesso: !logErr,
        simulada: isSimulacao,
        enviado_telegram: telegramSent,
        status_envio: statusEnvio,
        log_id: logRow?.id,
      });
    }

    // 4. Execução da Rotina de Sexta-Feira (Reconfirmação de Presença)
    if (action === "confirmacao_sexta") {
      const idempotencyKey = `confirmacao_sexta_ws_${ws.id}_${weekend.sabado}`;

      const { data: logRow, error: logErr } = await supabaseAdmin
        .from("escalas_automacoes_log")
        .upsert(
          {
            workspace_id: ws.id,
            tipo_rotina: "confirmacao_sexta",
            idempotency_key: idempotencyKey,
            data_fim_semana_inicio: weekend.sabado,
            data_fim_semana_fim: weekend.domingo,
            status: isSimulacao ? "simulada" : "executada",
            status_envio: isSimulacao ? "simulada" : "preparada",
            destinatario_tipo: "grupo",
            mensagem_texto: `Reconfirmação de presença de sexta-feira para fim de semana (${weekend.sabadoFormatado} e ${weekend.domingoFormatado}). Regra: Silêncio NUNCA significa confirmação!`,
            vagas_identificadas: [],
            enviado_telegram: false,
          },
          { onConflict: "idempotency_key" }
        )
        .select("id")
        .single();

      executionResults.push({
        workspace_id: ws.id,
        action,
        sucesso: !logErr,
        simulada: isSimulacao,
        enviado_telegram: false,
        log_id: logRow?.id,
      });
    }
  }

  return new Response(
    JSON.stringify({
      sucesso: true,
      action,
      executado_em: new Date().toISOString(),
      weekend,
      resultados: executionResults,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
