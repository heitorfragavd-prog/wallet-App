import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { isAuthorizedCronCaller, unauthorizedResponse } from "../_shared/auth-guard.ts";
import { collectExecutiveReportIndicators } from "../_shared/executive-report-collector.ts";
import { synthesizeExecutiveReport } from "../_shared/executive-report-synthesizer.ts";
import { CeoExecutiveReport } from "../_shared/executive-report-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Retorna a data de ontem no formato "YYYY-MM-DD" no fuso America/Sao_Paulo
 */
export function getYesterdaySaoPauloString(referenceDate = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const nowParts = fmt.format(referenceDate).split("-").map(Number);
  const yesterdayNoon = new Date(Date.UTC(nowParts[0], nowParts[1] - 1, nowParts[2] - 1, 12, 0, 0));
  return fmt.format(yesterdayNoon);
}

export interface ReportAuthResult {
  authorized: boolean;
  status: number;
  error?: string;
  isCron: boolean;
  authenticatedUserId?: string;
  workspacesToProcess?: Array<{ id: string; user_id: string; nome: string }>;
  referenceDate?: string;
}

/**
 * Validação rigorosa de autorização para geração de relatórios executivos.
 * Suporta:
 * 1. Cron / Chamador de Serviço (CRON_SECRET ou SUPABASE_SERVICE_ROLE_KEY)
 * 2. Geração Manual pelo Proprietário Legítimo via JWT
 */
export async function authorizeReportExecution(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  payload: { workspace_id?: string; reference_date?: string } = {}
): Promise<ReportAuthResult> {
  const isCron = isAuthorizedCronCaller(req);
  let authenticatedUserId: string | null = null;

  if (!isCron) {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;

    if (!token) {
      return {
        authorized: false,
        status: 401,
        error: "Credenciais de autenticação ausentes (Bearer token ou Cron secret obrigatório).",
        isCron: false,
      };
    }

    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      return {
        authorized: false,
        status: 401,
        error: "Token de usuário inválido ou expirado.",
        isCron: false,
      };
    }

    authenticatedUserId = userData.user.id;
  }

  // Validação da data se informada
  let validatedRefDate: string | null = null;
  if (payload.reference_date) {
    const trimmedDate = payload.reference_date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      return {
        authorized: false,
        status: 400,
        error: "Formato de data inválido. Use o padrão YYYY-MM-DD.",
        isCron,
      };
    }

    const todaySaoPaulo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (trimmedDate > todaySaoPaulo) {
      return {
        authorized: false,
        status: 400,
        error: "Data de referência não pode ser posterior à data atual.",
        isCron,
      };
    }

    validatedRefDate = trimmedDate;
  }

  const referenceDate = validatedRefDate || getYesterdaySaoPauloString();

  // Caso 1: Chamada Manual do Usuário
  if (!isCron) {
    if (!payload.workspace_id) {
      return {
        authorized: false,
        status: 400,
        error: "workspace_id é obrigatório para execução manual.",
        isCron: false,
      };
    }

    const targetWsId = payload.workspace_id.trim();

    // 1. Busca workspace
    const { data: ws, error: wsError } = await supabaseAdmin
      .from("workspaces")
      .select("id, user_id, nome")
      .eq("id", targetWsId)
      .maybeSingle();

    if (wsError || !ws) {
      return {
        authorized: false,
        status: 404,
        error: "Workspace não encontrado.",
        isCron: false,
      };
    }

    // 2. Verifica se o chamador é o proprietário direto
    const isDirectOwner = ws.user_id === authenticatedUserId;

    if (!isDirectOwner) {
      // 3. Se não for proprietário direto, consulta papel na workspace_members
      const { data: member } = await supabaseAdmin
        .from("workspace_members")
        .select("role, ativo")
        .eq("workspace_id", targetWsId)
        .eq("user_id", authenticatedUserId)
        .eq("ativo", true)
        .maybeSingle();

      const isExecutiveOwner = member?.role === "owner";

      if (!isExecutiveOwner) {
        return {
          authorized: false,
          status: 403,
          error: "Acesso negado: Apenas o proprietário executivo pode gerar relatórios deste workspace.",
          isCron: false,
        };
      }
    }

    // Retorna estritamente o workspace solicitado (prevenção absoluta de processamento em lote acidental)
    return {
      authorized: true,
      status: 200,
      isCron: false,
      authenticatedUserId: authenticatedUserId!,
      workspacesToProcess: [ws],
      referenceDate,
    };
  }

  // Caso 2: Chamada do Cron / Service Role
  if (payload.workspace_id) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, user_id, nome")
      .eq("id", payload.workspace_id.trim());

    if (!ws || ws.length === 0) {
      return {
        authorized: false,
        status: 404,
        error: "Workspace especificado no cron não foi encontrado.",
        isCron: true,
      };
    }

    return {
      authorized: true,
      status: 200,
      isCron: true,
      workspacesToProcess: ws,
      referenceDate,
    };
  }

  // Cron padrão: busca todos os workspaces
  const { data: allWorkspaces, error: allWsError } = await supabaseAdmin
    .from("workspaces")
    .select("id, user_id, nome");

  if (allWsError || !allWorkspaces || allWorkspaces.length === 0) {
    return {
      authorized: true,
      status: 200,
      isCron: true,
      workspacesToProcess: [],
      referenceDate,
    };
  }

  return {
    authorized: true,
    status: 200,
    isCron: true,
    workspacesToProcess: allWorkspaces,
    referenceDate,
  };
}

export interface WorkflowExecutionResult {
  workspaceId: string;
  ownerId: string;
  status: string;
  reportId?: string;
  notified: boolean;
  reDispatched?: boolean;
  motivo?: string;
  dispatchDetails?: {
    app: boolean;
    push: boolean;
    telegram: boolean;
    attempts: number;
    failures: Array<{ channel: string; reason: string }>;
  };
}

/**
 * Executa o fluxo atômico e idempotente de geração e entrega do Relatório Executivo.
 * - Reconhece tanto 'completed' quanto 'fallback_deterministic' como relatórios finalizados válidos.
 * - Impede chamadas duplicadas à IA.
 * - Protege contra concorrência através do estado atômico 'generating'.
 * - Separa o controle de geração da entrega (permite retentativa exclusiva de despacho).
 * - Audita individualmente a entrega de cada canal (app, push, telegram).
 */
export async function executeExecutiveReportWorkflow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  options: {
    workspaceId: string;
    ownerId: string;
    ownerName: string;
    referenceDate: string;
    geminiApiKey?: string;
    forceRegenerate?: boolean;
  }
): Promise<WorkflowExecutionResult> {
  const { workspaceId, ownerId, ownerName, referenceDate, geminiApiKey, forceRegenerate } = options;

  // 1. Consulta existência de relatório para (workspace, reference_date, 'daily', v1)
  const { data: existingReport } = await supabaseAdmin
    .from("ceo_executive_reports")
    .select("id, status, dispatch_status, executive_summary, financial_indicators, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("reference_date", referenceDate)
    .eq("period_type", "daily")
    .eq("version", 1)
    .maybeSingle();

  // 2. Avaliação de Idempotência e Estado
  if (existingReport && !forceRegenerate) {
    const isCompleted =
      existingReport.status === "completed" ||
      existingReport.status === "fallback_deterministic";

    if (isCompleted) {
      const prevDispatch = existingReport.dispatch_status || {};
      const needsDispatchRetry = prevDispatch.app !== true || prevDispatch.telegram !== true;

      if (!needsDispatchRetry) {
        return {
          workspaceId,
          ownerId,
          status: "skipped_already_completed",
          reportId: existingReport.id,
          notified: true,
          motivo: `Relatório para ${referenceDate} já finalizado (${existingReport.status}) e entregue.`,
        };
      }

      // Se a geração está concluída mas a entrega falhou, reexecuta APENAS a entrega multicanal
      const dispatchOutcome = await dispatchExecutiveNotification(supabaseAdmin, {
        workspaceId,
        ownerId,
        referenceDate,
        indicators: existingReport.financial_indicators,
        executiveSummary: existingReport.executive_summary,
        previousAttempts: prevDispatch.attempts || 0,
      });

      const finalStatus =
        dispatchOutcome.app && dispatchOutcome.telegram
          ? existingReport.status
          : "pending_dispatch";

      await supabaseAdmin
        .from("ceo_executive_reports")
        .update({
          status: finalStatus,
          dispatch_status: dispatchOutcome,
        })
        .eq("id", existingReport.id);

      return {
        workspaceId,
        ownerId,
        status: finalStatus,
        reportId: existingReport.id,
        notified: dispatchOutcome.app || dispatchOutcome.telegram,
        reDispatched: true,
        motivo: "Retentativa de entrega multicanal executada com sucesso.",
        dispatchDetails: dispatchOutcome,
      };
    }

    // Se estiver em 'generating', verifica se há bloqueio ativo (menos de 2 minutos)
    if (existingReport.status === "generating") {
      const updatedAtMs = new Date(existingReport.updated_at || Date.now()).getTime();
      const ageMs = Date.now() - updatedAtMs;

      if (ageMs < 120_000) {
        return {
          workspaceId,
          ownerId,
          status: "in_progress_concurrent",
          reportId: existingReport.id,
          notified: false,
          motivo: "Relatório em geração por outra requisição concorrente. Aguardando conclusão.",
        };
      }
    }
  }

  // 3. Reserva Atômica com status 'generating' para mitigar condições de corrida
  const periodStart = `${referenceDate}T00:00:00.000Z`;
  const periodEnd = `${referenceDate}T23:59:59.999Z`;

  const { data: lockRecord, error: lockError } = await supabaseAdmin
    .from("ceo_executive_reports")
    .upsert(
      {
        workspace_id: workspaceId,
        owner_id: ownerId,
        reference_date: referenceDate,
        period_type: "daily",
        period_start: periodStart,
        period_end: periodEnd,
        status: "generating",
        financial_indicators: {},
        executive_summary: "Em processamento...",
        recommendations: [],
        sources_consulted: [],
        data_quality_alerts: [],
        dispatch_status: { app: false, telegram: false, attempts: 0 },
        version: 1,
      },
      { onConflict: "workspace_id,reference_date,period_type,version" }
    )
    .select("id")
    .single();

  if (lockError) {
    throw new Error(`Falha no lock atômico de geração: ${lockError.message}`);
  }

  const reportId = lockRecord.id;

  try {
    // 4. Coleta determinística dos 6 blocos
    const { indicators, sourcesConsulted, dataQualityAlerts } =
      await collectExecutiveReportIndicators(supabaseAdmin, {
        workspaceId,
        referenceDate,
      });

    // 5. Síntese executiva inteligente com Fallback Determinístico Obrigatório
    const synthesis = await synthesizeExecutiveReport({
      indicators,
      referenceDate,
      workspaceId,
      ownerName,
      geminiApiKey,
    });

    // 6. Entrega Multicanal verificando individualmente app, push e telegram
    const dispatchOutcome = await dispatchExecutiveNotification(supabaseAdmin, {
      workspaceId,
      ownerId,
      referenceDate,
      indicators,
      executiveSummary: synthesis.executiveSummary,
      previousAttempts: 0,
    });

    const isFullyDelivered = dispatchOutcome.app && dispatchOutcome.telegram;
    const finalReportStatus = isFullyDelivered ? synthesis.status : "pending_dispatch";

    const reportToUpdate: Partial<CeoExecutiveReport> = {
      financial_indicators: indicators,
      executive_summary: synthesis.executiveSummary,
      recommendations: synthesis.recommendations,
      status: finalReportStatus,
      sources_consulted: sourcesConsulted,
      data_quality_alerts: [...dataQualityAlerts, ...synthesis.dataQualityAlerts],
      ai_model: synthesis.aiModel,
      ai_tokens_used: synthesis.aiTokensUsed,
      ai_estimated_cost_usd: synthesis.aiEstimatedCostUsd,
      dispatch_status: dispatchOutcome,
    };

    const { error: updateError } = await supabaseAdmin
      .from("ceo_executive_reports")
      .update(reportToUpdate)
      .eq("id", reportId);

    if (updateError) {
      throw new Error(`Erro ao atualizar relatório finalizado: ${updateError.message}`);
    }

    return {
      workspaceId,
      ownerId,
      status: finalReportStatus,
      reportId,
      notified: isFullyDelivered,
      dispatchDetails: dispatchOutcome,
    };
  } catch (genError: unknown) {
    const errorMsg = genError instanceof Error ? genError.message : String(genError);
    // Em caso de falha irreversível, marca status 'failed' para auditoria
    await supabaseAdmin
      .from("ceo_executive_reports")
      .update({
        status: "failed",
        error_message: errorMsg,
      })
      .eq("id", reportId);

    throw genError;
  }
}

/**
 * Despacha notificação multicanal e valida o status individual de cada canal.
 */
async function dispatchExecutiveNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  options: {
    workspaceId: string;
    ownerId: string;
    referenceDate: string;
    indicators: any;
    executiveSummary: string;
    previousAttempts: number;
  }
) {
  const { workspaceId, ownerId, referenceDate, indicators, executiveSummary, previousAttempts } = options;

  let appDelivered = false;
  let pushDelivered = false;
  let telegramDelivered = false;
  const failures: Array<{ channel: string; reason: string }> = [];

  const faturamento = indicators?.faturamento || {};
  const despesas = indicators?.despesas || {};
  const resultado = indicators?.resultado || {};

  const resumoTelegram =
    `👑 *WALLET CEO — RELATÓRIO EXECUTIVO DIÁRIO*\n` +
    `📅 *Referência:* ${referenceDate} (${faturamento.diaSemanaOntemNome || "Ontem"})\n\n` +
    `💰 *Faturamento Ontem:* R$ ${Number(faturamento.faturamentoOntem || 0).toFixed(2)} (${faturamento.pedidosOntem || 0} pedidos)\n` +
    `📊 *Faturamento Acumulado Mês:* R$ ${Number(faturamento.faturamentoMesAcumulado || 0).toFixed(2)}\n` +
    `📉 *Despesas Mês:* R$ ${Number(despesas.despesasMesAcumulado || 0).toFixed(2)}\n` +
    `📈 *Resultado Operacional:* R$ ${Number(resultado.resultadoOperacional || 0).toFixed(2)}\n` +
    (despesas.contasVencidasQuantidade > 0
      ? `⚠️ *Atenção:* ${despesas.contasVencidasQuantidade} conta(s) vencida(s) (R$ ${Number(despesas.contasVencidasValor || 0).toFixed(2)})\n`
      : "") +
    `\n🎯 *Síntese Executiva:*\n${executiveSummary}\n\n` +
    `🔗 *Acesse o relatório completo no Wallet:* /ceo`;

  try {
    const dispatchRes = await supabaseAdmin.functions.invoke("notification-dispatcher", {
      body: {
        workspace_id: workspaceId,
        categoria: "ceo_executivo",
        prioridade: "importante",
        titulo: `👑 Relatório Executivo Diário — ${referenceDate}`,
        mensagem: resumoTelegram,
        link_redirecionamento: `/ceo`,
        target_user_ids: [ownerId],
        target_role: "owner",
      },
    });

    if (dispatchRes.error) {
      failures.push({
        channel: "all",
        reason: dispatchRes.error.message || "Erro de conexão ao notification-dispatcher",
      });
    } else {
      // Inspeciona os resultados reais por canal retornados pelo dispatcher
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entregas: any[] = dispatchRes.data?.entregas || [];

      const appResult = entregas.find((e) => e.channel === "app");
      const pushResult = entregas.find((e) => e.channel === "push");
      const tgResult = entregas.find((e) => e.channel === "telegram");

      appDelivered = !!appResult?.delivered;
      pushDelivered = pushResult ? !!pushResult.delivered : false;
      telegramDelivered = !!tgResult?.delivered;

      if (appResult && !appResult.delivered) {
        failures.push({ channel: "app", reason: appResult.reason || "Falha in-app" });
      }
      if (pushResult && !pushResult.delivered) {
        failures.push({ channel: "push", reason: pushResult.reason || "Falha push" });
      }
      if (tgResult && !tgResult.delivered) {
        failures.push({ channel: "telegram", reason: tgResult.reason || "Falha telegram" });
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push({ channel: "all", reason: msg });
  }

  return {
    app: appDelivered,
    push: pushDelivered,
    telegram: telegramDelivered,
    dispatched_at: new Date().toISOString(),
    attempts: previousAttempts + 1,
    failures,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = getSupabaseSecretKey() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GEMINI_API_KEY");

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    let payload: { workspace_id?: string; reference_date?: string; force?: boolean } = {};

    if (req.headers.get("content-type")?.includes("application/json")) {
      try {
        payload = await req.json();
      } catch {
        // Ignora corpo se não for JSON válido
      }
    }

    // Autorização rigorosa (Cron Secret / Service Role OU Proprietário Autenticado)
    const authResult = await authorizeReportExecution(req, supabaseAdmin, payload);
    if (!authResult.authorized) {
      return new Response(
        JSON.stringify({ success: false, error: authResult.error }),
        { status: authResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const referenceDate = authResult.referenceDate || getYesterdaySaoPauloString();
    const workspaces = authResult.workspacesToProcess || [];

    if (workspaces.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum workspace ativo encontrado para gerar relatórios." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultados: WorkflowExecutionResult[] = [];

    // Processar cada workspace com controle atômico e idempotência real
    for (const ws of workspaces) {
      try {
        const resultado = await executeExecutiveReportWorkflow(supabaseAdmin, {
          workspaceId: ws.id,
          ownerId: ws.user_id,
          ownerName: ws.nome,
          referenceDate,
          geminiApiKey,
          forceRegenerate: !!payload.force,
        });
        resultados.push(resultado);
      } catch (wsErr: unknown) {
        const errorMsg = wsErr instanceof Error ? wsErr.message : String(wsErr);
        console.error(`[cron-relatorio-executivo] Falha ao processar workspace ${ws.id}:`, errorMsg);
        resultados.push({
          workspaceId: ws.id,
          ownerId: ws.user_id,
          status: "failed",
          motivo: errorMsg,
          notified: false,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        referenceDate,
        totalProcessados: resultados.length,
        resultados,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[cron-relatorio-executivo] Erro geral na execução do cron:", error);
    const message = error instanceof Error ? error.message : "Erro interno no cron de relatórios executivos";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
