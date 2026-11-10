import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { isAuthorizedCronCaller, unauthorizedResponse } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface AlertGroup {
  workspaceId: string | null;
  userId: string;
  messages: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isAuthorizedCronCaller(req)) {
    return unauthorizedResponse("Unauthorized: Cron secret or service role key required", corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = getSupabaseSecretKey() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const hojeDate = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const hoje = fmt(hojeDate);

  const d1Date = new Date(Date.now() + 1 * 86400000);
  const d1 = fmt(d1Date);

  const d3Date = new Date(Date.now() + 3 * 86400000);
  const d3 = fmt(d3Date);

  // 1. Busca dívidas com vencimento em D+1 e D+3 (status pendente ou vencida)
  const { data: dividasD1 } = await supabaseAdmin
    .from("dividas")
    .select("id, user_id, workspace_id, descricao, valor_total, data_vencimento")
    .neq("status", "quitada")
    .eq("data_vencimento", d1);

  const { data: dividasD3 } = await supabaseAdmin
    .from("dividas")
    .select("id, user_id, workspace_id, descricao, valor_total, data_vencimento")
    .neq("status", "quitada")
    .eq("data_vencimento", d3);

  // 2. Busca despesas a vencer hoje (D+0)
  const { data: despesasHoje } = await supabaseAdmin
    .from("despesas")
    .select("id, user_id, workspace_id, descricao, valor, data")
    .eq("pago", false)
    .eq("data", hoje);

  // Agrupa alertas por chave (workspace_id + user_id)
  const alertMap = new Map<string, AlertGroup>();

  const addAlert = (userId: string, workspaceId: string | null | undefined, msg: string) => {
    if (!userId) return;
    const ws = workspaceId || null;
    const key = `${ws || "none"}:${userId}`;
    if (!alertMap.has(key)) {
      alertMap.set(key, { workspaceId: ws, userId, messages: [] });
    }
    alertMap.get(key)!.messages.push(msg);
  };

  (dividasD1 || []).forEach((d) => {
    const val = Number(d.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    addAlert(d.user_id, d.workspace_id, `⚠️ Dívida "${d.descricao || "Dívida"}" (${val}) vence AMANHÃ!`);
  });

  (dividasD3 || []).forEach((d) => {
    const val = Number(d.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    addAlert(d.user_id, d.workspace_id, `📅 Lembrete: Dívida "${d.descricao || "Dívida"}" (${val}) vence em 3 dias.`);
  });

  (despesasHoje || []).forEach((d) => {
    const val = Number(d.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    addAlert(d.user_id, d.workspace_id, `⏰ Conta "${d.descricao || "Despesa"}" (${val}) vence HOJE!`);
  });

  let notificacoesDisparadas = 0;
  const resultadosEnvio: Array<{ userId: string; workspaceId?: string | null; sucesso: boolean; error?: string }> = [];

  // 3. Dispara através do NOTIFICATION-DISPATCHER centralizado
  for (const group of alertMap.values()) {
    const { userId, messages } = group;
    let effectiveWorkspaceId = group.workspaceId;
    const textoMensagem = messages.join("\n");
    const titulo = "🔔 Alerta de Compromissos Wallet";

    // Se o workspace não estiver definido no registro financeiro, busca workspace ativo associado
    if (!effectiveWorkspaceId) {
      const { data: wsData } = await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      effectiveWorkspaceId = wsData?.id;

      if (!effectiveWorkspaceId) {
        const { data: memberWs } = await supabaseAdmin
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId)
          .eq("active", true)
          .limit(1)
          .maybeSingle();
        effectiveWorkspaceId = memberWs?.workspace_id;
      }
    }

    if (!effectiveWorkspaceId) {
      // Fallback sem workspace cadastrado: insere direto em notificacoes in-app
      await supabaseAdmin.from("notificacoes").insert({
        user_id: userId,
        titulo,
        mensagem: textoMensagem,
        lida: false,
        link_redirecionamento: "/dividas",
      });
      notificacoesDisparadas++;
      resultadosEnvio.push({ userId, workspaceId: null, sucesso: true });
      continue;
    }

    try {
      // Roteia via notification-dispatcher respeitando RBAC, quiet hours e canais autorizados
      const dispatchRes = await supabaseAdmin.functions.invoke("notification-dispatcher", {
        body: {
          workspace_id: effectiveWorkspaceId,
          target_user_ids: [userId],
          categoria: "boletos",
          prioridade: "normal",
          titulo,
          mensagem: textoMensagem,
          link_redirecionamento: "/dividas",
        },
      });

      if (dispatchRes.error) {
        // Fallback resiliente: grava na central in-app
        await supabaseAdmin.from("notificacoes").insert({
          user_id: userId,
          titulo,
          mensagem: textoMensagem,
          lida: false,
          link_redirecionamento: "/dividas",
        });
      }

      resultadosEnvio.push({ userId, workspaceId: effectiveWorkspaceId, sucesso: true });
      notificacoesDisparadas++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      resultadosEnvio.push({ userId, workspaceId: effectiveWorkspaceId, sucesso: false, error: errMsg });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      usuariosNotificados: notificacoesDisparadas,
      detalhes: resultadosEnvio,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
