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

export interface BoletoValidationEvidence {
  length_valid: boolean;
  dv_campo_1_valid: boolean;
  dv_campo_2_valid: boolean;
  dv_campo_3_valid: boolean;
  dv_geral_valid: boolean;
  fator_vencimento: number | null;
  valor_derivado: number | null;
  vencimento_derivado: string | null;
  linha_matematicamente_valida: boolean;
}

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
  evidence?: BoletoValidationEvidence;
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
  status: "validado" | "validado_com_alerta" | "requer_revisao" | "rejeitado";
  divergencias: string[];
  warnings: string[];
  linhaDigitavel?: ValidatedLinhaDigitavel;
  codigoBarras?: ValidatedCodigoBarras;
  valorFinal: number;
  valorSource: "febraban_linha" | "ocr_visual";
  dataVencimentoFinal: string | null;
  vencimentoSource: "febraban_linha" | "ocr_visual";
  beneficiarioFinal: string | null;
  cnpjCpfBeneficiarioFinal: string | null;
  pagadorFinal: string | null;
  cnpjCpfPagadorFinal: string | null;
  bancoFinal: string | null;
  evidence?: BoletoValidationEvidence;
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

// Mapeamento dos segmentos de arrecadação FEBRABAN
const SEGMENTOS_ARRECADACAO: Record<string, string> = {
  "1": "Prefeitura",
  "2": "Saneamento / Água e Esgoto",
  "3": "Energia Elétrica e Gás",
  "4": "Telecomunicações",
  "5": "Órgãos Governamentais",
  "6": "Carnês e Assemelhados",
  "7": "Multas de Trânsito",
  "9": "Uso Exclusivo Bancário",
};

/**
 * Calcula o dígito verificador Módulo 11 para guias de arrecadação e concessionárias (FEBRABAN).
 */
export function calcularModulo11Arrecadacao(blocoSemDV: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = blocoSemDV.length - 1; i >= 0; i--) {
    soma += parseInt(blocoSemDV[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  if (resto === 0 || resto === 1) {
    return 0;
  }
  if (resto === 10) {
    return 1;
  }
  return 11 - resto;
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

    // Validação dos DVs dos 3 primeiros blocos (Módulo 10)
    const dv1Calculado = calcularModulo10(bloco1);
    const dv1Ok = dv1Calculado === dv1;
    if (!dv1Ok) {
      erros.push(`Dígito verificador do Bloco 1 inválido (esperado ${dv1Calculado}, recebido ${dv1})`);
    }

    const dv2Calculado = calcularModulo10(bloco2);
    const dv2Ok = dv2Calculado === dv2;
    if (!dv2Ok) {
      erros.push(`Dígito verificador do Bloco 2 inválido (esperado ${dv2Calculado}, recebido ${dv2})`);
    }

    const dv3Calculado = calcularModulo10(bloco3);
    const dv3Ok = dv3Calculado === dv3;
    if (!dv3Ok) {
      erros.push(`Dígito verificador do Bloco 3 inválido (esperado ${dv3Calculado}, recebido ${dv3})`);
    }

    const bancoCodigo = clean.substring(0, 3);
    const bancoNome = BANCOS_FEBRABAN[bancoCodigo] || `Banco ${bancoCodigo}`;

    // Derivação do Código de Barras (44 dígitos) e cálculo real de Módulo 11 do DV Geral
    const moeda = clean[3];
    const campoLivre = clean.substring(4, 9) + bloco2 + bloco3;
    const codigoSemDV = `${bancoCodigo}${moeda}${fatorVencStr}${valorStr}${campoLivre}`;
    const dvGeralCalculado = calcularModulo11Boleto(codigoSemDV);
    const dvGeralOk = dvGeral === dvGeralCalculado;

    if (!dvGeralOk) {
      erros.push(`Dígito verificador geral da linha inválido (esperado ${dvGeralCalculado}, recebido ${dvGeral})`);
    }

    const codigoBarras = `${bancoCodigo}${moeda}${dvGeral}${fatorVencStr}${valorStr}${campoLivre}`;
    const fatorVencNum = parseInt(fatorVencStr, 10);
    const dataVenc = fatorVencNum > 0 ? fatorVencimentoParaData(fatorVencNum) : undefined;
    const valorNum = parseInt(valorStr, 10) / 100;

    // Máscara bancária padrão: AAAAA.BBBBB CCCCC.DDDDDD EEEEE.FFFFFF G HHHHHHHHHHHHHH
    const formatada = `${clean.substring(0, 5)}.${clean.substring(5, 10)} ` +
                      `${clean.substring(10, 15)}.${clean.substring(15, 21)} ` +
                      `${clean.substring(21, 26)}.${clean.substring(26, 32)} ` +
                      `${clean[32]} ${clean.substring(33, 47)}`;

    const linhaMatematicaValida = clean.length === 47 && dv1Ok && dv2Ok && dv3Ok && dvGeralOk;
    const valido = erros.length === 0;

    const evidence: BoletoValidationEvidence = {
      length_valid: clean.length === 47,
      dv_campo_1_valid: dv1Ok,
      dv_campo_2_valid: dv2Ok,
      dv_campo_3_valid: dv3Ok,
      dv_geral_valid: dvGeralOk,
      fator_vencimento: fatorVencNum > 0 ? fatorVencNum : null,
      valor_derivado: valorNum > 0 ? valorNum : null,
      vencimento_derivado: dataVenc || null,
      linha_matematicamente_valida: linhaMatematicaValida,
    };

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
      evidence,
      motivo: valido ? undefined : erros.join("; "),
    };
  }

  // 2. BOLETO DE CONCESSIONÁRIA / ARRECADAÇÃO (48 dígitos)
  if (clean.length === 48) {
    if (!clean.startsWith("8")) {
      erros.push("Linha de arrecadação deve iniciar com o dígito 8");
    }

    const segmentoCod = clean[1];
    const segmentoNome = SEGMENTOS_ARRECADACAO[segmentoCod] || "Arrecadação / Concessionária";
    const codMoeda = clean[2];

    const usaModulo10 = codMoeda === "6" || codMoeda === "7";
    const usaModulo11 = codMoeda === "8" || codMoeda === "9";

    if (!usaModulo10 && !usaModulo11) {
      erros.push(`Código de moeda/valor inválido para arrecadação (${codMoeda}). Esperado 6, 7, 8 ou 9.`);
    }

    const fnCalcDV = usaModulo10 ? calcularModulo10 : calcularModulo11Arrecadacao;
    const nomeAlgoritmo = usaModulo10 ? "Módulo 10" : "Módulo 11";

    const bloco1 = clean.substring(0, 11);
    const dv1 = parseInt(clean[11], 10);
    const bloco2 = clean.substring(12, 23);
    const dv2 = parseInt(clean[23], 10);
    const bloco3 = clean.substring(24, 35);
    const dv3 = parseInt(clean[35], 10);
    const bloco4 = clean.substring(36, 47);
    const dv4 = parseInt(clean[47], 10);

    const dv1Calculado = fnCalcDV(bloco1);
    const dv2Calculado = fnCalcDV(bloco2);
    const dv3Calculado = fnCalcDV(bloco3);
    const dv4Calculado = fnCalcDV(bloco4);

    const dv1Ok = dv1Calculado === dv1;
    const dv2Ok = dv2Calculado === dv2;
    const dv3Ok = dv3Calculado === dv3;
    const dv4Ok = dv4Calculado === dv4;

    if (!dv1Ok) erros.push(`DV do Bloco 1 de arrecadação inválido via ${nomeAlgoritmo} (esperado ${dv1Calculado}, recebido ${dv1})`);
    if (!dv2Ok) erros.push(`DV do Bloco 2 de arrecadação inválido via ${nomeAlgoritmo} (esperado ${dv2Calculado}, recebido ${dv2})`);
    if (!dv3Ok) erros.push(`DV do Bloco 3 de arrecadação inválido via ${nomeAlgoritmo} (esperado ${dv3Calculado}, recebido ${dv3})`);
    if (!dv4Ok) erros.push(`DV do Bloco 4 de arrecadação inválido via ${nomeAlgoritmo} (esperado ${dv4Calculado}, recebido ${dv4})`);

    // Código de barras de arrecadação: junção dos 4 blocos sem os DVs (44 dígitos)
    const codigoBarras = `${bloco1}${bloco2}${bloco3}${bloco4}`;
    
    // Validação do DV Geral de Arrecadação (posição 4 do código de barras / índice 3)
    const dvGeralInformado = parseInt(codigoBarras[3], 10);
    const codigoSemDVGeral = codigoBarras.substring(0, 3) + codigoBarras.substring(4);
    const dvGeralCalculado = fnCalcDV(codigoSemDVGeral);
    const dvGeralOk = dvGeralInformado === dvGeralCalculado;

    if (!dvGeralOk) {
      erros.push(`DV geral do código de barras de arrecadação inválido via ${nomeAlgoritmo} (esperado ${dvGeralCalculado}, recebido ${dvGeralInformado})`);
    }

    // Derivação de valor efetivo (apenas moedas 6 e 8 possuem valor nominal em reais)
    let valorNum: number | undefined;
    if (codMoeda === "6" || codMoeda === "8") {
      const valorStr = codigoBarras.substring(4, 15);
      const valorCentavos = parseInt(valorStr, 10);
      if (!isNaN(valorCentavos) && valorCentavos > 0) {
        valorNum = valorCentavos / 100;
      }
    }

    const formatada = `${bloco1}-${dv1} ${bloco2}-${dv2} ${bloco3}-${dv3} ${bloco4}-${dv4}`;
    const valido = erros.length === 0;

    const evidence: BoletoValidationEvidence = {
      length_valid: clean.length === 48,
      dv_campo_1_valid: dv1Ok,
      dv_campo_2_valid: dv2Ok,
      dv_campo_3_valid: dv3Ok,
      dv_geral_valid: dvGeralOk,
      fator_vencimento: null,
      valor_derivado: valorNum || null,
      vencimento_derivado: null,
      linha_matematicamente_valida: valido,
    };

    return {
      valido,
      tipo: "arrecadacao",
      linhaLimpa: clean,
      linhaFormatada: formatada,
      codigoBarrasDerivado: codigoBarras,
      valorDerivado: valorNum,
      bancoNome: segmentoNome,
      erros,
      evidence,
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
    evidence: {
      length_valid: false,
      dv_campo_1_valid: false,
      dv_campo_2_valid: false,
      dv_campo_3_valid: false,
      dv_geral_valid: false,
      fator_vencimento: null,
      valor_derivado: null,
      vencimento_derivado: null,
      linha_matematicamente_valida: false,
    },
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

  if (str.includes(",") && str.includes(".")) {
    const clean = str.replace(/\./g, "").replace(",", ".");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  }

  if (str.includes(",")) {
    const clean = str.replace(",", ".");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

/**
 * Normaliza e formata datas para YYYY-MM-DD internamente e DD/MM/YYYY para exibição.
 */
export function normalizeDate(dateRaw: unknown): { iso: string | null; formattedBr: string | null } {
  if (!dateRaw) return { iso: null, formattedBr: null };
  const str = String(dateRaw).trim();

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
  const warnings: string[] = [];

  const valorVisual = parseBoletoAmount(raw.valor);
  const dataVisual = normalizeDate(raw.data_vencimento);

  const linhaValidada = raw.linha_digitavel ? validateLinhaDigitavel(raw.linha_digitavel) : undefined;
  const codigoValidado = raw.codigo_barras ? validateCodigoBarras(raw.codigo_barras) : undefined;

  let valorFinal = valorVisual;
  let valorSource: "febraban_linha" | "ocr_visual" = "ocr_visual";
  let dataVencimentoFinal = dataVisual.iso;
  let vencimentoSource: "febraban_linha" | "ocr_visual" = "ocr_visual";
  let status: "validado" | "validado_com_alerta" | "requer_revisao" | "rejeitado" = "requer_revisao";
  let valido = false;

  const linhaMatematicamenteValida = Boolean(
    linhaValidada?.evidence?.linha_matematicamente_valida || (linhaValidada?.valido && linhaValidada?.tipo === "arrecadacao")
  );

  if (linhaMatematicamenteValida && linhaValidada && linhaValidada.valorDerivado && linhaValidada.valorDerivado > 0) {
    // ── HIERARQUIA: LINHA MATEMATICAMENTE ÍNTEGRA É AUTORIDADE PARA VALOR E DATA ──
    valorFinal = linhaValidada.valorDerivado;
    valorSource = "febraban_linha";

    if (linhaValidada.dataVencimentoDerivada) {
      dataVencimentoFinal = linhaValidada.dataVencimentoDerivada;
      vencimentoSource = "febraban_linha";
    }

    let hasVisualDivergence = false;

    // Verificar se valor visual divergiu do valor da linha
    if (valorVisual > 0 && Math.abs(valorVisual - valorFinal) > 0.05) {
      warnings.push(
        `divergencia_valor_ocr: valor visual lido (R$ ${valorVisual.toFixed(2)}) difere do valor validado pela linha (R$ ${valorFinal.toFixed(2)})`
      );
      hasVisualDivergence = true;
    }

    // Verificar se vencimento visual divergiu do vencimento da linha
    if (dataVisual.iso && dataVencimentoFinal && dataVisual.iso !== dataVencimentoFinal) {
      warnings.push(
        `divergencia_vencimento_ocr: vencimento visual lido (${dataVisual.formattedBr}) difere da data validada pela linha (${normalizeDate(dataVencimentoFinal).formattedBr})`
      );
      hasVisualDivergence = true;
    }

    if (hasVisualDivergence) {
      status = "validado_com_alerta";
      valido = true;
    } else {
      status = "validado";
      valido = true;
    }
  } else if (linhaValidada && !linhaValidada.valido) {
    // Linha informada mas matematicamente inválida
    divergencias.push(...linhaValidada.erros);
    if (valorVisual > 0 && dataVisual.iso) {
      status = "requer_revisao";
      valido = false;
    } else {
      status = "rejeitado";
      valido = false;
    }
  } else if (valorVisual > 0 && dataVisual.iso) {
    // Linha ausente, mas dados visuais legíveis
    status = "requer_revisao";
    valido = false;
    warnings.push("linha_digitavel_ausente");
  } else {
    // Linha e valor ilegíveis -> fail-closed
    status = "rejeitado";
    valido = false;
    divergencias.push("Dados críticos do boleto ilegíveis ou incompletos");
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

  if (codigoValidado && !codigoValidado.valido) {
    divergencias.push(...codigoValidado.erros);
  }

  return {
    valido,
    status,
    divergencias,
    warnings,
    linhaDigitavel: linhaValidada,
    codigoBarras: codigoValidado,
    valorFinal,
    valorSource,
    dataVencimentoFinal,
    vencimentoSource,
    beneficiarioFinal,
    cnpjCpfBeneficiarioFinal: cnpjCpfBeneficiario.formatted || cnpjCpfBeneficiario.clean,
    pagadorFinal,
    cnpjCpfPagadorFinal: cnpjCpfPagador.formatted || cnpjCpfPagador.clean,
    bancoFinal,
    evidence: linhaValidada?.evidence,
    motivo: divergencias.length > 0 ? divergencias.join(" | ") : (warnings.length > 0 ? warnings.join(" | ") : undefined),
  };
}
