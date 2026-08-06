import { Investimento } from "./useInvestimentos";
import { MetaInvestimento } from "./useMetasInvestimento";

export interface SugestaoRebalanceamento {
  tipo_sugerido: "renda_fixa" | "renda_variavel";
  valor: number;
  motivo: string;
}

export function calcularAlocacaoAtual(investimentos: Investimento[]): {
  pctFixa: number;
  pctVariavel: number;
  valorFixa: number;
  valorVariavel: number;
  total: number;
} {
  const total = investimentos.reduce((sum, i) => sum + Number(i.valor_atual || 0), 0);
  if (total === 0) {
    return { pctFixa: 0, pctVariavel: 0, valorFixa: 0, valorVariavel: 0, total: 0 };
  }

  const valorFixa = investimentos
    .filter((i) => i.tipo === "renda_fixa" || i.tipo === "poupanca")
    .reduce((sum, i) => sum + Number(i.valor_atual || 0), 0);

  const valorVariavel = investimentos
    .filter((i) => i.tipo === "renda_variavel" || i.tipo === "cripto" || i.tipo === "fundo" || i.tipo === "outro")
    .reduce((sum, i) => sum + Number(i.valor_atual || 0), 0);

  return {
    pctFixa: (valorFixa / total) * 100,
    pctVariavel: (valorVariavel / total) * 100,
    valorFixa,
    valorVariavel,
    total,
  };
}

export function sugerirAporte(
  investimentos: Investimento[],
  meta: MetaInvestimento,
  valorAporte: number
): SugestaoRebalanceamento[] {
  const { pctFixa, pctVariavel, total } = calcularAlocacaoAtual(investimentos);

  if (total === 0) {
    return [
      {
        tipo_sugerido: "renda_fixa",
        valor: valorAporte,
        motivo: "Sua carteira de investimentos está vazia. Sugerimos iniciar pela Renda Fixa.",
      },
    ];
  }

  const metaFixa = Number(meta.alocacao_fixa || 60);
  const metaVariavel = Number(meta.alocacao_variavel || 40);

  const sugestoes: SugestaoRebalanceamento[] = [];

  // Se a percentagem de RF atual é maior que a meta de RF, o rebalanceamento sugere aportar em RV
  if (pctFixa > metaFixa) {
    sugestoes.push({
      tipo_sugerido: "renda_variavel",
      valor: valorAporte,
      motivo: `A parcela de Renda Fixa está em ${pctFixa.toFixed(0)}% (Meta: ${metaFixa}%), acima do ideal. Aporte em Renda Variável para rebalancear.`,
    });
  } else {
    sugestoes.push({
      tipo_sugerido: "renda_fixa",
      valor: valorAporte,
      motivo: `A parcela de Renda Variável está em ${pctVariavel.toFixed(0)}% (Meta: ${metaVariavel}%), acima do ideal. Aporte em Renda Fixa para rebalancear.`,
    });
  }

  return sugestoes;
}

export function useRebalanceamento() {
  return {
    calcularAlocacaoAtual,
    sugerirAporte,
  };
}
