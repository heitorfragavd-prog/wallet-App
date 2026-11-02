import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { encryptVaultSecret, decryptVaultSecret } from "../_shared/vault-crypto.ts";

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
  preserve_client_id?: boolean;
  client_secret?: string;
  auto_accept_orders?: boolean;
}

function maskSecretPreview(val?: string): string {
  if (!val) return "";
  if (val.length <= 8) return "********";
  return `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
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

    // GATE A: Chave mestra dedicada MARKETPLACE_VAULT_KEY (Sem fallback para service_role)
    const masterSecret = Deno.env.get("MARKETPLACE_VAULT_KEY");
    if (!masterSecret || masterSecret.trim().length < 32) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Chave mestre de cofre não configurada ou com entropia insuficiente (MARKETPLACE_VAULT_KEY). Ação abortada por segurança.",
        }),
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
      const {
        merchant_id: merchantId,
        client_id: clientId,
        preserve_client_id: preserveClientId,
        client_secret: clientSecret,
      } = body;

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

      const finalClientId = (preserveClientId || !clientId || clientId.includes("••••"))
        ? existingSecret?.client_id
        : clientId.trim();

      if (!finalClientId) {
        return new Response(
          JSON.stringify({ success: false, error: "Client ID é obrigatório no cadastro inicial." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let finalEncryptedSecret = existingSecret?.client_secret_encrypted;
      if (clientSecret && clientSecret.trim().length > 0) {
        // Criptografia Autenticada AES-256-GCM com chave mestra MARKETPLACE_VAULT_KEY
        finalEncryptedSecret = await encryptVaultSecret(clientSecret.trim(), masterSecret, "v1");
      }

      if (!finalEncryptedSecret) {
        return new Response(
          JSON.stringify({ success: false, error: "Client Secret é obrigatório no cadastro inicial." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // GATE C: Verificação estrita de erro na persistência do cofre
      const { error: vaultErr } = await adminClient
        .from("delivery_channel_secrets")
        .upsert(
          {
            workspace_id: workspaceId,
            channel_name: channelName,
            merchant_id: merchantId.trim(),
            client_id: finalClientId,
            key_id: "v1",
            client_secret_encrypted: finalEncryptedSecret,
            environment: "production",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,channel_name" }
        );

      if (vaultErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha ao persistir no cofre: ${vaultErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Consulta canal existente para preservar histórico de logs
      const { data: channelRow } = await adminClient
        .from("delivery_channels")
        .select("config")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      const currentConfig = (channelRow?.config && typeof channelRow.config === "object" ? channelRow.config : {}) as Record<string, unknown>;
      const logs = Array.isArray(currentConfig.event_log) ? currentConfig.event_log : [];

      const newLog = {
        id: `log-${Date.now()}`,
        event_type: "connect",
        status: "info",
        message: "Credenciais atualizadas no cofre AES-256-GCM. Homologação anterior invalidada até novo teste.",
        timestamp: new Date().toISOString(),
      };

      const updatedConfig = {
        ...currentConfig,
        merchant_id: merchantId.trim(),
        client_id_preview: maskSecretPreview(finalClientId),
        has_client_secret: true,
        event_log: [newLog, ...logs].slice(0, 20),
        updated_at: new Date().toISOString(),
      };
      delete (updatedConfig as Record<string, unknown>).client_id;
      delete (updatedConfig as Record<string, unknown>).client_secret;

      // GATE B: Alterar credenciais ou vínculo de loja INVALIDA homologação anterior
      // auto_accept_orders é desativado obrigatoriamente
      const nextState = "credentials_saved";

      const { error: channelErr } = await adminClient.from("delivery_channels").upsert(
        {
          workspace_id: workspaceId,
          channel_name: channelName,
          display_name: channelName === "ifood" ? "iFood Marketplace" : "99Food Restaurante",
          is_active: true,
          status: "pending_auth",
          connection_state: nextState,
          auto_accept_orders: false, // Homologação resetada: auto-aceite bloqueado
          config: updatedConfig,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,channel_name" }
      );

      if (channelErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha ao atualizar canal público: ${channelErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Credenciais armazenadas no cofre seguro. Execute o teste de conexão para homologar o canal.",
          state: nextState,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "test_connection") {
      // 1. Busca credenciais diretamente do cofre secreto
      const { data: secretRow, error: fetchSecretErr } = await adminClient
        .from("delivery_channel_secrets")
        .select("merchant_id, client_id, client_secret_encrypted")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      if (fetchSecretErr) {
        return new Response(
          JSON.stringify({
            success: false,
            http_status: 500,
            latency_ms: 0,
            state: "error",
            message: `Falha na consulta do cofre: ${fetchSecretErr.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const finalMerchantId = body.merchant_id?.trim() || secretRow?.merchant_id;
      const finalClientId = body.client_id?.trim() || secretRow?.client_id;

      let rawSecret: string | null = null;
      if (body.client_secret && body.client_secret.trim().length > 0) {
        rawSecret = body.client_secret.trim();
      } else if (secretRow?.client_secret_encrypted) {
        try {
          rawSecret = await decryptVaultSecret(secretRow.client_secret_encrypted, masterSecret);
        } catch {
          return new Response(
            JSON.stringify({
              success: false,
              http_status: 500,
              latency_ms: 0,
              state: "error",
              message: "Falha na descriptografia do cofre: chave inválida ou adulteração de dados.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (!finalMerchantId || !finalClientId || !rawSecret) {
        return new Response(
          JSON.stringify({
            success: false,
            http_status: 400,
            latency_ms: 0,
            state: "not_configured",
            message: "Credenciais incompletas: cadastre Merchant ID, Client ID e Client Secret.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const startTime = Date.now();
      let httpStatus = 0;
      let latencyMs = 0;
      let isSuccess = false;
      let connectionState:
        | "homologated"
        | "auth_approved"
        | "merchant_auth_pending"
        | "merchant_authorized"
        | "homologation_pending"
        | "insufficient_scopes"
        | "credentials_saved"
        | "error" = "credentials_saved";
      let feedbackMsg = "";

      if (channelName === "ifood") {
        try {
          // Etapa 1: Obtenção do Token OAuth via Client Credentials
          const authParams = new URLSearchParams({
            grantType: "client_credentials",
            clientId: finalClientId,
            clientSecret: rawSecret,
          });

          const resp = await fetch("https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "Wallet-App/2.1 (Integration Handshake)",
            },
            body: authParams.toString(),
            signal: AbortSignal.timeout(10000),
          });

          latencyMs = Date.now() - startTime;
          httpStatus = resp.status;

          if (resp.ok) {
            const tokenData = await resp.json().catch(() => ({}));
            const accessToken = tokenData.accessToken;

            if (accessToken) {
              // Criptografa e armazena o access token no cofre
              const encryptedToken = await encryptVaultSecret(accessToken, masterSecret, "v1");
              const expiresIn = typeof tokenData.expiresIn === "number" ? tokenData.expiresIn : 3600;
              const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

              const { error: tokenSaveErr } = await adminClient
                .from("delivery_channel_secrets")
                .update({
                  access_token_encrypted: encryptedToken,
                  token_expires_at: expiresAt,
                  updated_at: new Date().toISOString(),
                })
                .eq("workspace_id", workspaceId)
                .eq("channel_name", channelName);

              if (tokenSaveErr) {
                return new Response(
                  JSON.stringify({
                    success: false,
                    error: `Falha ao persistir token no cofre: ${tokenSaveErr.message}`,
                  }),
                  { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }

              // GATE B: Validação de Escopos Concedidos
              const scopesRaw = tokenData.scope || tokenData.scopes || "";
              const scopesList = typeof scopesRaw === "string" ? scopesRaw.split(" ") : Array.isArray(scopesRaw) ? scopesRaw : [];
              const hasOrderScope = scopesList.length === 0 || scopesList.some((s: string) => s.includes("order"));

              if (scopesList.length > 0 && !hasOrderScope) {
                isSuccess = false;
                connectionState = "insufficient_scopes";
                feedbackMsg = "Token autenticado no iFood, porém a aplicação não possui escopos de pedidos (orders:read/orders:status).";
              } else {
                // Etapa 2: Validação Real de Autorização e Status Operacional do Merchant (Gate B)
                try {
                  const statusResp = await fetch(
                    `https://merchant-api.ifood.com.br/merchant/v1.0/merchants/${finalMerchantId}/status`,
                    {
                      method: "GET",
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "User-Agent": "Wallet-App/2.1 (Merchant Status Check)",
                      },
                      signal: AbortSignal.timeout(6000),
                    }
                  );

                  if (statusResp.ok) {
                    const statusData = await statusResp.json().catch(() => null);

                    // Contrato oficial iFood: statusData é um array de operações
                    if (Array.isArray(statusData) && statusData.length > 0) {
                      const deliveryOp = statusData.find((op: Record<string, unknown>) => op.operation === "DELIVERY") || statusData[0];
                      const opState = String(deliveryOp?.state || "").toUpperCase();

                      if (opState === "OK") {
                        isSuccess = true;
                        connectionState = "homologated";
                        feedbackMsg = `Conexão e loja homologadas com sucesso no iFood em ${latencyMs}ms (Operação: ${deliveryOp.operation || 'DELIVERY'}, Estado: OK).`;
                      } else if (opState === "CLOSED" || opState === "PAUSED") {
                        // Loja autorizada pelo merchant mas fechada/pausada operacionalmente
                        isSuccess = false;
                        connectionState = "merchant_authorized";
                        feedbackMsg = `Loja vinculada e autorizada no iFood, porém atualmente fechada/pausada (${opState}). Homologação operacional pendente de abertura.`;
                      } else {
                        // Outros estados restritivos
                        isSuccess = false;
                        connectionState = "merchant_auth_pending";
                        feedbackMsg = `Loja no iFood retornou estado operacional restritivo (${opState}).`;
                      }
                    } else {
                      // Resposta 200 porém sem operações válidas
                      isSuccess = false;
                      connectionState = "auth_approved";
                      feedbackMsg = "Autenticação iFood concedida. Operações da loja retornaram vazias ou inconclusivas.";
                    }
                  } else if (statusResp.status === 401 || statusResp.status === 403) {
                    isSuccess = false;
                    connectionState = "merchant_auth_pending";
                    feedbackMsg = "Credenciais autenticadas no iFood, porém a loja ainda não autorizou o aplicativo no Portal do Parceiro.";
                  } else if (statusResp.status === 404) {
                    isSuccess = false;
                    connectionState = "merchant_auth_pending";
                    feedbackMsg = `Loja ${finalMerchantId} não encontrada ou não vinculada a esta aplicação no iFood.`;
                  } else {
                    isSuccess = false;
                    connectionState = "auth_approved";
                    feedbackMsg = `Autenticação iFood concedida. Verificação da loja retornou status HTTP ${statusResp.status}.`;
                  }
                } catch {
                  isSuccess = false;
                  connectionState = "auth_approved";
                  feedbackMsg = "Autenticação iFood concedida. Consulta de status da loja indisponível no momento.";
                }
              }
            } else {
              isSuccess = false;
              connectionState = "credentials_saved";
              feedbackMsg = "Resposta de autenticação do iFood não continha token de acesso válido.";
            }
          } else if (resp.status === 400 || resp.status === 401) {
            isSuccess = false;
            connectionState = "credentials_saved";
            feedbackMsg = `Credenciais rejeitadas pelo iFood (${httpStatus} Unauthorized): Verifique Client ID e Client Secret.`;
          } else {
            isSuccess = false;
            connectionState = "error";
            feedbackMsg = `Servidor do iFood retornou status ${httpStatus} em ${latencyMs}ms.`;
          }
        } catch {
          latencyMs = Date.now() - startTime;
          httpStatus = 504;
          isSuccess = false;
          connectionState = "error";
          feedbackMsg = `Tempo limite ou erro de rede ao conectar com o iFood (${latencyMs}ms).`;
        }
      } else if (channelName === "99food") {
        try {
          // GATE B: Contrato oficial 99Food Open Platform v2
          const resp = await fetch("https://open-api.99app.com/food/v2/oauth/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Wallet-App/2.1 (99Food Handshake)",
            },
            body: JSON.stringify({
              app_key: finalClientId,
              app_secret: rawSecret,
              shop_id: finalMerchantId,
            }),
            signal: AbortSignal.timeout(10000),
          });

          latencyMs = Date.now() - startTime;
          httpStatus = resp.status;

          if (resp.ok) {
            const data = await resp.json().catch(() => ({}));
            // Contrato 99Food: errno === 0 indica token emitido com sucesso
            if (data?.errno === 0 && data?.data?.access_token) {
              // Verifica se a loja está expressamente ativa e certificada no retorno oficial
              const shopInfo = data?.data?.shop_info;
              if (shopInfo && (shopInfo.status === 1 || shopInfo.is_active === true)) {
                isSuccess = true;
                connectionState = "homologated";
                feedbackMsg = `Conexão homologada com sucesso na 99Food em ${latencyMs}ms (Loja Ativa).`;
              } else {
                // Situação inconclusiva ou aguardando liberação operacional da equipe 99Food
                isSuccess = false;
                connectionState = "homologation_pending";
                feedbackMsg = "Credenciais autenticadas via 99Food Open Platform. Aguardando homologação e vínculo oficial da loja pela equipe da 99Food.";
              }
            } else {
              isSuccess = false;
              connectionState = "credentials_saved";
              feedbackMsg = `Falha na autenticação 99Food: ${data?.errmsg || 'Código de retorno ' + data?.errno}`;
            }
          } else if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
            isSuccess = false;
            connectionState = "credentials_saved";
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

      // GATE C: Atualiza canal no banco com verificação estrita de erros
      const testedAt = new Date().toISOString();
      const { data: currentCh, error: currentChErr } = await adminClient
        .from("delivery_channels")
        .select("config, auto_accept_orders")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      if (currentChErr) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Falha ao carregar canal para teste: ${currentChErr.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cfg = (currentCh?.config && typeof currentCh.config === "object" ? currentCh.config : {}) as Record<string, unknown>;
      const existingLogs = Array.isArray(cfg.event_log) ? cfg.event_log : [];

      const testLog = {
        id: `test-${Date.now()}`,
        event_type: "test",
        status: isSuccess ? "success" : connectionState.includes("pending") || connectionState.includes("approved") ? "warning" : "error",
        message: `Teste HTTP (${latencyMs}ms, status ${httpStatus}): ${feedbackMsg}`,
        timestamp: testedAt,
      };

      // auto_accept_orders SÓ pode permanecer ativo se for comprovadamente homologado
      const autoAcceptAllowed = connectionState === "homologated" ? Boolean(currentCh?.auto_accept_orders) : false;

      const { error: updateChannelErr } = await adminClient
        .from("delivery_channels")
        .update({
          connection_state: connectionState,
          status: isSuccess ? "active" : "pending_auth",
          auto_accept_orders: autoAcceptAllowed,
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

      if (updateChannelErr) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Falha ao atualizar estado do canal no banco: ${updateChannelErr.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
      // GATE C: Purga credenciais do cofre com verificação estrita de erro
      const { error: delErr } = await adminClient
        .from("delivery_channel_secrets")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName);

      if (delErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha ao purgar credenciais do cofre: ${delErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Desativa canal e limpa metadados públicos
      const { data: currentCh, error: chErr } = await adminClient
        .from("delivery_channels")
        .select("config")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      if (chErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha ao consultar canal para desconexão: ${chErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cfg = (currentCh?.config && typeof currentCh.config === "object" ? currentCh.config : {}) as Record<string, unknown>;
      const existingLogs = Array.isArray(cfg.event_log) ? cfg.event_log : [];

      const disconnectLog = {
        id: `disconnect-${Date.now()}`,
        event_type: "disconnect",
        status: "info",
        message: "Canal desconectado e credenciais purgadas do cofre do servidor.",
        timestamp: new Date().toISOString(),
      };

      const updatedConfig: Record<string, unknown> = {
        ...cfg,
        has_client_secret: false,
        client_id_preview: null,
        event_log: [disconnectLog, ...existingLogs].slice(0, 20),
      };
      delete updatedConfig.client_id;
      delete updatedConfig.client_secret;
      delete updatedConfig.merchant_id;
      delete updatedConfig.encrypted_secret;

      const { error: upErr } = await adminClient
        .from("delivery_channels")
        .update({
          connection_state: "disconnected",
          status: "pending_auth",
          is_active: false,
          auto_accept_orders: false,
          config: updatedConfig,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName);

      if (upErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha ao desativar canal no banco: ${upErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
