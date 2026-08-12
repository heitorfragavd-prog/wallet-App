import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { financeService } from "@/domains/finance/services/FinanceService";

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
  workspace_id?: string;
  categoria_id?: string;
  conta_id?: string | null;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  valor_restante: number;
  data_vencimento: string;
  parcelas: number;
  parcelas_pagas: number;
  parcela_atual?: number;
  total_parcelas?: number;
  parent_id?: string;
  status: "pendente" | "vencida" | "quitada";
  credor: string;
  valor_taxa?: number;
  documento_favorecido?: string | null;
  metodo_pagamento_esperado?: "pix" | "boleto" | "transferencia" | "cartao_credito" | "cartao_debito" | "dinheiro" | "outros";
  chave_pix?: string | null;
  pix_copia_cola?: string | null;
  codigo_barras?: string | null;
  linha_digitavel?: string | null;
  conta_bancaria?: { banco?: string; agencia?: string; conta?: string; titular?: string; tipo?: "corrente" | "poupanca"; } | null;
  created_at: string;
  updated_at: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
  contas_usuario?: {
    id: string;
    nome: string;
    tipo: string;
    cor?: string;
  } | null;
  debt_reminders?: DebtReminderInfo[];
}

export const DIVIDAS_QUERY_KEY = ["dividas"] as const;

export interface DividasQueryParams {
  startDate?: string | null;
  endDate?: string | null;
  workspaceId?: string | null;
}

function resolveDividaStatus(d: any): Divida {
  if (d.status === "quitada" || Number(d.valor_restante || 0) <= 0) {
    return { ...d, status: "quitada" };
  }
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  const venc = new Date(d.data_vencimento + "T12:00:00");
  venc.setHours(0, 0, 0, 0);
  
  const status = venc < hoje ? "vencida" : "pendente";
  return { ...d, status };
}

// ─── Fetcher com fallback (debt_reminders pode não existir) ─────────────
async function fetchDividas(params: DividasQueryParams = {}): Promise<Divida[]> {
  const { startDate, endDate, workspaceId } = params;

  let query = supabase
    .from("dividas")
    .select(
      "*, categorias!categoria_id (nome, cor, icone), contas_usuario (id, nome, tipo, cor), debt_reminders (id, reminder_hours, trigger_at, status, sent_at)"
    )
    .order("data_vencimento", { ascending: true });

  if (workspaceId) query = query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
  if (startDate) query = query.gte("data_vencimento", startDate);
  if (endDate) query = query.lte("data_vencimento", endDate);

  const { data, error } = await query;

  // Se debt_reminders não existir, cai no fallback sem ela
  if (error && (error.code === "PGRST200" || error.code === "PGRST205")) {
    let fallbackQuery = supabase
      .from("dividas")
      .select("*, categorias!categoria_id (nome, cor, icone), contas_usuario (id, nome, tipo, cor)")
      .order("data_vencimento", { ascending: true });

    if (workspaceId) fallbackQuery = fallbackQuery.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
    if (startDate) fallbackQuery = fallbackQuery.gte("data_vencimento", startDate);
    if (endDate) fallbackQuery = fallbackQuery.lte("data_vencimento", endDate);

    const { data: fallback, error: fallbackError } = await fallbackQuery;
    if (fallbackError) throw fallbackError;
    return ((fallback ?? []) as any[]).map(resolveDividaStatus) as Divida[];
  }

  if (error) throw error;
  return ((data ?? []) as any[]).map(resolveDividaStatus) as Divida[];
}

// ─── Hook ──────────────────────────────────────────────────
export const useDividas = (params: DividasQueryParams = {}) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const { startDate = null, endDate = null } = params;

  const currentWorkspaceId = activeWorkspace?.id || null;

  const { data: dividas = [], isLoading: loading } = useQuery({
    queryKey: [...DIVIDAS_QUERY_KEY, { startDate, endDate, workspaceId: currentWorkspaceId }],
    queryFn: () => fetchDividas({ startDate, endDate, workspaceId: currentWorkspaceId }),
    staleTime: 1000 * 60 * 2,
  });

  const createDivida = useMutation({
    mutationFn: async (
      divida: Omit<Divida, "id" | "user_id" | "created_at" | "updated_at" | "categorias">
    ) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      if (divida.parcelas && divida.parcelas > 1) {
        return await financeService.createDebt({
          userId,
          workspaceId: currentWorkspaceId || undefined,
          descricao: divida.descricao,
          valorTotal: divida.valor_total,
          dataVencimentoInicial: divida.data_vencimento,
          credor: divida.credor,
          categoriaId: divida.categoria_id,
          contaId: divida.conta_id,
          documentoFavorecido: divida.documento_favorecido,
          valorTaxa: divida.valor_taxa,
          totalParcelas: divida.parcelas,
          metodoPagamentoEsperado: divida.metodo_pagamento_esperado,
          chavePix: divida.chave_pix,
          pixCopiaCola: divida.pix_copia_cola,
          codigoBarras: divida.codigo_barras,
          linhaDigitavel: divida.linha_digitavel,
          contaBancaria: divida.conta_bancaria,
        });
      }

      const { data, error } = await supabase
        .from("dividas")
        .insert([{
          ...divida,
          user_id: userId,
          workspace_id: currentWorkspaceId || null,
          parcela_atual: 1,
          total_parcelas: 1,
        }])
        .select("*, categorias!categoria_id (nome, cor, icone)")
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
      toast({ title: "Erro ao criar dívida", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const updateDivida = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Divida> }) => {
      const { data, error } = await supabase
        .from("dividas")
        .update(updates)
        .eq("id", id)
        .select("*, categorias!categoria_id (nome, cor, icone)")
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
      toast({ title: "Erro ao atualizar dívida", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
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
      toast({ title: "Erro ao remover dívida", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
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