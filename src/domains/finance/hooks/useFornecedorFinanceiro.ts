import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface ItemHistoricoFornecedor {
  id: string;
  data: string;
  competencia: string;
  descricao: string;
  metodoPagamento: "pix" | "boleto" | "outro";
  valor: number;
  categoriaNome: string;
  status: "pago" | "pendente" | "cancelado";
  divipayExternalId?: string | null;
  comprovanteUrl?: string | null;
  despesaId?: string | null;
  dividaId?: string | null;
  origemEvidencia?: string | null;
}

export interface ResumoFinanceiroFornecedor {
  totalPagoNoMes: number;
  qtdPagamentos: number;
  totalPagoPix: number;
  totalPagoBoleto: number;
  totalPendente: number;
  totalVencido: number;
  ultimoPagamento: {
    data: string;
    valor: number;
    metodo: string;
  } | null;
  historico: ItemHistoricoFornecedor[];
}

export function useFornecedorFinanceiro(params: {
  fornecedorId?: string | null;
  fornecedorNome?: string | null;
  fornecedorCnpjCpf?: string | null;
  ano?: number;
  mes?: number;
}) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const { fornecedorId, fornecedorNome, fornecedorCnpjCpf, ano = new Date().getFullYear(), mes = new Date().getMonth() + 1 } = params;

  return useQuery({
    queryKey: ["fornecedor-financeiro", workspaceId, fornecedorId, ano, mes],
    enabled: !!workspaceId && !!fornecedorId,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<ResumoFinanceiroFornecedor> => {
      if (!workspaceId || !fornecedorId) {
        return {
          totalPagoNoMes: 0,
          qtdPagamentos: 0,
          totalPagoPix: 0,
          totalPagoBoleto: 0,
          totalPendente: 0,
          totalVencido: 0,
          ultimoPagamento: null,
          historico: [],
        };
      }

      // Intervalo do mês selecionado
      const mesStr = String(mes).padStart(2, "0");
      const dataInicioMes = `${ano}-${mesStr}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const dataFimMes = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, "0")}`;
      const hoje = new Date().toISOString().slice(0, 10);

      // 1. Busca conciliações Divipay vinculadas a este fornecedor
      const { data: conciliacoesRaw } = await (supabase as any)
        .from("divipay_conciliacoes")
        .select("*, categorias (nome)")
        .eq("workspace_id", workspaceId)
        .eq("contato_id", fornecedorId);

      // 2. Busca despesas diretas vinculadas ao fornecedor via contato_id
      const { data: despesasRaw } = await (supabase as any)
        .from("despesas")
        .select("*, categorias (nome)")
        .eq("workspace_id", workspaceId)
        .eq("contato_id", fornecedorId);

      // 3. Busca dívidas abertas e quitadas deste fornecedor
      let queryDividas = (supabase as any)
        .from("dividas")
        .select("*, categorias (nome)")
        .eq("workspace_id", workspaceId);

      if (fornecedorNome) {
        queryDividas = queryDividas.or(`contato_id.eq.${fornecedorId},credor.ilike.%${fornecedorNome}%`);
      } else {
        queryDividas = queryDividas.eq("contato_id", fornecedorId);
      }
      const { data: dividasRaw } = await queryDividas;

      // Monta histórico unificado
      const itens: ItemHistoricoFornecedor[] = [];
      const despesasProcessadas = new Set<string>();

      // Adiciona conciliações Divipay
      (conciliacoesRaw || []).forEach((c: any) => {
        if (c.despesa_id) despesasProcessadas.add(c.despesa_id);
        const dataStr = c.data_pagamento ? c.data_pagamento.slice(0, 10) : "";
        const isBoleto = c.metodo_pagamento === "boleto" || c.tipo === "BILLET";
        itens.push({
          id: `conc-${c.id}`,
          data: dataStr,
          competencia: c.competencia || dataStr.slice(0, 7) || `${ano}-${mesStr}`,
          descricao: c.descricao || (isBoleto ? "Pagamento de Boleto" : "Transferência Pix"),
          metodoPagamento: isBoleto ? "boleto" : "pix",
          valor: Number(c.valor || 0),
          categoriaNome: c.categorias?.nome || "Compra de Mercadorias",
          status: c.status === "conciliada" || c.status === "importada" ? "pago" : "pendente",
          divipayExternalId: c.divipay_external_id,
          comprovanteUrl: c.comprovante_url,
          despesaId: c.despesa_id,
          dividaId: c.divida_id,
          origemEvidencia: c.origem_evidencia,
        });
      });

      // Adiciona despesas que não vieram da conciliação Divipay
      (despesasRaw || []).forEach((d: any) => {
        if (despesasProcessadas.has(d.id)) return;
        const dataStr = d.data || "";
        const isBoleto = String(d.metodo_pagamento).toLowerCase() === "boleto";
        itens.push({
          id: `desp-${d.id}`,
          data: dataStr,
          competencia: dataStr.slice(0, 7) || `${ano}-${mesStr}`,
          descricao: d.descricao || "Despesa de Fornecedor",
          metodoPagamento: isBoleto ? "boleto" : "pix",
          valor: Number(d.valor || 0),
          categoriaNome: d.categorias?.nome || "Fornecedores",
          status: d.status === "pago" ? "pago" : "pendente",
          despesaId: d.id,
        });
      });

      // Ordena histórico: mais recentes primeiro
      itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      // Cálculos dos Indicadores
      let totalPagoNoMes = 0;
      let qtdPagamentos = 0;
      let totalPagoPix = 0;
      let totalPagoBoleto = 0;

      itens.forEach((item) => {
        if (item.status === "pago" && item.data >= dataInicioMes && item.data <= dataFimMes) {
          totalPagoNoMes += item.valor;
          qtdPagamentos++;
          if (item.metodoPagamento === "boleto") {
            totalPagoBoleto += item.valor;
          } else {
            totalPagoPix += item.valor;
          }
        }
      });

      // Dívidas pendentes e vencidas
      let totalPendente = 0;
      let totalVencido = 0;

      (dividasRaw || []).forEach((div: any) => {
        if (div.status !== "quitada") {
          const valorRestante = Number(div.valor_restante || 0);
          totalPendente += valorRestante;
          if (div.data_vencimento && div.data_vencimento < hoje) {
            totalVencido += valorRestante;
          }
        }
      });

      const ultimoPago = itens.find((i) => i.status === "pago");
      const ultimoPagamento = ultimoPago
        ? {
            data: ultimoPago.data,
            valor: ultimoPago.valor,
            metodo: ultimoPago.metodoPagamento,
          }
        : null;

      return {
        totalPagoNoMes,
        qtdPagamentos,
        totalPagoPix,
        totalPagoBoleto,
        totalPendente,
        totalVencido,
        ultimoPagamento,
        historico: itens,
      };
    },
  });
}
