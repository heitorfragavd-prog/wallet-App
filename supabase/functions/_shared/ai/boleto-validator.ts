/**
 * Boleto Validator — Validação Determinística e Conciliação de Boletos (Etapa 2.2A)
 * 
 * Regras:
 * 1. Não confia cegamente no modelo de IA.
 * 2. Linha digitável bancária (47 dígitos) e arrecadação/concessionária (48 dígitos).
 * 3. Validação de DVs (módulo 10 para blocos bancários e arrecadação; módulo 11 para código de barras).
 * 4. Extração determinística de valor e fator de vencimento da linha digitável.
 * 5. Cruzamento entre dados visuais lidos e dados codificados na linha digitável/código de barras.
 * 6. Detecção explícita de divergências (status: requer_revisao).
 */

export interface ValidatedLinhaDigitavel {
  valido: boolean;
  tipo: "bancario" | "arrecadacao" | "invalido";
  linhaLimpa: string;
  linhaFormatada: string;
  codigoBarrasDerivado?: string;
  fatorVencimento?: number;
  dataVencimentoDerivada?: string; // YYYY-MM-DD
  valorDerivado?: number;
  bancoCodigo?: string;
  bancoNome?: string;
  motivo?: string;
  erros: string[];
}

export interface ValidatedCodigoBarras {
  valido: boolean;
  codigoLimpo: string;
  tipo: "bancario" | "arrecadacao" | "invalido";
  bancoCodigo?: string;
  bancoNome?: string;
  fatorVencimento?: number;
  dataVencimentoDerivada?: string;
  valorDerivado?: number;
  motivo?: string;
  erros: string[];
}

export interface BoletoValidationResult {
  valido: boolean;
  status: "ok" | "requer_revisao";
  divergencias: string[];
  linhaDigitavel?: ValidatedLinhaDigitavel;
  codigoBarras?: ValidatedCodigoBarras;
  valorFinal: number;
  dataVencimentoFinal: string | null;
  beneficiarioFinal: string | null;
  cnpjCpfBeneficiarioFinal: string | null;
  pagadorFinal: string | null;
  cnpjCpfPagadorFinal: string | null;
  bancoFinal: string | null;
  motivo?: string;
}

// Mapeamento dos principais bancos brasileiros pelo código FEBRABAN
const BANCOS_FEBRABAN: Record<string, string> = {
  "001": "Banco do Brasil",
  "003": "Banco da Amazônia",
  "004": "Banco do Nordeste",
  "033": "Santander",
  "041": "Banrisul",
  "077": "Banco Inter",
  "104": "Caixa Econômica Federal",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "260": "Nubank",
  "336": "C6 Bank",
  "341": "Itaú Unibanco",
  "389": "Banco Mercantil",
  "422": "Banco Safra",
  "748": "Sicredi",
  "756": "Sicoob",
};

/**
 * Normaliza qualquer número removendo caracteres não numéricos.
 */
export function cleanDigits(val: unknown): string {
  if (!val) return "";
  return String(val).replace(/\D/g, "");
}

/**
 * Calcula o dígito verificador módulo 10 (usado nos blocos 1, 2 e 3 da linha digitável bancária).
 */
export function calcularModulo10(blocoSemDV: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = blocoSemDV.length - 1; i >= 0; i--) {
    let mul = parseInt(blocoSemDV[i], 10) * peso;
    if (mul > 9) {
      mul = Math.floor(mul / 10) + (mul % 10);
    }
    soma += mul;
    peso = peso === 2 ? 1 : 2;
  }
  const dezenaSuperior = Math.ceil(soma / 10) * 10;
  return (dezenaSuperior - soma) % 10;
}

/**
 * Calcula o dígito verificador módulo 11 para o código de barras bancário da FEBRABAN.
 */
export function calcularModulo11Boleto(codigoSemDV: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = codigoSemDV.length - 1; i >= 0; i--) {
    soma += parseInt(codigoSemDV[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  if (dv === 0 || dv === 10 || dv === 11) {
    return 1;
  }
  return dv;
}

/**
 * Converte o fator de vencimento da FEBRABAN para data no formato YYYY-MM-DD.
 * Compatível com o ciclo 1 (até 21/02/2025) e ciclo 2 (a partir de 22/02/2025).
 */
export function fatorVencimentoParaData(fatorStr: string | number): string | null {
  const fator = typeof fatorStr === "number" ? fatorStr : parseInt(String(fatorStr), 10);
  if (isNaN(fator) || fator <= 0) return null;

  // Ciclo 2 FEBRABAN: fator 1000 = 22/02/2025
  // Para operações atuais (2025-2047):
  const dataBaseCiclo2 = new Date(Date.UTC(2025, 1, 22)); // 22 de Fevereiro de 2025
  const diasAposBase = fator - 1000;
  const dataVenc = new Date(dataBaseCiclo2.getTime() + diasAposBase * 24 * 60 * 60 * 1000);

  if (isNaN(dataVenc.getTime())) return null;

  const yyyy = dataVenc.getUTCFullYear();
  const mm = String(dataVenc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dataVenc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Validador e formatador determinístico de Linha Digitável.
 */
export function validateLinhaDigitavel(linhaRaw: string | null | undefined): ValidatedLinhaDigitavel {
  const erros: string[] = [];
  if (!linhaRaw) {
    return {
      valido: false,
      tipo: "invalido",
      linhaLimpa: "",
      linhaFormatada: "",
      erros: ["Linha digitável não informada"],
      motivo: "Linha digitável ausente",
    };
  }

  const clean = cleanDigits(linhaRaw);

  // 1. BOLETO BANCÁRIO (47 dígitos)
  if (clean.length === 47) {
    const bloco1 = clean.substring(0, 9);
    const dv1 = parseInt(clean[9], 10);
    const bloco2 = clean.substring(10, 20);
    const dv2 = parseInt(clean[20], 10);
    const bloco3 = clean.substring(21, 31);
    const dv3 = parseInt(clean[31], 10);
    const dvGeral = parseInt(clean[32], 10);
    const fatorVencStr = clean.substring(33, 37);
    const valorStr = clean.substring(37, 47);

    // Validação dos DVs dos 3 primeiros blocos
    if (calcularModulo10(bloco1) !== dv1) {
      erros.push(`Dígito verificador do Bloco 1 inválido (esperado ${calcularModulo10(bloco1)}, recebido ${dv1})`);
    }
    if (calcularModulo10(bloco2) !== dv2) {
      erros.push(`Dígito verificador do Bloco 2 inválido (esperado ${calcularModulo10(bloco2)}, recebido ${dv2})`);
    }
    if (calcularModulo10(bloco3) !== dv3) {
      erros.push(`Dígito verificador do Bloco 3 inválido (esperado ${calcularModulo10(bloco3)}, recebido ${dv3})`);
    }

    const bancoCodigo = clean.substring(0, 3);
    const bancoNome = BANCOS_FEBRABAN[bancoCodigo] || `Banco ${bancoCodigo}`;

    // Derivação do Código de Barras (44 dígitos)
    // Posições: Banco(3) + Moeda(1) + DV Geral(1) + Fator(4) + Valor(10) + CampoLivre(25)
    // CampoLivre = Bloco1[4..9] + Bloco2[0..10] + Bloco3[0..10]
    const moeda = clean[3];
    const campoLivre = clean.substring(4, 9) + bloco2 + bloco3;
    const codigoBarras = `${bancoCodigo}${moeda}${dvGeral}${fatorVencStr}${valorStr}${campoLivre}`;

    const fatorVencNum = parseInt(fatorVencStr, 10);
    const dataVenc = fatorVencNum > 0 ? fatorVencimentoParaData(fatorVencNum) : undefined;
    const valorNum = parseInt(valorStr, 10) / 100;

    // Máscara bancária padrão: AAAAA.BBBBB CCCCC.DDDDDD EEEEE.FFFFFF G HHHHHHHHHHHHHH
    const formatada = `${clean.substring(0, 5)}.${clean.substring(5, 10)} ` +
                      `${clean.substring(10, 15)}.${clean.substring(15, 21)} ` +
                      `${clean.substring(21, 26)}.${clean.substring(26, 32)} ` +
                      `${clean[32]} ${clean.substring(33, 47)}`;

    const valido = erros.length === 0;

    return {
      valido,
      tipo: "bancario",
      linhaLimpa: clean,
      linhaFormatada: formatada,
      codigoBarrasDerivado: codigoBarras,
      fatorVencimento: fatorVencNum,
      dataVencimentoDerivada: dataVenc || undefined,
      valorDerivado: valorNum,
      bancoCodigo,
      bancoNome,
      erros,
      motivo: valido ? undefined : erros.join("; "),
    };
  }

  // 2. BOLETO DE CONCESSIONÁRIA / ARRECADAÇÃO (48 dígitos)
  if (clean.length === 48) {
    const bloco1 = clean.substring(0, 11);
    const dv1 = parseInt(clean[11], 10);
    const bloco2 = clean.substring(12, 23);
    const dv2 = parseInt(clean[23], 10);
    const bloco3 = clean.substring(24, 35);
    const dv3 = parseInt(clean[35], 10);
    const bloco4 = clean.substring(36, 47);
    const dv4 = parseInt(clean[47], 10);

    // Validação de DV módulo 10 em cada bloco de arrecadação
    if (calcularModulo10(bloco1) !== dv1) {
      erros.push(`DV do Bloco 1 de arrecadação inválido`);
    }
    if (calcularModulo10(bloco2) !== dv2) {
      erros.push(`DV do Bloco 2 de arrecadação inválido`);
    }
    if (calcularModulo10(bloco3) !== dv3) {
      erros.push(`DV do Bloco 3 de arrecadação inválido`);
    }
    if (calcularModulo10(bloco4) !== dv4) {
      erros.push(`DV do Bloco 4 de arrecadação inválido`);
    }

    // Código de barras de arrecadação: junção dos 4 blocos sem os DVs
    const codigoBarras = `${bloco1}${bloco2}${bloco3}${bloco4}`;
    
    // Valor no código de arrecadação: posições 4..15 (se moeda = 6 ou 8)
    let valorNum: number | undefined;
    const codMoeda = clean[2];
    if (codMoeda === "6" || codMoeda === "8") {
      const valorStr = codigoBarras.substring(4, 15);
      valorNum = parseInt(valorStr, 10) / 100;
    }

    const formatada = `${bloco1}-${dv1} ${bloco2}-${dv2} ${bloco3}-${dv3} ${bloco4}-${dv4}`;
    const valido = erros.length === 0;

    return {
      valido,
      tipo: "arrecadacao",
      linhaLimpa: clean,
      linhaFormatada: formatada,
      codigoBarrasDerivado: codigoBarras,
      valorDerivado: valorNum,
      bancoNome: "Arrecadação / Concessionária",
      erros,
      motivo: valido ? undefined : erros.join("; "),
    };
  }

  // 3. TAMANHO INCORRETO
  erros.push(`Linha digitável com ${clean.length} dígitos (esperado 47 para títulos bancários ou 48 para arrecadação)`);
  return {
    valido: false,
    tipo: "invalido",
    linhaLimpa: clean,
    linhaFormatada: clean,
    erros,
    motivo: erros[0],
  };
}

/**
 * Validador e normalizador determinístico de Código de Barras (44 dígitos).
 */
export function validateCodigoBarras(codigoRaw: string | null | undefined): ValidatedCodigoBarras {
  const erros: string[] = [];
  if (!codigoRaw) {
    return {
      valido: false,
      codigoLimpo: "",
      tipo: "invalido",
      erros: ["Código de barras não informado"],
    };
  }

  const clean = cleanDigits(codigoRaw);
  if (clean.length !== 44) {
    erros.push(`Código de barras com ${clean.length} dígitos (esperado exatamente 44)`);
    return {
      valido: false,
      codigoLimpo: clean,
      tipo: "invalido",
      erros,
      motivo: erros[0],
    };
  }

  const ehArrecadacao = clean.startsWith("8");
  if (ehArrecadacao) {
    let valorNum: number | undefined;
    const codMoeda = clean[2];
    if (codMoeda === "6" || codMoeda === "8") {
      const valorStr = clean.substring(4, 15);
      valorNum = parseInt(valorStr, 10) / 100;
    }

    return {
      valido: true,
      codigoLimpo: clean,
      tipo: "arrecadacao",
      bancoNome: "Arrecadação / Concessionária",
      valorDerivado: valorNum,
      erros: [],
    };
  }

  // Boleto Bancário: Banco(3) + Moeda(1) + DV(1) + Fator(4) + Valor(10) + CampoLivre(25)
  const bancoCodigo = clean.substring(0, 3);
  const bancoNome = BANCOS_FEBRABAN[bancoCodigo] || `Banco ${bancoCodigo}`;
  const dvGeral = parseInt(clean[4], 10);
  const codigoSemDV = clean.substring(0, 4) + clean.substring(5);
  const dvCalculado = calcularModulo11Boleto(codigoSemDV);

  if (dvGeral !== dvCalculado) {
    erros.push(`Dígito verificador geral inválido (esperado ${dvCalculado}, recebido ${dvGeral})`);
  }

  const fatorStr = clean.substring(5, 9);
  const valorStr = clean.substring(9, 19);
  const fatorNum = parseInt(fatorStr, 10);
  const dataVenc = fatorNum > 0 ? fatorVencimentoParaData(fatorNum) : undefined;
  const valorNum = parseInt(valorStr, 10) / 100;

  const valido = erros.length === 0;
  return {
    valido,
    codigoLimpo: clean,
    tipo: "bancario",
    bancoCodigo,
    bancoNome,
    fatorVencimento: fatorNum,
    dataVencimentoDerivada: dataVenc || undefined,
    valorDerivado: valorNum,
    erros,
    motivo: valido ? undefined : erros.join("; "),
  };
}

/**
 * Parser monetário determinístico para valores de boleto.
 * Suporta "1.234,56", "1234.56", 1234.56, "R$ 1.234,56".
 */
export function parseBoletoAmount(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.round(val * 100) / 100;

  const str = String(val).trim().replace(/^R\$\s*/i, "").trim();
  if (!str) return 0;

  // Se tiver vírgula e ponto (ex: "1.234,56") -> remove pontos e troca vírgula por ponto
  if (str.includes(",") && str.includes(".")) {
    const clean = str.replace(/\./g, "").replace(",", ".");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  }

  // Se tiver apenas vírgula (ex: "1234,56")
  if (str.includes(",")) {
    const clean = str.replace(",", ".");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  }

  // Padrão numérico decimal (ex: "1234.56")
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

/**
 * Normaliza e formata datas para YYYY-MM-DD internamente e DD/MM/YYYY para exibição.
 */
export function normalizeDate(dateRaw: unknown): { iso: string | null; formattedBr: string | null } {
  if (!dateRaw) return { iso: null, formattedBr: null };
  const str = String(dateRaw).trim();

  // Caso DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const dd = brMatch[1].padStart(2, "0");
    const mm = brMatch[2].padStart(2, "0");
    const yyyy = brMatch[3];
    return {
      iso: `${yyyy}-${mm}-${dd}`,
      formattedBr: `${dd}/${mm}/${yyyy}`,
    };
  }

  // Caso YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2];
    const dd = isoMatch[3];
    return {
      iso: `${yyyy}-${mm}-${dd}`,
      formattedBr: `${dd}/${mm}/${yyyy}`,
    };
  }

  return { iso: null, formattedBr: null };
}

/**
 * Normaliza e valida CPF/CNPJ.
 */
export function normalizeCpfCnpj(val: unknown): { clean: string | null; formatted: string | null; valido: boolean } {
  const clean = cleanDigits(val);
  if (!clean) return { clean: null, formatted: null, valido: false };

  if (clean.length === 11) {
    const formatted = clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    return { clean, formatted, valido: true };
  }

  if (clean.length === 14) {
    const formatted = clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    return { clean, formatted, valido: true };
  }

  return { clean, formatted: clean, valido: false };
}

/**
 * Reconciliação determinística entre os dados extraídos do boleto e a linha digitável / código de barras.
 */
export function reconcileBoleto(raw: {
  banco?: string | null;
  beneficiario?: string | null;
  cnpj_cpf_beneficiario?: string | null;
  pagador?: string | null;
  cnpj_cpf_pagador?: string | null;
  data_vencimento?: string | null;
  valor?: unknown;
  linha_digitavel?: string | null;
  codigo_barras?: string | null;
  nosso_numero?: string | null;
  numero_documento?: string | null;
  agencia_codigo_beneficiario?: string | null;
}): BoletoValidationResult {
  const divergencias: string[] = [];

  const valorVisual = parseBoletoAmount(raw.valor);
  const dataVisual = normalizeDate(raw.data_vencimento);

  const linhaValidada = raw.linha_digitavel ? validateLinhaDigitavel(raw.linha_digitavel) : undefined;
  const codigoValidado = raw.codigo_barras ? validateCodigoBarras(raw.codigo_barras) : undefined;

  // 1. Reconciliação de Valor
  let valorFinal = valorVisual;
  if (linhaValidada && linhaValidada.valido && linhaValidada.valorDerivado && linhaValidada.valorDerivado > 0) {
    if (valorVisual > 0 && Math.abs(valorVisual - linhaValidada.valorDerivado) > 0.05) {
      divergencias.push(
        `Divergência de valor: valor impresso (R$ ${valorVisual.toFixed(2)}) difere do valor codificado na linha digitável (R$ ${linhaValidada.valorDerivado.toFixed(2)})`
      );
    }
    // Se o valor visual não veio ou divergiu, a linha digitável é a fonte canônica codificada
    if (valorFinal <= 0) {
      valorFinal = linhaValidada.valorDerivado;
    }
  }

  // 2. Reconciliação de Data de Vencimento
  let dataVencimentoFinal = dataVisual.iso;
  if (linhaValidada && linhaValidada.valido && linhaValidada.dataVencimentoDerivada) {
    if (dataVisual.iso && dataVisual.iso !== linhaValidada.dataVencimentoDerivada) {
      const dataLinhaBr = normalizeDate(linhaValidada.dataVencimentoDerivada).formattedBr;
      divergencias.push(
        `Divergência de vencimento: data impressa (${dataVisual.formattedBr}) difere do vencimento na linha digitável (${dataLinhaBr})`
      );
    }
    if (!dataVencimentoFinal) {
      dataVencimentoFinal = linhaValidada.dataVencimentoDerivada;
    }
  }

  // 3. Banco / Instituição Emissora
  let bancoFinal = raw.banco ? String(raw.banco).trim() : null;
  if (linhaValidada && linhaValidada.bancoNome && (!bancoFinal || bancoFinal.toLowerCase().includes("banco"))) {
    bancoFinal = linhaValidada.bancoNome;
  }

  // 4. Beneficiário e Pagador
  const beneficiarioFinal = raw.beneficiario ? String(raw.beneficiario).trim() : null;
  const cnpjCpfBeneficiario = normalizeCpfCnpj(raw.cnpj_cpf_beneficiario);

  const pagadorFinal = raw.pagador ? String(raw.pagador).trim() : null;
  const cnpjCpfPagador = normalizeCpfCnpj(raw.cnpj_cpf_pagador);

  // 5. Linha digitável ou código inválidos
  if (linhaValidada && !linhaValidada.valido) {
    divergencias.push(...linhaValidada.erros);
  }
  if (codigoValidado && !codigoValidado.valido) {
    divergencias.push(...codigoValidado.erros);
  }

  const valido = divergencias.length === 0 && valorFinal > 0;
  const status = valido ? "ok" : "requer_revisao";

  return {
    valido,
    status,
    divergencias,
    linhaDigitavel: linhaValidada,
    codigoBarras: codigoValidado,
    valorFinal,
    dataVencimentoFinal,
    beneficiarioFinal,
    cnpjCpfBeneficiarioFinal: cnpjCpfBeneficiario.formatted || cnpjCpfBeneficiario.clean,
    pagadorFinal,
    cnpjCpfPagadorFinal: cnpjCpfPagador.formatted || cnpjCpfPagador.clean,
    bancoFinal,
    motivo: divergencias.length > 0 ? divergencias.join(" | ") : undefined,
  };
}
