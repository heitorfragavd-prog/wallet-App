import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { logger } from "@/core/logging/LoggerService";

export interface FaturaCartao {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  cartao_id: string;
  mes_fatura: number; // 1-12
  ano_fatura: number;
  data_inicio: string;
  data_fechamento: string;
  data_vencimento: string;
  valor_total: number;
  valor_pago: number;
  status: "aberta" | "paga" | "atrasada";
  divida_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PeriodoFaturaInfo {
  data_inicio: string;     // YYYY-MM-DD
  data_fechamento: string; // YYYY-MM-DD
  data_vencimento: string; // YYYY-MM-DD
}

/**
 * Calcula os limites de datas (período de fechamento e data de vencimento)
 * para a fatura de um cartão em um mês/ano específico.
 */
export function calcularPeriodoFatura(
  cartao: { dia_fechamento?: number | null; dia_vencimento?: number | null } | number | null | undefined,
  mes: number,
  ano: number
): PeriodoFaturaInfo {
  let diaFech = 1;
  let diaVenc = 10;

  if (typeof cartao === "number") {
    diaFech = cartao > 0 && cartao <= 31 ? cartao : 1;
  } else if (cartao && typeof cartao === "object") {
    const rawFech = Number(cartao.dia_fechamento);
    const rawVenc = Number(cartao.dia_vencimento);
    if (!isNaN(rawFech) && rawFech > 0 && rawFech <= 31) {
      diaFech = rawFech;
    }
    if (!isNaN(rawVenc) && rawVenc > 0 && rawVenc <= 31) {
      diaVenc = rawVenc;
    }
  }

  // Fatura do mês 'mes' (1-12) e ano 'ano':
  // data_fechamento: 22/08/2026 (se mes=8, ano=2026, diaFech=22)
  const fechDate = new Date(ano, mes - 1, diaFech);
  const dataFechamento = format(fechDate, "yyyy-MM-dd");

  // data_inicio: 22/07/2026 (mês anterior)
  const inicioDate = new Date(ano, mes - 2, diaFech);
  const dataInicio = format(inicioDate, "yyyy-MM-dd");

  // data_vencimento: 21/09/2026 (se vencimento <= fechamento, mês seguinte)
  let vencDate = new Date(ano, mes - 1, diaVenc);
  if (diaVenc <= diaFech) {
    vencDate = new Date(ano, mes, diaVenc);
  }
  const dataVencimento = format(vencDate, "yyyy-MM-dd");

  return {
    data_inicio: dataInicio,
    data_fechamento: dataFechamento,
    data_vencimento: dataVencimento,
  };
}

/**
 * Identifica a qual mês/ano de fatura uma compra pertence, baseada na data da compra
 * e no dia de fechamento do cartão.
 */
export function determinarFaturaParaData(
  dataCompraStr: string,
  diaFechamentoCartao?: number | null
): { mes_fatura: number; ano_fatura: number } {
  if (!dataCompraStr) {
    const d = new Date();
    return { mes_fatura: d.getMonth() + 1, ano_fatura: d.getFullYear() };
  }

  const [anoStr, mesStr, diaStr] = dataCompraStr.split("-");
  const anoCompra = parseInt(anoStr, 10);
  const mesCompra = parseInt(mesStr, 10);
  const diaCompra = parseInt(diaStr, 10);

  const diaFech = diaFechamentoCartao && diaFechamentoCartao > 0 && diaFechamentoCartao <= 31 ? diaFechamentoCartao : 22;

  // Se a compra ocorreu DEPOIS do dia de fechamento do mês, ela entra na fatura do mês SEGUINTE!
  if (diaCompra > diaFech) {
    const nextDate = new Date(anoCompra, mesCompra, 1);
    return {
      mes_fatura: nextDate.getMonth() + 1,
      ano_fatura: nextDate.getFullYear(),
    };
  }

  // Se ocorreu ATÉ o dia de fechamento, ela pertence à fatura do mês atual da compra
  return {
    mes_fatura: mesCompra,
    ano_fatura: anoCompra,
  };
}

export const FATURAS_QUERY_KEY = ["faturas_cartao"] as const;

export const useFaturasCartao = (cartaoId?: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const activeWorkspaceId = activeWorkspace?.id || null;

  // Query: Lista todas as faturas do cartão
  const { data: faturas = [], isLoading, refetch } = useQuery({
    queryKey: [...FATURAS_QUERY_KEY, cartaoId, activeWorkspaceId],
    queryFn: async (): Promise<FaturaCartao[]> => {
      if (!cartaoId || !activeWorkspaceId) return [];
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return [];

      const query = supabase
        .from("faturas_cartao")
        .select("*")
        .eq("cartao_id", cartaoId)
        .eq("workspace_id", activeWorkspaceId)
        .order("ano_fatura", { ascending: false })
        .order("mes_fatura", { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error("useFaturasCartao", "Erro ao buscar faturas", { error: error.message });
        throw error;
      }
      return (data || []) as FaturaCartao[];
    },
    enabled: !!cartaoId && !!activeWorkspaceId,
  });

  // Mutation: Criar ou obter fatura (Upsert por período)
  const getOrCreateFatura = useMutation({
    mutationFn: async ({
      cartao,
      mes,
      ano,
    }: {
      cartao: { id: string; dia_fechamento?: number | null; dia_vencimento?: number | null };
      mes: number;
      ano: number;
    }): Promise<FaturaCartao> => {
      if (!activeWorkspaceId) throw new Error("Workspace não selecionado");
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Tenta buscar fatura existente
      let queryExistente = supabase
        .from("faturas_cartao")
        .select("*")
        .eq("cartao_id", cartao.id)
        .eq("mes_fatura", mes)
        .eq("ano_fatura", ano);

      if (activeWorkspaceId) {
        queryExistente = queryExistente.eq("workspace_id", activeWorkspaceId);
      }

      const { data: existente } = await queryExistente.maybeSingle();

      if (existente) {
        return existente as FaturaCartao;
      }

      // 2. Se não existir, calcula o período e cria
      const periodo = calcularPeriodoFatura(cartao, mes, ano);

      const novaFaturaPayload = {
        user_id: user.id,
        workspace_id: activeWorkspaceId,
        cartao_id: cartao.id,
        mes_fatura: mes,
        ano_fatura: ano,
        data_inicio: periodo.data_inicio,
        data_fechamento: periodo.data_fechamento,
        data_vencimento: periodo.data_vencimento,
        valor_total: 0,
        valor_pago: 0,
        status: "aberta",
      };

      const { data: nova, error } = await supabase
        .from("faturas_cartao")
        .insert(novaFaturaPayload)
        .select()
        .single();

      if (error) throw error;
      return nova as FaturaCartao;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FATURAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["fatura-cartao-detalhe"] });
    },
  });

  // Mutation: Atualizar status / valor_pago de uma fatura
  const updateFatura = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<FaturaCartao>;
    }) => {
      let q = supabase
        .from("faturas_cartao")
        .update(payload)
        .eq("id", id);
      if (activeWorkspaceId) {
        q = q.eq("workspace_id", activeWorkspaceId);
      }
      const { data, error } = await q
        .select()
        .single();

      if (error) throw error;
      return data as FaturaCartao;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FATURAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["fatura-cartao-detalhe"] });
    },
  });

  // Mutation: Excluir fatura (se sem compras vinculadas)
  const deleteFatura = useMutation({
    mutationFn: async (id: string) => {
      let q = supabase.from("faturas_cartao").delete().eq("id", id);
      if (activeWorkspaceId) {
        q = q.eq("workspace_id", activeWorkspaceId);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FATURAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["fatura-cartao-detalhe"] });
      toast({ title: "Fatura removida" });
    },
  });

  return {
    faturas,
    isLoading,
    refetch,
    getOrCreateFatura: getOrCreateFatura.mutateAsync,
    updateFatura: updateFatura.mutateAsync,
    deleteFatura: deleteFatura.mutateAsync,
  };
};
