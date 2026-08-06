import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. Obter todos os usuários cadastrados
    const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers();
    if (usersErr) throw usersErr;

    const todayStr = new Date().toISOString().split("T")[0];
    let alertCount = 0;

    for (const user of users) {
      const userId = user.id;

      // ─── CHECK 1: ALERTAS DE PROVENTOS DO DIA ───
      const { data: proventos } = await supabaseAdmin
        .from("proventos_esperados")
        .select("*, investimentos(nome)")
        .eq("user_id", userId)
        .eq("data_pagamento", todayStr)
        .eq("status", "previsto");

      if (proventos && proventos.length > 0) {
        for (const prov of proventos) {
          const val = Number(prov.valor_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const ativoNome = prov.investimentos?.nome || "Ativo";
          const msg = `🎉 ${val} de ${ativoNome} caíram na sua conta!`;

          // Enviar Push
          try {
            await supabaseAdmin.functions.invoke("enviar-push", {
              body: { user_id: userId, titulo: "🔔 Dividendo Recebido!", mensagem: msg, url: "/contas" },
            });
          } catch (_) {}

          // Atualizar status para 'recebido'
          await supabaseAdmin
            .from("proventos_esperados")
            .update({ status: "recebido" })
            .eq("id", prov.id);

          alertCount++;
        }
      }

      // ─── CHECK 2: ALERTAS DE DESBALANCEAMENTO SEMANAL ───
      // Apenas executa no Domingo (dia 0)
      if (new Date().getDay() === 0) {
        const { data: config } = await supabaseAdmin
          .from("configuracoes_investimentos")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        const limitDev = config?.alerta_desbalanceamento || 10.0;

        const { data: invs } = await supabaseAdmin
          .from("investimentos")
          .select("*")
          .eq("user_id", userId)
          .eq("ativo", true);

        const { data: metas } = await supabaseAdmin
          .from("metas_investimento")
          .select("*")
          .eq("user_id", userId)
          .eq("ativo", true);

        if (invs && invs.length > 0 && metas && metas.length > 0) {
          const meta = metas[0]; // Considera a meta principal
          const total = invs.reduce((sum, i) => sum + Number(i.valor_atual || 0), 0);

          if (total > 0) {
            const valorFixa = invs
              .filter((i) => i.tipo === "renda_fixa" || i.tipo === "poupanca")
              .reduce((sum, i) => sum + Number(i.valor_atual || 0), 0);

            const pctFixa = (valorFixa / total) * 100;
            const diff = Math.abs(pctFixa - Number(meta.alocacao_fixa || 60));

            if (diff > limitDev) {
              const msg = `⚠️ Sua carteira desviou ${diff.toFixed(0)}% da meta de alocação de RF (Meta: ${meta.alocacao_fixa}%). Rebalanceamento sugerido!`;
              try {
                await supabaseAdmin.functions.invoke("enviar-push", {
                  body: { user_id: userId, titulo: "⚖️ Rebalanceamento Sugerido", mensagem: msg, url: "/contas" },
                });
              } catch (_) {}
              alertCount++;
            }
          }
        }
      }

      // ─── CHECK 3: SWEEP DE CAIXA (VARREDURA DE SOBRA) ───
      // Executa no último dia do mês
      const hoje = new Date();
      const amanha = new Date(hoje.getTime() + 86400000);
      if (hoje.getMonth() !== amanha.getMonth()) {
        // Buscar saldo do usuário de contas ou simular sobra
        const { data: contas } = await supabaseAdmin
          .from("contas_usuario")
          .select("saldo_atual")
          .eq("user_id", userId);

        const totalSaldo = (contas || []).reduce((sum, c) => sum + Number(c.saldo_atual || 0), 0);

        // Se o saldo for maior que 2000, sugere investir o excedente
        if (totalSaldo > 2000) {
          const sobra = totalSaldo - 2000;
          const valSobra = sobra.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const msg = `💰 Você tem ${valSobra} sobrando em conta este mês. Que tal investir esse valor em suas metas?`;
          try {
            await supabaseAdmin.functions.invoke("enviar-push", {
              body: { user_id: userId, titulo: "💸 Sugestão de Investimento", mensagem: msg, url: "/contas" },
            });
          } catch (_) {}
          alertCount++;
        }
      }
    }

    return new Response(JSON.stringify({ success: true, alertsSent: alertCount }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
