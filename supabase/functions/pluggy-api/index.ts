// Supabase Edge Function: pluggy-api
// Proxy seguro e autenticado para a API da Pluggy (Open Finance).
// As credenciais (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET) existem SOMENTE no servidor
// e nunca são expostas ao frontend. Cada requisição exige autenticação JWT e validação
// de propriedade por workspace_id e item_id.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── CONFIGURAÇÃO DE CORS COM ALLOWLIST ───
const ALLOWED_ORIGINS_DEFAULT = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const envAllowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowList = [...ALLOWED_ORIGINS_DEFAULT, ...envAllowed];

  const isAllowed = allowList.includes(origin) || origin.endsWith(".supabase.co") || origin.endsWith(".lovable.app");
  const allowOrigin = isAllowed ? origin : (envAllowed[0] || ALLOWED_ORIGINS_DEFAULT[0]);

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function maskId(id?: string | null): string {
  if (!id) return "NULL";
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

// ─── GERAÇÃO DETERMINÍSTICA E NÃO-REVERSÍVEL DE clientUserId ───
async function generateClientUserId(userId: string, workspaceId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`wallet_pluggy_v1_${userId}_${workspaceId}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `usr_${hashHex.slice(0, 28)}`;
}

function fetchWithTimeout(url: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 15000, ...fetchInit } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchInit, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ─── AUTENTICAÇÃO COM A PLUGGY (SERVER-SIDE ONLY) ───
async function getPluggyApiKey(): Promise<string> {
  const clientId = (Deno.env.get("PLUGGY_CLIENT_ID") ?? "").trim();
  const clientSecret = (Deno.env.get("PLUGGY_CLIENT_SECRET") ?? "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais da Pluggy (PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET) não configuradas no servidor.");
  }

  let resp: Response;
  try {
    resp = await fetchWithTimeout("https://api.pluggy.ai/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
      timeout: 15000,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("timeout")) {
      throw new Error("Tempo limite excedido ao autenticar na Pluggy.");
    }
    throw new Error(`Erro de conexão com a Pluggy: ${msg}`);
  }

  if (resp.status === 429) {
    throw new Error("Limite de requisições da Pluggy atingido (Rate Limit 429). Tente novamente em instantes.");
  }

  const rawBody = await resp.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`Resposta inválida da autenticação Pluggy (status ${resp.status}).`);
  }

  if (!resp.ok || !data.apiKey) {
    const errorMsg = data.message || data.error || data.detail || `Falha na autenticação Pluggy (status ${resp.status})`;
    throw new Error(String(errorMsg));
  }

  return String(data.apiKey);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { success: false, error: `Método ${req.method} não permitido` }, 405);
  }

  try {
    // 1. Validação de Autenticação JWT do Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(req, { success: false, error: "Token de autenticação ausente." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(req, { success: false, error: "Configuração do Supabase ausente no servidor." }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse(req, { success: false, error: "Usuário não autenticado ou token inválido." }, 401);
    }

    const userId = user.id;

    // 2. Leitura do Payload e Validação de Workspace
    const requestBody = await req.json().catch(() => ({}));
    const { action, workspace_id, itemId, ...params } = requestBody;

    if (!action) {
      return jsonResponse(req, { success: false, error: "Parâmetro 'action' é obrigatório." }, 400);
    }

    if (!workspace_id) {
      return jsonResponse(req, { success: false, error: "Parâmetro 'workspace_id' é obrigatório." }, 400);
    }

    // 3. Validação de Acesso ao Workspace
    const { data: hasAccess } = await supabaseAdmin
      .rpc("tem_acesso_workspace", { p_workspace_id: workspace_id })
      .maybeSingle();

    let authorized = hasAccess === true;

    if (!authorized) {
      // Fallback de verificação direta no banco
      const { data: wsDirect } = await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("id", workspace_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (wsDirect) {
        authorized = true;
      }
    }

    if (!authorized) {
      console.warn(`[pluggy-api] Acesso negado: user=${maskId(userId)} workspace=${maskId(workspace_id)}`);
      return jsonResponse(req, { success: false, error: "Acesso negado ao workspace especificado." }, 403);
    }

    // 4. Execução das Ações Seguras
    switch (action) {
      // ─── GERAÇÃO DE CONNECT TOKEN COM CLIENT USER ID DERIVADO ───
      case "getConnectToken": {
        const apiKey = await getPluggyApiKey();
        const clientUserId = await generateClientUserId(userId, workspace_id);

        let tokenRes: Response;
        try {
          tokenRes = await fetchWithTimeout("https://api.pluggy.ai/connect_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": apiKey,
            },
            body: JSON.stringify({
              options: {
                clientUserId,
              },
            }),
            timeout: 15000,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Erro ao gerar Connect Token na Pluggy: ${msg}`);
        }

        if (tokenRes.status === 429) {
          return jsonResponse(req, { success: false, error: "Limite de requisições da Pluggy atingido." }, 429);
        }

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.accessToken) {
          const errDetail = tokenData.message || tokenData.error || "Falha ao gerar accessToken na Pluggy.";
          return jsonResponse(req, { success: false, error: String(errDetail) }, 400);
        }

        return jsonResponse(req, { success: true, data: { accessToken: tokenData.accessToken } });
      }

      // ─── REGISTRO E VALIDAÇÃO SERVER-SIDE DO ITEM ───
      case "registerItem": {
        if (!itemId) {
          return jsonResponse(req, { success: false, error: "Parâmetro 'itemId' é obrigatório." }, 400);
        }

        const apiKey = await getPluggyApiKey();

        // 1. Valida na API da Pluggy se o item existe de fato
        let itemVerifyRes: Response;
        try {
          itemVerifyRes = await fetchWithTimeout(`https://api.pluggy.ai/items/${encodeURIComponent(String(itemId))}`, {
            headers: { "X-API-KEY": apiKey },
            timeout: 15000,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return jsonResponse(req, { success: false, error: `Erro ao consultar Item na Pluggy: ${msg}` }, 500);
        }

        if (!itemVerifyRes.ok) {
          return jsonResponse(req, { success: false, error: "Item Pluggy não encontrado ou inválido na instituição financeira." }, 400);
        }

        const itemRemoteData = await itemVerifyRes.json();
        const expectedClientUserId = await generateClientUserId(userId, workspace_id);

        // Se a Pluggy retornou clientUserId, valida se corresponde a este workspace/usuário
        if (itemRemoteData.clientUserId && itemRemoteData.clientUserId !== expectedClientUserId) {
          console.warn(`[pluggy-api] clientUserId mismatch: remote=${maskId(itemRemoteData.clientUserId)} expected=${maskId(expectedClientUserId)}`);
          return jsonResponse(req, { success: false, error: "O Item informado pertence a outra sessão ou usuário." }, 403);
        }

        // 2. Confere se o item já está registrado para outro workspace/usuário
        const { data: existingItem } = await supabaseAdmin
          .from("pluggy_items")
          .select("id, workspace_id, user_id")
          .eq("item_id", String(itemId))
          .maybeSingle();

        if (existingItem && (existingItem.workspace_id !== workspace_id || existingItem.user_id !== userId)) {
          return jsonResponse(req, { success: false, error: "Item já vinculado a outro workspace." }, 403);
        }

        const connectorId = params.connectorId ? Number(params.connectorId) : (itemRemoteData.connector?.id ?? null);
        const connectorName = params.connectorName ? String(params.connectorName) : (itemRemoteData.connector?.name ?? null);

        const { data: itemRecord, error: itemError } = await supabaseAdmin
          .from("pluggy_items")
          .upsert(
            {
              user_id: userId,
              workspace_id,
              item_id: String(itemId),
              connector_id: connectorId,
              connector_name: connectorName,
              client_user_id: expectedClientUserId,
              status: itemRemoteData.status || "UPDATED",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "item_id" }
          )
          .select()
          .single();

        if (itemError) {
          console.error(`[pluggy-api] Erro ao registrar item:`, itemError);
          return jsonResponse(req, { success: false, error: "Erro ao registrar Item no banco de dados." }, 500);
        }

        return jsonResponse(req, {
          success: true,
          data: {
            id: itemRecord.id,
            item_id: itemRecord.item_id,
            status: itemRecord.status,
            connector_name: itemRecord.connector_name,
          },
        });
      }

      // ─── CONSULTA DE CONTAS SANITIZADAS COM VALIDAÇÃO DE OWNERSHIP ───
      case "getAccounts": {
        if (!itemId) {
          return jsonResponse(req, { success: false, error: "Parâmetro 'itemId' é obrigatório." }, 400);
        }

        const { data: itemValid } = await supabaseAdmin
          .from("pluggy_items")
          .select("id")
          .eq("item_id", String(itemId))
          .eq("workspace_id", workspace_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!itemValid) {
          console.warn(`[pluggy-api] Item não autorizado: itemId=${maskId(itemId)} user=${maskId(userId)}`);
          return jsonResponse(req, { success: false, error: "Item não encontrado ou não pertence a este workspace." }, 403);
        }

        const apiKey = await getPluggyApiKey();
        const accRes = await fetchWithTimeout(`https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(String(itemId))}`, {
          headers: { "X-API-KEY": apiKey },
          timeout: 15000,
        });

        if (!accRes.ok) {
          const errBody = await accRes.json().catch(() => ({}));
          return jsonResponse(req, { success: false, error: errBody.message || `Erro ${accRes.status} ao buscar contas na Pluggy.` }, accRes.status);
        }

        const accData = await accRes.json();
        const rawAccounts = accData.results || accData.accounts || [];

        // Sanitização de campos retornados ao frontend
        const sanitizedAccounts = rawAccounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: a.balance,
          currencyCode: a.currencyCode,
          number: a.number ? `****${String(a.number).slice(-4)}` : undefined,
        }));

        return jsonResponse(req, { success: true, data: sanitizedAccounts });
      }

      // ─── CONSULTA DE TRANSAÇÕES SANITIZADAS COM VALIDAÇÃO DE OWNERSHIP ───
      case "getTransactions": {
        if (!itemId) {
          return jsonResponse(req, { success: false, error: "Parâmetro 'itemId' é obrigatório." }, 400);
        }

        const { data: itemValid } = await supabaseAdmin
          .from("pluggy_items")
          .select("id")
          .eq("item_id", String(itemId))
          .eq("workspace_id", workspace_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!itemValid) {
          return jsonResponse(req, { success: false, error: "Item não encontrado ou não pertence a este workspace." }, 403);
        }

        const apiKey = await getPluggyApiKey();
        const txRes = await fetchWithTimeout(`https://api.pluggy.ai/transactions?itemId=${encodeURIComponent(String(itemId))}`, {
          headers: { "X-API-KEY": apiKey },
          timeout: 15000,
        });

        if (!txRes.ok) {
          const errBody = await txRes.json().catch(() => ({}));
          return jsonResponse(req, { success: false, error: errBody.message || `Erro ${txRes.status} ao buscar transações na Pluggy.` }, txRes.status);
        }

        const txData = await txRes.json();
        const rawTransactions = txData.results || txData.transactions || [];

        const sanitizedTransactions = rawTransactions.map((t: any) => ({
          id: t.id,
          description: t.description,
          amount: t.amount,
          date: t.date,
          category: t.category,
          type: t.type,
        }));

        return jsonResponse(req, { success: true, data: sanitizedTransactions });
      }

      // ─── CONSULTA DE INVESTIMENTOS SANITIZADOS COM VALIDAÇÃO DE OWNERSHIP ───
      case "getInvestments": {
        if (!itemId) {
          return jsonResponse(req, { success: false, error: "Parâmetro 'itemId' é obrigatório." }, 400);
        }

        const { data: itemValid } = await supabaseAdmin
          .from("pluggy_items")
          .select("id")
          .eq("item_id", String(itemId))
          .eq("workspace_id", workspace_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!itemValid) {
          return jsonResponse(req, { success: false, error: "Item não encontrado ou não pertence a este workspace." }, 403);
        }

        const apiKey = await getPluggyApiKey();
        const invRes = await fetchWithTimeout(`https://api.pluggy.ai/investments?itemId=${encodeURIComponent(String(itemId))}`, {
          headers: { "X-API-KEY": apiKey },
          timeout: 15000,
        });

        if (!invRes.ok) {
          const errBody = await invRes.json().catch(() => ({}));
          return jsonResponse(req, { success: false, error: errBody.message || `Erro ${invRes.status} ao buscar investimentos na Pluggy.` }, invRes.status);
        }

        const invData = await invRes.json();
        const rawInvestments = invData.results || invData.investments || [];

        const sanitizedInvestments = rawInvestments.map((inv: any) => ({
          id: inv.id,
          name: inv.name,
          value: inv.value,
          type: inv.type,
          currencyCode: inv.currencyCode,
        }));

        return jsonResponse(req, { success: true, data: sanitizedInvestments });
      }

      // ─── SINCRONIZAÇÃO IDEMPOTENTE DE CONTAS E TRANSAÇÕES ───
      case "syncItem": {
        if (!itemId) {
          return jsonResponse(req, { success: false, error: "Parâmetro 'itemId' é obrigatório." }, 400);
        }

        const expectedClientUserId = await generateClientUserId(userId, workspace_id);

        // Confere se o item pertence a outro workspace
        const { data: existingItem } = await supabaseAdmin
          .from("pluggy_items")
          .select("id, workspace_id, user_id")
          .eq("item_id", String(itemId))
          .maybeSingle();

        if (existingItem && (existingItem.workspace_id !== workspace_id || existingItem.user_id !== userId)) {
          return jsonResponse(req, { success: false, error: "Item já vinculado a outro workspace." }, 403);
        }

        // Garante que o item está registrado no workspace
        await supabaseAdmin.from("pluggy_items").upsert(
          {
            user_id: userId,
            workspace_id,
            item_id: String(itemId),
            connector_name: params.connectorName ? String(params.connectorName) : null,
            client_user_id: expectedClientUserId,
            status: "UPDATED",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "item_id" }
        );

        const apiKey = await getPluggyApiKey();

        // 1. Busca contas na Pluggy
        const accRes = await fetchWithTimeout(`https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(String(itemId))}`, {
          headers: { "X-API-KEY": apiKey },
          timeout: 15000,
        });

        const accData = accRes.ok ? await accRes.json() : {};
        const accountsList = accData.results || accData.accounts || [];

        // 2. Busca transações na Pluggy
        const txRes = await fetchWithTimeout(`https://api.pluggy.ai/transactions?itemId=${encodeURIComponent(String(itemId))}`, {
          headers: { "X-API-KEY": apiKey },
          timeout: 15000,
        });

        const txData = txRes.ok ? await txRes.json() : {};
        const txList = txData.results || txData.transactions || [];

        // 3. Busca categorias existentes do usuário para match
        const { data: categoriasExistentes } = await supabaseAdmin
          .from("categorias")
          .select("id, nome")
          .eq("user_id", userId);

        const catMap = new Map<string, string>();
        (categoriasExistentes || []).forEach((c: { id: string; nome?: string }) => {
          if (c.nome) catMap.set(c.nome.toLowerCase().trim(), c.id);
        });

        let syncedAccountsCount = 0;
        let syncedTxCount = 0;

        for (const acc of accountsList) {
          let tipoConta = "conta_corrente";
          if (acc.type === "CREDIT") tipoConta = "cartao_credito";
          else if (acc.type === "SAVINGS") tipoConta = "poupanca";

          const nomeConta = params.connectorName ? `${params.connectorName} (${acc.name})` : acc.name;

          let diaFechamento = null;
          let diaVencimento = null;
          let limiteCredito = null;

          if (acc.creditData) {
            limiteCredito = acc.creditData.creditLimit ? Number(acc.creditData.creditLimit) : null;
            if (acc.creditData.balanceCloseDate) {
              const closeDay = parseInt(acc.creditData.balanceCloseDate.substring(8, 10));
              if (!isNaN(closeDay)) diaFechamento = closeDay;
            }
            if (acc.creditData.balanceDueDate) {
              const dueDay = parseInt(acc.creditData.balanceDueDate.substring(8, 10));
              if (!isNaN(dueDay)) diaVencimento = dueDay;
            }
          } else if (tipoConta === "cartao_credito") {
            limiteCredito = 5000;
            diaFechamento = 1;
            diaVencimento = 10;
          }

          // Inserção idempotente com verificação prévia de conta existente vinculada ao pluggy_account_id
          const { data: existingAccount } = await supabaseAdmin
            .from("contas_usuario")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("pluggy_account_id", acc.id)
            .maybeSingle();

          let targetAccountId = existingAccount?.id;

          if (!targetAccountId) {
            const { data: novaConta, error: accErr } = await supabaseAdmin
              .from("contas_usuario")
              .insert({
                user_id: userId,
                workspace_id,
                pluggy_account_id: acc.id,
                nome: nomeConta,
                tipo: tipoConta,
                saldo_inicial: Math.abs(acc.balance || 0),
                saldo_atual: Math.abs(acc.balance || 0),
                limite_credito: limiteCredito,
                dia_fechamento: diaFechamento,
                dia_vencimento: diaVencimento,
                cor: tipoConta === "cartao_credito" ? "#820AD1" : "#10B981",
              })
              .select("id")
              .single();

            if (accErr || !novaConta) {
              console.error("[pluggy-api] Erro ao criar conta:", accErr);
              continue;
            }
            targetAccountId = novaConta.id;
          } else {
            // Atualização idempotente da conta existente
            await supabaseAdmin
              .from("contas_usuario")
              .update({
                saldo_atual: Math.abs(acc.balance || 0),
                limite_credito: limiteCredito,
                dia_fechamento: diaFechamento,
                dia_vencimento: diaVencimento,
              })
              .eq("id", targetAccountId);
          }

          syncedAccountsCount++;

          // Inserção idempotente de transações
          if (txList.length > 0) {
            for (const tx of txList) {
              // Verifica se transação já existe por pluggy_transaction_id
              const { data: existingTx } = await supabaseAdmin
                .from("transacoes")
                .select("id")
                .eq("workspace_id", workspace_id)
                .eq("pluggy_transaction_id", tx.id)
                .maybeSingle();

              if (existingTx) {
                // Já sincronizada anteriormente, não duplica
                continue;
              }

              const isDespesa = tx.amount < 0 || tx.type === "DEBIT";
              const valorAbs = Math.abs(tx.amount || 0);
              const tipo = isDespesa ? "despesa" : "receita";
              const catNome = tx.category || (isDespesa ? "Despesas Diversas" : "Rendas Diversas");
              const catKey = catNome.toLowerCase().trim();

              let categoriaId = catMap.get(catKey);
              if (!categoriaId) {
                const { data: newCat } = await supabaseAdmin
                  .from("categorias")
                  .insert({
                    user_id: userId,
                    nome: catNome,
                    tipo,
                    cor: tipo === "receita" ? "#10B981" : "#F43F5E",
                    icone: "Tag",
                  })
                  .select("id")
                  .single();

                if (newCat) {
                  categoriaId = newCat.id;
                  catMap.set(catKey, newCat.id);
                }
              }

              const { error: insertTxErr } = await supabaseAdmin.from("transacoes").insert({
                user_id: userId,
                workspace_id,
                conta_id: targetAccountId,
                categoria_id: categoriaId || null,
                pluggy_transaction_id: tx.id,
                tipo,
                descricao: tx.description || "Transação Open Finance",
                valor: valorAbs,
                data: tx.date ? tx.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
                metodo_pagamento: tipoConta === "cartao_credito" ? "cartao_credito" : "pix",
                observacoes: `Importado via Pluggy Open Finance (${catNome})`,
              });

              if (!insertTxErr) {
                syncedTxCount++;
              }
            }
          }
        }

        return jsonResponse(req, {
          success: true,
          data: {
            accountsCount: syncedAccountsCount,
            transactionsCount: syncedTxCount,
            investmentsCount: 0,
          },
        });
      }

      default:
        return jsonResponse(req, { success: false, error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pluggy-api] Erro inesperado:", msg);
    return jsonResponse(req, { success: false, error: msg }, 500);
  }
});
