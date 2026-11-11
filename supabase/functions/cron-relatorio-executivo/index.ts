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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isAuthorizedCronCaller(req)) {
    return unauthorizedResponse("Unauthorized: Cron secret or service role key required", corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = getSupabaseSecretKey() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GEMINI_API_KEY");

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    let targetReferenceDate: string | null = null;

    // Permite sobrescrever data para fins de homologação/reprocessamento autorizado
    if (req.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await req.json();
        if (body.reference_date && /^\d{4}-\d{2}-\d{2}$/.test(body.reference_date)) {
          targetReferenceDate = body.reference_date;
        }
      } catch {
        // Ignora corpo se não for JSON válido
      }
    }

    const referenceDate = targetReferenceDate || getYesterdaySaoPauloString();

    // 1. Identificar todos os workspaces cadastrados
    const { data: workspaces, error: wsError } = await supabaseAdmin
      .from("workspaces")
      .select("id, user_id, nome");

    if (wsError || !workspaces || workspaces.length === 0) {
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

    // 2. Processar cada workspace de forma isolada e idempotente
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
