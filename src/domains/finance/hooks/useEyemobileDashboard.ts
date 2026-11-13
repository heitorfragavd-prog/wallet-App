import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildEyemobileDashboard, type EyemobileDashboardData } from "@/domains/finance/services/eyemobileDashboard";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useRef } from "react";

function toISODate(dateStr: string): string {
  if (!dateStr) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split(/[/-]/);
  if (parts.length === 3 && parts[2].length === 4) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return dateStr;
}

export interface EyemobileStore {
  id: string;
  name: string;
}

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  storeId?: string;
}

export interface EyemobileDashboardResult extends EyemobileDashboardData {
  configured: boolean;
  stores: EyemobileStore[];
  isLocalFallback?: boolean;
}

interface EyemobileSyncResponse {
  success?: boolean;
  configured?: boolean;
  sales?: unknown[];
  products?: unknown[];
  stores?: unknown[];
  hasMore?: boolean;
  error?: string;
}

const normalizeStores = (stores: unknown): EyemobileStore[] => {
  const raw = Array.isArray(stores) ? stores : (stores as { data?: unknown[] })?.data ?? [];
  return raw
    .map((store) => {
      const value = store as Record<string, unknown>;
      return {
        id: String(value.id ?? value.store_id ?? ""),
        name: String(value.name ?? value.store_name ?? "Loja sem nome"),
      };
    })
    .filter((store) => store.id);
};

async function checkEyemobileConfigured(workspaceId?: string): Promise<boolean> {
  try {
    if (!workspaceId) return false;

    // 1. Valida se o workspace existe, pertence ao usuário autenticado e é do tipo PJ
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, tipo, user_id")
      .eq("id", workspaceId)
      .maybeSingle();

    if (wsErr || !ws || ws.tipo !== "PJ") {
      return false;
    }

    // 2. Consulta estrita de credenciais por user_id do workspace, sem expor access_key nem secret_key
    const { data: config, error: configErr } = await supabase
      .from("eyemobile_config")
      .select("id, environment, store_id")
      .eq("user_id", ws.user_id)
      .maybeSingle();

    if (configErr || !config) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchLiveProducts(): Promise<unknown[]> {
  try {
    const { data, error } = await supabase.functions.invoke("eyemobile-sync", {
      body: { mode: "PRODUCTS" },
    });
    if (error || !data) return [];
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    return [];
  }
}

async function buildLocalFallbackDashboard(
  filters: DashboardFilters,
  workspaceId?: string,
): Promise<EyemobileDashboardResult> {
  const productsPromise = fetchLiveProducts();

  // Paginação segura em lotes de 1000 registros para cobrir grandes períodos sem truncar em 2000
  const PAGE_SIZE = 1000;
  const allTransacoes: Array<Record<string, unknown>> = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("transacoes")
      .select("*")
      .eq("tipo", "receita")
      .like("descricao", "Venda Eyemobile %")
      .gte("data", filters.startDate)
      .lte("data", filters.endDate)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data: chunk, error: queryError } = await query.range(from, from + PAGE_SIZE - 1);
    if (queryError) {
      console.warn("Erro ao buscar transações no fallback local:", queryError.message);
      break;
    }

    if (!chunk || chunk.length === 0) {
      break;
    }

    allTransacoes.push(...chunk);
    if (chunk.length < PAGE_SIZE || allTransacoes.length >= 20000) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  // Deduplicação estrita por ID de venda para blindar contra duplicidades históricas
  const seenSaleIds = new Set<string>();
  let transacoes = allTransacoes.filter((t) => {
    const dedupKey = (t as { deduplication_key?: string }).deduplication_key;
    const keyId = typeof dedupKey === "string" && dedupKey.startsWith("eyemobile:") ? dedupKey.replace("eyemobile:", "") : null;
    const match = t.descricao?.match(/#(\d+)/) || t.observacoes?.match(/#(\d+)/);
    const saleId = keyId || (match ? match[1] : t.id);
    if (seenSaleIds.has(saleId)) return false;
    seenSaleIds.add(saleId);
    return true;
  });

  if (filters.storeId && filters.storeId !== "all") {
    const isNumericStoreId = /^\d+$/.test(filters.storeId);
    if (!isNumericStoreId) {
      const targetStore = filters.storeId.toLowerCase();
      transacoes = transacoes.filter((t) => {
        const obs = String(t.observacoes ?? "").toLowerCase();
        return obs.includes(`loja: ${targetStore}`);
      });
    }
  }

  const isConfigured = await checkEyemobileConfigured(workspaceId);

  if (!transacoes.length) {
    return {
      configured: isConfigured,
      stores: [],
      isLocalFallback: true,
      ...buildEyemobileDashboard({ sales: [], products: [], stores: [] }),
    };
  }

  const totalRevenue = transacoes.reduce((acc, t) => acc + Number(t.valor), 0);
  const totalTransactions = transacoes.length;

  const sales = transacoes.map((t) => ({
    total: t.valor,
    time: t.created_at ?? t.data,
    transaction_pays: [{ pay_type_name: t.metodo_pagamento ?? "Desconhecido" }],
    items: Array.isArray(t.itens) ? t.itens : [],
  }));

  const products = await productsPromise;

  const dashboard = buildEyemobileDashboard({
    sales,
    products,
    stores: [],
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  return {
    configured: isConfigured,
    stores: [],
    isLocalFallback: true,
    ...dashboard,
    kpis: {
      ...dashboard.kpis,
      totalRevenue,
      totalTransactions,
      averageTicket: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
      frontCashierRevenue: totalRevenue,
    },
  };
}

export async function fetchLiveDashboard(
  filters: DashboardFilters,
  workspaceId?: string,
): Promise<EyemobileDashboardResult> {
  const isoStartDate = toISODate(filters.startDate);
  const isoEndDate = toISODate(filters.endDate);

  let data: EyemobileSyncResponse | null = null;
  let invokeError: Error | null = null;

  try {
    const invokePromise = supabase.functions.invoke("eyemobile-sync", {
      body: {
        mode: "DASHBOARD",
        start_date: isoStartDate,
        end_date: isoEndDate,
        store_id: filters.storeId || undefined,
        workspace_id: workspaceId,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout ao consultar Edge Function")), 20000);
      invokePromise.finally(() => clearTimeout(timer));
    });

    const result = (await Promise.race([invokePromise, timeoutPromise])) as {
      data: EyemobileSyncResponse | null;
      error: Error | null;
    };
    data = result.data;
    invokeError = result.error;
  } catch (err: unknown) {
    invokeError = err instanceof Error ? err : new Error(String(err));
  }

  // Se a Edge Function teve erro (rede, timeout, 500) ou retornou success === false
  if (invokeError || data?.success === false) {
    console.warn("Edge Function indisponivel, usando fallback local...", invokeError || data?.error);
    return buildLocalFallbackDashboard(
      { ...filters, startDate: isoStartDate, endDate: isoEndDate },
      workspaceId,
    );
  }

  // Se a Edge Function confirmou explicitamente que as credenciais NÃO estão configuradas
  if (data?.configured === false) {
    return {
      configured: false,
      stores: [],
      isLocalFallback: false,
      ...buildEyemobileDashboard({ sales: [], products: [], stores: [] }),
    };
  }

  const dashboard = buildEyemobileDashboard({
    sales: data?.sales ?? [],
    products: data?.products ?? [],
    stores: data?.stores ?? [],
    startDate: isoStartDate,
    endDate: isoEndDate,
    hasMore: data?.hasMore,
  });
  return { configured: true, stores: normalizeStores(data?.stores), ...dashboard };
}

export function useEyemobileDashboard(filters: DashboardFilters) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const qc = useQueryClient();
  const queryKey = [
    "eyemobile-dashboard",
    workspaceId,
    filters.startDate,
    filters.endDate,
    filters.storeId ?? "all",
  ];

  const lastValidWorkspaceRef = useRef<string | null>(workspaceId);
  const lastValidResult = useRef<EyemobileDashboardResult | null>(null);

  if (lastValidWorkspaceRef.current !== workspaceId) {
    lastValidWorkspaceRef.current = workspaceId;
    lastValidResult.current = null;
  }

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<EyemobileDashboardResult> => {
      const result = await fetchLiveDashboard(filters, activeWorkspace?.id);
      if (result.configured) {
        lastValidResult.current = result;
      }
      return result;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    placeholderData: () => {
      const cached = qc.getQueryData<EyemobileDashboardResult>(queryKey);
      if (cached) return cached;
      return lastValidResult.current ?? undefined;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 2000,
  });

  const syncLive = async (): Promise<EyemobileDashboardResult> => {
    try {
      await supabase.functions.invoke("eyemobile-sync", {
        body: { mode: "SALES", workspace_id: activeWorkspace?.id },
      });
    } catch {
      // Sincronização de persistência best-effort; fallback segue buscando dados ao vivo
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["eyemobile-dashboard", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["transacoes"] }),
      qc.invalidateQueries({ queryKey: ["receitas"] }),
    ]);
    const live = await fetchLiveDashboard(filters, activeWorkspace?.id);
    qc.setQueryData(queryKey, live);
    return live;
  };

  return { ...query, syncLive };
}
