import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VaultRequestBody {
  action: "test_connection" | "save_credentials" | "get_metadata" | "disconnect";
  workspace_id: string;
  channel_name: "ifood" | "99food";
  merchant_id?: string;
  client_id?: string;
  client_secret?: string;
  auto_accept_orders?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = getSupabaseSecretKey() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Configuração do servidor ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Validação de Autenticação JWT
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Cabeçalho de autorização ausente ou inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Sessão expirada ou usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: VaultRequestBody = await req.json().catch(() => ({}));
    const { action, workspace_id: workspaceId, channel_name: channelName } = body;

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ success: false, error: "Identificador de workspace é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!channelName || !["ifood", "99food"].includes(channelName)) {
      return new Response(
        JSON.stringify({ success: false, error: "Canal de marketplace inválido (deve ser ifood ou 99food)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validação Estrita de Permissão RBAC (apenas Admin/Owner do workspace)
    const { data: owner } = await adminClient
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    let isAdmin = Boolean(owner);
    if (!isAdmin) {
      const { data: member } = await adminClient
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .eq("active", true)
        .eq("role", "admin")
        .maybeSingle();
      isAdmin = Boolean(member);
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Acesso negado: apenas administradores do workspace podem gerenciar o cofre de credenciais.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Execução das Ações de Cofre Seguro
    if (action === "save_credentials") {
      const { merchant_id: merchantId, client_id: clientId, client_secret: clientSecret, auto_accept_orders: autoAccept } = body;

      if (!merchantId?.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: "Merchant ID é obrigatório." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Consulta se já existem credenciais prévias no cofre
      const { data: existingSecret } = await adminClient
        .from("delivery_channel_secrets")
        .select("client_id, client_secret_encrypted")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      const finalClientId = (clientId && clientId !== "KEEP_EXISTING" && !clientId.includes("••••"))
        ? clientId.trim()
        : existingSecret?.client_id;

      if (!finalClientId) {
        return new Response(
          JSON.stringify({ success: false, error: "Client ID é obrigatório no cadastro inicial." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const finalSecret = clientSecret?.trim() || existingSecret?.client_secret_encrypted;
      if (!finalSecret) {
        return new Response(
          JSON.stringify({ success: false, error: "Client Secret é obrigatório no cadastro inicial." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upsert no cofre secreto
      const { error: vaultErr } = await adminClient
        .from("delivery_channel_secrets")
        .upsert(
          {
            workspace_id: workspaceId,
            channel_name: channelName,
            merchant_id: merchantId.trim(),
            client_id: finalClientId,
            client_secret_encrypted: finalSecret,
            environment: "production",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,channel_name" }
        );

      if (vaultErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Erro ao salvar no cofre: ${vaultErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Consulta estado do canal
      const { data: channelRow } = await adminClient
        .from("delivery_channels")
        .select("connection_state, config")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      const isHomologated = channelRow?.connection_state === "homologated";
      const currentConfig = (channelRow?.config && typeof channelRow.config === "object" ? channelRow.config : {}) as Record<string, unknown>;
      const logs = Array.isArray(currentConfig.event_log) ? currentConfig.event_log : [];

      const newLog = {
        id: `log-${Date.now()}`,
        event_type: "connect",
        status: "success",
        message: "Credenciais registradas no cofre seguro do servidor. Pronto para teste de conexão.",
        timestamp: new Date().toISOString(),
      };

      const updatedConfig = {
        ...currentConfig,
        merchant_id: merchantId.trim(),
        client_id: clientId.trim(),
        has_client_secret: true,
        event_log: [newLog, ...logs].slice(0, 20),
        updated_at: new Date().toISOString(),
      };

      await adminClient.from("delivery_channels").upsert(
        {
          workspace_id: workspaceId,
          channel_name: channelName,
          display_name: channelName === "ifood" ? "iFood Marketplace" : "99Food Restaurante",
          is_active: true,
          status: isHomologated ? "active" : "pending_auth",
          connection_state: isHomologated ? "homologated" : "credentials_present_unverified",
          // Aceite automático só pode ser habilitado se já estiver homologado
          auto_accept_orders: isHomologated ? Boolean(autoAccept) : false,
          config: updatedConfig,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,channel_name" }
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: "Credenciais armazenadas no cofre seguro. Execute o teste para validar a homologação.",
          state: isHomologated ? "homologated" : "credentials_present_unverified",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "test_connection") {
      // 1. Busca credenciais diretamente do cofre secreto
      const { data: secretRow } = await adminClient
        .from("delivery_channel_secrets")
        .select("merchant_id, client_id, client_secret_encrypted")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      const finalMerchantId = body.merchant_id?.trim() || secretRow?.merchant_id;
      const finalClientId = body.client_id?.trim() || secretRow?.client_id;
      const finalSecret = body.client_secret?.trim() || secretRow?.client_secret_encrypted;

      if (!finalMerchantId || !finalClientId || !finalSecret) {
        return new Response(
          JSON.stringify({
            success: false,
            http_status: 400,
            latency_ms: 0,
            state: "not_configured",
            message: "Credenciais incompletas: informe Merchant ID, Client ID e Client Secret.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const startTime = Date.now();
      let httpStatus = 0;
      let latencyMs = 0;
      let isSuccess = false;
      let connectionState: "homologated" | "credentials_present_unverified" | "error" = "credentials_present_unverified";
      let feedbackMsg = "";

      if (channelName === "ifood") {
        try {
          const authParams = new URLSearchParams({
            grantType: "client_credentials",
            clientId: finalClientId,
            clientSecret: finalSecret,
          });

          const resp = await fetch("https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "Wallet-App/2.1 (Integration Handshake)",
            },
            body: authParams.toString(),
            signal: AbortSignal.timeout(10000), // 10s timeout
          });

          latencyMs = Date.now() - startTime;
          httpStatus = resp.status;

          if (resp.ok) {
            const tokenData = await resp.json().catch(() => ({}));
            isSuccess = true;
            connectionState = "homologated";
            feedbackMsg = `Conexão homologada com sucesso! Resposta do iFood em ${latencyMs}ms.`;

            // Grava token criptografado e validade no cofre
            if (tokenData.accessToken) {
              const expiresIn = typeof tokenData.expiresIn === "number" ? tokenData.expiresIn : 3600;
              const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
              await adminClient
                .from("delivery_channel_secrets")
                .update({
                  access_token_encrypted: tokenData.accessToken,
                  token_expires_at: expiresAt,
                  updated_at: new Date().toISOString(),
                })
                .eq("workspace_id", workspaceId)
                .eq("channel_name", channelName);
            }
          } else if (resp.status === 400 || resp.status === 401) {
            isSuccess = false;
            connectionState = "credentials_present_unverified";
            feedbackMsg = `Credenciais rejeitadas pelo iFood (${httpStatus} Unauthorized): Verifique Client ID e Client Secret no Portal Developer.`;
          } else {
            isSuccess = false;
            connectionState = "error";
            feedbackMsg = `Servidor do iFood retornou status ${httpStatus} em ${latencyMs}ms.`;
          }
        } catch (fetchErr: unknown) {
          latencyMs = Date.now() - startTime;
          httpStatus = 504;
          isSuccess = false;
          connectionState = "error";
          feedbackMsg = `Tempo limite ou erro de rede ao conectar com o iFood (${latencyMs}ms).`;
        }
      } else if (channelName === "99food") {
        try {
          // Chamada real ao endpoint oficial da 99Food Open API
          const resp = await fetch("https://open-api.99app.com/food/v2/oauth/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Wallet-App/2.1 (99Food Handshake)",
            },
            body: JSON.stringify({
              app_key: finalClientId,
              app_secret: finalSecret,
              shop_id: finalMerchantId,
            }),
            signal: AbortSignal.timeout(10000),
          });

          latencyMs = Date.now() - startTime;
          httpStatus = resp.status;

          if (resp.ok) {
            isSuccess = true;
            connectionState = "homologated";
            feedbackMsg = `Conexão homologada com sucesso! Resposta da 99Food em ${latencyMs}ms.`;
          } else if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
            isSuccess = false;
            connectionState = "credentials_present_unverified";
            feedbackMsg = `Credenciais rejeitadas pela 99Food (${httpStatus}): Verifique App Key e App Secret no Portal 99Food.`;
          } else {
            isSuccess = false;
            connectionState = "error";
            feedbackMsg = `Servidor da 99Food retornou status ${httpStatus} em ${latencyMs}ms.`;
          }
        } catch {
          latencyMs = Date.now() - startTime;
          httpStatus = 504;
          isSuccess = false;
          connectionState = "error";
          feedbackMsg = `Tempo limite ou erro de rede ao conectar com a 99Food (${latencyMs}ms).`;
        }
      }

      // Atualiza canal no banco com o resultado do teste
      const testedAt = new Date().toISOString();
      const { data: currentCh } = await adminClient
        .from("delivery_channels")
        .select("config")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      const cfg = (currentCh?.config && typeof currentCh.config === "object" ? currentCh.config : {}) as Record<string, unknown>;
      const existingLogs = Array.isArray(cfg.event_log) ? cfg.event_log : [];

      const testLog = {
        id: `test-${Date.now()}`,
        event_type: "test",
        status: isSuccess ? "success" : "warning",
        message: `Teste HTTP real (${latencyMs}ms, status ${httpStatus}): ${feedbackMsg}`,
        timestamp: testedAt,
      };

      await adminClient
        .from("delivery_channels")
        .update({
          connection_state: connectionState,
          status: isSuccess ? "active" : "pending_auth",
          config: {
            ...cfg,
            last_connection_test: {
              success: isSuccess,
              state: connectionState,
              message: feedbackMsg,
              tested_at: testedAt,
              latency_ms: latencyMs,
              http_status: httpStatus,
            },
            event_log: [testLog, ...existingLogs].slice(0, 20),
          },
          updated_at: testedAt,
        })
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName);

      return new Response(
        JSON.stringify({
          success: isSuccess,
          http_status: httpStatus,
          latency_ms: latencyMs,
          state: connectionState,
          message: feedbackMsg,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "disconnect") {
      // Purga credenciais do cofre
      await adminClient
        .from("delivery_channel_secrets")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName);

      // Desativa canal
      const { data: currentCh } = await adminClient
        .from("delivery_channels")
        .select("config")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      const cfg = (currentCh?.config && typeof currentCh.config === "object" ? currentCh.config : {}) as Record<string, unknown>;
      const existingLogs = Array.isArray(cfg.event_log) ? cfg.event_log : [];

      const disconnectLog = {
        id: `disconnect-${Date.now()}`,
        event_type: "disconnect",
        status: "info",
        message: "Canal desconectado e credenciais purgadas do cofre do servidor.",
        timestamp: new Date().toISOString(),
      };

      await adminClient
        .from("delivery_channels")
        .update({
          connection_state: "disconnected",
          status: "pending_auth",
          is_active: false,
          auto_accept_orders: false,
          config: {
            ...cfg,
            has_client_secret: false,
            event_log: [disconnectLog, ...existingLogs].slice(0, 20),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Canal desconectado com sucesso e credenciais removidas do cofre.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação não suportada" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro interno no processamento do cofre";
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
