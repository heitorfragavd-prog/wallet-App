import { useMemo, useState } from "react";
import { useInvestimentos, calcularIR, calcularRentabilidadeReal } from "./useInvestimentos";
import { useConfiguracoesInvestimentos } from "./useConfiguracoesInvestimentos";
import { obterTaxaRealAnual } from "./useProjecaoInvestimentos";

export function useSimuladorRentabilidade(
  selectedAssetIds?: string[],
  simulatedValues?: Record<string, number>
) {
  const { investimentos } = useInvestimentos();
  const { configuracoes } = useConfiguracoesInvestimentos();

  const [periodoMeses, setPeriodoMeses] = useState<number>(12);

  const resultado = useMemo(() => {
    if (!investimentos || investimentos.length === 0) return null;

    const filteredInvestimentos = selectedAssetIds
      ? investimentos.filter((i) => selectedAssetIds.includes(i.id))
      : investimentos;

    if (filteredInvestimentos.length === 0) {
      return {
        totalAtual: 0,
        valorBruto: 0,
        rendimento: 0,
        ir: 0,
        valorLiquido: 0,
        valorReal: 0,
        aliquotaIR: 0,
        taxaMediaAnual: 0,
      };
    }

    const totalAtual = filteredInvestimentos.reduce((s, i) => {
      const val = (simulatedValues && simulatedValues[i.id] !== undefined)
        ? simulatedValues[i.id]
        : (i.valor_atual || 0);
      return s + val;
    }, 0);

    if (totalAtual === 0) {
      return {
        totalAtual: 0,
        valorBruto: 0,
        rendimento: 0,
        ir: 0,
        valorLiquido: 0,
        valorReal: 0,
        aliquotaIR: 0,
        taxaMediaAnual: 0,
      };
    }

    const ipcaAnual = configuracoes?.taxa_ipca_anual || 4.5;

    // Calcular taxa média ponderada anual usando taxa real indexada
    const somaPesosTaxas = filteredInvestimentos.reduce(
      (s, i) => {
        const val = (simulatedValues && simulatedValues[i.id] !== undefined)
          ? simulatedValues[i.id]
          : (i.valor_atual || 0);
        const taxaReal = obterTaxaRealAnual(i.taxa_rendimento_anual || 0, i.taxa_referencia, ipcaAnual);
        return s + val * (taxaReal / 100);
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
  }, [investimentos, configuracoes, periodoMeses, selectedAssetIds, simulatedValues]);

  return { periodoMeses, setPeriodoMeses, resultado };
}

