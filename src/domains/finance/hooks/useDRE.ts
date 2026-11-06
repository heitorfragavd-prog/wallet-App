import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { CeoFinancialMetricsService, RelatorioLucroLiquidoReal } from "@/domains/ceo/services/CeoFinancialMetricsService";
import type { DREGerencial, LinhaDRE } from "@/domains/finance/types/foodCost";

export const DRE_QUERY_KEY = ["dre_gerencial"] as const;

interface FetchDREParams {
  mes: number;
  ano: number;
  workspaceId?: string | null;
}

interface DREHistoricoMes {
  periodo: string;
  mes: number;
  ano: number;
  receitaBruta: number;
  receitaLiquida: number;
  lucroBruto: number;
  despesasOperacionais: number;
  despesasCartao: number;
  ebitda: number;
  lair: number;
  lucroLiquido: number;
  margemBruta: number;
  margemEbitda: number;
  margemLiquida: number;
}

/**
 * Apura a DRE Gerencial canônica unificada a partir do motor central
 * CeoFinancialMetricsService.getRealNetProfit, garantindo paridade numérica
 * estrita entre Dashboard, Wallet CEO e DRE, sem alíquotas ou estimativas arbitrárias.
 */
async function calcularDRE({ mes, ano, workspaceId }: FetchDREParams): Promise<DREGerencial> {
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const periodo = `${meses[mes - 1]}/${ano}`;

  if (!workspaceId) {
    return {
      periodo,
      mes, ano,
      receitaBruta: 0,
      impostosSimples: 0,
      pisCofinsSobreReceita: 0,
      issServicos: 0,
      receitaLiquida: 0,
      cmv: 0,
      lucroBruto: 0,
      despesasOperacionais: 0,
      ebitda: 0,
      depreciacao: 0,
      lair: 0,
      irpj: 0,
      lucroLiquido: 0,
      margemBruta: 0,
      margemEbitda: 0,
      margemLiquida: 0,
      linhas: [],
      despesasCartao: 0,
    };
  }

  let relatorio: RelatorioLucroLiquidoReal;
  try {
    relatorio = await CeoFinancialMetricsService.getRealNetProfit(workspaceId, { mes, ano });
  } catch (err) {
    console.warn("[useDRE] Falha ao obter dados canônicos do CEO:", err);
    return {
      periodo,
      mes, ano,
      receitaBruta: 0,
      impostosSimples: 0,
      pisCofinsSobreReceita: 0,
      issServicos: 0,
      receitaLiquida: 0,
      cmv: 0,
      lucroBruto: 0,
      despesasOperacionais: 0,
      ebitda: 0,
      depreciacao: 0,
      lair: 0,
      irpj: 0,
      lucroLiquido: 0,
      margemBruta: 0,
      margemEbitda: 0,
      margemLiquida: 0,
      linhas: [],
      despesasCartao: 0,
    };
  }

  const receitaBruta = relatorio.faturamentoBruto;
  const deducoesVendas = relatorio.deducoesVendas;
  const receitaLiquida = relatorio.receitaLiquida;
  const cmv = relatorio.cmvReal;
  const lucroBruto = relatorio.lucroBruto;
  const despesasOperacionais = relatorio.despesasOperacionais;
  const despesasCartao = relatorio.despesasFinanceiras; // Taxas de adquirência, cartões e bancos
  const ebitda = relatorio.resultadoOperacional;
  const depreciacao = 0; // Depreciação contábil não arbitrada
  const lair = ebitda - depreciacao;
  const irpj = relatorio.tributosSobreResultado;
  const lucroLiquido = relatorio.lucroLiquido;

  const pct = (v: number) =>
    receitaBruta > 0 ? Math.round((v / receitaBruta) * 10000) / 100 : 0;

  let labelCMV = "(-) CMV — Custo de Mercadoria Vendida";
  if (relatorio.cmvComprovado > 0) {
    labelCMV = `(-) CMV Real (Auditado por NF — ${relatorio.coberturaCustosPercent}% cob.)`;
  } else if (relatorio.cmvReal > 0) {
    labelCMV = "(-) CMV Real (Referência de Atacado)";
  } else {
    labelCMV = "(-) CMV (Pendente de Custos Reais)";
  }

  const linhas: LinhaDRE[] = [
    { label: "Receita Bruta", valor: receitaBruta, tipo: "total" },
  ];

  if (deducoesVendas > 0) {
    linhas.push({
      label: "(-) Devoluções e Cancelamentos de Vendas",
      valor: -deducoesVendas,
      percentualSobreReceita: pct(deducoesVendas),
      tipo: "negativo",
      indent: 1,
    });
  }

  // Linha informativa de tributos sobre receita (sem estimativas fixas arbitrárias)
  linhas.push({
    label: "(-) Tributos sobre Vendas (Pendente de apuração fiscal)",
    valor: 0,
    percentualSobreReceita: 0,
    tipo: "negativo",
    indent: 1,
  });

  linhas.push(
    { label: "= Receita Líquida", valor: receitaLiquida, percentualSobreReceita: pct(receitaLiquida), tipo: "subtotal" },
    { label: labelCMV, valor: -cmv, percentualSobreReceita: pct(cmv), tipo: "negativo" },
    { label: "= Lucro Bruto", valor: lucroBruto, percentualSobreReceita: pct(lucroBruto), tipo: "subtotal" },
    { label: "(-) Despesas Operacionais (por Competência)", valor: -despesasOperacionais, percentualSobreReceita: pct(despesasOperacionais), tipo: "negativo" },
    { label: "(-) Despesas Financeiras e Taxas de Meios de Pagamento", valor: -despesasCartao, percentualSobreReceita: pct(despesasCartao), tipo: "negativo", indent: 1 },
    { label: "= EBITDA / Resultado Operacional", valor: ebitda, percentualSobreReceita: pct(ebitda), tipo: "subtotal" },
    { label: "= LAIR (Lucro antes do IR)", valor: lair, percentualSobreReceita: pct(lair), tipo: "subtotal" }
  );

  if (irpj > 0) {
    linhas.push({
      label: "(-) IRPJ / CSLL (Comprovados)",
      valor: -irpj,
      percentualSobreReceita: pct(irpj),
      tipo: "negativo",
      indent: 1,
    });
  } else {
    linhas.push({
      label: "(-) IRPJ / CSLL (Pendente de escrituração fiscal)",
      valor: 0,
      percentualSobreReceita: 0,
      tipo: "negativo",
      indent: 1,
    });
  }

  linhas.push({
    label: "= Lucro Líquido",
    valor: lucroLiquido,
    percentualSobreReceita: pct(lucroLiquido),
    tipo: "total",
  });

  return {
    periodo,
    mes, ano,
    receitaBruta,
    impostosSimples: 0,
    pisCofinsSobreReceita: 0,
    issServicos: 0,
    receitaLiquida,
    cmv,
    lucroBruto,
    despesasOperacionais,
    ebitda,
    depreciacao,
    lair,
    irpj,
    lucroLiquido,
    margemBruta: pct(lucroBruto),
    margemEbitda: pct(ebitda),
    margemLiquida: pct(lucroLiquido),
    linhas,
    despesasCartao,
  };
}

async function buscarHistoricoDRE(mesAtual: number, anoAtual: number, meses: number, workspaceId?: string | null): Promise<DREHistoricoMes[]> {
  const promises = Array.from({ length: meses }, (_, i) => {
    const d = new Date(anoAtual, mesAtual - 1 - i, 1);
    const m = d.getMonth() + 1;
    const a = d.getFullYear();
    return calcularDRE({ mes: m, ano: a, workspaceId })
      .then((dre) => ({
        periodo: dre.periodo,
        mes: m,
        ano: a,
        receitaBruta: dre.receitaBruta,
        receitaLiquida: dre.receitaLiquida,
        lucroBruto: dre.lucroBruto,
        despesasOperacionais: dre.despesasOperacionais,
        despesasCartao: dre.despesasCartao || 0,
        ebitda: dre.ebitda,
        lair: dre.lair,
        lucroLiquido: dre.lucroLiquido,
        margemBruta: dre.margemBruta,
        margemEbitda: dre.margemEbitda,
        margemLiquida: dre.margemLiquida,
      }))
      .catch(() => null);
  });

  const results = await Promise.all(promises);
  return (results.filter(Boolean) as DREHistoricoMes[]).reverse();
}

export function useDRE(mes?: number, ano?: number) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const hoje = new Date();
  const mesAtual = mes ?? hoje.getMonth() + 1;
  const anoAtual = ano ?? hoje.getFullYear();

  const { data: dre, isLoading: loadingDRE } = useQuery({
    queryKey: [...DRE_QUERY_KEY, mesAtual, anoAtual, workspaceId],
    queryFn: () => calcularDRE({ mes: mesAtual, ano: anoAtual, workspaceId }),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: historico, isLoading: loadingHistorico } = useQuery({
    queryKey: [...DRE_QUERY_KEY, "historico", mesAtual, anoAtual, workspaceId],
    queryFn: () => buscarHistoricoDRE(mesAtual, anoAtual, 6, workspaceId),
    staleTime: 1000 * 60 * 10,
    enabled: !!dre && !!workspaceId,
  });

  return { dre, historico, loading: loadingDRE, loadingHistorico };
}
