import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  cartao: { dia_fechamento?: number | null; dia_vencimento?: number | null },
  mes: number,
  ano: number
): PeriodoFaturaInfo {
  const diaFech = cartao.dia_fechamento && cartao.dia_fechamento > 0 && cartao.dia_fechamento <= 31 ? cartao.dia_fechamento : 22;
  const diaVenc = cartao.dia_vencimento && cartao.dia_vencimento > 0 && cartao.dia_vencimento <= 31 ? cartao.dia_vencimento : 21;

  // Data de fechamento do mês da fatura (ex: 22/07/2026)
  const maxFechCurrentMonth = new Date(ano, mes, 0).getDate();
  const actualFechDay = Math.min(diaFech, maxFechCurrentMonth);
  const dataFechamento = `${ano}-${String(mes).padStart(2, "0")}-${String(actualFechDay).padStart(2, "0")}`;

  // Data de início = Fechamento do mês anterior (ex: 22/06/2026)
  const prevMonthDate = new Date(ano, mes - 2, 1);
  const prevAno = prevMonthDate.getFullYear();
  const prevMes = prevMonthDate.getMonth() + 1;
  const maxFechPrevMonth = new Date(prevAno, prevMes, 0).getDate();
  const actualPrevFechDay = Math.min(diaFech, maxFechPrevMonth);
  const dataInicio = `${prevAno}-${String(prevMes).padStart(2, "0")}-${String(actualPrevFechDay).padStart(2, "0")}`;

  // Data de vencimento: se dia_vencimento <= dia_fechamento, o vencimento é no mês seguinte
  let vencAno = ano;
  let vencMes = mes;
  if (diaVenc <= diaFech) {
    const nextMonthDate = new Date(ano, mes, 1);
    vencAno = nextMonthDate.getFullYear();
    vencMes = nextMonthDate.getMonth() + 1;
  }
  const maxVencDay = new Date(vencAno, vencMes, 0).getDate();
  const actualVencDay = Math.min(diaVenc, maxVencDay);
  const dataVencimento = `${vencAno}-${String(vencMes).padStart(2, "0")}-${String(actualVencDay).padStart(2, "0")}`;

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
  const { activeWorkspaceId } = useWorkspace();

  // Query: Lista todas as faturas do cartão
  const { data: faturas = [], isLoading, refetch } = useQuery({
    queryKey: [...FATURAS_QUERY_KEY, cartaoId, activeWorkspaceId],
    queryFn: async (): Promise<FaturaCartao[]> => {
      if (!cartaoId) return [];
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return [];

      let query = supabase
        .from("faturas_cartao")
        .select("*")
        .eq("cartao_id", cartaoId)
        .order("ano_fatura", { ascending: false })
        .order("mes_fatura", { ascending: false });

      if (activeWorkspaceId) {
        query = query.eq("workspace_id", activeWorkspaceId);
      }

      const { data, error } = await query;
      if (error) {
        logger.error("useFaturasCartao", "Erro ao buscar faturas", { error: error.message });
        throw error;
      }
      return (data || []) as FaturaCartao[];
    },
    enabled: !!cartaoId,
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
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Tenta buscar fatura existente
      const { data: existente } = await supabase
        .from("faturas_cartao")
        .select("*")
        .eq("cartao_id", cartao.id)
        .eq("mes_fatura", mes)
        .eq("ano_fatura", ano)
        .maybeSingle();

      if (existente) {
        return existente as FaturaCartao;
      }

      // 2. Se não existir, calcula o período e cria
      const periodo = calcularPeriodoFatura(cartao, mes, ano);

      const novaFaturaPayload = {
        user_id: user.id,
        workspace_id: activeWorkspaceId || null,
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
      const { data, error } = await supabase
        .from("faturas_cartao")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as FaturaCartao;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FATURAS_QUERY_KEY });
    },
  });

  // Mutation: Excluir fatura (se sem compras vinculadas)
  const deleteFatura = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("faturas_cartao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FATURAS_QUERY_KEY });
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
