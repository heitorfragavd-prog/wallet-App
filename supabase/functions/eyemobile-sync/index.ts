import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    // Check if the caller has service role authorization (e.g. Cron)
    const isServiceRole = token === supabaseServiceKey;

    let user_id: string | null = null;
    let requestBody: any = {};
    try {
      requestBody = await req.json();
    } catch (_) {
      // Empty body
    }

    const { mode, access_key, secret_key, environment, page, page_size, preview, end_date, store_id } = requestBody;

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
        } catch (e: any) {
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
    // Sempre inicia na página 1 (offset 0) com filtros de data; ignora paginação salva.
    if (mode === "DASHBOARD") {
      const dashboard = await fetchDashboardData(
        user_id,
        supabaseAdmin,
        requestBody.start_date,
        end_date,
        store_id,
        0,        // offset = 0 (página 1)
        100,      // limite padrão
        false     // não é paginação externa
      );
      return new Response(JSON.stringify({ success: true, ...dashboard }), {
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

  } catch (error: any) {
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
   });
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
    return { configured: false, sales: [], products: [], stores: [] };
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
    } catch (err: any) {
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

  // Busca vendas com paginação completa (iterando todas as páginas até has_more = false)
  const buildUrl = (offset: number) => {
    const params = new URLSearchParams({ limit: String(customLimit), offset: String(offset) });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (selectedStoreId) params.set("store_id", selectedStoreId);
    return `${baseUrl}/sales?${params.toString()}`;
  };
  const buildFallbackUrl = (offset: number) => {
    const params = new URLSearchParams({ limit: String(customLimit), offset: String(offset) });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (selectedStoreId) params.set("store_id", selectedStoreId);
    return `${baseUrl}/transactions?${params.toString()}`;
  };

  let allSales: any[] = [];
  let offset = customOffset;
  let hasMore = true;
  const maxPages = isExternalPagination ? 1 : 50; // Dashboard: até 50 páginas (5000 vendas)

  for (let page = 0; hasMore && page < maxPages; page++) {
    const salesUrl = buildUrl(offset);
    const transactionsUrl = buildFallbackUrl(offset);
    const salesResult = await fetchWithFallback(salesUrl, transactionsUrl);
    const sales = salesResult.data || [];

    if (sales.length > 0) {
      allSales.push(...sales);
      // Se a API retornar vendas fora do intervalo (mais antigas que startDate), podemos parar
      const lastSaleDate = sales[sales.length - 1]?.time || sales[sales.length - 1]?.created_at;
      if (startDate && lastSaleDate) {
        const saleDate = lastSaleDate.split("T")[0];
        if (saleDate < startDate) {
          // Vendas já são mais antigas que o período solicitado - pode parar
          hasMore = false;
          break;
        }
      }
      hasMore = salesResult.has_more === true;
      offset += customLimit;
    } else {
      hasMore = false;
    }
  }

  // Busca produtos
  const productsResult = await fetchWithFallback(`${baseUrl}/products?limit=100&offset=0`);
  const products = productsResult.data || [];

  // Busca lojas
  const storesResult = await fetchWithFallback(`${baseUrl}/stores`);
  const stores = storesResult.data || [];

  return { configured: true, sales: allSales, products, stores };
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
          .eq("user_id", user_id);
          
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

      let offset = typeof customOffset === "number" ? customOffset : 0;
      let limit = typeof customLimit === "number" ? customLimit : 100;
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
          for (const sale of salesData.data) {
            // Skip cancelled or uncompleted sales
            if (sale.cancelled || !sale.completed) {
              continue;
            }

            // Check for duplicate sales: check if a transaction with the same Eyemobile ID already exists
            const saleMarker = `Integrado via Eyemobile API. Venda: #${sale.id}`;
            const { data: existingSales, error: searchErr } = await supabaseAdmin
              .from("transacoes")
              .select("id, metodo_pagamento")
              .eq("user_id", user_id)
              .ilike("observacoes", `%Venda: #${sale.id}%`)
              .maybeSingle();

            if (searchErr) {
              console.error("Erro ao pesquisar venda existente:", searchErr);
              continue;
            }

            // Map payment method name
            const payTypeName = sale.transaction_pays?.[0]?.pay_type_name || null;
            const payTypeRaw = sale.transaction_pays?.[0]?.pay_type || null;
            const storeName = sale.event_point?.point?.name || null;
            const mappedMethod = mapPaymentMethod(payTypeName);

            if (existingSales) {
              // Already imported, check if it needs self-healing update
              if (existingSales.metodo_pagamento === null && mappedMethod !== null) {
                const payPart = payTypeName ? ` | Pagamento: ${payTypeName}` : "";
                const obsValue = saleMarker + (storeName ? ` | Loja: ${storeName}` : "") + payPart;
                
                const { error: updErr } = await supabaseAdmin
                  .from("transacoes")
                  .update({
                    metodo_pagamento: mappedMethod,
                    created_at: sale.time || new Date().toISOString(),
                    observacoes: obsValue
                  })
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
              tipo: "receita",
              valor: Number(sale.total || 0),
              descricao: `Venda Eyemobile #${sale.id}`,
              data: sale.time ? toSaoPauloDate(sale.time) : new Date().toISOString().split("T")[0],
              created_at: sale.time || new Date().toISOString(),
              categoria_id: config.default_categoria_receita_id || null,
              conta_id: config.default_conta_id || null,
              metodo_pagamento: mappedMethod,
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
        } else {
          hasMore = false;
          fetchedHasMore = false;
        }
      }

      if (isExternalPagination) {
        // Salva o progresso no banco de dados para permitir continuar depois
        await supabaseAdmin
          .from("eyemobile_config")
          .update({ last_synced_offset: offset })
          .eq("user_id", user_id);

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
    } catch (e: any) {
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
    } catch (e: any) {
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
    .replace(/[̀-ͯ]/g, ""); // remove acentos p/ comparar "credito", "debito"
  
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
