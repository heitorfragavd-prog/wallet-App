import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import {
  encryptVaultSecret,
  decryptVaultSecret,
  validateMasterVaultKey,
} from "../_shared/vault-crypto.ts";

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

    // GATE 3: Validação da chave mestra dedicada MARKETPLACE_VAULT_KEY (formato verificável de 256 bits)
    const masterSecret = Deno.env.get("MARKETPLACE_VAULT_KEY");
    const keyValidation = validateMasterVaultKey(masterSecret);
    if (!keyValidation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Chave mestre de cofre não configurada ou inválida (MARKETPLACE_VAULT_KEY): ${keyValidation.reason}. Ação abortada por segurança.`,
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
    if (action === "get_metadata") {
      const { data: meta, error: metaErr } = await adminClient.rpc("get_delivery_channel_metadata", {
        p_workspace_id: workspaceId,
        p_channel_name: channelName,
      });

      if (metaErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha ao obter metadados: ${metaErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, metadata: meta?.[0] || null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

      // Consulta se já existem credenciais prévias no cofre para preservar client_id se mascarado
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

      // GATE 1: Persistência ATÔMICA via RPC transacional restrita a service_role
      const { data: saveResult, error: rpcErr } = await adminClient.rpc("save_delivery_channel_vault_atomic", {
        p_workspace_id: workspaceId,
        p_channel_name: channelName,
        p_merchant_id: merchantId.trim(),
        p_client_id: finalClientId,
        p_key_id: "v1",
        p_client_secret_encrypted: finalEncryptedSecret,
        p_environment: "production",
      });

      if (rpcErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha ao persistir no cofre transacional: ${rpcErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: saveResult?.message || "Credenciais armazenadas no cofre seguro. Execute o teste de conexão para homologar o canal.",
          state: saveResult?.state || "credentials_saved",
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

      // Consulta estado prévio do canal para preservar homologação comprovada
      const { data: currentChannel } = await adminClient
        .from("delivery_channels")
        .select("connection_state, auto_accept_orders, config")
        .eq("workspace_id", workspaceId)
        .eq("channel_name", channelName)
        .maybeSingle();

      const currentConfig = (currentChannel?.config && typeof currentChannel.config === "object"
        ? currentChannel.config
        : {}) as Record<string, unknown>;

      const officialHomologation = currentConfig.official_homologation && typeof currentConfig.official_homologation === "object"
        ? (currentConfig.official_homologation as Record<string, unknown>)
        : null;

      // Homologação prévia SOMENTE é preservada se existir evidência confiável explícita de aprovação oficial
      const hasReliableHomologationEvidence = Boolean(
        (officialHomologation?.approved === true || currentConfig.is_officially_homologated === true) &&
        currentChannel?.connection_state === "homologated"
      );

      // GATE 1 & GATE 2: Identificar se o teste utiliza credenciais temporárias não salvas no cofre
      const hasAdHocMerchant = body.merchant_id && body.merchant_id.trim() !== secretRow?.merchant_id;
      const hasAdHocClient = body.client_id && !body.client_id.includes("••••") && body.client_id.trim() !== secretRow?.client_id;
      const hasAdHocSecret = Boolean(body.client_secret && body.client_secret.trim().length > 0);
      const isDryRun = hasAdHocMerchant || hasAdHocClient || hasAdHocSecret || !secretRow;

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
      let operationalStatus: string | null = null;
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
      let verifiedScopes: string[] = [];

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
              // Criptografa e armazena o access token no cofre apenas se não for dry-run
              if (!isDryRun) {
                const encryptedToken = await encryptVaultSecret(accessToken, masterSecret, "v1");
                const expiresIn = typeof tokenData.expiresIn === "number" ? tokenData.expiresIn : 3600;
                const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

                await adminClient
                  .from("delivery_channel_secrets")
                  .update({
                    access_token_encrypted: encryptedToken,
                    token_expires_at: expiresAt,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("workspace_id", workspaceId)
                  .eq("channel_name", channelName);
              }

              // GATE 2: Validação Estrita de Escopos Concedidos
              // Escopos ausentes devem ser tratados como NÃO verificados / insuficientes, NUNCA autorizados por presunção
              const scopesRaw = tokenData.scope || tokenData.scopes;
              if (!scopesRaw) {
                isSuccess = false;
                connectionState = "insufficient_scopes";
                feedbackMsg = "Token emitido pelo iFood sem escopos explícitos comprovados (insufficient_scopes). Homologação requer escopos de pedidos.";
              } else {
                const scopesList = typeof scopesRaw === "string"
                  ? scopesRaw.split(" ").map((s: string) => s.trim()).filter(Boolean)
                  : Array.isArray(scopesRaw)
                  ? scopesRaw.map((s: unknown) => String(s).trim()).filter(Boolean)
                  : [];
                verifiedScopes = scopesList;

                const hasOrderScope = scopesList.some((s: string) =>
                  s.includes("order") || s.includes("merchant:order") || s.includes("orders:read")
                );

                if (!hasOrderScope) {
                  isSuccess = false;
                  connectionState = "insufficient_scopes";
                  feedbackMsg = "Token autenticado no iFood, porém a aplicação não possui escopos de pedidos (orders:read/orders:status).";
                } else {
                  // Etapa 2: Validação Real de Autorização do Merchant e Status Operacional (GATE 2)
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
                        operationalStatus = opState;

                        // GATE 2: Separar homologação oficial do aplicativo da disponibilidade operacional da loja.
                        // Homologado SOMENTE se houver evidência confiável prévia de aprovação oficial.
                        if (hasReliableHomologationEvidence) {
                          isSuccess = true;
                          connectionState = "homologated";
                          if (opState === "OK") {
                            feedbackMsg = `Conexão e aplicativo oficialmente homologados no iFood em ${latencyMs}ms (Loja Operacional: OK).`;
                          } else if (opState === "CLOSED" || opState === "PAUSED") {
                            feedbackMsg = `Homologação oficial comprovada preservada no iFood. Loja atualmente fechada/pausada operacionalmente (${opState}).`;
                          } else {
                            isSuccess = false;
                            connectionState = "merchant_auth_pending";
                            feedbackMsg = `Loja no iFood retornou estado operacional restritivo (${opState}). Homologação operacional pendente.`;
                          }
                        } else {
                          // Sem evidência confiável prévia, loja vinculada é 'merchant_authorized', NUNCA 'homologated'
                          if (opState === "OK" || opState === "CLOSED" || opState === "PAUSED") {
                            isSuccess = true;
                            connectionState = "merchant_authorized";
                            feedbackMsg = `Loja vinculada e autorizada no iFood em ${latencyMs}ms (Estado Operacional: ${opState}). Homologação oficial do aplicativo pendente de aprovação pela equipe do iFood Developer.`;
                          } else {
                            isSuccess = false;
                            connectionState = "merchant_auth_pending";
                            feedbackMsg = `Loja no iFood retornou estado operacional restritivo (${opState}). Homologação operacional pendente.`;
                          }
                        }
                      } else {
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
          // GATE 2: Contrato oficial 99Food Open Platform v2
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
              const shopInfo = data?.data?.shop_info;
              if (shopInfo) {
                const isActive = shopInfo.status === 1 || shopInfo.is_active === true;
                operationalStatus = isActive ? "OPEN" : (shopInfo.status === 2 ? "CLOSED" : "PAUSED");

                if (hasReliableHomologationEvidence) {
                  isSuccess = true;
                  connectionState = "homologated";
                  feedbackMsg = isActive
                    ? `Conexão oficialmente homologada na 99Food em ${latencyMs}ms (Loja Ativa: OPEN).`
                    : `Homologação oficial comprovada preservada na 99Food. Loja atualmente fechada/pausada (${operationalStatus}).`;
                } else {
                  // Sem evidência confiável prévia, loja vinculada é 'merchant_authorized', NUNCA 'homologated'
                  isSuccess = true;
                  connectionState = "merchant_authorized";
                  feedbackMsg = `Loja vinculada e autorizada na 99Food em ${latencyMs}ms (Estado: ${operationalStatus}). Homologação oficial do aplicativo pendente de aprovação pela equipe da 99Food.`;
                }
              } else {
                isSuccess = false;
                connectionState = "homologation_pending";
                feedbackMsg = "Credenciais autenticadas via 99Food Open Platform. Aguardando vinculação e confirmação oficial da loja pela equipe da 99Food.";
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

      // GATE 1 & GATE 2: Testes com credenciais temporárias (dry-run) NÃO alteram o estado persistente do canal no banco!
      if (isDryRun) {
        return new Response(
          JSON.stringify({
            success: isSuccess,
            http_status: httpStatus,
            latency_ms: latencyMs,
            state: connectionState,
            operational_status: operationalStatus,
            scopes: verifiedScopes,
            is_dry_run: true,
            message: `[MODO SIMULAÇÃO] ${feedbackMsg} Salve as credenciais no cofre para registrar a homologação definitiva.`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // GATE 1 & GATE 2: Atualiza canal de forma atômica no banco via RPC exclusiva de service_role
      const { error: rpcTestErr } = await adminClient.rpc("record_delivery_channel_test_atomic", {
        p_workspace_id: workspaceId,
        p_channel_name: channelName,
        p_connection_state: connectionState,
        p_is_success: isSuccess,
        p_http_status: httpStatus,
        p_latency_ms: latencyMs,
        p_feedback_msg: feedbackMsg,
        p_operational_status: operationalStatus,
        p_scopes: verifiedScopes.length > 0 ? verifiedScopes : null,
      });

      if (rpcTestErr) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Falha ao registrar teste atômico no banco: ${rpcTestErr.message}`,
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
          operational_status: operationalStatus,
          scopes: verifiedScopes,
          message: feedbackMsg,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "disconnect") {
      // GATE 1: Desconexão e purga ATÔMICA via RPC transacional exclusiva de service_role
      const { error: rpcDiscErr } = await adminClient.rpc("disconnect_delivery_marketplace", {
        p_workspace_id: workspaceId,
        p_channel_name: channelName,
      });

      if (rpcDiscErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha na desconexão atômica: ${rpcDiscErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Canal desconectado com sucesso e credenciais purgadas do cofre via transação atômica.",
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
