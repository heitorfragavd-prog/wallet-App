import { useMemo } from "react";
import { useTransacoes } from "@/domains/finance/hooks/useTransacoes";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { useItensMercado } from "@/domains/market/hooks/useItensMercado";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface DRELineItem {
  codigo: string;
  descricao: string;
  valor: number;
  tipo: "receita" | "deducao" | "custo" | "despesa" | "subtotal" | "resultado";
  destaque?: boolean;
}

export interface DRESummary {
  faturamentoEyemobile: number;
  faturamentoDivipay: number;
  outrasReceitas: number;
  faturamentoBrutoTotal: number;

  custoInsumosMercado: number;
  taxasGatewayDivipay: number;
  custoTotalCPV: number;

  lucroBruto: number;
  margemBrutaPercentual: number;

  despesasOperacionais: number;

  lucroLiquido: number;
  margemLiquidaPercentual: number;

  linhas: DRELineItem[];
}

export const useDREData = () => {
  const { activeWorkspace } = useWorkspace();
  const { transacoes, loading: loadingTransacoes } = useTransacoes();
  const { receitas, loading: loadingReceitas } = useReceitas();
  const { despesas, loading: loadingDespesas } = useDespesas();
  const { itens, loading: loadingMercado } = useItensMercado();

  const dre = useMemo<DRESummary>(() => {
    // 1. Receitas
    let faturamentoEyemobile = 0;
    let faturamentoDivipay = 0;
    let outrasReceitas = 0;

    // Processar transações e receitas
    (receitas || []).forEach((r) => {
      const descLower = (r.descricao || "").toLowerCase();
      if (descLower.includes("eyemobile") || descLower.includes("pdv")) {
        faturamentoEyemobile += Number(r.valor || 0);
      } else if (descLower.includes("divipay") || descLower.includes("pix")) {
        faturamentoDivipay += Number(r.valor || 0);
      } else {
        outrasReceitas += Number(r.valor || 0);
      }
    });

    (transacoes || []).forEach((t) => {
      if (t.tipo === "receita") {
        const descLower = (t.descricao || "").toLowerCase();
        if (descLower.includes("eyemobile") || descLower.includes("pdv")) {
          faturamentoEyemobile += Number(t.valor || 0);
        } else if (descLower.includes("divipay")) {
          faturamentoDivipay += Number(t.valor || 0);
        } else {
          outrasReceitas += Number(t.valor || 0);
        }
      }
    });

    const faturamentoBrutoTotal = faturamentoEyemobile + faturamentoDivipay + outrasReceitas;

    // 2. Custos de Insumo (Mercado) & Taxas de Gateway (Divipay)
    let custoInsumosMercado = 0;
    (itens || []).forEach((item) => {
      // Itens de mercado em estoque multiplicados pelo preço atual
      custoInsumosMercado += Number(item.preco_atual || 0) * Number(item.quantidade_atual || 0);
    });

    // Estimativa de taxas gateway (2.5% sobre Divipay) ou taxas registradas
    const taxasGatewayDivipay = faturamentoDivipay * 0.025;
    const custoTotalCPV = custoInsumosMercado + taxasGatewayDivipay;

    // 3. Lucro Bruto
    const lucroBruto = faturamentoBrutoTotal - custoTotalCPV;
    const margemBrutaPercentual = faturamentoBrutoTotal > 0 ? (lucroBruto / faturamentoBrutoTotal) * 100 : 0;

    // 4. Despesas Operacionais
    let despesasOperacionais = 0;
    (despesas || []).forEach((d) => {
      despesasOperacionais += Number(d.valor || 0);
    });

    // 5. Lucro Líquido
    const lucroLiquido = lucroBruto - despesasOperacionais;
    const margemLiquidaPercentual = faturamentoBrutoTotal > 0 ? (lucroLiquido / faturamentoBrutoTotal) * 100 : 0;

    // Linhas formatadas da DRE
    const linhas: DRELineItem[] = [
      { codigo: "1", descricao: "(+) Faturamento Eyemobile PDV", valor: faturamentoEyemobile, tipo: "receita" },
      { codigo: "1.2", descricao: "(+) Entradas Divipay", valor: faturamentoDivipay, tipo: "receita" },
      { codigo: "1.3", descricao: "(+) Outras Receitas Operacionais", valor: outrasReceitas, tipo: "receita" },
      { codigo: "1.T", descricao: "(=) FATURAMENTO BRUTO TOTAL", valor: faturamentoBrutoTotal, tipo: "subtotal", destaque: true },

      { codigo: "2.1", descricao: "(-) Custo de Insumos & Matéria-Prima (Mercado)", valor: custoInsumosMercado, tipo: "custo" },
      { codigo: "2.2", descricao: "(-) Taxas de Gateway & Plataforma (Divipay)", valor: taxasGatewayDivipay, tipo: "custo" },
      { codigo: "2.T", descricao: "(=) CUSTO DOS PRODUTOS/SERVIÇOS VENDIDOS (CPV)", valor: custoTotalCPV, tipo: "subtotal" },

      { codigo: "3.T", descricao: "(=) LUCRO BRUTO", valor: lucroBruto, tipo: "subtotal", destaque: true },

      { codigo: "4.1", descricao: "(-) Despesas Operacionais & Administrativas", valor: despesasOperacionais, tipo: "despesa" },

      { codigo: "5.T", descricao: "(=) LUCRO LÍQUIDO DO EXERCÍCIO", valor: lucroLiquido, tipo: "resultado", destaque: true },
    ];

    return {
      faturamentoEyemobile,
      faturamentoDivipay,
      outrasReceitas,
      faturamentoBrutoTotal,
      custoInsumosMercado,
      taxasGatewayDivipay,
      custoTotalCPV,
      lucroBruto,
      margemBrutaPercentual,
      despesasOperacionais,
      lucroLiquido,
      margemLiquidaPercentual,
      linhas,
    };
  }, [receitas, transacoes, despesas, itens]);

  return {
    dre,
    loading: loadingTransacoes || loadingReceitas || loadingDespesas || loadingMercado,
    activeWorkspace,
  };
};
