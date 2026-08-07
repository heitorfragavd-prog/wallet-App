import { useMemo, useState } from "react";
import { useInvestimentos, calcularIR, calcularRentabilidadeReal } from "./useInvestimentos";
import { useConfiguracoesInvestimentos } from "./useConfiguracoesInvestimentos";
import { obterTaxaRealAnual } from "./useProjecaoInvestimentos";

export function useSimuladorRentabilidade() {
  const { investimentos } = useInvestimentos();
  const { configuracoes } = useConfiguracoesInvestimentos();

  const [periodoMeses, setPeriodoMeses] = useState<number>(12);

  const resultado = useMemo(() => {
    if (!investimentos || investimentos.length === 0) return null;

    const totalAtual = investimentos.reduce((s, i) => s + (i.valor_atual || 0), 0);
    if (totalAtual === 0) return null;

    const ipcaAnual = configuracoes?.taxa_ipca_anual || 4.5;

    // Calcular taxa média ponderada anual usando taxa real indexada
    const somaPesosTaxas = investimentos.reduce(
      (s, i) => {
        const taxaReal = obterTaxaRealAnual(i.taxa_rendimento_anual || 0, i.taxa_referencia, ipcaAnual);
        return s + (i.valor_atual || 0) * (taxaReal / 100);
      },
      0
    );
    const taxaMediaAnual = somaPesosTaxas / totalAtual;

    const taxaMensal = taxaMediaAnual / 12;
    const valorBruto = totalAtual * Math.pow(1 + taxaMensal, periodoMeses);
    const rendimento = valorBruto - totalAtual;

    const dias = periodoMeses * 30;
    const { ir, aliquota } = calcularIR(rendimento, dias);
    const valorLiquido = valorBruto - ir;

    const valorReal = calcularRentabilidadeReal(valorLiquido, periodoMeses, ipcaAnual);

    return {
      totalAtual,
      valorBruto,
      rendimento,
      ir,
      valorLiquido,
      valorReal,
      aliquotaIR: aliquota * 100,
      taxaMediaAnual: taxaMediaAnual * 100,
    };
  }, [investimentos, configuracoes, periodoMeses]);

  return { periodoMeses, setPeriodoMeses, resultado };
}
