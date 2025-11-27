// Edge Function para processar lembretes de manutenção de veículos
// Executado via pg_cron diariamente
// URL: https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LembreteManutencao {
  id: string;
  user_id: string;
  veiculo_id: string;
  manutencao_id: string;
  tipo_manutencao: "plano" | "customizada";
  data_prevista: string;
  dias_antecedencia: number;
  status: string;
}

interface Veiculo {
  id: string;
  marca: string;
  modelo: string;
  placa: string;
  quilometragem: number;
}

interface Profile {
  name: string;
  telefone: string | null;
  email: string;
}

interface PlanoManutencao {
  id: string;
  intervalo_km: number;
  tipos_manutencao: {
    nome: string;
    sistema: string;
  };
}

interface ManutencaoCustomizada {
  id: string;
  nome: string;
  sistema: string;
  intervalo_km: number;
}

interface WebhookManutencao {
  id: string;
  nome: string;
  url: string;
  ativo: boolean;
  retry_attempts: number;
  retry_delay_seconds: number;
  auth_header: string | null;
}

interface WebhookPayload {
  tipo: "lembrete_manutencao";
  timestamp: string;
  veiculo: {
    id: string;
    marca: string;
    modelo: string;
    placa: string;
    quilometragem: number;
  };
  manutencao: {
    tipo: string;
    sistema: string;
    data_prevista: string;
    intervalo_km?: number;
  };
  usuario: {
    id: string;
    nome: string;
    telefone: string;
    email: string;
  };
  lembrete: {
    id: string;
    dias_antecedencia: number;
  };
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

    console.log("Iniciando processamento de lembretes de manutenção...");

    // 1. Buscar webhooks ativos
    const { data: webhooks, error: webhooksError } = await supabaseAdmin
      .from("webhooks_manutencao")
      .select("*")
      .eq("ativo", true);

    if (webhooksError) {
      console.error("Erro ao buscar webhooks:", webhooksError);
      throw webhooksError;
    }

    if (!webhooks || webhooks.length === 0) {
      console.warn("Nenhum webhook ativo configurado, pulando processamento");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum webhook ativo configurado",
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Encontrados ${webhooks.length} webhooks ativos`);

    // 2. Buscar lembretes pendentes que devem ser enviados
    // Lembrete deve ser enviado quando: data_prevista - dias_antecedencia <= hoje
    const hoje = new Date();
    const { data: lembretes, error: lembretesError } = await supabaseAdmin
      .from("lembretes_manutencao")
      .select(
        `
        *,
        veiculos:veiculo_id (
          id,
          marca,
          modelo,
          placa,
          quilometragem
        )
      `
      )
      .eq("status", "pendente");

    if (lembretesError) {
      console.error("Erro ao buscar lembretes:", lembretesError);
      throw lembretesError;
    }

    if (!lembretes || lembretes.length === 0) {
      console.log("Nenhum lembrete pendente encontrado");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum lembrete pendente",
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Encontrados ${lembretes.length} lembretes pendentes`);

    // Filtrar lembretes que devem ser enviados hoje
    const lembretesParaEnviar = lembretes.filter((lembrete) => {
      const dataPrevista = new Date(lembrete.data_prevista);
      const dataEnvio = new Date(dataPrevista);
      dataEnvio.setDate(dataEnvio.getDate() - lembrete.dias_antecedencia);

      // Enviar se a data de envio é hoje ou já passou
      return dataEnvio <= hoje;
    });

    console.log(
      `${lembretesParaEnviar.length} lembretes devem ser enviados hoje`
    );

    let processedCount = 0;
    let failedCount = 0;

    // 3. Processar cada lembrete
    for (const lembrete of lembretesParaEnviar as LembreteManutencao[]) {
      try {
        console.log(`Processando lembrete ${lembrete.id}...`);

        // Buscar dados do veículo (já vem do select acima)
        const veiculo = (lembrete as any).veiculos as Veiculo;

        if (!veiculo) {
          console.error(`Veículo não encontrado para lembrete ${lembrete.id}`);
          await supabaseAdmin
            .from("lembretes_manutencao")
            .update({
              status: "cancelado",
              webhook_response: "Veículo não encontrado",
            })
            .eq("id", lembrete.id);
          failedCount++;
          continue;
        }

        // Buscar dados da manutenção (plano ou customizada)
        let manutencaoNome = "";
        let manutencaoSistema = "";
        let intervaloKm: number | undefined;

        if (lembrete.tipo_manutencao === "plano") {
          const { data: plano, error: planoError } = await supabaseAdmin
            .from("planos_manutencao_veiculo")
            .select(
              `
              id,
              intervalo_km,
              tipos_manutencao:tipo_manutencao_id (
                nome,
                sistema
              )
            `
            )
            .eq("id", lembrete.manutencao_id)
            .single();

          if (planoError || !plano) {
            console.error(
              `Plano de manutenção não encontrado: ${lembrete.manutencao_id}`
            );
            await supabaseAdmin
              .from("lembretes_manutencao")
              .update({
                status: "cancelado",
                webhook_response: "Plano de manutenção não encontrado",
              })
              .eq("id", lembrete.id);
            failedCount++;
            continue;
          }

          const planoTyped = plano as PlanoManutencao;
          manutencaoNome = planoTyped.tipos_manutencao.nome;
          manutencaoSistema = planoTyped.tipos_manutencao.sistema;
          intervaloKm = planoTyped.intervalo_km;
        } else {
          const { data: customizada, error: customizadaError } =
            await supabaseAdmin
              .from("manutencoes_customizadas")
              .select("*")
              .eq("id", lembrete.manutencao_id)
              .single();

          if (customizadaError || !customizada) {
            console.error(
              `Manutenção customizada não encontrada: ${lembrete.manutencao_id}`
            );
            await supabaseAdmin
              .from("lembretes_manutencao")
              .update({
                status: "cancelado",
                webhook_response: "Manutenção customizada não encontrada",
              })
              .eq("id", lembrete.id);
            failedCount++;
            continue;
          }

          const customizadaTyped = customizada as ManutencaoCustomizada;
          manutencaoNome = customizadaTyped.nome;
          manutencaoSistema = customizadaTyped.sistema || "Não especificado";
          intervaloKm = customizadaTyped.intervalo_km;
        }

        // Buscar dados do usuário
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("name, telefone, email")
          .eq("user_id", lembrete.user_id)
          .single();

        if (profileError || !profile) {
          console.error(
            `Perfil do usuário não encontrado: ${lembrete.user_id}`
          );
          await supabaseAdmin
            .from("lembretes_manutencao")
            .update({
              status: "cancelado",
              webhook_response: "Perfil do usuário não encontrado",
            })
            .eq("id", lembrete.id);
          failedCount++;
          continue;
        }

        const profileTyped = profile as Profile;

        // Construir payload do webhook
        const payload: WebhookPayload = {
          tipo: "lembrete_manutencao",
          timestamp: new Date().toISOString(),
          veiculo: {
            id: veiculo.id,
            marca: veiculo.marca,
            modelo: veiculo.modelo,
            placa: veiculo.placa || "Sem placa",
            quilometragem: veiculo.quilometragem,
          },
          manutencao: {
            tipo: manutencaoNome,
            sistema: manutencaoSistema,
            data_prevista: lembrete.data_prevista,
            intervalo_km: intervaloKm,
          },
          usuario: {
            id: lembrete.user_id,
            nome: profileTyped.name,
            telefone: profileTyped.telefone || "",
            email: profileTyped.email,
          },
          lembrete: {
            id: lembrete.id,
            dias_antecedencia: lembrete.dias_antecedencia,
          },
        };

        console.log("Payload construído:", JSON.stringify(payload, null, 2));

        // Enviar para todos os webhooks ativos
        let webhookSuccess = false;
        for (const webhook of webhooks as WebhookManutencao[]) {
          const success = await enviarWebhook(
            supabaseAdmin,
            webhook,
            lembrete.id,
            payload
          );
          if (success) {
            webhookSuccess = true;
          }
        }

        // Atualizar status do lembrete
        if (webhookSuccess) {
          await supabaseAdmin
            .from("lembretes_manutencao")
            .update({
              status: "enviado",
              webhook_enviado_em: new Date().toISOString(),
            })
            .eq("id", lembrete.id);
          processedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`Erro ao processar lembrete ${lembrete.id}:`, error);
        failedCount++;
      }
    }

    console.log(
      `Processamento concluído: ${processedCount} sucesso, ${failedCount} falhas`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Lembretes processados",
        total_pendentes: lembretes.length,
        para_enviar: lembretesParaEnviar.length,
        processed: processedCount,
        failed: failedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Erro ao processar lembretes de manutenção:", error);

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

async function enviarWebhook(
  supabaseAdmin: any,
  webhook: WebhookManutencao,
  lembreteId: string,
  payload: WebhookPayload
): Promise<boolean> {
  let tentativa = 0;
  const maxTentativas = webhook.retry_attempts;

  while (tentativa < maxTentativas) {
    tentativa++;

    try {
      console.log(
        `Enviando webhook ${webhook.nome} (tentativa ${tentativa}/${maxTentativas})...`
      );

      // Timeout de 10 segundos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (webhook.auth_header) {
        headers["Authorization"] = webhook.auth_header;
      }

      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Log do webhook
      await supabaseAdmin.from("logs_webhooks_manutencao").insert({
        webhook_id: webhook.id,
        lembrete_id: lembreteId,
        payload: payload,
        status_code: response.status,
        response: await response.text(),
        erro: response.ok ? null : `HTTP ${response.status}`,
        tentativa: tentativa,
      });

      if (response.ok) {
        console.log(
          `Webhook ${webhook.nome} enviado com sucesso (tentativa ${tentativa})`
        );
        return true;
      } else {
        console.error(
          `Webhook ${webhook.nome} retornou erro ${response.status} (tentativa ${tentativa})`
        );

        // Se não for a última tentativa, aguardar antes de tentar novamente
        if (tentativa < maxTentativas) {
          await new Promise((resolve) =>
            setTimeout(resolve, webhook.retry_delay_seconds * 1000)
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error.name === "AbortError"
          ? "Timeout ao enviar webhook (>10s)"
          : error.message;

      console.error(
        `Erro ao enviar webhook ${webhook.nome} (tentativa ${tentativa}): ${errorMessage}`
      );

      // Log do erro
      await supabaseAdmin.from("logs_webhooks_manutencao").insert({
        webhook_id: webhook.id,
        lembrete_id: lembreteId,
        payload: payload,
        status_code: null,
        response: null,
        erro: errorMessage,
        tentativa: tentativa,
      });

      // Se não for a última tentativa, aguardar antes de tentar novamente
      if (tentativa < maxTentativas) {
        await new Promise((resolve) =>
          setTimeout(resolve, webhook.retry_delay_seconds * 1000)
        );
      }
    }
  }

  console.error(
    `Webhook ${webhook.nome} falhou após ${maxTentativas} tentativas`
  );
  return false;
}
