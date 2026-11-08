import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { formatarDataParaSaoPaulo, getHojeSaoPaulo } from "../utils/dateHelpers";
import {
  FinancialConsolidationService,
  type DespesaInput,
  type TransacaoInput,
} from "../services/FinancialConsolidationService";

export interface ComposicaoMensalDespesa {
  mes: string; // "YYYY-MM"
  saidasCaixa: number;
  despesasOperacionais: number;
  comprasEstoque: number;
  transferenciasInternas: number;
  qtdRegistros: number;
}

export interface MediaMensalConsolidada {
  mediaMensal: number;
  somaTotal: number;
  mesesConsiderados: number;
  composicaoMensal: ComposicaoMensalDespesa[];
  totaisPorClassificacao: {
    saidasCaixa: number;
    despesasOperacionais: number;
    comprasEstoque: number;
    transferenciasInternas: number;
  };
  duplicidadesEvitadas: number;
}

const CATEGORIAS_ESTOQUE_KEYWORDS = [
  "mercadoria",
  "mercadorias",
  "estoque",
  "bebida",
  "bebidas",
  "alimento",
  "alimentos",
  "insumo",
  "insumos",
  "revenda",
  "fornecedor",
  "compra de mercadorias",
];

export function useMediaMensalDespesas() {
  const { activeWorkspace } = useWorkspace();

  return useQuery({
    queryKey: ["media-mensal-despesas", activeWorkspace?.id],
    queryFn: async (): Promise<number> => {
      if (!activeWorkspace?.id) return 0;

      // Consolidação financeira gerencial canônica (6 meses fechados completos)
      const hojeSP = getHojeSaoPaulo();
      const [ano, mes] = hojeSP.split("-").map(Number);

      const inicioData = new Date(ano, mes - 1 - 6, 1);
      const fimData = new Date(ano, mes - 1, 0);

      const dataInicioFormatada = formatarDataParaSaoPaulo(inicioData);
      const dataFimFormatada = formatarDataParaSaoPaulo(fimData);

      // 1. Busca despesas quitadas dos últimos 6 meses fechados
      const despesasQuery = supabase
        .from("despesas")
        .select(`
          id,
          valor,
          data,
          status,
          descricao,
          workspace_id,
          fatura_id,
          categoria_id,
          deduplication_key,
          divipay_external_id,
          observacoes,
          categorias(nome)
        `)
        .eq("workspace_id", activeWorkspace.id)
        .eq("status", "pago")
        .is("fatura_id", null)
        .gte("data", dataInicioFormatada)
        .lte("data", dataFimFormatada);

      // 2. Busca transações de despesa/saída dos últimos 6 meses fechados
      const transacoesQuery = supabase
        .from("transacoes")
        .select(`
          id,
          valor,
          data,
          tipo,
          tipo_transacao,
          natureza_operacao,
          descricao,
          workspace_id,
          conta_id,
          conta_destino_id,
          cartao_id,
          categoria_id,
          observacoes,
          deduplication_key,
          divipay_external_id,
          categorias(nome)
        `)
        .eq("workspace_id", activeWorkspace.id)
        .in("tipo", ["despesa", "transferencia", "estorno", "reembolso"])
        .gte("data", dataInicioFormatada)
        .lte("data", dataFimFormatada);

      const [despesasResp, transacoesResp] = await Promise.all([
        despesasQuery,
        transacoesQuery,
      ]);

      if (despesasResp.error) {
        console.error("Erro ao buscar despesas para média mensal:", despesasResp.error);
        throw despesasResp.error;
      }
      if (transacoesResp.error) {
        console.error("Erro ao buscar transações para média mensal:", transacoesResp.error);
        throw transacoesResp.error;
      }

      const rawDespesas = (despesasResp.data ?? []) as unknown as DespesaInput[];
      const rawTransacoes = (transacoesResp.data ?? []) as unknown as TransacaoInput[];

      // 3. Aplicação do Motor Canônico de Consolidação (elimina duplicidades e transferências internas)
      const report = FinancialConsolidationService.consolidate({
        workspaceId: activeWorkspace.id,
        despesas: rawDespesas,
        transacoes: rawTransacoes,
        options: {
          startDate: dataInicioFormatada,
          endDate: dataFimFormatada,
          ignoreInternalTransfers: true,
          ignoreCreditCardInvoicePayments: true,
        },
      });

      // Se não há saídas registradas, retorna 0
      if (report.saidasEfetivamentePagas === 0 && report.itensConsolidados.length === 0) {
        return 0;
      }

      // Conta quantos meses distintos possuem dados nos 6 meses fechados
      const mesesComDados = new Set<string>();
      report.itensConsolidados.forEach((item) => {
        if (item.data) mesesComDados.add(item.data.slice(0, 7));
      });

      const divisorMeses = Math.min(6, Math.max(1, mesesComDados.size));

      // Média mensal canônica baseada nas saídas efetivas de caixa
      const mediaCalculada = report.saidasEfetivamentePagas / divisorMeses;

      // Arredonda para 2 casas decimais com precisão monetária
      return Math.round(mediaCalculada * 100) / 100;
    },
    enabled: !!activeWorkspace?.id,
  });
}
