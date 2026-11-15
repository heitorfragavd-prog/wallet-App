import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { isAuthorizedCronCaller } from "../_shared/auth-guard.ts";
import {
  getNextWeekendDatesSaoPaulo,
  WeekendDatesSaoPaulo,
  HORARIOS_OFICIAIS_RODO_POINT,
  VagaDescobertaDetalhe,
  buildMondayConsultationMessage,
  buildFridayConfirmationMessage,
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

  // Autenticação e Autorização Estrita (Gate 8):
  // 1. Chamadas de sistema (pg_cron / dispatcher) autorizadas via secret header / cronCaller
  const isCron = isAuthorizedCronCaller(req);
  let callingUserId: string | null = null;

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
    callingUserId = userData.user.id;
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
  const rawForcar = Boolean(payload.forcar);
  const targetWorkspaceId = payload.workspace_id;

  // Se não for chamada de cron, exige workspace_id explícito e valida permissão de administrador (Gate 8)
  if (!isCron) {
    if (!targetWorkspaceId) {
      return new Response(
        JSON.stringify({
          error: "Requisições manuais devem especificar obrigatoriamente o workspace_id.",
          code: "FORBIDDEN_WORKSPACE_MISSING",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validação de papel de administrador/executivo no workspace específico (Gate 8)
    const { data: isExec } = await supabaseAdmin.rpc("is_workspace_executive", {
      p_workspace_id: targetWorkspaceId,
      p_user_id: callingUserId,
    });

    if (!isExec) {
      // Fallback seguro: verifica se é o proprietário do workspace
      const { data: wsOwner } = await supabaseAdmin
        .from("workspaces")
        .select("id, user_id")
        .eq("id", targetWorkspaceId)
        .eq("user_id", callingUserId)
        .maybeSingle();

      if (!wsOwner) {
        return new Response(
          JSON.stringify({
            error: "Acesso negado: apenas administradores autorizados deste workspace podem disparar automações de escalas.",
            code: "FORBIDDEN_NOT_WORKSPACE_ADMIN",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
  }

  // O parâmetro 'forcar' só pode ser aceito para chamadas com autorização comprovada
  const forcar = rawForcar;

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

      // 1. Busca grupo do Telegram ativo de folguistas
      const { data: grupoFolguistas } = await supabaseAdmin
        .from("telegram_grupos_config")
        .select("id, chat_id, nome_grupo")
        .eq("workspace_id", ws.id)
        .eq("tipo_grupo", "folguistas")
        .eq("ativo", true)
        .maybeSingle();

      // 2. Consulta escalas existentes para sábado e domingo
      const { data: escalasFimSemana } = await supabaseAdmin
        .from("colaborador_escalas")
        .select("id, colaborador_id, data, turno")
        .eq("workspace_id", ws.id)
        .in("data", [weekend.sabado, weekend.domingo]);

      // 3. Identifica vagas cobertas vs descobertas considerando os horários da Rodo Point:
      // Sábado: Manhã (05h00 às 14h30) e Noite (13h00 às 22h30)
      // Domingo: Manhã (05h00 às 14h30) e Noite (13h00 às 22h30)
      const vagasDescobertas: VagaDescobertaDetalhe[] = [];
      const turnosVerificar: Array<{ dia: "sabado" | "domingo"; data: string; turno: "manha" | "noite" }> = [
        { dia: "sabado", data: weekend.sabado, turno: "manha" },
        { dia: "sabado", data: weekend.sabado, turno: "noite" },
        { dia: "domingo", data: weekend.domingo, turno: "manha" },
        { dia: "domingo", data: weekend.domingo, turno: "noite" },
      ];

      for (const slot of turnosVerificar) {
        const estaCoberto = (escalasFimSemana || []).some(
          (e: { data: string; turno: string; colaborador_id: string | null }) =>
            e.data === slot.data &&
            (e.turno === slot.turno || (slot.turno === "manha" && e.turno === "abertura") || (slot.turno === "noite" && e.turno === "fechamento")) &&
            Boolean(e.colaborador_id)
        );
        if (!estaCoberto) {
          const info = HORARIOS_OFICIAIS_RODO_POINT[slot.dia][slot.turno];
          vagasDescobertas.push({
            data: slot.data,
            diaSemana: slot.dia,
            turno: slot.turno,
            horario: info.horarioFormatado,
          });
        }
      }

      // 4. Se TODOS os turnos estiverem cobertos, não envia consulta desnecessária (Gate 3)
      if (vagasDescobertas.length === 0) {
        const textoSemVagas = `Escala de fim de semana (${weekend.sabadoFormatado} e ${weekend.domingoFormatado}) 100% coberta. Nenhuma consulta necessária aos folguistas.`;
        const { data: logRow } = await supabaseAdmin
          .from("escalas_automacoes_log")
          .upsert(
            {
              workspace_id: ws.id,
              tipo_rotina: "consulta_segunda",
              idempotency_key: idempotencyKey,
              data_fim_semana_inicio: weekend.sabado,
              data_fim_semana_fim: weekend.domingo,
              status: "executada",
              status_envio: "escala_coberta_sem_consulta",
              destinatario_tipo: "sistema",
              destinatario_id: null,
              destinatario_nome: "Sistema Interno",
              mensagem_texto: textoSemVagas,
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
          sucesso: true,
          status_envio: "escala_coberta_sem_consulta",
          vagas_descobertas: 0,
          log_id: logRow?.id,
        });
        continue;
      }

      // 5. Monta mensagem informativa de consulta apenas com as vagas descobertas
      const textoMensagem = buildMondayConsultationMessage({
        weekend,
        vagasDescobertas,
      });

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
            vagas_identificadas: vagasDescobertas,
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
        vagas_descobertas: vagasDescobertas.length,
        log_id: logRow?.id,
      });
    }

    // 4. Execução da Rotina de Sexta-Feira (Reconfirmação de Presença Real - Gate 2)
    if (action === "confirmacao_sexta") {
      const idempotencyKey = `confirmacao_sexta_ws_${ws.id}_${weekend.sabado}`;

      // Idempotência
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
            mensagem: "Rotina de confirmação de sexta já executada nesta semana. Disparo ignorado.",
          });
          continue;
        }
      }

      // 1. Busca grupo do Telegram ativo de folguistas
      const { data: grupoFolguistas } = await supabaseAdmin
        .from("telegram_grupos_config")
        .select("id, chat_id, nome_grupo")
        .eq("workspace_id", ws.id)
        .eq("tipo_grupo", "folguistas")
        .eq("ativo", true)
        .maybeSingle();

      // 2. Consulta as escalas aprovadas de sábado e domingo que possuem colaborador_id
      const { data: escalasWeekend } = await supabaseAdmin
        .from("colaborador_escalas")
        .select("id, colaborador_id, data, turno, observacao")
        .eq("workspace_id", ws.id)
        .in("data", [weekend.sabado, weekend.domingo]);

      const escalados = (escalasWeekend || []).filter(
        (e: { colaborador_id: string | null }) => Boolean(e.colaborador_id)
      );

      // Se não há nenhum colaborador escalado
      if (escalados.length === 0) {
        const textoSemEscalados = `Nenhum colaborador escalado para o fim de semana (${weekend.sabadoFormatado} e ${weekend.domingoFormatado}). Confirmação desnecessária.`;
        const { data: logRow } = await supabaseAdmin
          .from("escalas_automacoes_log")
          .upsert(
            {
              workspace_id: ws.id,
              tipo_rotina: "confirmacao_sexta",
              idempotency_key: idempotencyKey,
              data_fim_semana_inicio: weekend.sabado,
              data_fim_semana_fim: weekend.domingo,
              status: "executada",
              status_envio: "sem_destinatarios",
              destinatario_tipo: "sistema",
              mensagem_texto: textoSemEscalados,
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
          sucesso: true,
          status_envio: "sem_destinatarios",
          log_id: logRow?.id,
        });
        continue;
      }

      // 3. Busca detalhes dos colaboradores escalados
      const colaboradorIds = [...new Set(escalados.map((e: { colaborador_id: string }) => e.colaborador_id))];
      const { data: colaboradoresData } = await supabaseAdmin
        .from("colaboradores")
        .select("id, nome, telegram_user_id, telegram_username")
        .in("id", colaboradorIds);

      const colabMap = new Map((colaboradoresData || []).map((c: { id: string }) => [c.id, c]));

      // 4. Consulta disponibilidades para verificar quem já confirmou
      const { data: disponibilidades } = await supabaseAdmin
        .from("folguistas_disponibilidade")
        .select("colaborador_id, data_referencia, turno, confirmado")
        .eq("workspace_id", ws.id)
        .in("data_referencia", [weekend.sabado, weekend.domingo])
        .eq("confirmado", true);

      const confirmadosSet = new Set(
        (disponibilidades || []).map(
          (d: { colaborador_id: string; data_referencia: string }) => `${d.colaborador_id}_${d.data_referencia}`
        )
      );

      // 5. Identifica folguistas com confirmação pendente (Regra: Silêncio NUNCA significa confirmação!)
      const pendentesParaConfirmar: Array<{
        colaboradorId: string;
        colaboradorNome: string;
        telegramUserId: number | null;
        telegramUsername: string | null;
        data: string;
        dataFormatada: string;
        diaSemana: "sabado" | "domingo";
        turno: "manha" | "noite";
        horario: string;
        mensagem: string;
      }> = [];

      for (const esc of escalados) {
        const isJaConfirmado = confirmadosSet.has(`${esc.colaborador_id}_${esc.data}`);
        if (!isJaConfirmado) {
          const colab = colabMap.get(esc.colaborador_id) as { nome: string; telegram_user_id: number | null; telegram_username: string | null } | undefined;
          const diaSemana: "sabado" | "domingo" = esc.data === weekend.sabado ? "sabado" : "domingo";
          const turnoNorm: "manha" | "noite" = esc.turno?.toLowerCase().includes("noite") || esc.turno?.toLowerCase().includes("fechamento") ? "noite" : "manha";
          const dataFmt = diaSemana === "sabado" ? weekend.sabadoFormatado : weekend.domingoFormatado;
          const horarioFmt = HORARIOS_OFICIAIS_RODO_POINT[diaSemana][turnoNorm].horarioFormatado;
          const colabNome = colab?.nome || "Colaborador";

          const msg = buildFridayConfirmationMessage({
            colaboradorNome: colabNome,
            data: esc.data,
            dataFormatada: dataFmt,
            diaSemana,
            turno: turnoNorm,
            horario: horarioFmt,
          });

          pendentesParaConfirmar.push({
            colaboradorId: esc.colaborador_id,
            colaboradorNome: colabNome,
            telegramUserId: colab?.telegram_user_id || null,
            telegramUsername: colab?.telegram_username || null,
            data: esc.data,
            dataFormatada: dataFmt,
            diaSemana,
            turno: turnoNorm,
            horario: horarioFmt,
            mensagem: msg,
          });
        }
      }

      if (pendentesParaConfirmar.length === 0) {
        const textoTodosConfirmados = `Todos os folguistas escalados para o fim de semana (${weekend.sabadoFormatado} e ${weekend.domingoFormatado}) já confirmaram presença previamente.`;
        const { data: logRow } = await supabaseAdmin
          .from("escalas_automacoes_log")
          .upsert(
            {
              workspace_id: ws.id,
              tipo_rotina: "confirmacao_sexta",
              idempotency_key: idempotencyKey,
              data_fim_semana_inicio: weekend.sabado,
              data_fim_semana_fim: weekend.domingo,
              status: "executada",
              status_envio: "todos_confirmados",
              destinatario_tipo: "sistema",
              mensagem_texto: textoTodosConfirmados,
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
          sucesso: true,
          status_envio: "todos_confirmados",
          total_escalados: escalados.length,
          log_id: logRow?.id,
        });
        continue;
      }

      // 6. Preparação ou Envio Real das confirmações
      let enviosSucesso = 0;
      const errosEnvio: string[] = [];

      for (const pendente of pendentesParaConfirmar) {
        if (!isSimulacao && telegramBotToken) {
          try {
            // Canal seguro: se tem chat privado ou grupo de folguistas
            const targetChatId = pendente.telegramUserId || grupoFolguistas?.chat_id;
            if (targetChatId) {
              const textoFinal = pendente.telegramUserId
                ? pendente.mensagem
                : `@${pendente.telegramUsername || pendente.colaboradorNome}:\n${pendente.mensagem}`;

              const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: targetChatId,
                  text: textoFinal,
                }),
              });
              const tgData = await res.json();
              if (tgData?.ok) {
                enviosSucesso++;
              } else {
                errosEnvio.push(tgData?.description || "Falha Telegram");
              }
            } else {
              errosEnvio.push(`Sem chat_id para ${pendente.colaboradorNome}`);
            }
          } catch (fetchErr: unknown) {
            errosEnvio.push(fetchErr instanceof Error ? fetchErr.message : "Erro de rede");
          }
        }
      }

      const statusEnvio = isSimulacao
        ? "simulada"
        : enviosSucesso > 0
        ? "enviada"
        : errosEnvio.length > 0
        ? "falha"
        : "preparada";

      const { data: logRow, error: logErr } = await supabaseAdmin
        .from("escalas_automacoes_log")
        .upsert(
          {
            workspace_id: ws.id,
            tipo_rotina: "confirmacao_sexta",
            idempotency_key: idempotencyKey,
            data_fim_semana_inicio: weekend.sabado,
            data_fim_semana_fim: weekend.domingo,
            status: isSimulacao ? "simulada" : (statusEnvio === "falha" ? "erro" : "executada"),
            status_envio: statusEnvio,
            destinatario_tipo: "grupo",
            destinatario_id: grupoFolguistas?.id || null,
            destinatario_nome: grupoFolguistas?.nome_grupo || "Folguistas Rodo Point",
            mensagem_texto: pendentesParaConfirmar.map((p) => p.mensagem).join("\n\n---\n\n"),
            vagas_identificadas: pendentesParaConfirmar.map((p) => ({
              colaboradorId: p.colaboradorId,
              colaboradorNome: p.colaboradorNome,
              data: p.data,
              turno: p.turno,
              horario: p.horario,
            })),
            enviado_telegram: enviosSucesso > 0,
            erro_mensagem: errosEnvio.length > 0 ? errosEnvio.join("; ") : null,
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
        status_envio: statusEnvio,
        total_pendentes: pendentesParaConfirmar.length,
        envios_sucesso: enviosSucesso,
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
