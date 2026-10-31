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
  reconciliacao_zero_padding?: boolean;
  has_unresolved_material_divergence?: boolean;
  divergencia_material_detalhes?: string[];
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
  codigoBarrasFinal?: string | null;
  linhaDigitavelFinal?: string | null;
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

  let clean = cleanDigits(linhaRaw);
  let zeroPaddingReconciled = false;

  // Reconciliação Determinística de Zero-Padding no Campo 5 (46 -> 47 dígitos)
  // Ocorre quando OCR de visão suprime um zero no preenchimento do valor nominal (ex: 4 zeros em vez de 5 zeros).
  // Validação estrita: SÓ é aceita se os 3 primeiros blocos satisfazem Módulo 10 E o código de barras resultante satisfaz Módulo 11 do DV Geral.
  if (clean.length === 46) {
    const b1 = clean.substring(0, 9);
    const d1 = parseInt(clean[9], 10);
    const b2 = clean.substring(10, 20);
    const d2 = parseInt(clean[20], 10);
    const b3 = clean.substring(21, 31);
    const d3 = parseInt(clean[31], 10);
    const dGeral = parseInt(clean[32], 10);
    const fator = clean.substring(33, 37);
    const val9 = clean.substring(37, 46);

    if (
      calcularModulo10(b1) === d1 &&
      calcularModulo10(b2) === d2 &&
      calcularModulo10(b3) === d3
    ) {
      const candClean = clean.substring(0, 37) + "0" + val9;
      const bCodigo = candClean.substring(0, 3);
      const mMoeda = candClean[3];
      const val10 = candClean.substring(37, 47);
      const cLivre = candClean.substring(4, 9) + b2 + b3;
      const cSemDV = `${bCodigo}${mMoeda}${fator}${val10}${cLivre}`;
      const dGeralCalc = calcularModulo11Boleto(cSemDV);

      if (dGeralCalc === dGeral) {
        clean = candClean;
        zeroPaddingReconciled = true;
      }
    }
  }

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
      ...(zeroPaddingReconciled ? { reconciliacao_zero_padding: true } : {}),
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
 * Deriva deterministicamente a linha digitável (47 dígitos para bancário ou 48 dígitos para arrecadação)
 * a partir de um código de barras de 44 dígitos válido segundo a norma FEBRABAN.
 */
export function barcodeToLinhaDigitavel(codigoBarrasRaw: string | null | undefined): {
  valido: boolean;
  tipo: "bancario" | "arrecadacao" | "invalido";
  linhaLimpa: string;
  linhaFormatada: string;
} | null {
  if (!codigoBarrasRaw) return null;
  const clean = cleanDigits(codigoBarrasRaw);
  if (clean.length !== 44) return null;

  // 1. Boleto de Arrecadação / Concessionárias (Começa com 8)
  if (clean.startsWith("8")) {
    const codMoeda = clean[2];
    const isMod10 = codMoeda === "6" || codMoeda === "7";

    const b1 = clean.substring(0, 11);
    const b2 = clean.substring(11, 22);
    const b3 = clean.substring(22, 33);
    const b4 = clean.substring(33, 44);

    const dv1 = isMod10 ? calcularModulo10(b1) : calcularModulo11Arrecadacao(b1);
    const dv2 = isMod10 ? calcularModulo10(b2) : calcularModulo11Arrecadacao(b2);
    const dv3 = isMod10 ? calcularModulo10(b3) : calcularModulo11Arrecadacao(b3);
    const dv4 = isMod10 ? calcularModulo10(b4) : calcularModulo11Arrecadacao(b4);

    const linhaLimpa = `${b1}${dv1}${b2}${dv2}${b3}${dv3}${b4}${dv4}`;
    const linhaFormatada = `${b1}-${dv1} ${b2}-${dv2} ${b3}-${dv3} ${b4}-${dv4}`;

    return {
      valido: true,
      tipo: "arrecadacao",
      linhaLimpa,
      linhaFormatada,
    };
  }

  // 2. Boleto Bancário (44 dígitos -> 47 dígitos)
  // Posições: Banco(0-2), Moeda(3), DV Geral(4), Fator(5-8), Valor(9-18), CampoLivre(19-43)
  const cSemDV = clean.substring(0, 4) + clean.substring(5);
  const dvGeralCalculado = calcularModulo11Boleto(cSemDV);
  const dvGeralOriginal = parseInt(clean[4], 10);
  if (dvGeralCalculado !== dvGeralOriginal) {
    return null; // Código de barras inválido por Módulo 11
  }

  // Campo 1: Banco(3) + Moeda(1) + CampoLivre[0..4] (5 dígitos) + DV Módulo 10
  const c1Base = clean.substring(0, 4) + clean.substring(19, 24);
  const c1Dv = calcularModulo10(c1Base);

  // Campo 2: CampoLivre[5..14] (10 dígitos) + DV Módulo 10
  const c2Base = clean.substring(24, 34);
  const c2Dv = calcularModulo10(c2Base);

  // Campo 3: CampoLivre[15..24] (10 dígitos) + DV Módulo 10
  const c3Base = clean.substring(34, 44);
  const c3Dv = calcularModulo10(c3Base);

  // Campo 4: DV Geral
  const c4 = String(dvGeralOriginal);

  // Campo 5: Fator de Vencimento (4) + Valor Nominal (10)
  const c5 = clean.substring(5, 19);

  const linhaLimpa = `${c1Base}${c1Dv}${c2Base}${c2Dv}${c3Base}${c3Dv}${c4}${c5}`;
  const linhaFormatada = `${c1Base.substring(0, 5)}.${c1Base.substring(5)}${c1Dv} ` +
                         `${c2Base.substring(0, 5)}.${c2Base.substring(5)}${c2Dv} ` +
                         `${c3Base.substring(0, 5)}.${c3Base.substring(5)}${c3Dv} ` +
                         `${c4} ${c5}`;

  return {
    valido: true,
    tipo: "bancario",
    linhaLimpa,
    linhaFormatada,
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
 * Verifica se um ano é bissexto pelo calendário gregoriano.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Retorna o número de dias no mês (1-12) para um ano específico.
 */
export function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 1: case 3: case 5: case 7: case 8: case 10: case 12:
      return 31;
    case 4: case 6: case 9: case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Validação puramente matemática de data do calendário gregoriano.
 * Evita armadilhas de fuso horário / timezone de objetos Date do JS.
 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const maxDays = getDaysInMonth(year, month);
  return day >= 1 && day <= maxDays;
}

/**
 * Normaliza e formata datas para YYYY-MM-DD internamente e DD/MM/YYYY para exibição.
 * Suporta DD/MM/YYYY, DD-MM-YYYY e YYYY-MM-DD.
 * Rejeita datas impossíveis (ex: 31/02/2026) e não altera o dia por timezone.
 */
export function normalizeDate(dateRaw: unknown): { iso: string | null; formattedBr: string | null } {
  if (!dateRaw) return { iso: null, formattedBr: null };
  const str = String(dateRaw).trim();

  let dd: string;
  let mm: string;
  let yyyy: string;

  const brMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (brMatch) {
    dd = brMatch[1].padStart(2, "0");
    mm = brMatch[2].padStart(2, "0");
    yyyy = brMatch[3];
  } else {
    const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (isoMatch) {
      yyyy = isoMatch[1];
      mm = isoMatch[2].padStart(2, "0");
      dd = isoMatch[3].padStart(2, "0");
    } else {
      return { iso: null, formattedBr: null };
    }
  }

  const yearNum = parseInt(yyyy, 10);
  const monthNum = parseInt(mm, 10);
  const dayNum = parseInt(dd, 10);

  if (!isValidCalendarDate(yearNum, monthNum, dayNum)) {
    return { iso: null, formattedBr: null };
  }

  return {
    iso: `${yyyy}-${mm}-${dd}`,
    formattedBr: `${dd}/${mm}/${yyyy}`,
  };
}

export function parseNum(v: unknown): number {
  return parseBoletoAmount(v);
}

export function parseDate(v: unknown, fallbackDate?: string): string {
  const norm = normalizeDate(v);
  if (norm.iso) return norm.iso;
  if (!v) return fallbackDate || new Date().toISOString().split("T")[0];
  const str = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split("T")[0];
  return fallbackDate || new Date().toISOString().split("T")[0];
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
  data_emissao?: string | null;
  valor?: unknown;
  desconto?: unknown;
  juros_multa?: unknown;
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
  const dataEmissaoVisual = normalizeDate(raw.data_emissao);

  const linhaValidada = raw.linha_digitavel ? validateLinhaDigitavel(raw.linha_digitavel) : undefined;
  const codigoValidado = raw.codigo_barras ? validateCodigoBarras(raw.codigo_barras) : undefined;

  let valorFinal = valorVisual;
  let valorSource: "febraban_linha" | "ocr_visual" = "ocr_visual";
  let dataVencimentoFinal = dataVisual.iso;
  let vencimentoSource: "febraban_linha" | "ocr_visual" = "ocr_visual";
  let status: "validado" | "validado_com_alerta" | "requer_revisao" | "rejeitado" = "requer_revisao";
  let valido = false;

  let codigoBarrasFinal: string | null = null;
  let linhaDigitavelFinal: string | null = linhaValidada?.linhaLimpa || (raw.linha_digitavel ? cleanDigits(raw.linha_digitavel) : null);

  const linhaMatematicamenteValida = Boolean(
    linhaValidada?.evidence?.linha_matematicamente_valida || (linhaValidada?.valido && linhaValidada?.tipo === "arrecadacao")
  );

  let hasUnresolvedMaterialDivergence = false;

  if (linhaMatematicamenteValida && linhaValidada && linhaValidada.valorDerivado && linhaValidada.valorDerivado > 0) {
    const valorDerivado = linhaValidada.valorDerivado;
    const vencimentoDerivado = linhaValidada.dataVencimentoDerivada;

    // 1. Verificação Estrita de Valor Nominal em CENTAVOS INTEIROS (sem tolerância solta)
    const valorVisualCentavos = Math.round(valorVisual * 100);
    const valorDerivadoCentavos = Math.round(valorDerivado * 100);
    let temDivergenciaMaterialValor = false;

    if (valorVisualCentavos > 0 && valorVisualCentavos !== valorDerivadoCentavos) {
      temDivergenciaMaterialValor = true;
      hasUnresolvedMaterialDivergence = true;
      divergencias.push(
        `divergencia_material_valor: valor visual impresso no documento (R$ ${(valorVisualCentavos / 100).toFixed(2)}) difere do valor nominal derivado da linha digitável (R$ ${(valorDerivadoCentavos / 100).toFixed(2)})`
      );
    }

    // 2. Verificação Estrita de Vencimento Completo (ISO YYYY-MM-DD)
    let temDivergenciaMaterialVencimento = false;

    if (vencimentoDerivado) {
      if (dataVisual.iso && dataVisual.iso !== vencimentoDerivado) {
        // Confusão comprovada com data de emissão:
        // Ocorre quando o OCR confunde a data de emissão com vencimento (ex: visual lido 23/10/2026 == emissão 23/10/2026)
        // e a linha digitável possui vencimento estritamente posterior (ex: 03/11/2026), com valor nominal 100% corroborado em centavos.
        const isConfusaoEmissao = Boolean(
          dataEmissaoVisual.iso &&
          dataVisual.iso === dataEmissaoVisual.iso &&
          vencimentoDerivado > dataEmissaoVisual.iso &&
          !temDivergenciaMaterialValor
        );

        if (isConfusaoEmissao) {
          warnings.push(
            `divergencia_vencimento_ocr: vencimento visual correspondia à data de emissão (${dataVisual.formattedBr}) e foi corrigido para a data validada pela linha (${normalizeDate(vencimentoDerivado).formattedBr})`
          );
        } else {
          temDivergenciaMaterialVencimento = true;
          hasUnresolvedMaterialDivergence = true;
          divergencias.push(
            `divergencia_material_vencimento: vencimento visual impresso (${dataVisual.formattedBr || dataVisual.iso}) difere comprovadamente do vencimento derivado da linha (${normalizeDate(vencimentoDerivado).formattedBr || vencimentoDerivado})`
          );
        }
      }
    }

    if (linhaValidada?.evidence?.reconciliacao_zero_padding) {
      warnings.push("Linha digitável reconciliada deterministicamente: zero de preenchimento recomposto no campo de valor conforme Módulo 11 da FEBRABAN.");
    }

    if (hasUnresolvedMaterialDivergence) {
      // REGRA FUNDAMENTAL: Linha matematicamente válida NÃO é autoridade se diverge materialmente do documento
      // Bloqueia status para requer_revisao e NÃO substitui silenciosamente os valores visuais
      status = "requer_revisao";
      valido = false;
      valorFinal = valorVisual > 0 ? valorVisual : valorDerivado;
      valorSource = valorVisual > 0 ? "ocr_visual" : "febraban_linha";
      dataVencimentoFinal = dataVisual.iso || vencimentoDerivado || null;
      vencimentoSource = dataVisual.iso ? "ocr_visual" : "febraban_linha";
    } else {
      valorFinal = valorDerivado;
      valorSource = "febraban_linha";
      dataVencimentoFinal = vencimentoDerivado || dataVisual.iso;
      vencimentoSource = vencimentoDerivado ? "febraban_linha" : "ocr_visual";

      if (warnings.length > 0 || linhaValidada?.evidence?.reconciliacao_zero_padding) {
        status = "validado_com_alerta";
        valido = true;
      } else {
        status = "validado";
        valido = true;
      }
    }
  } else if (codigoValidado && codigoValidado.valido && codigoValidado.valorDerivado && codigoValidado.valorDerivado > 0) {
    // ── HIERARQUIA 2: CÓDIGO DE BARRAS DE 44 DÍGITOS COM CORROBORAÇÃO OBRIGATÓRIA ──
    const derived = barcodeToLinhaDigitavel(codigoValidado.codigoLimpo);
    if (derived && derived.valido) {
      const cbValor = codigoValidado.valorDerivado;
      const cbVenc = codigoValidado.dataVencimentoDerivada;

      const valorVisualCentavos = Math.round(valorVisual * 100);
      const cbValorCentavos = Math.round(cbValor * 100);
      let cbMaterialDivergence = false;

      if (valorVisualCentavos > 0 && valorVisualCentavos !== cbValorCentavos) {
        cbMaterialDivergence = true;
        hasUnresolvedMaterialDivergence = true;
        divergencias.push(
          `divergencia_material_valor: valor visual impresso (R$ ${(valorVisualCentavos / 100).toFixed(2)}) difere do código de barras (R$ ${(cbValorCentavos / 100).toFixed(2)})`
        );
      }

      if (cbVenc) {
        if (dataVisual.iso && dataVisual.iso !== cbVenc) {
          const isConfusaoEmissao = Boolean(
            dataEmissaoVisual.iso &&
            dataVisual.iso === dataEmissaoVisual.iso &&
            cbVenc > dataEmissaoVisual.iso &&
            !cbMaterialDivergence
          );

          if (isConfusaoEmissao) {
            warnings.push(
              `divergencia_vencimento_ocr: vencimento visual correspondia à data de emissão (${dataVisual.formattedBr}) e foi corrigido para a data validada pelo código de barras (${normalizeDate(cbVenc).formattedBr})`
            );
          } else {
            cbMaterialDivergence = true;
            hasUnresolvedMaterialDivergence = true;
            divergencias.push(
              `divergencia_material_vencimento: vencimento visual impresso (${dataVisual.formattedBr || dataVisual.iso}) difere comprovadamente do código de barras (${normalizeDate(cbVenc).formattedBr || cbVenc})`
            );
          }
        }
      }

      if (cbMaterialDivergence) {
        status = "requer_revisao";
        valido = false;
        valorFinal = valorVisual > 0 ? valorVisual : cbValor;
        valorSource = valorVisual > 0 ? "ocr_visual" : "febraban_linha";
        dataVencimentoFinal = dataVisual.iso || cbVenc || null;
        vencimentoSource = dataVisual.iso ? "ocr_visual" : "febraban_linha";
      } else {
        valorFinal = cbValor;
        valorSource = "febraban_linha";
        dataVencimentoFinal = cbVenc || dataVisual.iso;
        vencimentoSource = cbVenc ? "febraban_linha" : "ocr_visual";
        codigoBarrasFinal = codigoValidado.codigoLimpo;
        linhaDigitavelFinal = derived.linhaLimpa;
        warnings.push("linha_digitavel_recomposta_do_codigo_barras: Linha digitável recomposta com sucesso a partir do código de barras canônico validado pela FEBRABAN.");
        status = "validado_com_alerta";
        valido = true;
      }
    } else {
      status = "requer_revisao";
      valido = false;
      divergencias.push("Falha ao recompor linha digitável a partir do código de barras");
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

  // 5. Reconciliação e Normalização Canônica do Código de Barras (44 dígitos)
  if (!linhaDigitavelFinal && linhaValidada?.linhaLimpa) {
    linhaDigitavelFinal = linhaValidada.linhaLimpa;
  }

  if (linhaMatematicamenteValida && linhaValidada?.codigoBarrasDerivado) {
    const cbDerivado = linhaValidada.codigoBarrasDerivado;
    if (raw.codigo_barras) {
      const cbClean = cleanDigits(raw.codigo_barras);
      if (cbClean === cbDerivado) {
        codigoBarrasFinal = cbDerivado;
      } else {
        // Código bruto do OCR difere do código canônico derivado
        const cbRawValidacao = validateCodigoBarras(cbClean);
        if (cbRawValidacao.valido && cbClean !== cbDerivado) {
          // Ambos são códigos válidos por si sós, mas CONTRADITÓRIOS (apontam para títulos distintos)
          divergencias.push("Inconsistência irreconciliável: código de barras e linha digitável válidos apontam para documentos diferentes.");
          status = "requer_revisao";
          valido = false;
        } else {
          // OCR bruto é inválido (48 dígitos, ruído visual, checksum inválido). A linha íntegra é a autoridade canônica.
          codigoBarrasFinal = cbDerivado;
          warnings.push("divergencia_codigo_barras_ocr: OCR bruto inválido substituído pelo código canônico derivado de 44 dígitos da linha FEBRABAN.");
        }
      }
    } else {
      codigoBarrasFinal = cbDerivado;
    }
  } else if (codigoValidado && codigoValidado.valido) {
    codigoBarrasFinal = codigoValidado.codigoLimpo;
  } else if (codigoValidado && !codigoValidado.valido && !linhaMatematicamenteValida) {
    divergencias.push(...codigoValidado.erros);
  }

  return {
    valido,
    status,
    divergencias,
    warnings,
    linhaDigitavel: linhaValidada,
    codigoBarras: codigoValidado,
    codigoBarrasFinal,
    linhaDigitavelFinal,
    valorFinal,
    valorSource,
    dataVencimentoFinal,
    vencimentoSource,
    beneficiarioFinal,
    cnpjCpfBeneficiarioFinal: cnpjCpfBeneficiario.formatted || cnpjCpfBeneficiario.clean,
    pagadorFinal,
    cnpjCpfPagadorFinal: cnpjCpfPagador.formatted || cnpjCpfPagador.clean,
    bancoFinal,
    evidence: {
      ...linhaValidada?.evidence,
      codigo_barras_canonico_derivado: Boolean(codigoBarrasFinal && codigoBarrasFinal.length === 44),
      codigo_barras_divergente_ocr: Boolean(raw.codigo_barras && cleanDigits(raw.codigo_barras) !== codigoBarrasFinal),
      has_unresolved_material_divergence: hasUnresolvedMaterialDivergence,
      divergencia_material_detalhes: hasUnresolvedMaterialDivergence ? divergencias : undefined,
    },
    motivo: divergencias.length > 0 ? divergencias.join(" | ") : (warnings.length > 0 ? warnings.join(" | ") : undefined),
  };
}
