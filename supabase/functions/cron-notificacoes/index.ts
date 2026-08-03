import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    .select("id, user_id, descricao, valor_total, data_vencimento")
    .neq("status", "quitada")
    .eq("data_vencimento", d1);

  const { data: dividasD3 } = await supabaseAdmin
    .from("dividas")
    .select("id, user_id, descricao, valor_total, data_vencimento")
    .neq("status", "quitada")
    .eq("data_vencimento", d3);

  // 2. Busca despesas a vencer hoje (D+0)
  const { data: despesasHoje } = await supabaseAdmin
    .from("despesas")
    .select("id, user_id, descricao, valor, data")
    .eq("pago", false)
    .eq("data", hoje);

  // Agrupa alertas por usuário
  const userAlerts = new Map<string, string[]>();

  const addAlert = (userId: string, msg: string) => {
    if (!userAlerts.has(userId)) userAlerts.set(userId, []);
    userAlerts.get(userId)!.push(msg);
  };

  (dividasD1 || []).forEach((d) => {
    const val = Number(d.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    addAlert(d.user_id, `⚠️ Dívida "${d.descricao || 'Dívida'}" (${val}) vence AMANHÃ!`);
  });

  (dividasD3 || []).forEach((d) => {
    const val = Number(d.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    addAlert(d.user_id, `📅 Lembrete: Dívida "${d.descricao || 'Dívida'}" (${val}) vence em 3 dias.`);
  });

  (despesasHoje || []).forEach((d) => {
    const val = Number(d.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    addAlert(d.user_id, `⏰ Conta "${d.descricao || 'Despesa'}" (${val}) vence HOJE!`);
  });

  let notificacoesDisparadas = 0;

  // Dispara notificações push e Telegram para cada usuário afetado
  for (const [userId, msgs] of userAlerts.entries()) {
    const textoMensagem = msgs.join("\n");
    const titulo = "🔔 Alerta de Compromissos Wallet";

    // 1. Tenta enviar Push
    try {
      await supabaseAdmin.functions.invoke("enviar-push", {
        body: { user_id: userId, titulo, mensagem: textoMensagem, url: "/dividas" },
      });
    } catch (e) {
      console.warn("Erro ao invocar enviar-push:", e);
    }

    // 2. Tenta enviar Telegram
    try {
      const htmlTelegram = `🔔 <b>Alerta de Compromissos Wallet</b>\n\n` + msgs.join("\n\n");
      await supabaseAdmin.functions.invoke("enviar-telegram", {
        body: { user_id: userId, titulo, mensagem: htmlTelegram },
      });
    } catch (e) {
      console.warn("Erro ao invocar enviar-telegram:", e);
    }

    notificacoesDisparadas++;
  }

  return new Response(
    JSON.stringify({ success: true, usuariosNotificados: notificacoesDisparadas }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
