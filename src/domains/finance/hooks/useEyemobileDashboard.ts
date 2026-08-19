import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildEyemobileDashboard, type EyemobileDashboardData } from "@/domains/finance/services/eyemobileDashboard";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useRef } from "react";

function toISODate(dateStr: string): string {
  if (!dateStr) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split(/[\/\-]/);
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

interface DashboardFilters {
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

  let query = supabase
    .from("transacoes")
    .select("*")
    .eq("tipo", "receita")
    .like("descricao", "Venda Eyemobile %")
    .gte("data", filters.startDate)
    .lte("data", filters.endDate)
    .order("data", { ascending: false })
    .limit(2000);

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data: transacoes, error: queryError } = await query;

  if (queryError || !transacoes?.length) {
    return {
      configured: false,
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
    configured: true,
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

async function fetchLiveDashboard(
  filters: DashboardFilters,
  workspaceId?: string,
): Promise<EyemobileDashboardResult> {
  const isoStartDate = toISODate(filters.startDate);
  const isoEndDate = toISODate(filters.endDate);

  let data: EyemobileSyncResponse | null = null;
  let invokeError: Error | null = null;

  try {
    const result = await supabase.functions.invoke("eyemobile-sync", {
      body: {
        mode: "DASHBOARD",
        start_date: isoStartDate,
        end_date: isoEndDate,
        store_id: filters.storeId || undefined,
        workspace_id: workspaceId,
      },
    });
    data = result.data as EyemobileSyncResponse | null;
    invokeError = result.error;
  } catch (err: unknown) {
    invokeError = err instanceof Error ? err : new Error(String(err));
  }

  if (invokeError || data?.success === false) {
    console.warn("Edge Function indisponivel, usando fallback local...", invokeError || data?.error);
    if (data?.configured || !data) {
      return buildLocalFallbackDashboard(
        { ...filters, startDate: isoStartDate, endDate: isoEndDate },
        workspaceId,
      );
    }
    return {
      configured: false,
      stores: [],
      isLocalFallback: true,
      ...buildEyemobileDashboard({ sales: [], products: [], stores: [] }),
    };
  }

  const dashboard = buildEyemobileDashboard({
    sales: data?.sales ?? [],
    products: data?.products ?? [],
    stores: data?.stores ?? [],
    startDate: isoStartDate,
    endDate: isoEndDate,
  });
  return { configured: data?.configured !== false, stores: normalizeStores(data?.stores), ...dashboard };
}

export function useEyemobileDashboard(filters: DashboardFilters) {
  const { activeWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const queryKey = [
    "eyemobile-dashboard",
    filters.startDate,
    filters.endDate,
    filters.storeId ?? "all",
  ];

  const lastValidResult = useRef<EyemobileDashboardResult | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<EyemobileDashboardResult> => {
      const result = await fetchLiveDashboard(filters, activeWorkspace?.id);
      if (result.configured) {
        lastValidResult.current = result;
      }
      return result;
    },
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
    await qc.invalidateQueries({ queryKey: ["eyemobile-dashboard"] });
    const live = await fetchLiveDashboard(filters, activeWorkspace?.id);
    qc.setQueryData(queryKey, live);
    return live;
  };

  return { ...query, syncLive };
}
