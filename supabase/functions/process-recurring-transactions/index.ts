// Edge Function para processar transações recorrentes
// Executado via pg_cron diariamente
// URL: https://[seu-projeto].supabase.co/functions/v1/process-recurring-transactions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TransacaoRecorrente {
  id: string;
  user_id: string;
  tipo_transacao: 'receita' | 'despesa';
  descricao: string;
  valor: number;
  categoria_id: string | null;
  metodo_pagamento: string | null;
  conta_id: string | null;
  recorrencia: 'diaria' | 'semanal' | 'mensal' | 'anual';
  dia_execucao: number | null;
  dia_semana: number | null;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  ultima_execucao: string | null;
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

    console.log("Iniciando processamento de transações recorrentes...");

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeISO = hoje.toISOString().split('T')[0];

    // Buscar transações recorrentes ativas
    const { data: recorrentes, error: recorrentesError } = await supabaseAdmin
      .from("transacoes_recorrentes")
      .select("*")
      .eq("ativo", true)
      .lte("data_inicio", hojeISO)
      .or(`data_fim.is.null,data_fim.gte.${hojeISO}`);

    if (recorrentesError) {
      console.error("Erro ao buscar transações recorrentes:", recorrentesError);
      throw recorrentesError;
    }

    if (!recorrentes || recorrentes.length === 0) {
      console.log("Nenhuma transação recorrente ativa encontrada");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhuma transação recorrente ativa",
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Encontradas ${recorrentes.length} transações recorrentes ativas`);

    let processedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Processar cada transação recorrente
    for (const recorrente of recorrentes as TransacaoRecorrente[]) {
      try {
        console.log(`Processando transação recorrente ${recorrente.id}...`);

        // Verificar se deve executar hoje
        const deveExecutar = verificarSeDeveExecutar(recorrente, hoje);

        if (!deveExecutar) {
          console.log(`Transação ${recorrente.id} não deve executar hoje`);
          skippedCount++;
          continue;
        }

        // Criar nova transação
        const tabela = recorrente.tipo_transacao === 'receita' ? 'receitas' : 'despesas';
        
        const novaTransacao = {
          user_id: recorrente.user_id,
          descricao: recorrente.descricao,
          valor: recorrente.valor,
          data: hojeISO,
          categoria_id: recorrente.categoria_id,
          metodo_pagamento: recorrente.metodo_pagamento,
          conta_id: recorrente.conta_id,
          recorrencia_id: recorrente.id,
        };

        const { error: insertError } = await supabaseAdmin
          .from(tabela)
          .insert([novaTransacao]);

        if (insertError) {
          console.error(`Erro ao criar transação para ${recorrente.id}:`, insertError);
          failedCount++;
          continue;
        }

        // Atualizar ultima_execucao
        const { error: updateError } = await supabaseAdmin
          .from("transacoes_recorrentes")
          .update({
            ultima_execucao: hojeISO,
            updated_at: new Date().toISOString(),
          })
          .eq("id", recorrente.id);

        if (updateError) {
          console.error(`Erro ao atualizar ultima_execucao para ${recorrente.id}:`, updateError);
        }

        console.log(`Transação criada com sucesso para ${recorrente.id}`);
        processedCount++;

      } catch (error) {
        console.error(`Erro ao processar transação recorrente ${recorrente.id}:`, error);
        failedCount++;
      }
    }

    console.log(
      `Processamento concluído: ${processedCount} criadas, ${skippedCount} puladas, ${failedCount} falhas`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Transações recorrentes processadas",
        processed: processedCount,
        skipped: skippedCount,
        failed: failedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Erro ao processar transações recorrentes:", error);

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

function verificarSeDeveExecutar(
  recorrente: TransacaoRecorrente,
  hoje: Date
): boolean {
  const ultimaExecucao = recorrente.ultima_execucao
    ? new Date(recorrente.ultima_execucao)
    : null;

  // Se nunca executou, verificar se já passou da data de início
  if (!ultimaExecucao) {
    const dataInicio = new Date(recorrente.data_inicio);
    dataInicio.setHours(0, 0, 0, 0);
    return hoje >= dataInicio;
  }

  ultimaExecucao.setHours(0, 0, 0, 0);

  switch (recorrente.recorrencia) {
    case 'diaria':
      // Executar se última execução foi ontem ou antes
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);
      return ultimaExecucao <= ontem;

    case 'semanal':
      // Executar se hoje é o dia da semana configurado e já passou 7 dias
      const diaSemanaHoje = hoje.getDay();
      const diasDesdeUltima = Math.floor(
        (hoje.getTime() - ultimaExecucao.getTime()) / (1000 * 60 * 60 * 24)
      );
      return (
        diaSemanaHoje === recorrente.dia_semana &&
        diasDesdeUltima >= 7
      );

    case 'mensal':
      // Executar se hoje é o dia do mês configurado e já passou 1 mês
      const diaHoje = hoje.getDate();
      const mesPassou =
        hoje.getMonth() > ultimaExecucao.getMonth() ||
        hoje.getFullYear() > ultimaExecucao.getFullYear();
      return diaHoje === recorrente.dia_execucao && mesPassou;

    case 'anual':
      // Executar se hoje é o mesmo dia/mês e já passou 1 ano
      const diaHojeAnual = hoje.getDate();
      const mesHoje = hoje.getMonth();
      const anoPassou = hoje.getFullYear() > ultimaExecucao.getFullYear();
      const dataInicio = new Date(recorrente.data_inicio);
      return (
        diaHojeAnual === dataInicio.getDate() &&
        mesHoje === dataInicio.getMonth() &&
        anoPassou
      );

    default:
      return false;
  }
}
