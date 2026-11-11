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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = getSupabaseSecretKey() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GEMINI_API_KEY");

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    let payload: { workspace_id?: string; reference_date?: string } = {};

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

    const resultados: Array<{
      workspaceId: string;
      ownerId: string;
      status: string;
      reportId?: string;
      notified: boolean;
      motivo?: string;
    }> = [];

    // Processar cada workspace de forma isolada e idempotente
    for (const ws of workspaces) {
      const workspaceId = ws.id;
      const ownerId = ws.user_id;

      try {
        // Idempotência: verifica se já existe relatório completado no dia para este workspace
        const { data: existingReport } = await supabaseAdmin
          .from("ceo_executive_reports")
          .select("id, status")
          .eq("workspace_id", workspaceId)
          .eq("reference_date", referenceDate)
          .eq("period_type", "daily")
          .eq("status", "completed")
          .maybeSingle();

        if (existingReport) {
          resultados.push({
            workspaceId,
            ownerId,
            status: "skipped_already_completed",
            reportId: existingReport.id,
            notified: false,
            motivo: `Relatório para ${referenceDate} já foi gerado anteriormente com status completed.`,
          });
          continue;
        }

        // 3. Coleta determinística dos 6 blocos
        const { indicators, sourcesConsulted, dataQualityAlerts } =
          await collectExecutiveReportIndicators(supabaseAdmin, {
            workspaceId,
            referenceDate,
          });

        // 4. Síntese executiva inteligente com Fallback Determinístico
        const synthesis = await synthesizeExecutiveReport({
          indicators,
          referenceDate,
          workspaceId,
          ownerName: ws.nome,
          geminiApiKey,
        });

        const periodStart = `${referenceDate}T00:00:00.000Z`;
        const periodEnd = `${referenceDate}T23:59:59.999Z`;

        const reportToSave: Partial<CeoExecutiveReport> = {
          workspace_id: workspaceId,
          owner_id: ownerId,
          reference_date: referenceDate,
          period_type: "daily",
          period_start: periodStart,
          period_end: periodEnd,
          financial_indicators: indicators,
          executive_summary: synthesis.executiveSummary,
          recommendations: synthesis.recommendations,
          status: synthesis.status,
          sources_consulted: sourcesConsulted,
          data_quality_alerts: [...dataQualityAlerts, ...synthesis.dataQualityAlerts],
          ai_model: synthesis.aiModel,
          ai_tokens_used: synthesis.aiTokensUsed,
          ai_estimated_cost_usd: synthesis.aiEstimatedCostUsd,
          dispatch_status: { app: false, telegram: false },
          version: 1,
        };

        // 5. UPSERT idempotente no banco de dados
        const { data: savedReport, error: saveError } = await supabaseAdmin
          .from("ceo_executive_reports")
          .upsert(reportToSave, {
            onConflict: "workspace_id,reference_date,period_type,version",
          })
          .select("id")
          .single();

        if (saveError) {
          throw new Error(`Erro ao persistir relatório: ${saveError.message}`);
        }

        const reportId = savedReport.id;
        let notified = false;

        // 6. Entrega Multicanal via Notification Dispatcher na categoria ceo_executivo
        try {
          const resumoTelegram = `👑 *WALLET CEO — RELATÓRIO EXECUTIVO DIÁRIO*\n` +
            `📅 *Referência:* ${referenceDate} (${indicators.faturamento.diaSemanaOntemNome})\n\n` +
            `💰 *Faturamento Ontem:* R$ ${indicators.faturamento.faturamentoOntem.toFixed(2)} (${indicators.faturamento.pedidosOntem} pedidos)\n` +
            `📊 *Faturamento Acumulado Mês:* R$ ${indicators.faturamento.faturamentoMesAcumulado.toFixed(2)}\n` +
            `📉 *Despesas Mês:* R$ ${indicators.despesas.despesasMesAcumulado.toFixed(2)}\n` +
            `📈 *Resultado Operacional:* R$ ${indicators.resultado.resultadoOperacional.toFixed(2)}\n` +
            (indicators.despesas.contasVencidasQuantidade > 0
              ? `⚠️ *Atenção:* ${indicators.despesas.contasVencidasQuantidade} conta(s) vencida(s) (R$ ${indicators.despesas.contasVencidasValor.toFixed(2)})\n`
              : "") +
            `\n🎯 *Síntese Executiva:*\n${synthesis.executiveSummary}\n\n` +
            `🔗 *Acesse o relatório completo no Wallet:* /ceo`;

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

          if (!dispatchRes.error) {
            notified = true;
            await supabaseAdmin
              .from("ceo_executive_reports")
              .update({
                dispatch_status: {
                  app: true,
                  telegram: true,
                  dispatched_at: new Date().toISOString(),
                },
              })
              .eq("id", reportId);
          }
        } catch (dispatchErr) {
          console.error(`[cron-relatorio-executivo] Erro no despacho de notificação para ws ${workspaceId}:`, dispatchErr);
        }

        resultados.push({
          workspaceId,
          ownerId,
          status: synthesis.status,
          reportId,
          notified,
        });
      } catch (wsErr: unknown) {
        const errorMsg = wsErr instanceof Error ? wsErr.message : String(wsErr);
        console.error(`[cron-relatorio-executivo] Falha ao processar workspace ${workspaceId}:`, errorMsg);
        resultados.push({
          workspaceId,
          ownerId,
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
