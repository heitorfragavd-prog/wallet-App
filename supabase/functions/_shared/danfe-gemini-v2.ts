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

  let valorUnitarioLido: number | null = temUnitLido ? vUnitLidoNum : null;
  let valorUnitarioCalculado: number | null = null;
  let valorUnitarioInferido = false;

  let valorTotalLido: number | null = temTotLido ? vTotLidoNum : null;
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

export const GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS = `Você é um extrator fiscal especializado em DANFE brasileira.
Analise esta imagem da DANFE e extraia com máxima precisão o cabeçalho fiscal, a paginação (FOLHA X / Y) e o quadro CÁLCULO DO IMPOSTO (Totais).

Retorne APENAS um JSON no seguinte formato:
{
  "cabecalho": {
    "fornecedor": "razão social do emitente/fornecedor ou null",
    "cnpj_fornecedor": "CNPJ do emitente ou null",
    "numero_nf": "número da NF formatado (ex: 013.790.902) ou null",
    "serie_nf": "série da NF (ex: 26) ou null",
    "data_emissao": "data de emissão YYYY-MM-DD ou null",
    "data_entrada": "data de entrada/saída YYYY-MM-DD ou null",
    "chave_acesso": "chave de acesso de 44 dígitos ou null",
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
1. "pagina_atual" e "total_paginas": identifique no cabeçalho/topo da DANFE o campo de folha (ex: "FOLHA 1/2" -> pagina_atual: 1, total_paginas: 2; "FOLHA 2/2" -> pagina_atual: 2, total_paginas: 2). Se for folha única ("FOLHA 1/1" ou sem indicação de múltiplas folhas), use pagina_atual: 1 e total_paginas: 1.
2. "valor_produtos": extraia o valor numérico exato do campo "VALOR TOTAL DOS PRODUTOS" do quadro CÁLCULO DO IMPOSTO. NUNCA calcule ou some itens. Campo ilegível = null.
3. "valor_total_nf": extraia o valor numérico exato do campo "VALOR TOTAL DA NOTA" do quadro CÁLCULO DO IMPOSTO. NUNCA calcule ou invente. Campo ilegível = null.
4. Não invente dados. Se não estiver legível na folha, retorne null.
5. "regiao_tabela_produtos": porcentagem vertical (0.0 a 1.0) onde a seção DADOS DO PRODUTO / SERVIÇO começa e termina.`;

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
