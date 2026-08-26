import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface FaturaImportacaoInfo {
  id: string;
  total_lancamentos: number;
  total_fatura: number;
  ajustes_fatura: number;
  hash_documento?: string;
  transacoes_criadas: number;
  created_at: string;
}

export interface FaturaCartaoTransacao {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  mes_referencia: string;
  categoria_id?: string;
  cartao_id: string;
  conta_id?: string;
  parcela_atual?: number;
  total_parcelas?: number;
  importacao_id?: string;
  hash_importacao?: string;
  numero_linha_importacao?: number;
  categorias?: {
    id: string;
    nome: string;
    cor?: string;
    icone?: string;
  };
}

export interface UseFaturaCartaoProps {
  cartaoId?: string | null;
  mesReferencia?: string | null; // Formato "YYYY-MM" (ex: "2026-08")
  workspaceId?: string | null;
}

export function useFaturaCartao({ cartaoId, mesReferencia, workspaceId }: UseFaturaCartaoProps) {
  const { activeWorkspace } = useWorkspace();
  const effectiveWorkspaceId = workspaceId !== undefined ? workspaceId : activeWorkspace?.id;

  return useQuery({
    queryKey: ["fatura-cartao-detalhe", cartaoId, mesReferencia, effectiveWorkspaceId],
    queryFn: async () => {
      if (!cartaoId || !mesReferencia) {
        return {
          transacoes: [] as FaturaCartaoTransacao[],
          importacao: null as FaturaImportacaoInfo | null,
          totalLancamentos: 0,
          totalFatura: 0,
          ajustesFatura: 0,
          quantidade: 0,
        };
      }

      // 1. Buscar registro oficial da importação em fatura_cartao_importacoes
      let impQuery = supabase
        .from("fatura_cartao_importacoes")
        .select("*")
        .eq("conta_id", cartaoId)
        .eq("mes_referencia", mesReferencia)
        .order("created_at", { ascending: false })
        .limit(1);

      if (effectiveWorkspaceId) {
        impQuery = impQuery.eq("workspace_id", effectiveWorkspaceId);
      }

      const { data: impData, error: impError } = await impQuery.maybeSingle();

      if (impError && impError.code !== "PGRST116") {
        console.error("[useFaturaCartao] Erro ao buscar cabeçalho da importação:", impError);
      }

      // 2. Buscar transações vinculadas ao cartão e mês de referência
      let transQuery = supabase
        .from("transacoes")
        .select("*, categorias(id, nome, cor, icone)")
        .or(`cartao_id.eq.${cartaoId},conta_id.eq.${cartaoId}`)
        .eq("tipo", "despesa")
        .eq("mes_referencia", mesReferencia)
        .gt("valor", 0)
        .order("data", { ascending: true })
        .order("numero_linha_importacao", { ascending: true, nullsFirst: false });

      if (effectiveWorkspaceId) {
        transQuery = transQuery.eq("workspace_id", effectiveWorkspaceId);
      }

      const { data: transacoes, error: transError } = await transQuery;

      if (transError) {
        console.error("[useFaturaCartao] Erro ao buscar transações:", transError);
        throw transError;
      }

      const listaTransacoes = (transacoes || []) as FaturaCartaoTransacao[];
      const somaCalculada = listaTransacoes.reduce((acc, t) => acc + Number(t.valor || 0), 0);

      const totalLancamentos = impData?.total_lancamentos !== undefined && impData?.total_lancamentos !== null
        ? Number(impData.total_lancamentos)
        : somaCalculada;

      const totalFatura = impData?.total_fatura !== undefined && impData?.total_fatura !== null
        ? Number(impData.total_fatura)
        : (totalLancamentos + Number(impData?.ajustes_fatura || 0));

      const ajustesFatura = impData?.ajustes_fatura !== undefined && impData?.ajustes_fatura !== null
        ? Number(impData.ajustes_fatura)
        : 0;

      return {
        transacoes: listaTransacoes,
        importacao: impData as FaturaImportacaoInfo | null,
        totalLancamentos,
        totalFatura,
        ajustesFatura,
        quantidade: listaTransacoes.length,
      };
    },
    enabled: Boolean(cartaoId && mesReferencia),
    staleTime: 1000 * 60 * 5, // 5 minutos de cache
  });
}
