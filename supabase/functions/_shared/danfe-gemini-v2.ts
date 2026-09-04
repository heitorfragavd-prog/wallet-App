/**
 * WALLET — PIPELINE DANFE GEMINI V2 (Core Engine)
 * 
 * Módulo de extração fiscal com visão contínua, sanitização de FCI,
 * validação estrita sem inventar unidades e sem mascarar valores inferidos.
 */

export interface DanfeItemV2 {
  codigo: string | null;
  ean: string | null;
  descricao: string;
  ncm: string | null;
  cst: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  valor_unitario_lido: number | null;
  valor_unitario_calculado: number | null;
  valor_unitario_inferido: boolean;
  valor_total_lido: number | null;
  valor_total_calculado: number | null;
  valor_total_inferido: boolean;
  valor_total: number; // Valor consolidado para soma matemática
  valor_unitario: number; // Valor consolidado
  fci_info: string | null;
  campos_incompletos: string[];
}

export interface DanfeValidationResultV2 {
  valido: boolean;
  status: 'ok' | 'requer_revisao';
  somaItens: number;
  valorReferencia: number;
  diferenca: number;
  toleranciaUtilizada: number;
  motivo?: string;
  totalItensComCamposIncompletos: number;
}

export interface DanfeExtractionResultV2 {
  cabecalho?: {
    numero_nf?: string | null;
    serie_nf?: string | null;
    fornecedor?: string | null;
    cnpj_fornecedor?: string | null;
    data_emissao?: string | null;
    data_entrada?: string | null;
    chave_acesso?: string | null;
  };
  valores_totais?: {
    valor_produtos?: number;
    valor_total_nf?: number;
    valor_icms?: number;
    valor_ipi?: number;
    valor_frete?: number;
  };
  itens: DanfeItemV2[];
  itensRejeitados: Array<{ index: number; raw: any; motivo: string }>;
  validacao: DanfeValidationResultV2;
  metadados: {
    modelo_utilizado: string;
    resolucao_original?: string;
    resolucao_crop?: string;
    tempo_execucao_ms: number;
    segunda_leitura_executada: boolean;
    prompt_tokens?: number;
    candidates_tokens?: number;
    custo_usd?: number;
  };
}

// ─── CONJUNTO DE UNIDADES FISCAIS VÁLIDAS NO BRASIL ───
export const UNIDADES_FISCAIS_VALIDAS = new Set([
  'UN', 'UND', 'UNID', 'CX', 'CXA', 'PC', 'PCA', 'PCT', 'PACOTE',
  'KG', 'KGS', 'G', 'GR', 'GRAMA', 'LT', 'L', 'LITRO', 'LTR',
  'FD', 'FARDO', 'DZ', 'DUZIA', 'SC', 'SACO', 'M', 'M2', 'M3',
  'PAR', 'CJ', 'CONJ', 'RO', 'ROLO', 'TB', 'TUBO', 'GL', 'GALAO',
  'CP', 'FC', 'FL', 'LATA', 'LT1', 'PET', 'GARRAFA', 'GF', 'AMP'
]);

// ─── 1. SANITIZAÇÃO DE FCI E TEXTOS LEGAIS DENTRO DA DESCRIÇÃO ───

export function sanitizeProductDescription(descricaoBruta: string): { descricaoLimpa: string; fciInfo: string | null } {
  if (!descricaoBruta) {
    return { descricaoLimpa: '', fciInfo: null };
  }

  let text = String(descricaoBruta).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let extractedFci: string | null = null;

  const fciPatterns = [
    /Resolu[çc][ãa]o\s+do\s+Senado\s+Federal\s+n[ºo°]?\s*13\/12[^\n]*/gi,
    /N[úu]mero\s+da\s+FCI:?\s*([A-F0-9\-]{36}|[A-F0-9\-]+)/gi,
    /FCI:?\s*([A-F0-9\-]{36})/gi,
    /vBCFCPST[^\n]*/gi,
    /vFCPST[^\n]*/gi,
  ];

  for (const pattern of fciPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (!extractedFci) extractedFci = match.join('; ');
      text = text.replace(pattern, ' ');
    }
  }

  const limpa = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-_,.:;]+|[\s\-_,.:;]+$/g, '')
    .trim();

  return {
    descricaoLimpa: limpa.length > 0 ? limpa : String(descricaoBruta).trim(),
    fciInfo: extractedFci
  };
}

// ─── 2. PARSER DE NÚMEROS BRASILEIROS ───

export function parseFiscalNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim();
  if (str.includes(',')) {
    const clean = str.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
  const clean = str.replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

// ─── 3. VALIDAÇÃO ESTRUTURAL DETERMINÍSTICA ESTREITA ───

export function validateProductRowV2(rawItem: any): { isValid: boolean; item?: DanfeItemV2; motivo?: string } {
  if (!rawItem || typeof rawItem !== 'object') {
    return { isValid: false, motivo: 'Objeto nulo ou inválido' };
  }

  const rawDesc = String(rawItem.descricao || '').trim();
  if (rawDesc.length < 2) {
    return { isValid: false, motivo: 'Descrição vazia ou muito curta (<2 caracteres)' };
  }

  // 1. Sanitizar FCI da descrição
  const { descricaoLimpa, fciInfo } = sanitizeProductDescription(rawDesc);
  const descUpper = descricaoLimpa.toUpperCase();

  // 2. Rejeição estrita de seções e rodapés puros
  const rodapesPuros = [
    'DADOS ADICIONAIS',
    'INFORMACOES COMPLEMENTARES',
    'INFORMAÇÕES COMPLEMENTARES',
    'RESERVADO AO FISCO',
    'BASE DE CALCULO DO ICMS',
    'VALOR TOTAL DOS PRODUTOS',
    'CONTINUACAO',
    'CONTINUAÇÃO',
    'DOCUMENTO AUXILIAR DA NOTA FISCAL',
    'TRIBUTOS INCIDENTES'
  ];

  if (rodapesPuros.some(r => descUpper === r || descUpper.startsWith(r))) {
    return { isValid: false, motivo: `Linha de rodapé/seção rejeitada: "${descricaoLimpa}"` };
  }

  // 3. Validação de Quantidade
  const qtd = parseFiscalNumber(rawItem.quantidade);
  if (qtd <= 0) {
    return { isValid: false, motivo: `Quantidade inválida (${rawItem.quantidade})` };
  }

  // 4. Validação de Valores Monetários com preservação de origem (lido vs inferido)
  const vUnitLidoNum = rawItem.valor_unitario != null && String(rawItem.valor_unitario).trim() !== '' ? parseFiscalNumber(rawItem.valor_unitario) : null;
  const vTotLidoNum = rawItem.valor_total != null && String(rawItem.valor_total).trim() !== '' ? parseFiscalNumber(rawItem.valor_total) : null;

  const temUnitLido = vUnitLidoNum !== null && vUnitLidoNum > 0;
  const temTotLido = vTotLidoNum !== null && vTotLidoNum > 0;

  if (!temUnitLido && !temTotLido) {
    return { isValid: false, motivo: 'Nenhum valor monetário lido (unitário e total zerados ou nulos)' };
  }

  const valorUnitarioLido: number | null = temUnitLido ? vUnitLidoNum : null;
  let valorUnitarioCalculado: number | null = null;
  let valorUnitarioInferido = false;

  const valorTotalLido: number | null = temTotLido ? vTotLidoNum : null;
  let valorTotalCalculado: number | null = null;
  let valorTotalInferido = false;

  if (temTotLido && !temUnitLido) {
    valorUnitarioCalculado = +(vTotLidoNum! / qtd).toFixed(4);
    valorUnitarioInferido = true;
  }

  if (temUnitLido && !temTotLido) {
    valorTotalCalculado = +(qtd * vUnitLidoNum!).toFixed(2);
    valorTotalInferido = true;
  }

  const valorTotalConsolidado = temTotLido ? vTotLidoNum! : valorTotalCalculado!;
  const valorUnitarioConsolidado = temUnitLido ? vUnitLidoNum! : valorUnitarioCalculado!;

  // 5. Forte Sinal Fiscal Obrigatório (Código >=2 chars OU EAN >=7 chars OU NCM >=4 dígitos OU CFOP 4 dígitos)
  const codStr = rawItem.codigo ? String(rawItem.codigo).trim() : null;
  const eanStr = rawItem.ean ? String(rawItem.ean).trim() : null;
  const ncmStr = rawItem.ncm ? String(rawItem.ncm).trim().replace(/[^0-9]/g, '') : null;
  const cfopStr = rawItem.cfop ? String(rawItem.cfop).trim().replace(/[^0-9]/g, '') : null;
  const cstStr = rawItem.cst ? String(rawItem.cst).trim() : null;

  const temSinalCodigo = Boolean(codStr && codStr.length >= 2 && codStr !== 'null');
  const temSinalEan = Boolean(eanStr && eanStr.length >= 7 && eanStr !== 'SEM GTIN');
  const temSinalNcm = Boolean(ncmStr && ncmStr.length >= 4);
  const temSinalCfop = Boolean(cfopStr && cfopStr.length === 4);

  const temForteSinalFiscal = temSinalCodigo || temSinalEan || temSinalNcm || temSinalCfop;
  if (!temForteSinalFiscal) {
    return { isValid: false, motivo: 'Linha sem nenhum sinal fiscal identificador (sem código, EAN, NCM ou CFOP)' };
  }

  // 6. Tratamento de Unidade (NUNCA INVENTAR "UN")
  let unidadeFinal: string | null = null;
  if (rawItem.unidade) {
    const uUpper = String(rawItem.unidade).trim().toUpperCase();
    if (UNIDADES_FISCAIS_VALIDAS.has(uUpper)) {
      unidadeFinal = uUpper;
    } else if (uUpper.length >= 1 && uUpper.length <= 4) {
      unidadeFinal = uUpper;
    }
  }

  const camposIncompletos: string[] = [];
  if (!unidadeFinal) camposIncompletos.push('unidade');
  if (valorUnitarioInferido) camposIncompletos.push('valor_unitario_inferido');
  if (valorTotalInferido) camposIncompletos.push('valor_total_inferido');
  if (!ncmStr) camposIncompletos.push('ncm');
  if (!cfopStr) camposIncompletos.push('cfop');

  const itemConsolidado: DanfeItemV2 = {
    codigo: temSinalCodigo ? codStr : null,
    ean: temSinalEan ? eanStr : null,
    descricao: descricaoLimpa,
    ncm: temSinalNcm ? ncmStr : null,
    cst: cstStr,
    cfop: temSinalCfop ? cfopStr : null,
    unidade: unidadeFinal,
    quantidade: qtd,
    valor_unitario_lido: valorUnitarioLido,
    valor_unitario_calculado: valorUnitarioCalculado,
    valor_unitario_inferido: valorUnitarioInferido,
    valor_total_lido: valorTotalLido,
    valor_total_calculado: valorTotalCalculado,
    valor_total_inferido: valorTotalInferido,
    valor_total: valorTotalConsolidado,
    valor_unitario: valorUnitarioConsolidado,
    fci_info: fciInfo,
    campos_incompletos: camposIncompletos
  };

  return { isValid: true, item: itemConsolidado };
}

// ─── 4. RECONCILIAÇÃO DETERMINÍSTICA SEM ROW_CENTER ───

export function reconcileAndDeduplicateV2(itens1: DanfeItemV2[], itens2: DanfeItemV2[]): DanfeItemV2[] {
  const resultado = [...itens1];

  const normalizeStr = (s: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  for (const cand of itens2) {
    const candDesc = normalizeStr(cand.descricao);
    const candCod = (cand.codigo || '').trim();
    const candTot = Number(cand.valor_total) || 0;
    const candQtd = Number(cand.quantidade) || 0;

    const isDuplicate = resultado.some(existing => {
      const exDesc = normalizeStr(existing.descricao);
      const exCod = (existing.codigo || '').trim();
      const exTot = Number(existing.valor_total) || 0;
      const exQtd = Number(existing.quantidade) || 0;

      // 1. Mesmo código, mesma quantidade e mesmo valor total
      if (candCod && exCod && candCod === exCod && Math.abs(candTot - exTot) < 0.05 && Math.abs(candQtd - exQtd) < 0.01) {
        return true;
      }

      // 2. Mesma descrição normalizada, mesma quantidade e mesmo valor total
      if (candDesc && exDesc && (candDesc === exDesc || candDesc.includes(exDesc) || exDesc.includes(candDesc))) {
        if (Math.abs(candTot - exTot) < 0.05 && Math.abs(candQtd - exQtd) < 0.01) {
          return true;
        }
      }

      return false;
    });

    if (!isDuplicate) {
      resultado.push(cand);
    }
  }

  return resultado;
}

// ─── 5. VALIDAÇÃO MATEMÁTICA DETERMINÍSTICA ───

export function validateDanfeMathV2(itens: DanfeItemV2[], valorProdutosDeclarado?: number | null): DanfeValidationResultV2 {
  const somaItens = +(itens.reduce((acc, it) => acc + (Number(it.valor_total) || 0), 0)).toFixed(2);
  const temValorReferencia = typeof valorProdutosDeclarado === 'number' && !isNaN(valorProdutosDeclarado) && valorProdutosDeclarado > 0;
  const valorReferencia = temValorReferencia ? +(Number(valorProdutosDeclarado)).toFixed(2) : 0;
  const diferenca = +(somaItens - valorReferencia).toFixed(2);

  const tolerancia = 0.05;
  // Validação estrita: EXIGE valor de referência positivo lido da NF e itens transcritos
  const valido = temValorReferencia && itens.length > 0 && Math.abs(diferenca) <= tolerancia;

  const totalIncompletos = itens.filter(it => it.campos_incompletos.length > 0).length;

  let motivo: string | undefined;
  if (!temValorReferencia) {
    motivo = 'valor_produtos_nf_ausente: Valor Total dos Produtos não foi identificado no quadro de totais da NF';
  } else if (!valido) {
    motivo = `Divergência matemática: soma dos itens (${somaItens}) difere do valor declarado na NF (${valorReferencia}) em ${diferenca}`;
  }

  return {
    valido,
    status: valido ? 'ok' : 'requer_revisao',
    somaItens,
    valorReferencia,
    diferenca,
    toleranciaUtilizada: tolerancia,
    motivo,
    totalItensComCamposIncompletos: totalIncompletos
  };
}

// ─── 4. FORMATAÇÃO E EXTRAÇÃO DETERMINÍSTICA DO NÚMERO DA NF-E ─────────────

/**
 * Formata um número de NF-e (nNF) para a máscara padrão 000.000.000 sem jamais mover ou trocar dígitos.
 */
export function formatNFeNumber(nNF: string | number | null | undefined): string | null {
  if (nNF === null || nNF === undefined) return null;
  const digits = String(nNF).replace(/\D/g, "");
  if (!digits) return null;

  // REGRA ESTRITA: nNF tem exatamente 9 dígitos (padStart se menor, rejeitar se maior).
  // CNPJ tem 14 dígitos e NUNCA pode ser aceito como número de NF.
  if (digits.length > 9) {
    // Número de dígitos inválido para nNF — rejeitar silenciosamente.
    return null;
  }

  const padded = digits.padStart(9, "0");
  return padded.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
}


export interface AccessKeyNFeInfo {
  cUF: string;
  AAMM: string;
  CNPJ: string;
  modelo: string;
  serie: string;
  nNF: string; // 9 dígitos
  nNFFormatado: string; // 000.000.000
  tpEmis: string;
  cNF: string;
  cDV: string;
}

/**
 * Calcula o dígito verificador (cDV) de uma chave NF-e de 44 dígitos usando módulo 11 SEFAZ.
 * Retorna true se o DV calculado coincidir com o DV do último dígito da chave.
 */
function validateNFeAccessKeyDV(digits44: string): boolean {
  if (digits44.length !== 44) return false;
  const keyDigits = digits44.substring(0, 43);
  const expectedDV = parseInt(digits44[43], 10);

  let sum = 0;
  let weight = 2;
  for (let i = keyDigits.length - 1; i >= 0; i--) {
    sum += parseInt(keyDigits[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const calculatedDV = remainder < 2 ? 0 : 11 - remainder;
  return calculatedDV === expectedDV;
}

/**
 * Valida minimamente se uma sequência de 44 dígitos é uma chave NF-e plausível.
 * Critérios: exatamente 44 dígitos, modelo = "55" (NF-e) ou "65" (NFC-e), DV válido.
 */
function isPlausibleNFeAccessKey(digits44: string): boolean {
  if (digits44.length !== 44) return false;
  const modelo = digits44.substring(20, 22);
  if (modelo !== "55" && modelo !== "65") return false;
  return validateNFeAccessKeyDV(digits44);
}

/**
 * Busca uma chave de acesso válida de 44 dígitos em campos específicos do payload.
 * NÃO serializa o JSON inteiro nem usa regex de blocos que possa concatenar CNPJ + NF.
 * Cada candidato é avaliado individualmente. Deve ter exatamente 44 dígitos após limpeza.
 */
export function findAccessKeyInPayload(payload: any, rawText?: string): string | null {
  if (!payload && !rawText) return null;

  // Lista explícita de campos onde a chave de acesso pode estar — nunca o payload inteiro
  const candidateValues: any[] = [
    payload?.chave_acesso,
    payload?.chave,
    payload?.chave_de_acesso,
    payload?.nfe_chave,
    payload?.access_key,
    payload?.cabecalho?.chave_acesso,
    payload?.cabecalho?.chave,
    payload?.cabecalho?.chave_de_acesso,
    payload?.cabecalho?.nfe_chave,
    payload?.cabecalho?.access_key,
  ];

  for (const cand of candidateValues) {
    if (cand == null) continue;
    const raw = String(cand);
    const clean = raw.replace(/\D/g, "");
    // Só aceitar se EXATAMENTE 44 dígitos, modelo = 55/65 e DV válido
    if (clean.length === 44 && isPlausibleNFeAccessKey(clean)) {
      return clean;
    }
  }

  // Busca no rawText fornecido explicitamente (ex: resposta bruta do OCR) —
  // NUNCA usa JSON.stringify do payload completo, para não concatenar campos separados.
  if (rawText) {
    // Sequência contínua de exatamente 44 dígitos (não 43, não 45)
    const matches = rawText.match(/\b\d{44}\b/g) || [];
    for (const m of matches) {
      if (isPlausibleNFeAccessKey(m)) return m;
    }
  }

  return null;
}


/**
 * Extrai deterministicamente as partes estruturais e o número da NF-e (nNF)
 * a partir de uma chave de acesso oficial de 44 dígitos da SEFAZ.
 * 
 * Estrutura:
 * cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + cDV(1) = 44 dígitos
 */
export function extractNFeNumberFromAccessKey(chaveAcesso: string | null | undefined): AccessKeyNFeInfo | null {
  if (!chaveAcesso) return null;
  const digits = String(chaveAcesso).replace(/\D/g, "");
  if (digits.length !== 44) return null;

  const cUF = digits.substring(0, 2);
  const AAMM = digits.substring(2, 6);
  const CNPJ = digits.substring(6, 20);
  const modelo = digits.substring(20, 22);
  const serie = digits.substring(22, 25);
  const nNF = digits.substring(25, 34); // 9 dígitos da posição 25 a 33 (índice 25 a 34)
  const tpEmis = digits.substring(34, 35);
  const cNF = digits.substring(35, 43);
  const cDV = digits.substring(43, 44);

  return {
    cUF,
    AAMM,
    CNPJ,
    modelo,
    serie,
    nNF,
    nNFFormatado: formatNFeNumber(nNF) || nNF,
    tpEmis,
    cNF,
    cDV,
  };
}

export interface ReconciledNFeNumber {
  numero_nf: string | null;
  numero_nf_formatado: string | null;
  serie_nf: string | null;
  source_selected: "access_key" | "visual" | "none";
  match: boolean;
}

/**
 * Realiza a conciliação determinística entre o número visual lido pelo modelo e a chave de acesso da SEFAZ.
 * Se houver divergência entre o número visual e uma chave de acesso válida de 44 dígitos,
 * a chave de acesso PREVALECE como fonte canônica fiscal.
 */
export function reconcileNFeNumber(
  visualNumber: string | null | undefined,
  visualSerie: string | null | undefined,
  accessKey: string | null | undefined,
  correlationId = "anon",
  channel: "telegram" | "wallet" = "wallet",
): ReconciledNFeNumber {
  const keyInfo = extractNFeNumberFromAccessKey(accessKey);
  const visualClean = visualNumber ? String(visualNumber).replace(/\D/g, "") : null;

  // REGRA ESTRITA: numero_nf deve ter no máximo 9 dígitos.
  // CNPJ tem 14 dígitos — se chegou aqui com 14 dígitos, o modelo confundiu CNPJ com NF.
  const visualIsValid = visualClean && visualClean.length <= 9;
  const visualNormalized = visualIsValid ? visualClean.padStart(9, "0") : null;

  const digitsOnly = accessKey ? String(accessKey).replace(/\D/g, "") : "";
  const maskedKey = digitsOnly.length >= 10
    ? `${digitsOnly.substring(0, 4)}...${digitsOnly.substring(digitsOnly.length - 6)}`
    : (digitsOnly ? "invalid_len" : "none");

  // Log DANFE_REAL_HEADER_TRACE — payload estrutural sem dados sensíveis
  console.log(JSON.stringify({
    log: "DANFE_REAL_HEADER_TRACE",
    correlation_id: correlationId,
    channel,
    numero_nf_raw: visualNumber ?? null,
    numero_nf_digits_count: visualClean?.length ?? 0,
    numero_nf_valid_length: visualIsValid,
    access_key_field_present: !!accessKey,
    access_key_candidate_digits_count: digitsOnly.length,
    access_key_candidate_masked: maskedKey,
    access_key_candidate_valid: !!keyInfo,
    access_key_modelo: keyInfo?.modelo ?? null,
    access_key_dv_valid: !!keyInfo,
  }));

  if (keyInfo) {
    const keyNum = keyInfo.nNF;
    const match = visualNormalized === keyNum;
    const source_selected: "access_key" | "visual" = match ? "visual" : "access_key";
    const serie_final = visualSerie ? String(visualSerie).trim() : String(Number(keyInfo.serie));

    // Log DANFE_NF_RECONCILIATION_TRACE
    console.log(JSON.stringify({
      log: "DANFE_NF_RECONCILIATION_TRACE",
      correlation_id: correlationId,
      channel,
      numero_nf_model: visualNumber ?? null,
      numero_nf_model_valid: visualIsValid,
      access_key_found: true,
      access_key_digits_count: digitsOnly.length,
      access_key_source: "field",
      access_key_masked: maskedKey,
      access_key_modelo: keyInfo.modelo,
      numero_nf_from_access_key: keyNum,
      numero_nf_reconciled: keyInfo.nNFFormatado,
      source_selected,
      numero_nf_before_formatter: keyNum,
      numero_nf_after_formatter: keyInfo.nNFFormatado,
      match,
    }));

    return {
      numero_nf: keyNum,
      numero_nf_formatado: keyInfo.nNFFormatado,
      serie_nf: serie_final,
      source_selected,
      match,
    };
  }

  if (visualNormalized) {
    const formatted = formatNFeNumber(visualNormalized);

    // Log DANFE_NF_RECONCILIATION_TRACE — sem chave
    console.log(JSON.stringify({
      log: "DANFE_NF_RECONCILIATION_TRACE",
      correlation_id: correlationId,
      channel,
      numero_nf_model: visualNumber ?? null,
      numero_nf_model_valid: visualIsValid,
      access_key_found: false,
      access_key_digits_count: digitsOnly.length,
      access_key_source: "none",
      access_key_masked: maskedKey,
      access_key_modelo: null,
      numero_nf_from_access_key: null,
      numero_nf_reconciled: formatted,
      source_selected: "visual",
      numero_nf_before_formatter: visualNormalized,
      numero_nf_after_formatter: formatted,
      match: false,
    }));

    return {
      numero_nf: visualNormalized,
      numero_nf_formatado: formatted,
      serie_nf: visualSerie ? String(visualSerie).trim() : null,
      source_selected: "visual",
      match: false,
    };
  }

  // Sem chave e sem número visual válido — nenhum dado confiável
  console.log(JSON.stringify({
    log: "DANFE_NF_RECONCILIATION_TRACE",
    correlation_id: correlationId,
    channel,
    numero_nf_model: visualNumber ?? null,
    numero_nf_model_valid: false,
    access_key_found: false,
    access_key_digits_count: digitsOnly.length,
    access_key_source: "none",
    access_key_masked: maskedKey,
    access_key_modelo: null,
    numero_nf_from_access_key: null,
    numero_nf_reconciled: null,
    source_selected: "none",
    numero_nf_before_formatter: null,
    numero_nf_after_formatter: null,
    match: false,
    invalid_nf_number_length: visualClean ? visualClean.length : 0,
  }));

  return {
    numero_nf: null,
    numero_nf_formatado: null,
    serie_nf: visualSerie ? String(visualSerie).trim() : null,
    source_selected: "none",
    match: false,
  };
}


export const GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS = `Você é um extrator fiscal especializado em DANFE brasileira.

Analise esta imagem da DANFE e extraia com máxima precisão o cabeçalho fiscal, a CHAVE DE ACESSO (44 dígitos numéricos localizada no quadro superior direito abaixo do código de barras), a paginação (FOLHA X / Y) e o quadro CÁLCULO DO IMPOSTO (Totais).

Retorne APENAS um JSON no seguinte formato:
{
  "cabecalho": {
    "fornecedor": "razão social do emitente/fornecedor ou null",
    "cnpj_fornecedor": "CNPJ do emitente ou null",
    "numero_nf": "número da NF impresso no campo Nº (ex: 000.083.208) ou null",
    "serie_nf": "série da NF (ex: 1) ou null",
    "data_emissao": "data de emissão YYYY-MM-DD ou null",
    "data_entrada": "data de entrada/saída YYYY-MM-DD ou null",
    "chave_acesso": "transcrição dos 44 dígitos da CHAVE DE ACESSO abaixo do código de barras ou null",
    "pagina_atual": 1,
    "total_paginas": 1
  },
  "valores_totais": {
    "valor_produtos": 0.00,
    "valor_total_nf": 0.00,
    "valor_icms": 0.00,
    "valor_ipi": 0.00,
    "valor_frete": 0.00,
    "valor_desconto": 0.00
  },
  "regiao_tabela_produtos": {
    "top": 0.25,
    "bottom": 0.85
  }
}

REGRAS CRÍTICAS:
1. "chave_acesso": no quadro superior direito, abaixo do código de barras da DANFE, transcreva a sequência completa de 44 dígitos da CHAVE DE ACESSO. Remova espaços ou transcreva os dígitos.
2. "numero_nf": leia com atenção o campo "Nº" no cabeçalho da DANFE.
3. "pagina_atual" e "total_paginas": identifique no cabeçalho/topo da DANFE o campo de folha (ex: "FOLHA 1/2" -> pagina_atual: 1, total_paginas: 2; "FOLHA 2/2" -> pagina_atual: 2, total_paginas: 2). Se for folha única ("FOLHA 1/1" ou sem indicação de múltiplas folhas), use pagina_atual: 1 e total_paginas: 1.
4. "valor_produtos": extraia o valor numérico exato do campo "VALOR TOTAL DOS PRODUTOS" do quadro CÁLCULO DO IMPOSTO. NUNCA calcule ou some itens. Campo ilegível = null.
5. "valor_total_nf": extraia o valor numérico exato do campo "VALOR TOTAL DA NOTA" do quadro CÁLCULO DO IMPOSTO. NUNCA calcule ou invente. Campo ilegível = null.
6. Não invente dados. Se não estiver legível na folha, retorne null.
7. "regiao_tabela_produtos": porcentagem vertical (0.0 a 1.0) onde a seção DADOS DO PRODUTO / SERVIÇO começa e termina.`;


export const GEMINI_V2_PROMPT_TABELA = `Você é um extrator fiscal especializado em DANFE brasileira.

Esta imagem contém a tabela DADOS DO PRODUTO / SERVIÇO de uma Nota Fiscal.

Faça a transcrição EXAUSTIVA de TODAS as linhas físicas da tabela, de cima para baixo.

REGRAS ESTREITAS:
1. Não resuma.
2. Não deduplique.
3. Não invente valores.
4. Não use totais da nota para inferir produtos.
5. Textos legais de FCI ou Resolução do Senado podem aparecer dentro da célula de descrição de um produto. Esses textos NÃO significam que a linha deixou de ser produto. Transcreva a descrição completa.
6. Se a UNIDADE não estiver legível, retorne null. NUNCA assuma "UN" por conta própria.
7. Se algum campo estiver ilegível, retorne null.

Retorne em formato JSON estrito:
{
  "itens": [
    {
      "codigo": "string ou null",
      "ean": "string ou null",
      "descricao": "string",
      "ncm": "string ou null",
      "cst": "string ou null",
      "cfop": "string ou null",
      "unidade": "string ou null",
      "quantidade": 0.0,
      "valor_unitario": 0.0,
      "valor_total": 0.0
    }
  ]
}`;
