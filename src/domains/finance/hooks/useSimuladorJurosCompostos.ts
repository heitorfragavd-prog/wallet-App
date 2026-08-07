import { useMemo, useState } from "react";
import { useInvestimentos } from "./useInvestimentos";
import { obterTaxaRealAnual } from "./useProjecaoInvestimentos";

export interface MesProjecao {
  mes: number;
  juros: number;
  totalInvestido: number;
  totalJuros: number;
  totalAcumulado: number;
}

export interface ResultadoSimulador {
  valorInicial: number;
  valorFinal: number;
  totalInvestido: number;
  totalJuros: number;
  taxaMediaAnual: number;
  periodoMeses: number;
  dadosMensais: MesProjecao[];
}

const PERIODOS = [
  { label: "1 mês", meses: 1 },
  { label: "3 meses", meses: 3 },
  { label: "6 meses", meses: 6 },
  { label: "1 ano", meses: 12 },
  { label: "5 anos", meses: 60 },
];

export function useSimuladorJurosCompostos() {
  const { investimentos } = useInvestimentos();

  const [periodoMeses, setPeriodoMeses] = useState<number>(12);

  const resultado = useMemo((): ResultadoSimulador | null => {
    if (!investimentos || investimentos.length === 0) return null;

    const valorInicial = investimentos.reduce((s, i) => s + (i.valor_atual || 0), 0);
    if (valorInicial <= 0) return null;

    // Calcular a taxa real anual ponderada suportando indexadores (CDI, IPCA, prefixado)
    const somaPesosTaxas = investimentos.reduce(
      (s, i) => {
        const taxaReal = obterTaxaRealAnual(i.taxa_rendimento_anual || 0, i.taxa_referencia, 4.5);
        return s + (i.valor_atual || 0) * (taxaReal / 100);
      },
      0
    );
    const taxaMediaAnual = somaPesosTaxas / valorInicial; // Fração decimal (ex: 0.12 para 12%)

    const taxaMensal = taxaMediaAnual / 12;

    const dadosMensais: MesProjecao[] = [];
    let acumulado = valorInicial;
    let totalJurosAcumulado = 0;

    for (let m = 0; m <= periodoMeses; m++) {
      const jurosDoMes = m === 0 ? 0 : acumulado * taxaMensal;
      acumulado += jurosDoMes;
      totalJurosAcumulado += jurosDoMes;

      dadosMensais.push({
        mes: m,
        juros: jurosDoMes,
        totalInvestido: valorInicial,
        totalJuros: totalJurosAcumulado,
        totalAcumulado: acumulado,
      });
    }

    const valorFinal = acumulado;
    const totalJuros = valorFinal - valorInicial;

    return {
      valorInicial,
      valorFinal,
      totalInvestido: valorInicial,
      totalJuros,
      taxaMediaAnual: taxaMediaAnual * 100, // Retorna como percentual (ex: 12.0)
      periodoMeses,
      dadosMensais,
    };
  }, [investimentos, periodoMeses]);

  return { periodoMeses, setPeriodoMeses, resultado, periodos: PERIODOS };
}
