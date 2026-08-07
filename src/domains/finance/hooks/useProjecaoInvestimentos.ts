export interface ProjecaoItem {
  mes: number;
  valorBruto: number;
  valorLiquido: number;
  valorReal: number;
  irDevido: number;
  inflacao: number;
}

export function projetar(
  valorInicial: number,
  taxaAnual: number,
  meses: number,
  aporteMensal: number,
  mostrarLiquido: boolean,
  mostrarReal: boolean,
  taxaIpcaAnual: number = 4.5
): ProjecaoItem[] {
  const taxaMensal = Math.pow(1 + taxaAnual / 100, 1 / 12) - 1;
  const ipcaMensal = Math.pow(1 + taxaIpcaAnual / 100, 1 / 12) - 1;

  const projecoes: ProjecaoItem[] = [];
  let valorBruto = valorInicial;

  for (let i = 1; i <= meses; i++) {
    valorBruto = valorBruto * (1 + taxaMensal) + aporteMensal;

    const totalAportado = valorInicial + aporteMensal * i;
    const rendimento = Math.max(0, valorBruto - totalAportado);

    const dias = i * 30;
    let aliquotaIR = 0.225;
    if (dias > 720) aliquotaIR = 0.15;
    else if (dias > 360) aliquotaIR = 0.175;
    else if (dias > 180) aliquotaIR = 0.20;

    const irDevido = rendimento * aliquotaIR;
    const valorLiquido = valorBruto - irDevido;

    const inflacaoAcumulada = Math.pow(1 + ipcaMensal, i) - 1;
    const valorReal = valorBruto / (1 + inflacaoAcumulada);

    projecoes.push({
      mes: i,
      valorBruto,
      valorLiquido: mostrarLiquido ? valorLiquido : valorBruto,
      valorReal: mostrarReal ? valorReal : valorBruto,
      irDevido,
      inflacao: inflacaoAcumulada * 100,
    });
  }

  return projecoes;
}

export function obterTaxaRealAnual(
  taxaRendimento: number,
  taxaReferencia?: string,
  ipcaAnual: number = 4.5,
  cdiAnual: number = 10.5
): number {
  const ref = (taxaReferencia || "").trim().toUpperCase();
  if (ref === "CDI") {
    const pct = taxaRendimento <= 2.5 ? taxaRendimento * 100 : taxaRendimento;
    return (pct / 100) * cdiAnual;
  }
  if (ref === "IPCA") {
    return taxaRendimento + ipcaAnual;
  }
  return taxaRendimento;
}

export function projetarPatrimonioTotal(
  investimentos: Array<{ valor_atual: number; taxa_rendimento_anual: number; taxa_referencia?: string }>,
  meses: number,
  aporteMensalTotal: number,
  taxaIpcaAnual: number = 4.5
): Array<{ mes: number; valorBruto: number }> {
  const n = investimentos.length;
  if (n === 0) return [];

  const aporteIndividual = aporteMensalTotal / n;
  const resultadosPorAtivo = investimentos.map((inv) => {
    const taxaReal = obterTaxaRealAnual(inv.taxa_rendimento_anual, inv.taxa_referencia, taxaIpcaAnual);
    return projetar(inv.valor_atual, taxaReal, meses, aporteIndividual, false, false, taxaIpcaAnual);
  });

  const resultadoTotal: Array<{ mes: number; valorBruto: number }> = [];
  for (let m = 0; m < meses; m++) {
    let sumBruto = 0;
    resultadosPorAtivo.forEach((res) => {
      if (res[m]) {
        sumBruto += res[m].valorBruto;
      }
    });
    resultadoTotal.push({
      mes: m + 1,
      valorBruto: sumBruto,
    });
  }

  return resultadoTotal;
}

export function useProjecaoInvestimentos() {
  return {
    projetar,
    projetarPatrimonioTotal,
  };
}
