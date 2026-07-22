import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

export interface DebtReminderInfo {
  id: string;
  reminder_hours: number;
  trigger_at: string;
  status: "pending" | "sent" | "failed";
  sent_at?: string;
}

export interface Divida {
  id: string;
  user_id: string;
  categoria_id?: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  valor_restante: number;
  data_vencimento: string;
  parcelas: number;
  parcelas_pagas: number;
  status: "pendente" | "vencida" | "quitada";
  credor: string;
  valor_taxa?: number;
  created_at: string;
  updated_at: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
  debt_reminders?: DebtReminderInfo[];
}

export const DIVIDAS_QUERY_KEY = ["dividas"] as const;

export interface DividasQueryParams {
  startDate?: string | null;
  endDate?: string | null;
}

// ─── Fetcher com fallback (debt_reminders pode não existir) ─────────────
async function fetchDividas(params: DividasQueryParams = {}): Promise<Divida[]> {
  const { startDate, endDate } = params;

  let query = supabase
    .from("dividas")
    .select(
      "*, categorias (nome, cor, icone), debt_reminders (id, reminder_hours, trigger_at, status, sent_at)"
    )
    .order("data_vencimento", { ascending: true });

  if (startDate) query = query.gte("data_vencimento", startDate);
  if (endDate) query = query.lte("data_vencimento", endDate);

  const { data, error } = await query;

  // Se debt_reminders não existir, cai no fallback sem ela
  if (error && (error.code === "PGRST200" || error.code === "PGRST205")) {
    let fallbackQuery = supabase
      .from("dividas")
      .select("*, categorias (nome, cor, icone)")
      .order("data_vencimento", { ascending: true });

    if (startDate) fallbackQuery = fallbackQuery.gte("data_vencimento", startDate);
    if (endDate) fallbackQuery = fallbackQuery.lte("data_vencimento", endDate);

    const { data: fallback, error: fallbackError } = await fallbackQuery;
    if (fallbackError) throw fallbackError;
    return (fallback ?? []) as Divida[];
  }

  if (error) throw error;
  return (data ?? []) as Divida[];
}

// ─── Hook ──────────────────────────────────────────────────
export const useDividas = (params: DividasQueryParams = {}) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { startDate = null, endDate = null } = params;

  const { data: dividas = [], isLoading: loading } = useQuery({
    queryKey: [...DIVIDAS_QUERY_KEY, { startDate, endDate }],
    queryFn: () => fetchDividas({ startDate, endDate }),
    staleTime: 1000 * 60 * 2,
  });

  const createDivida = useMutation({
    mutationFn: async (
      divida: Omit<Divida, "id" | "user_id" | "created_at" | "updated_at" | "categorias">
    ) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("dividas")
        .insert([{ ...divida, user_id: userId }])
        .select("*, categorias (nome, cor, icone)")
        .single();
      if (error) throw error;
      return data as Divida;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DIVIDAS_QUERY_KEY });
      toast({ title: "Dívida criada", description: "Dívida criada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDividas", "Erro ao criar dívida", { error: String(error) });
      toast({ title: "Erro ao criar dívida", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  const updateDivida = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Divida> }) => {
      const { data, error } = await supabase
        .from("dividas")
        .update(updates)
        .eq("id", id)
        .select("*, categorias (nome, cor, icone)")
        .single();
      if (error) throw error;
      return data as Divida;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DIVIDAS_QUERY_KEY });
      toast({ title: "Dívida atualizada", description: "Dívida atualizada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDividas", "Erro ao atualizar dívida", { error: String(error) });
      toast({ title: "Erro ao atualizar dívida", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  const deleteDivida = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dividas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DIVIDAS_QUERY_KEY });
      toast({ title: "Dívida removida", description: "Dívida removida com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDividas", "Erro ao remover dívida", { error: String(error) });
      toast({ title: "Erro ao remover dívida", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  return {
    dividas,
    loading,
    createDivida: (
      divida: Omit<Divida, "id" | "user_id" | "created_at" | "updated_at" | "categorias">
    ) => createDivida.mutateAsync(divida),
    updateDivida: (id: string, updates: Partial<Divida>) =>
      updateDivida.mutateAsync({ id, updates }),
    deleteDivida: (id: string) => deleteDivida.mutateAsync(id),
    refetch: () => qc.invalidateQueries({ queryKey: DIVIDAS_QUERY_KEY }),
  };
};