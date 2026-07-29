import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildEyemobileDashboard, type EyemobileDashboardData } from "@/domains/finance/services/eyemobileDashboard";

// Converte data DD/MM/YYYY ou ISO para ISO YYYY-MM-DD
function toISODate(dateStr: string): string {
 if (!dateStr) return dateStr;
 // Se já está no formato ISO (YYYY-MM-DD), retorna como está
 if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
 // Tenta converter DD/MM/YYYY
   const parts = dateStr.split(/[/-]/);
 if (parts.length === 3 && parts[2].length === 4) {
   const [day, month, year] = parts;
   return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
 }
 // Fallback: retorna string original
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
  return raw.map((store) => {
    const value = store as Record<string, unknown>;
    return { id: String(value.id ?? value.store_id ?? ""), name: String(value.name ?? value.store_name ?? "Loja sem nome") };
  }).filter((store) => store.id);
};

// Calcula KPIs locais a partir de transações salvas no banco
async function buildLocalFallbackDashboard(
  filters: DashboardFilters,
): Promise<EyemobileDashboardResult> {
  // Busca paginada para superar limite de 1000 linhas do Supabase
  const allTransacoes: { valor: number; created_at?: string; data?: string; metodo_pagamento?: string }[] = [];
  let page = 0;
  const pageSize = 1000;
  let fetchMore = true;

  let queryError: any = null;
  
  while (fetchMore) {
    const { data, error } = await supabase
      .from("transacoes")
      .select("*")
      .eq("tipo", "receita")
      .gte("data", filters.startDate)
      .lte("data", filters.endDate)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      queryError = error;
      fetchMore = false;
    } else if (!data || data.length === 0) {
      fetchMore = false;
    } else {
      allTransacoes.push(...data);
      if (data.length < pageSize) {
        fetchMore = false;
      } else {
        page++;
      }
    }
  }

  const transacoes = allTransacoes;

  if (queryError || !transacoes?.length) {
    // Sem dados locais — retorna estrutura vazia para o componente decidir como exibir
    return {
      configured: false,
      stores: [],
      isLocalFallback: true,
      ...buildEyemobileDashboard({ sales: [], products: [], stores: [] }),
    };
  }

  const totalRevenue = transacoes.reduce((acc, t) => acc + Number(t.valor), 0);
  const totalTransactions = transacoes.length;

  // Mapear transações locais para formato de "sales" que o builder entende
  const sales = transacoes.map((t) => ({
    total: t.valor,
    time: t.created_at ?? t.data,
    transaction_pays: [{ pay_type_name: t.metodo_pagamento ?? "Desconhecido" }],
    items: [],
  }));

  const dashboard = buildEyemobileDashboard({
    sales,
    products: [],
    stores: [],
  });

  return {
    configured: true, // temos dados locais
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

export function useEyemobileDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["eyemobile-dashboard", filters.startDate, filters.endDate, filters.storeId ?? "all"],
    queryFn: async (): Promise<EyemobileDashboardResult> => {
      // Garante que as datas estejam no formato ISO antes de enviar para a API
      const isoStartDate = toISODate(filters.startDate);
      const isoEndDate = toISODate(filters.endDate);

      let data: EyemobileSyncResponse | null = null;
      let invokeError: Error | null = null;

      // Tenta chamar a Edge Function
      try {
        const result = await supabase.functions.invoke("eyemobile-sync", {
          body: {
            mode: "DASHBOARD",
            start_date: isoStartDate,
            end_date: isoEndDate,
            store_id: filters.storeId || undefined,
          },
        });
        data = result.data as EyemobileSyncResponse | null;
        invokeError = result.error;
      } catch (err: unknown) {
        // Edge Function não está implantada ou erro de rede
        invokeError = err instanceof Error ? err : new Error(String(err));
      }

      // Se a Edge Function falhou (erro de invocação ou payload com success:false)
      if (invokeError || data?.success === false) {
        console.warn("Edge Function Eyemobile indisponível, usando fallback local...", invokeError || data?.error);
        
        // Se temos configuração mas a API falhou, tenta fallback local
        if (data?.configured || !data) {
          return buildLocalFallbackDashboard({ ...filters, startDate: isoStartDate, endDate: isoEndDate });
        }
        
        // Se não configurado, retorna estrutura vazia
        return { 
          configured: false, 
          stores: [], 
          isLocalFallback: true,
          ...buildEyemobileDashboard({ sales: [], products: [], stores: [] }) 
        };
      }

      // Sucesso da Edge Function
      const dashboard = buildEyemobileDashboard({
        sales: data?.sales ?? [],
        products: data?.products ?? [],
        stores: data?.stores ?? [],
      });
      return { configured: data?.configured !== false, stores: normalizeStores(data?.stores), ...dashboard };
    },
    staleTime: 1000 * 60,
  });
}