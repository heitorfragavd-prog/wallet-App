import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const hoje = new Date().toISOString().split("T")[0];
  const amanha = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  // Contas a vencer amanhã
  const { data: contasAmanha } = await supabaseAdmin
    .from("despesas")
    .select("*, user_id")
    .eq("data", amanha)
    .eq("pago", false);

  // Insumos vencendo
  const { data: insumos } = await supabaseAdmin
    .from("itens_mercado")
    .select("*, user_id")
    .lte("data_validade", amanha)
    .gte("data_validade", hoje);

  // Enviar notificações
  for (const conta of contasAmanha || []) {
    await supabaseAdmin.functions.invoke("notificar-whatsapp", {
      body: {
        telefone: "+55...", // buscar do perfil do usuário
        mensagem: `⏰ Lembrete: "${conta.descricao}" de R$ ${conta.valor} vence AMANHÃ!`,
      },
    });
  }

  return new Response("OK", { status: 200 });
});
