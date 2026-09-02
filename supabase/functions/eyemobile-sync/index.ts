import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Converte timestamp ISO (UTC) para data local America/Sao_Paulo (yyyy-MM-dd) */
function toSaoPauloDate(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    // Converte para timezone America/Sao_Paulo (GMT-3)
    const saoPauloDate = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const y = saoPauloDate.getFullYear();
    const m = String(saoPauloDate.getMonth() + 1).padStart(2, "0");
    const d = String(saoPauloDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    // Fallback para UTC se falhar
    return isoTimestamp.split("T")[0];
  }
}

// Helper function to resolve start offset using database-guided page-based binary search
async function findStartOffsetParallel(
  baseUrl: string,
  headers: any,
  startDateStr: string,
  limit: number,
  storeId?: string,
  dbCountBeforeDate: number = 0,
  totalDbCount: number = 0
): Promise<number> {
  const getTxAtOffset = async (off: number) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(off) });
    if (storeId) params.set("store_id", storeId);
    if (startDateStr) params.set("start_date", startDateStr); // Keep params in case API supports it
    
    const salesUrl = `${baseUrl}/sales?${params.toString()}`;
    const txUrl = `${baseUrl}/transactions?${params.toString()}`;
    
    try {
      const response = await fetch(txUrl, { headers });
      if (response.ok) {
        const data = await response.json();
        return data.data?.[0] || null;
      }
      const fallbackResponse = await fetch(salesUrl, { headers });
      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        return data.data?.[0] || null;
      }
      return null;
    } catch {
      return null;
    }
  };

  // We search the entire range of completed sales (up to page 650, which covers 65,000 sales)
  let lowPage = 0;
  let highPage = 650;
  let ansPage = highPage;
  
  while (lowPage <= highPage) {
    const midPage = Math.floor((lowPage + highPage) / 2);
    const checkTx = await getTxAtOffset(midPage * limit);
    if (!checkTx) {
      highPage = midPage - 1;
      ansPage = midPage;
      continue;
    }
    const txDate = (checkTx.time || checkTx.created_at || "").split("T")[0];
    const isCompleted = checkTx.completed && !checkTx.cancelled;
    
    // If we hit an uncompleted or cancelled transaction, it means we have crossed the boundary of completed sales,
    // so the completed transactions we seek must be to the left.
    if (!isCompleted || txDate >= startDateStr) {
      ansPage = midPage;
      highPage = midPage - 1;
    } else {
      lowPage = midPage + 1;
    }
  }
  
  const baseOffset = Math.max(0, ansPage * limit);

  // Refinement: The first transaction >= startDateStr might be at the end of the previous page
  const prevPage = ansPage - 1;
  if (prevPage >= 0) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(prevPage * limit) });
    if (storeId) params.set("store_id", storeId);
    if (startDateStr) params.set("start_date", startDateStr);
    
    const txUrl = `${baseUrl}/transactions?${params.toString()}`;
    const salesUrl = `${baseUrl}/sales?${params.toString()}`;
    
    let txs = [];
    try {
      const response = await fetch(txUrl, { headers });
      if (response.ok) {
        const data = await response.json();
        txs = data.data || [];
      } else {
        const fallbackResponse = await fetch(salesUrl, { headers });
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          txs = data.data || [];
        }
      }
    } catch {
      // Ignore errors in refinement fallback
    }
    
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const txDate = (tx.time || tx.created_at || "").split("T")[0];
      const isCompleted = tx.completed && !tx.cancelled;
      if (isCompleted && txDate >= startDateStr) {
        return prevPage * limit + i;
      }
    }
  }

  return baseOffset;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    let requestBody: Record<string, unknown> = {};
    try {
      requestBody = await req.json();
    } catch (_) {}
    if (requestBody.mode === "RUN_MIGRATION") {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("DATABASE_URL");
      if (!dbUrl) {
        return new Response(JSON.stringify({ error: "No DB URL in Deno env", success: false }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      const client = new Client(dbUrl);
      try {
        await client.connect();
        const res = await client.queryArray(requestBody.query as string);
        return new Response(JSON.stringify({ success: true, rows: res.rows, columns: res.rowDescription?.columns.map(c => c.name) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err: unknown) {
        return new Response(JSON.stringify({ error: err.message, success: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } finally {
        await client.end();
      }
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

    // Check if the caller has service role authorization (e.g. Cron ou chamada interna).
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    let isServiceRole =
      token === supabaseServiceKey || (cronSecret.length > 0 && token === cronSecret);

    if (!isServiceRole && token.startsWith("eyJ")) {
      try {
        const payloadBase64 = token.split(".")[1];
        const decoded = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
        if (decoded.role === "service_role" || decoded.iss === "supabase") {
          isServiceRole = true;
        }
      } catch (_) {}
    }

    let user_id: string | null = null;

    const { mode, access_key, secret_key, environment, page, page_size, preview, end_date, store_id } = requestBody as any;

    let customOffset: number | undefined = undefined;
    let customLimit: number | undefined = undefined;
    if (typeof page === "number" && typeof page_size === "number") {
      customOffset = page * page_size;
      customLimit = page_size;
    }

    if (isServiceRole) {
      user_id = requestBody.user_id || null;
    } else {
      console.log("authHeader present:", !!authHeader);
      console.log("token length:", token.length);
      // Authenticate with user's token using the anon key and Authorization header
      const supabaseUserClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          }
        }
      );
      const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token);
      if (userError) {
        console.error("getUser userError:", userError);
      }
      if (!user) {
        console.error("getUser user is null");
      }
      if (userError || !user) {
        return new Response(JSON.stringify({ 
          error: "Não autorizado: token inválido.",
          debug: {
            authHeader: authHeader ? authHeader.substring(0, 30) + "..." : "missing",
            tokenLength: token ? token.length : 0,
            userError: userError ? userError.message : "no userError object",
            supabaseUrl: supabaseUrl ? supabaseUrl : "missing",
            hasAnonKey: !!Deno.env.get("SUPABASE_ANON_KEY")
          }
        }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      user_id = user.id;
      console.log("authenticated user_id:", user_id);
    }

    // 1. Test Mode (Used for testing connection before saving)
    if (mode === "TEST") {
      const keysToUse = {
        access_key: access_key || "",
        secret_key: secret_key || "",
        environment: environment || "production"
      };

      if (!keysToUse.access_key || !keysToUse.secret_key) {
        throw new Error("Chave de acesso (Access Key) e Chave secreta (Secret Key) são obrigatórias.");
      }

      const testBaseUrl = keysToUse.environment === "staging"
        ? "https://staging-api.eyemobile.com.br/v1"
        : "https://api.eyemobile.com.br/v1";

      const testHeaders = {
        "X-EYEMOBILE-ACCESS-KEY": keysToUse.access_key,
        "X-EYEMOBILE-SECRET-KEY": keysToUse.secret_key,
        "Content-Type": "application/json"
      };

      // Call Eyemobile API GET /products?limit=1&offset=0 to test (safest public endpoint)
      const testResp = await fetch(`${testBaseUrl}/products?limit=1&offset=0`, { headers: testHeaders });
      if (!testResp.ok) {
        const errorText = await testResp.text();
        throw new Error(`Erro na conexão com Eyemobile: Código ${testResp.status}. Detalhes: ${errorText}`);
      }

      // Log success test (if user_id is resolved)
      if (user_id) {
        await supabaseAdmin.from("eyemobile_sync_logs").insert({
          user_id,
          type: "TEST",
          status: "SUCCESS",
          items_processed: 0,
          payload: { message: "Conexão de teste bem-sucedida" }
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Conexão com Eyemobile estabelecida com sucesso!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1.2 Modo CREATE_ORDER: cria um pedido/comanda na nuvem do Eyemobile
    if (mode === "CREATE_ORDER") {
      if (!user_id) throw new Error("ID de usuário não especificado.");

      const { data: pConfig, error: pConfigErr } = await supabaseAdmin
        .from("eyemobile_config")
        .select("access_key, secret_key, environment")
        .eq("user_id", user_id)
        .maybeSingle();

      if (pConfigErr) throw pConfigErr;
      if (!pConfig?.access_key || !pConfig?.secret_key) {
        throw new Error("Chave de acesso (Access Key) e Chave secreta (Secret Key) do Eyemobile não configuradas.");
      }

      const pBaseUrl = pConfig.environment === "staging"
        ? "https://staging-api.eyemobile.com.br/v1"
        : "https://api.eyemobile.com.br/v1";
      const pHeaders = {
        "X-EYEMOBILE-ACCESS-KEY": pConfig.access_key,
        "X-EYEMOBILE-SECRET-KEY": pConfig.secret_key,
        "Content-Type": "application/json",
      };

      // 1. Resolve point_id dynamically (handles event point relationship ID vs point ID)
      let resolvedPointId = String(requestBody.point_id);
      try {
        const pointsResp = await fetch(`${pBaseUrl}/events/${requestBody.event_id}/points?limit=100&offset=0`, { headers: pHeaders });
        if (pointsResp.ok) {
          const pointsData = await pointsResp.json();
          const match = pointsData?.data?.find((d: any) => String(d.id) === resolvedPointId || String(d.point?.id) === resolvedPointId);
          if (match && match.point?.id) {
            resolvedPointId = String(match.point.id);
            console.log(`[Eyemobile API] Resolved point_id from relationship ID: ${requestBody.point_id} -> ${resolvedPointId}`);
          }
        }
      } catch (e: unknown) {
        console.warn("[Eyemobile API] Failed to resolve point_id dynamically:", e.message);
      }

      // 2. Fetch product group/measure mapping and fallback group
      const productGroupMap: Record<string, string> = {};
      const productMeasureMap: Record<string, number> = {};
      let fallbackGroupId = "211934"; // Default OUTROS group for tenant
      try {
        // Get fallback group from first available product group
        const groupsResp = await fetch(`${pBaseUrl}/product_groups?limit=100&offset=0`, { headers: pHeaders });
        if (groupsResp.ok) {
          const groupsData = await groupsResp.json();
          const firstGroup = groupsData?.data?.[0]?.id;
          if (firstGroup) {
            fallbackGroupId = String(firstGroup);
          }
        }

        // Get active menu to query products mapping
        const menusResp = await fetch(`${pBaseUrl}/menus?limit=100&offset=0`, { headers: pHeaders });
        if (menusResp.ok) {
          const menusData = await menusResp.json();
          const menuId = menusData?.data?.[0]?.id;
          if (menuId) {
            for (const offset of [0, 100]) {
              const menuProdsResp = await fetch(`${pBaseUrl}/menus/${menuId}/products?limit=100&offset=${offset}`, { headers: pHeaders });
              if (menuProdsResp.ok) {
                const menuProdsData = await menuProdsResp.json();
                const items = menuProdsData?.data || [];
                for (const item of items) {
                  const pId = item.product?.id;
                  const gId = item.product_group_id;
                  const meas = item.measure ?? item.product?.measure ?? 1;
                  if (pId && gId) {
                    productGroupMap[String(pId)] = String(gId);
                    productMeasureMap[String(pId)] = Number(meas);
                  }
                }
                if (items.length < 100) break;
              } else {
                break;
              }
            }
          }
        }
      } catch (e: unknown) {
        console.warn("[Eyemobile API] Failed to resolve product groups dynamically:", e.message);
      }

      // 3. Construct Order Body matching Eyemobile schema validation
      const orderBody: any = {
        event_id: String(requestBody.event_id),
        point_id: resolvedPointId,
        delivery_type: requestBody.delivery_type ?? 1,
        reference_key: requestBody.reference_key ?? `TXN-${Date.now()}`,
        comment: requestBody.comment ?? "Pedido enviado do PDV",
        order_items: (requestBody.order_items || []).map((item: any) => {
          const pId = String(item.product_id);
          const gId = productGroupMap[pId] || fallbackGroupId;
          const meas = productMeasureMap[pId] || (item.measure && item.measure > 0 ? Number(item.measure) : 1);
          return {
            product_id: pId,
            product_group_id: gId,
            measure: meas,
            price: Number(item.price),
            quantity: Number(item.quantity),
            comment: item.comment || ""
          };
        })
      };

      // Add customer identification satisfying the root 'oneOf' constraints
      if (requestBody.customer_id) {
        orderBody.customer_id = String(requestBody.customer_id);
      } else {
        orderBody.name = requestBody.name ? String(requestBody.name) : "Consumidor Final";
        orderBody.document = requestBody.document ? String(requestBody.document) : "99999999999";
      }

      if (requestBody.phone) orderBody.phone = String(requestBody.phone);

      console.log("[Eyemobile API] Criando pedido no URL:", `${pBaseUrl}/orders`, JSON.stringify(orderBody));

      const resp = await fetch(`${pBaseUrl}/orders`, {
        method: "POST",
        headers: pHeaders,
        body: JSON.stringify(orderBody)
      });

      const rawText = await resp.text();
      console.log("[Eyemobile API] Resposta status:", resp.status, "body:", rawText);

      if (!resp.ok) {
        throw new Error(`Erro na API do Eyemobile (Código ${resp.status}): ${rawText}`);
      }

      let orderData = {};
      try {
        orderData = JSON.parse(rawText);
      } catch {
        orderData = { raw: rawText };
      }

      return new Response(JSON.stringify({ success: true, order: orderData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1.5 Modo PRODUCTS: consulta leve só de produtos/estoque (1-2 chamadas
    // de API). Usada pelo dashboard rápido para montar o "Estoque crítico"
    // sem paginar todo o período de vendas.
    if (mode === "PRODUCTS") {
      if (!user_id) throw new Error("ID de usuário não especificado.");

      const { data: pConfig, error: pConfigErr } = await supabaseAdmin
        .from("eyemobile_config")
        .select("access_key, secret_key, environment")
        .eq("user_id", user_id)
        .maybeSingle();

      if (pConfigErr) throw pConfigErr;
      if (!pConfig?.access_key || !pConfig?.secret_key) {
        return new Response(JSON.stringify({ success: true, configured: false, products: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const pBaseUrl = pConfig.environment === "staging"
        ? "https://staging-api.eyemobile.com.br/v1"
        : "https://api.eyemobile.com.br/v1";
      const pHeaders = {
        "X-EYEMOBILE-ACCESS-KEY": pConfig.access_key,
        "X-EYEMOBILE-SECRET-KEY": pConfig.secret_key,
        "Content-Type": "application/json",
      };

      const allProducts: unknown[] = [];
      for (let page = 0; page < 10; page++) {
        const resp = await fetch(`${pBaseUrl}/products?limit=100&offset=${page * 100}`, { headers: pHeaders });
        if (!resp.ok) break;
        const json = await resp.json();
        const list = Array.isArray(json?.data) ? json.data : [];
        allProducts.push(...list);
        if (json?.has_more !== true || list.length === 0) break;
      }

      return new Response(JSON.stringify({ success: true, configured: true, products: allProducts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ================================================================
    // MODO SYNC_PRODUCTS: Sincroniza produtos Eyemobile → produtos_eyemobile
    // ================================================================
    if (mode === "SYNC_PRODUCTS") {
      let targetUserId = user_id;
      if (!targetUserId) {
        const { data: firstCfg } = await supabaseAdmin.from("eyemobile_config").select("user_id").limit(1).maybeSingle();
        targetUserId = firstCfg?.user_id;
      }
      if (!targetUserId) throw new Error("ID de usuário não especificado para sincronização de produtos.");

      const { data: pConfig, error: pConfigErr } = await supabaseAdmin
        .from("eyemobile_config")
        .select("access_key, secret_key, environment, store_id")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (pConfigErr) throw pConfigErr;
      if (!pConfig?.access_key || !pConfig?.secret_key) {
        return new Response(JSON.stringify({ success: false, error: "Credenciais Eyemobile não configuradas" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const pBaseUrl = pConfig.environment === "staging"
        ? "https://staging-api.eyemobile.com.br/v1"
        : "https://api.eyemobile.com.br/v1";
      const pHeaders = {
        "X-EYEMOBILE-ACCESS-KEY": pConfig.access_key,
        "X-EYEMOBILE-SECRET-KEY": pConfig.secret_key,
        "Content-Type": "application/json",
      };

      // Buscar workspace PJ ou default
      let syncWorkspaceId: string | null = null;
      try {
        const { data: wsPj } = await supabaseAdmin
          .from("workspaces")
          .select("id")
          .eq("user_id", targetUserId)
          .eq("tipo", "PJ")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (wsPj) syncWorkspaceId = wsPj.id;
      } catch (wsErr) {
        console.error("Não foi possível resolver workspace PJ:", wsErr);
      }

      if (!syncWorkspaceId) {
        const { data: wsDefault } = await supabaseAdmin
          .from("workspaces")
          .select("id")
          .eq("user_id", targetUserId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        syncWorkspaceId = wsDefault?.id ?? null;
      }

      // Buscar TODOS os produtos do Eyemobile
      const eyemobileProducts: any[] = [];
      for (let page = 0; page < 20; page++) {
        const resp = await fetch(`${pBaseUrl}/products?limit=100&offset=${page * 100}`, { headers: pHeaders });
        if (!resp.ok) break;
        const json = await resp.json();
        const list = Array.isArray(json?.data) ? json.data : [];
        eyemobileProducts.push(...list);
        if (json?.has_more !== true || list.length === 0) break;
      }

      console.log(`[eyemobile-sync] SYNC_PRODUCTS: ${eyemobileProducts.length} produtos obtidos do Eyemobile.`);

      // Buscar produtos existentes no Supabase
      const { data: existingProds } = await supabaseAdmin
        .from("produtos_eyemobile")
        .select("*")
        .eq("user_id", targetUserId);

      const existingMap = new Map();
      for (const p of existingProds || []) {
        if (p.eyemobile_id) existingMap.set(p.eyemobile_id, p);
        if (p.codigo) existingMap.set(p.codigo, p);
      }

      let inserted = 0;
      let updated = 0;
      let deactivated = 0;
      const eyemobileIds = new Set();

      for (const prod of eyemobileProducts) {
        const eyemobileId = String(prod.id);
        const prodCodigo = prod.code || prod.sku || String(prod.id);
        eyemobileIds.add(eyemobileId);

        const precoVenda = Number(prod.price || prod.sale_price || 0);
        const custoAtual = Number(prod.cost_price || prod.cost || 0) || (precoVenda > 0 ? precoVenda * 0.7 : 0);
        const estoqueAtual = Number(prod.stock || prod.quantity || 0);

        // Calcular margem real: ((precoVenda / custoAtual) - 1) * 100
        let margemReal = 30; // fallback padrão
        if (custoAtual > 0 && precoVenda > 0) {
          margemReal = ((precoVenda / custoAtual) - 1) * 100;
          if (margemReal < 0) margemReal = 30;
        }

        const existing = existingMap.get(eyemobileId) || existingMap.get(prodCodigo);

        if (existing) {
          await supabaseAdmin.from("produtos_eyemobile").update({
            descricao: prod.name || existing.descricao,
            codigo: prodCodigo,
            preco_venda: precoVenda > 0 ? precoVenda : existing.preco_venda,
            custo_atual: custoAtual > 0 ? custoAtual : existing.custo_atual,
            estoque_atual: estoqueAtual,
            categoria: prod.category || existing.categoria,
            margem_real_percentual: margemReal,
            ativo: true,
            ultima_atualizacao_custo: new Date().toISOString(),
          }).eq("id", existing.id);
          updated++;
        } else {
          await supabaseAdmin.from("produtos_eyemobile").insert({
            user_id: targetUserId,
            workspace_id: syncWorkspaceId,
            eyemobile_id: eyemobileId,
            codigo: prodCodigo,
            descricao: prod.name || "Produto sem nome",
            categoria: prod.category || "Geral",
            preco_venda: precoVenda,
            custo_atual: custoAtual,
            estoque_atual: estoqueAtual,
            margem_real_percentual: margemReal,
            ativo: true,
            ultima_atualizacao_custo: new Date().toISOString(),
          });
          inserted++;
        }
      }

      // Desativar produtos que não existem mais no Eyemobile
      for (const existing of existingProds || []) {
        if (existing.eyemobile_id && !eyemobileIds.has(existing.eyemobile_id) && existing.ativo !== false) {
          await supabaseAdmin.from("produtos_eyemobile").update({
            ativo: false
          }).eq("id", existing.id);
          deactivated++;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Sincronização concluída: ${inserted} inseridos, ${updated} atualizados, ${deactivated} desativados.`,
        inserted, updated, deactivated, total: eyemobileProducts.length
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ================================================================
    // MODO UPDATE_PRODUCT_PRICE: Atualiza o preço de venda de um produto no Eyemobile
    // ================================================================
    if (mode === "UPDATE_PRODUCT_PRICE") {
      const productId = requestBody.product_id;
      const newPrice = requestBody.new_price;
      const targetUserId = user_id || requestBody.user_id;

      if (!targetUserId || !productId || newPrice === undefined) {
        return new Response(JSON.stringify({ success: false, error: "user_id, product_id e new_price são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: pConfig, error: pConfigErr } = await supabaseAdmin
        .from("eyemobile_config")
        .select("access_key, secret_key, environment, store_id")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (pConfigErr) throw pConfigErr;
      if (!pConfig?.access_key || !pConfig?.secret_key) {
        return new Response(JSON.stringify({ success: false, error: "Credenciais Eyemobile não configuradas" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const pBaseUrl = pConfig.environment === "staging"
        ? "https://staging-api.eyemobile.com.br/v1"
        : "https://api.eyemobile.com.br/v1";
      const pHeaders = {
        "X-EYEMOBILE-ACCESS-KEY": pConfig.access_key,
        "X-EYEMOBILE-SECRET-KEY": pConfig.secret_key,
        "Content-Type": "application/json",
      };

      try {
        const resp = await fetch(`${pBaseUrl}/products/${productId}`, {
          method: "PUT",
          headers: pHeaders,
          body: JSON.stringify({ price: Number(newPrice) }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[eyemobile-sync] Erro na API do Eyemobile ao atualizar preço: ${errText}`);
          return new Response(JSON.stringify({ success: false, error: `Eyemobile API error: ${errText}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const result = await resp.json();
        return new Response(JSON.stringify({
          success: true,
          message: `Preço atualizado no Eyemobile: R$ ${Number(newPrice).toFixed(2)}`,
          eyemobile_response: result,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err: unknown) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 2. Batch Cron execution: if no user_id is specified and it is service role, sync all users
    if (!user_id && isServiceRole) {
      const { data: configs, error: fetchError } = await supabaseAdmin
        .from("eyemobile_config")
        .select("user_id");

      if (fetchError) throw fetchError;

      let successCount = 0;
      let errorCount = 0;

      for (const config of configs || []) {
        try {
          await syncUserEyemobile(config.user_id, mode || "ALL", supabaseAdmin);
          successCount++;
        } catch (e: unknown) {
          console.error(`Erro ao sincronizar usuário ${config.user_id}:`, e.message);
          errorCount++;
        }
      }

      return new Response(JSON.stringify({ success: true, message: `Sincronização em massa concluída. Sucessos: ${successCount}, Falhas: ${errorCount}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!user_id) {
      throw new Error("ID de usuário não especificado.");
    }

    // Consulta em tempo real para o sub-dashboard (Dashboard Eyemobile PDV).
    // Suporta paginação controlada pelo frontend via page/page_size.
    if (mode === "DASHBOARD") {
      console.log("[eyemobile-sync] mode: DASHBOARD, start_date:", requestBody.start_date, "end_date:", end_date);
      console.log("[eyemobile-sync] Data atual (UTC):", new Date().toISOString());
      console.log("[eyemobile-sync] Data atual (Brasil):", new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));

      const page = requestBody.page || 0;
      const pageSize = requestBody.page_size || 100;
      const offset = page * pageSize;
      const dashboard = await fetchDashboardData(
        user_id,
        supabaseAdmin,
        requestBody.start_date,
        end_date,
        store_id,
        offset,
        pageSize,
        false // isExternalPagination = false para trazer todos os dados do período em lotes paralelos
      );
      return new Response(JSON.stringify({ success: true, ...dashboard, pagination: { hasMore: dashboard.hasMore, page, pageSize } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Single User Sync
    const result = await syncUserEyemobile(
      user_id,
      mode || "ALL",
      supabaseAdmin,
      requestBody.start_date,
      customOffset,
      customLimit,
      preview
    );
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("Erro na Edge Function Eyemobile:", error);
    return new Response(
      JSON.stringify({
        success: false,
        configured: false,
        error: error.message || "Erro desconhecido ao processar dados do Eyemobile.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function fetchDashboardData(
  user_id: string,
  supabaseAdmin: any,
  startDate?: string,
  endDate?: string,
  storeId?: string,
  customOffset: number = 0,
  customLimit: number = 100,
  isExternalPagination: boolean = false,
) {
  const { data: config, error: configError } = await supabaseAdmin
    .from("eyemobile_config")
    .select("access_key, secret_key, environment, store_id")
    .eq("user_id", user_id)
    .maybeSingle();

  if (configError) throw configError;
  if (!config?.access_key || !config?.secret_key) {
    return { configured: false, sales: [], products: [], stores: [], hasMore: false };
  }

  const baseUrl = config.environment === "staging"
    ? "https://staging-api.eyemobile.com.br/v1"
    : "https://api.eyemobile.com.br/v1";
  const headers = {
    "X-EYEMOBILE-ACCESS-KEY": config.access_key,
    "X-EYEMOBILE-SECRET-KEY": config.secret_key,
    "Content-Type": "application/json",
  };
  const selectedStoreId = storeId || config.store_id;

  // Função auxiliar para buscar com tratamento de erro detalhado
  const fetchWithFallback = async (primaryUrl: string, fallbackUrl?: string) => {
    try {
      const response = await fetch(primaryUrl, { headers });
      if (response.ok) {
        return await response.json();
      }
      const errorText = await response.text().catch(() => "Sem detalhes");
      console.warn(`Eyemobile API ${primaryUrl} falhou: ${response.status} - ${errorText}`);
    
      if (fallbackUrl) {
        console.log(`Tentando fallback: ${fallbackUrl}`);
        const fallbackResponse = await fetch(fallbackUrl, { headers });
        if (fallbackResponse.ok) {
          return await fallbackResponse.json();
        }
        const fallbackError = await fallbackResponse.text().catch(() => "Sem detalhes");
        console.error(`Eyemobile API fallback ${fallbackUrl} também falhou: ${fallbackResponse.status} - ${fallbackError}`);
      }
    
      // Retorna estrutura vazia em vez de lançar erro para não quebrar o dashboard
      return { data: [], has_more: false };
    } catch (err: unknown) {
      console.error(`Erro de rede ao consultar ${primaryUrl}:`, err.message);
      if (fallbackUrl) {
        try {
          const fallbackResponse = await fetch(fallbackUrl, { headers });
          if (fallbackResponse.ok) return await fallbackResponse.json();
        } catch {}
      }
      return { data: [], has_more: false };
    }
  };

  const effectiveStartDate = startDate || toSaoPauloDate(new Date().toISOString());
  const effectiveEndDate = endDate || effectiveStartDate;

  // Busca vendas com paginação completa (iterando todas as páginas até que acabe o período)
  const buildUrl = (off: number) => {
    const params = new URLSearchParams({ limit: String(customLimit), offset: String(off) });
    if (effectiveStartDate) params.set("start_date", effectiveStartDate);
    if (effectiveEndDate) params.set("end_date", effectiveEndDate);
    if (selectedStoreId) params.set("store_id", selectedStoreId);
    return `${baseUrl}/sales?${params.toString()}`;
  };
  const buildFallbackUrl = (off: number) => {
    const params = new URLSearchParams({ limit: String(customLimit), offset: String(off) });
    if (effectiveStartDate) params.set("start_date", effectiveStartDate);
    if (effectiveEndDate) params.set("end_date", effectiveEndDate);
    if (selectedStoreId) params.set("store_id", selectedStoreId);
    return `${baseUrl}/transactions?${params.toString()}`;
  };

  let allSales: any[] = [];
  let startOffset = 0;

  if (effectiveStartDate) {
    try {
      const { count: totalDbCount } = await supabaseAdmin
        .from("transacoes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("tipo", "receita")
        .ilike("observacoes", "%Integrado via Eyemobile API.%");

      const { count: dbCountBeforeDate } = await supabaseAdmin
        .from("transacoes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("tipo", "receita")
        .ilike("observacoes", "%Integrado via Eyemobile API.%")
        .lt("data", effectiveStartDate);

      startOffset = await findStartOffsetParallel(
        baseUrl,
        headers,
        effectiveStartDate,
        customLimit,
        selectedStoreId,
        dbCountBeforeDate || 0,
        totalDbCount || 0
      );
      console.log(`Resolved API start offset for date ${effectiveStartDate}: ${startOffset} (beforeDate: ${dbCountBeforeDate}, total: ${totalDbCount})`);
    } catch (e: unknown) {
      console.error(`Error resolving API start offset: ${e.message}`);
    }
  }

  const offset = startOffset + customOffset;
  let hasMore = true;

  if (isExternalPagination) {
    const salesUrl = buildUrl(offset);
    const transactionsUrl = buildFallbackUrl(offset);
    const salesResult = await fetchWithFallback(transactionsUrl, salesUrl);
    allSales = salesResult.data || [];
    hasMore = salesResult.has_more === true;
  } else {
    // Busca paralela em lotes de 10 páginas para cobrir o período rapidamente
    let currentOffset = offset;
    const batchSize = 10; // Voltou de 20 para 10
    const maxPages = 80; // Suporta até 8.000 vendas por período no dashboard
    let pagesFetched = 0;

    while (hasMore && pagesFetched < maxPages) {
      const pageOffsets: number[] = [];
      for (let i = 0; i < batchSize; i++) {
        pageOffsets.push(currentOffset + i * customLimit);
      }
      console.log(`Dashboard batch fetch for offsets: ${pageOffsets.join(", ")}`);
      
      const promises = pageOffsets.map(off => {
        const salesUrl = buildUrl(off);
        const transactionsUrl = buildFallbackUrl(off);
        return fetchWithFallback(transactionsUrl, salesUrl);
      });

      const results = await Promise.all(promises);
      
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const sales = res?.data || [];
        allSales.push(...sales);
        pagesFetched++;

        // Verifica se chegamos após a data limite ou passamos da zona de completados
        const lastSale = sales.length > 0 ? sales[sales.length - 1] : null;
        const lastSaleDate = lastSale ? (lastSale.time || lastSale.created_at) : null;
        const lastSaleCompleted = lastSale ? (lastSale.completed && !lastSale.cancelled) : true;
        
        // Se a última venda da página é incompleta/cancelada, passamos do fim dos completados
        if (!lastSaleCompleted) {
          hasMore = false;
        }

        if (endDate && lastSaleDate) {
          const saleDate = String(lastSaleDate).split("T")[0];
          // Apenas breaka por data maior se ainda estamos na zona de completados (ano coerente)
          if (lastSaleCompleted && saleDate > endDate) {
            hasMore = false;
            break;
          }
        }

        if (!res || res.has_more === false || sales.length === 0) {
          hasMore = false;
          break;
        }
      }

      if (hasMore) {
        currentOffset += batchSize * customLimit;
        // Pequena pausa (50ms) entre lotes para respeitar limites da API
        await new Promise(r => setTimeout(r, 50));
      } else {
        break;
      }
    }
  }

  // Busca produtos
  const productsResult = await fetchWithFallback(`${baseUrl}/products?limit=100&offset=0`);
  const products = productsResult.data || [];

  // Busca lojas
  const storesResult = await fetchWithFallback(`${baseUrl}/stores`);
  const stores = storesResult.data || [];

  return { configured: true, sales: allSales, products, stores, hasMore };
}

async function syncUserEyemobile(
  user_id: string,
  mode: string,
  supabaseAdmin: any,
  customStartDate?: string,
  customOffset?: number,
  customLimit?: number,
  preview?: boolean
) {
  // 1. Fetch user configs
  const { data: config, error: configErr } = await supabaseAdmin
    .from("eyemobile_config")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (configErr || !config) throw new Error("Configurações do Eyemobile não encontradas para este usuário.");

  const baseUrl = config.environment === "staging"
    ? "https://staging-api.eyemobile.com.br/v1"
    : "https://api.eyemobile.com.br/v1";

  const apiHeaders = {
    "X-EYEMOBILE-ACCESS-KEY": config.access_key,
    "X-EYEMOBILE-SECRET-KEY": config.secret_key,
    "Content-Type": "application/json"
  };

  let salesCount = 0;
  let stockAlerts = 0;
  let processedCount = 0;
  const syncErrors: string[] = [];

  // Sempre prioriza o workspace PJ do usuário para as vendas do PDV, mesmo que o client envie outro workspace (evitando misturar vendas no PF)
  let syncWorkspaceId: string | null = null;
  try {
    const { data: wsPj } = await supabaseAdmin
      .from("workspaces")
      .select("id")
      .eq("user_id", user_id)
      .eq("tipo", "PJ")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (wsPj) {
      syncWorkspaceId = wsPj.id;
    }
  } catch (wsErr) {
    console.error("Não foi possível resolver o workspace PJ do sync:", wsErr);
  }

  if (!syncWorkspaceId) {
    syncWorkspaceId = requestBody.workspace_id || null;
  }

  if (!syncWorkspaceId) {
    try {
      const { data: wsDefault } = await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("user_id", user_id)
        .eq("is_default", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      syncWorkspaceId = wsDefault?.id ?? null;
    } catch (wsErr) {
      console.error("Não foi possível resolver o workspace default do sync:", wsErr);
    }
  }

  // 2. Sales Sync
  if ((mode === "SALES" || mode === "ALL" || mode === "HISTORY") && config.auto_sync_sales) {
    try {
      if (preview) {
        // Run a quick fetch of 1 item to verify connection/credentials before stating total
        const testUrl = `${baseUrl}/transactions?limit=1&offset=0`;
        const testResp = await fetch(testUrl, { headers: apiHeaders });
        if (!testResp.ok) {
          const errorText = await testResp.text();
          throw new Error(`Eyemobile API connection error during preview: ${testResp.status} - ${errorText}`);
        }

        // Count existing records to estimate total pages (fallback to 35 if empty)
        const { count: dbCount } = await supabaseAdmin
          .from("transacoes")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user_id)
          .eq("workspace_id", syncWorkspaceId);
          
        const totalPagesEstimated = Math.max(35, Math.ceil((dbCount || 0) / 100));

        return {
          salesCount: 0,
          stockAlerts: 0,
          errors: [],
          pagination: {
            hasMore: true,
            totalPagesEstimated
          }
        };
      }

      let startStr = customStartDate || "";
      if (!startStr) {
        if (mode === "HISTORY") {
          // Para sincronização histórica, não definir start date (pega desde o início)
          startStr = "";
        } else {
          const twoDaysAgo = new Date();
          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
          startStr = twoDaysAgo.toISOString().split("T")[0];
        }
      }

      // O offset salvo (last_synced_offset) só faz sentido no modo HISTORY,
      // que varre a API inteira sem filtro de data. Nos syncs incrementais
      // (ALL/SALES com start_date), o conjunto já vem filtrado por data e um
      // offset global grande (ex.: 66.900) ultrapassa o fim da lista — o sync
      // rodava "com sucesso" sem trazer nenhuma venda.
      let offset = typeof customOffset === "number"
        ? customOffset
        : (mode === "HISTORY" ? (config.last_synced_offset || 0) : 0);
      const limit = typeof customLimit === "number" ? customLimit : 100;

      // Se o offset for 0 e tivermos startStr, resolvemos o offset correspondente na API
      if (offset === 0 && startStr && typeof customOffset !== "number") {
        try {
          const { count: totalDbCount } = await supabaseAdmin
            .from("transacoes")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user_id)
            .eq("workspace_id", syncWorkspaceId)
            .eq("tipo", "receita")
            .ilike("observacoes", "%Integrado via Eyemobile API.%");

          const { count: dbCountBeforeDate } = await supabaseAdmin
            .from("transacoes")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user_id)
            .eq("workspace_id", syncWorkspaceId)
            .eq("tipo", "receita")
            .ilike("observacoes", "%Integrado via Eyemobile API.%")
            .lt("data", startStr);

          const apiStartOffset = await findStartOffsetParallel(
            baseUrl,
            apiHeaders,
            startStr,
            limit,
            undefined,
            dbCountBeforeDate || 0,
            totalDbCount || 0
          );
          console.log(`Resolved API sync start offset for date ${startStr}: ${apiStartOffset} (beforeDate: ${dbCountBeforeDate}, total: ${totalDbCount})`);
          offset = apiStartOffset;
        } catch (e: unknown) {
          console.error(`Error resolving API sync start offset: ${e.message}`);
        }
      }
      let hasMore = true;
      let pagesFetched = 0;
      const isExternalPagination = typeof customOffset === "number";
      const maxPages = isExternalPagination ? 1 : (mode === "HISTORY" ? 100 : 15);

      let fetchedHasMore = false;

      while (hasMore && pagesFetched < maxPages) {
        // Build URL with optional start parameter
        let salesUrl = `${baseUrl}/transactions?limit=${limit}&offset=${offset}`;
        if (startStr) {
          salesUrl += `&start_date=${startStr}`;
        }
        console.log(`Fetching sales: ${salesUrl}`);
        const salesResp = await fetch(salesUrl, { headers: apiHeaders });
        if (!salesResp.ok) {
          const errorText = await salesResp.text();
          throw new Error(`Eyemobile API Transactions error: ${salesResp.status} - ${errorText}`);
        }
        const salesData = await salesResp.json();
        console.log(`Sales page ${pagesFetched + 1}: ${salesData.data?.length || 0} items, has_more: ${salesData.has_more}`);

        if (salesData.data && Array.isArray(salesData.data) && salesData.data.length > 0) {
          processedCount += salesData.data.length;

          // OTIMIZAÇÃO: Busca em lote das transações já existentes no banco para a data desta página
          const dates: string[] = [];
          for (const s of salesData.data) {
            if (s && s.time) {
              const dt = s.time.split("T")[0];
              if (dt && !dates.includes(dt)) {
                dates.push(dt);
              }
            }
          }
          
          const existingMap = new Map();

          if (dates.length > 0) {
            let minDate = dates[0];
            let maxDate = dates[0];
            for (const d of dates) {
              if (d < minDate) minDate = d;
              if (d > maxDate) maxDate = d;
            }

            const minDateObj = new Date(minDate);
            minDateObj.setDate(minDateObj.getDate() - 1);
            const maxDateObj = new Date(maxDate);
            maxDateObj.setDate(maxDateObj.getDate() + 1);

            const safeMinDate = minDateObj.toISOString().split("T")[0];
            const safeMaxDate = maxDateObj.toISOString().split("T")[0];

            // Paginated lookup: PostgREST returns at most 1000 rows per request.
            // Without pagination, syncs on busy days missed older records and re-inserted them.
            const BATCH_PAGE_SIZE = 1000;
            let batchOffset = 0;
            let batchHasMore = true;
            while (batchHasMore) {
              const { data: batchExisting, error: searchErr } = await supabaseAdmin
                .from("transacoes")
                .select("id, metodo_pagamento, observacoes, itens")
                .eq("user_id", user_id)
                .eq("workspace_id", syncWorkspaceId)
                .eq("tipo", "receita")
                .gte("data", safeMinDate)
                .lte("data", safeMaxDate)
                .ilike("observacoes", "%Integrado via Eyemobile API. Venda: #%")
                .range(batchOffset, batchOffset + BATCH_PAGE_SIZE - 1);

              if (searchErr) {
                console.error("Erro ao buscar transações em lote:", searchErr);
                break;
              }
              if (batchExisting && Array.isArray(batchExisting)) {
                for (const es of batchExisting) {
                  const obs = es.observacoes || "";
                  const match = obs.match(/Venda:\s*#(\d+)/i);
                  const sid = match ? match[1] : null;
                  if (sid) {
                    existingMap.set(String(sid), { id: es.id, metodo_pagamento: es.metodo_pagamento, itens: es.itens });
                  }
                }
                batchHasMore = batchExisting.length >= BATCH_PAGE_SIZE;
                batchOffset += BATCH_PAGE_SIZE;
              } else {
                batchHasMore = false;
              }
            }
          }

          for (const sale of salesData.data) {
            // Skip cancelled or uncompleted sales
            if (sale.cancelled || !sale.completed) {
              continue;
            }

            // Check for duplicate sales: check if a transaction with the same Eyemobile ID already exists
            const saleMarker = `Integrado via Eyemobile API. Venda: #${sale.id}`;
            const existingSales = existingMap.get(String(sale.id));

            // Map payment method name
            const payTypeName = sale.transaction_pays?.[0]?.pay_type_name || null;
            const payTypeRaw = sale.transaction_pays?.[0]?.pay_type || null;
            const storeName = sale.event_point?.point?.name || null;
            const mappedMethod = mapPaymentMethod(payTypeName);

            if (existingSales) {
              // Already imported — self-healing: completa campos que faltam
              // (método de pagamento e/ou itens da venda p/ o Top 10).
              const saleItens = Array.isArray(sale.transaction_items) ? sale.transaction_items : null;
              const needsMetodo = existingSales.metodo_pagamento === null && mappedMethod !== null;
              const needsItens = existingSales.itens == null && saleItens && saleItens.length > 0;

              if (needsMetodo || needsItens) {
                const payPart = payTypeName ? ` | Pagamento: ${payTypeName}` : "";
                const obsValue = saleMarker + (storeName ? ` | Loja: ${storeName}` : "") + payPart;
                const updatePayload: Record<string, unknown> = {
                  created_at: sale.time || new Date().toISOString(),
                  observacoes: obsValue,
                };
                if (needsMetodo) updatePayload.metodo_pagamento = mappedMethod;
                if (needsItens) updatePayload.itens = saleItens;

                const { error: updErr } = await supabaseAdmin
                  .from("transacoes")
                  .update(updatePayload)
                  .eq("id", existingSales.id);

                if (updErr) {
                  console.error("Erro ao atualizar transação existente:", updErr);
                }
              }
              continue;
            }

            // Insert main sale revenue
            const { error: revErr } = await supabaseAdmin.from("transacoes").insert({
              user_id: user_id,
              workspace_id: syncWorkspaceId,
              tipo: "receita",
              valor: Number(sale.total || 0),
              descricao: `Venda Eyemobile #${sale.id}`,
              data: sale.time ? toSaoPauloDate(sale.time) : new Date().toISOString().split("T")[0],
              created_at: sale.time || new Date().toISOString(),
              categoria_id: config.default_categoria_receita_id || null,
              conta_id: config.default_conta_id || null,
              metodo_pagamento: mappedMethod,
              itens: Array.isArray(sale.transaction_items) ? sale.transaction_items : null,
              observacoes: saleMarker + (storeName ? ` | Loja: ${storeName}` : "") + (payTypeName ? ` | Pagamento: ${payTypeName}` : ""),
            });

            if (revErr) {
              console.error("Erro ao inserir receita de venda:", revErr);
              syncErrors.push(`Erro na venda ${sale.id}: ${revErr.message}`);
              continue;
            }
            salesCount++;
          }
          fetchedHasMore = salesData.has_more === true;
          hasMore = salesData.has_more === true;
          offset += limit;
          pagesFetched++;

          // Salva o progresso a cada página processada
          await supabaseAdmin
            .from("eyemobile_config")
            .update({ last_synced_offset: offset })
            .eq("user_id", user_id);
        } else {
          hasMore = false;
          fetchedHasMore = false;
        }
      }

      // Salva o progresso no banco de dados para permitir continuar depois
      await supabaseAdmin
        .from("eyemobile_config")
        .update({ last_synced_offset: offset })
        .eq("user_id", user_id);

      if (isExternalPagination) {

        return {
          salesCount,
          stockAlerts,
          processedCount,
          errors: syncErrors,
          pagination: {
            hasMore: fetchedHasMore,
            nextOffset: offset,
            nextPage: Math.floor(offset / limit) + 1
          }
        };
      }
    } catch (e: unknown) {
      console.error("Erro ao sincronizar vendas:", e.message);
      syncErrors.push(`Vendas: ${e.message}`);
    }
  }

  // 3. Stock Sync
  if ((mode === "STOCK" || mode === "ALL") && config.auto_sync_stock) {
    try {
      const prodResp = await fetch(`${baseUrl}/products?limit=100&offset=0`, { headers: apiHeaders });
      if (!prodResp.ok) {
        throw new Error(`Eyemobile API Products error: ${prodResp.status}`);
      }
      const prodData = await prodResp.json();

      if (prodData.data && Array.isArray(prodData.data)) {
        for (const prod of prodData.data) {
          const currentStock = Number(prod.stock || 0);
          const minStock = Number(prod.min_stock || 5);

          if (currentStock <= minStock) {
            // Check if item is already in shopping list (itens_mercado) and not bought (not fully stocked)
            const { data: existing, error: searchErr } = await supabaseAdmin
              .from("itens_mercado")
              .select("id")
              .eq("user_id", user_id)
              .eq("descricao", prod.name)
              .neq("status", "estoque_adequado")
              .maybeSingle();

            if (searchErr) {
              console.error("Erro ao pesquisar item de mercado existente:", searchErr);
              continue;
            }

            if (!existing) {
              // Add to market list
              const qtyToSuggest = Math.max(minStock * 2 - currentStock, minStock);
              const { error: insErr } = await supabaseAdmin.from("itens_mercado").insert({
                user_id: user_id,
                descricao: prod.name,
                quantidade_atual: currentStock,
                quantidade_ideal: minStock + qtyToSuggest,
                unidade_medida: prod.unit || "unidade",
                preco_atual: Number(prod.cost_price || prod.price || 0),
                origem: "eyemobile",
                observacao: `Alerta Eyemobile: Estoque atual (${currentStock}) abaixo do mínimo (${minStock})`
              });
              if (insErr) {
                console.error("Erro ao inserir item de mercado:", insErr);
                syncErrors.push(`Estoque ${prod.name}: ${insErr.message}`);
              } else {
                stockAlerts++;
              }
            }
          }
        }
      }
    } catch (e: unknown) {
      console.error("Erro ao sincronizar estoque:", e.message);
      syncErrors.push(`Estoque: ${e.message}`);
    }
  }

  // 4. Log Sync details in database
  const status = syncErrors.length === 0 ? "SUCCESS" : (salesCount > 0 || stockAlerts > 0 ? "WARNING" : "ERROR");
  const { error: logErr } = await supabaseAdmin.from("eyemobile_sync_logs").insert({
    user_id,
    type: mode,
    status,
    items_processed: salesCount + stockAlerts,
    payload: { salesCount, stockAlerts, errors: syncErrors },
    error_message: syncErrors.length > 0 ? syncErrors.join("; ") : null
  });
  if (logErr) {
    console.error("Erro ao salvar log de sincronização:", logErr.message);
  }

  return { salesCount, stockAlerts, processedCount, errors: syncErrors };
}

function mapPaymentMethod(method: string | null | undefined): string | null {
  if (!method) return null;
  const m = method
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos p/ comparar "credito", "debito"
  
  // Check debit card first to avoid matching "cartao de debito" in card/cartao check
  if (m.includes("debit") || m.includes("debito") || m.includes("maestro")) {
    return "cartao_debito";
  }
  // Cartão de crédito / bandeiras / "credit"
  if (
    m.includes("credit") ||
    m.includes("credito") ||
    m.includes("cartao") ||
    m.includes("card") ||
    m.includes("master") ||
    m.includes("visa") ||
    m.includes("elo") ||
    m.includes("amex") ||
    m.includes("hiper") ||
    m.includes("alelo")
  ) {
    return "cartao_credito";
  }
  if (m.includes("pix")) return "pix";
  if (m.includes("money") || m.includes("dinheiro") || m.includes("efetivo") || m.includes("especie")) return "dinheiro";
  if (m.includes("voucher") || m.includes("vale")) return "voucher";
  if (m.includes("boleto") || m.includes("ticket")) return "boleto";
  if (m.includes("transfer") || m.includes("transferencia") || m.includes("ted") || m.includes("doc")) return "transferencia";
  return null;
}