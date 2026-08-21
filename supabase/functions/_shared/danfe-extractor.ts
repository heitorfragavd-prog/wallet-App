/**
 * DANFE Extractor Engine & Security Module (v1.0.47)
 * 
 * Módulo puro e determinístico para extração estruturada de DANFE:
 * 1. calculateRotationNeeded: detecção de orientação por conteúdo (0°, 90°, 180°, 270°)
 * 2. calculateTableCropTiles: cálculo adaptativo de recortes com Core vs Overlap
 * 3. expandCropTileWithMargin: ampliação de contexto vertical para retry de visão
 * 4. classifyVisionResponse: classificação explícita de status (success, empty_valid, refusal, invalid_json, api_error)
 * 5. validateProductRow: validador estrutural de linha de produto (rejeição de textos/rodapés legais)
 * 6. consolidateDanfeItems: ownership geométrico de linhas baseado no Core do Tile + resgate seguro de órfãos + deduplicação
 * 7. validateDanfeMath: validação matemática estrita da soma e tolerâncias por item
 * 8. evaluateStockStatus: proteção de estoque e custo unitário para unidades fracionadas (CX != UN)
 */

export interface DanfeItemRaw {
  codigo?: string | null;
  ean?: string | null;
  descricao?: string;
  ncm?: string | null;
  cfop?: string | null;
  unidade?: string;
  quantidade?: number | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
  icms_aliquota?: number | null;
  ipi_aliquota?: number | null;
  pis_aliquota?: number | null;
  cofins_aliquota?: number | null;
  custo_unitario_liquido?: number | null;
  confianca?: number;

  // Metadados internos geométricos e de rastreamento de tile (NÃO gravados na tabela final do BD)
  _row_center?: number | null;
  _row_top?: number | null;
  _row_bottom?: number | null;
  _absoluteY?: number | null;
  _sourceTile?: number;
  _positionInTile?: number;
  _totalItemsInTile?: number;
  _isCoreOwner?: boolean;
}

export interface DanfeCabecalho {
  numero_nf?: string | null;
  serie_nf?: string | null;
  data_emissao?: string | null;
  data_entrada?: string | null;
  fornecedor?: string | null;
  cnpj_fornecedor?: string | null;
  chave_acesso?: string | null;
}

export interface DanfeTotais {
  valor_total_nf?: number | null;
  valor_produtos?: number | null;
  valor_icms?: number | null;
  valor_icms_st?: number | null;
  valor_ipi?: number | null;
  valor_frete?: number | null;
  valor_desconto?: number | null;
}

export interface RegiaoTabelaDetectada {
  detectada: boolean;
  top?: number | null;
  bottom?: number | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface DanfeValidacaoResultado {
  valido: boolean;
  status: "valido" | "requer_revisao";
  itensValidosCount: number;
  somaItens: number;
  valorReferencia: number;
  diferenca: number;
  percentualDiferenca: number;
  itensComErroMatematico: number;
  motivo?: string;
}

export interface CropTileCoordinate {
  index: number;
  totalTiles: number;
  x: number;
  y: number;
  width: number;
  height: number;
  overlapY: number;
  coreStartY: number;
  coreEndY: number;
}

export interface ItemConsolidationDiagnostic {
  tileIndex: number;
  itemIndex: number;
  descricao: string;
  codigo?: string | null;
  rowCenter: number | null;
  absoluteY: number | null;
  coreRange: string;
  accepted: boolean;
  reason: string;
}

export interface TileCoverageAnalysis {
  tileIndex: number;
  yStart: number;
  yEnd: number;
  coreStart: number;
  coreEnd: number;
  itemsCount: number;
  minRowCenter: number | null;
  maxRowCenter: number | null;
  possivelOmissaoFinal: boolean;
}

export type VisionResponseStatus = "success" | "empty_valid" | "refusal" | "invalid_json" | "api_error";

/**
 * 1. ORIENTAÇÃO DO DOCUMENTO (UMA ÚNICA ROTAÇÃO POR CONTEÚDO)
 * Retorna exatamente o ângulo que a imagem deve ser rotacionada baseando-se no conteúdo textual.
 */
export function calculateRotationNeeded(
  contentOrientationDegrees?: 0 | 90 | 180 | 270 | null
): 0 | 90 | 180 | 270 {
  if (contentOrientationDegrees != null && [0, 90, 180, 270].includes(contentOrientationDegrees)) {
    return contentOrientationDegrees as 0 | 90 | 180 | 270;
  }
  return 0;
}

/**
 * 2. DETERMINAÇÃO ADAPTATIVA DE TILES
 * Determina o número de recortes baseado na altura física da tabela:
 * - Altura < 220px: 1 tile (tabela compacta de 1 a 4 itens)
 * - Altura 220px - 440px: 2 tiles (tabela média de 5 a 8 itens)
 * - Altura 441px - 650px: 3 tiles (tabela densa de 8 a 14 itens)
 * - Altura > 650px: 4 tiles (tabela muito densa / folha cheia)
 */
export function determineAdaptiveTilesCount(tableHeightPx: number): number {
  if (tableHeightPx < 220) return 1;
  if (tableHeightPx <= 440) return 2;
  if (tableHeightPx <= 650) return 3;
  return 4;
}

/**
 * 2.1 RECORTES DA TABELA COM FATIAMENTO ADAPTATIVO (CORE VS OVERLAP)
 */
export function calculateTableCropTiles(
  imageWidth: number,
  imageHeight: number,
  regiaoDetectada?: RegiaoTabelaDetectada | null,
  tilesCountInput?: number | "auto",
  overlapPercent: number = 0.15
): { tiles: CropTileCoordinate[]; usouFallback: boolean; topPercent: number; bottomPercent: number; adaptiveTilesCount: number } {
  let topPercent = 0.28;
  let bottomPercent = 0.88;
  let usouFallback = true;

  if (regiaoDetectada && regiaoDetectada.detectada) {
    const rawTop = regiaoDetectada.top != null ? regiaoDetectada.top : regiaoDetectada.y;
    const rawBottom =
      regiaoDetectada.bottom != null
        ? regiaoDetectada.bottom
        : regiaoDetectada.y != null && regiaoDetectada.height != null
        ? regiaoDetectada.y + regiaoDetectada.height
        : null;

    if (
      rawTop != null &&
      rawBottom != null &&
      rawTop >= 0.05 &&
      rawBottom <= 0.98 &&
      rawBottom > rawTop + 0.10
    ) {
      topPercent = Math.max(0.05, Math.min(0.9, rawTop));
      bottomPercent = Math.max(topPercent + 0.10, Math.min(0.98, rawBottom));
      usouFallback = false;
    }
  }

  const startY = Math.floor(imageHeight * topPercent);
  const endY = Math.floor(imageHeight * bottomPercent);
  const totalTableHeight = Math.max(100, endY - startY);

  const tilesCount =
    typeof tilesCountInput === "number" && tilesCountInput >= 1
      ? Math.min(4, Math.max(1, Math.floor(tilesCountInput)))
      : determineAdaptiveTilesCount(totalTableHeight);

  if (tilesCount <= 1) {
    return {
      tiles: [
        {
          index: 0,
          totalTiles: 1,
          x: 0,
          y: startY,
          width: imageWidth,
          height: totalTableHeight,
          overlapY: 0,
          coreStartY: startY,
          coreEndY: endY,
        },
      ],
      usouFallback,
      topPercent,
      bottomPercent,
      adaptiveTilesCount: 1,
    };
  }

  const rawTileHeight = totalTableHeight / tilesCount;
  const overlapPx = Math.floor(rawTileHeight * overlapPercent);
  const tiles: CropTileCoordinate[] = [];

  for (let i = 0; i < tilesCount; i++) {
    const coreStartY = Math.floor(startY + i * rawTileHeight);
    const coreEndY = i === tilesCount - 1 ? endY : Math.floor(startY + (i + 1) * rawTileHeight);

    const tileStartY = Math.max(startY, Math.floor(coreStartY - (i > 0 ? overlapPx : 0)));
    const tileEndY = Math.min(endY, Math.floor(coreEndY + (i < tilesCount - 1 ? overlapPx : 0)));
    const tileHeight = tileEndY - tileStartY;

    tiles.push({
      index: i,
      totalTiles: tilesCount,
      x: 0,
      y: tileStartY,
      width: imageWidth,
      height: tileHeight,
      overlapY: i > 0 ? overlapPx : 0,
      coreStartY,
      coreEndY,
    });
  }

  return {
    tiles,
    usouFallback,
    topPercent,
    bottomPercent,
    adaptiveTilesCount: tilesCount,
  };
}

/**
 * 2.2 AMPLIAÇÃO DE CONTEXTO VERTICAL PARA RETRY DE VISÃO
 * Adiciona margem vertical superior e inferior sem alterar o Core original
 */
export function expandCropTileWithMargin(
  tile: CropTileCoordinate,
  imageWidth: number,
  imageHeight: number,
  marginPercent: number = 0.25
): CropTileCoordinate {
  const marginPx = Math.floor(tile.height * marginPercent);
  const newY = Math.max(0, tile.y - marginPx);
  const newEndY = Math.min(imageHeight, tile.y + tile.height + marginPx);

  return {
    ...tile,
    x: 0,
    y: newY,
    width: imageWidth,
    height: newEndY - newY,
    overlapY: tile.coreStartY - newY,
    coreStartY: tile.coreStartY,
    coreEndY: tile.coreEndY,
  };
}

/**
 * 2.3 DIAGNÓSTICO DE COBERTURA VERTICAL POR TILE
 */
export function analyzeTileCoverage(
  tile: CropTileCoordinate,
  items: DanfeItemRaw[]
): TileCoverageAnalysis {
  const validCenters = (items || [])
    .map((it) => (it._row_center != null ? Number(it._row_center) : null))
    .filter((c): c is number => c != null && !isNaN(c) && c >= 0 && c <= 1);

  const minRowCenter = validCenters.length > 0 ? Math.min(...validCenters) : null;
  const maxRowCenter = validCenters.length > 0 ? Math.max(...validCenters) : null;

  return {
    tileIndex: tile.index,
    yStart: tile.y,
    yEnd: tile.y + tile.height,
    coreStart: tile.coreStartY,
    coreEnd: tile.coreEndY,
    itemsCount: items.length,
    minRowCenter,
    maxRowCenter,
    possivelOmissaoFinal: false,
  };
}

/**
 * 2.4 SUBDIVISÃO DE TILE SUSPEITO (REEXTRAÇÃO SELETIVA)
 */
export function subdivideCropTile(
  parentTile: CropTileCoordinate,
  imageWidth: number,
  imageHeight: number,
  overlapPercent: number = 0.15
): [CropTileCoordinate, CropTileCoordinate] {
  const parentCoreHeight = parentTile.coreEndY - parentTile.coreStartY;
  const halfCore = Math.floor(parentCoreHeight / 2);
  const midY = parentTile.coreStartY + halfCore;
  const overlapPx = Math.floor(halfCore * overlapPercent);

  const subTileA: CropTileCoordinate = {
    index: parentTile.index * 10,
    totalTiles: parentTile.totalTiles * 2,
    x: 0,
    y: Math.max(0, parentTile.coreStartY - (parentTile.index > 0 ? overlapPx : 0)),
    width: imageWidth,
    height: 0,
    overlapY: parentTile.index > 0 ? overlapPx : 0,
    coreStartY: parentTile.coreStartY,
    coreEndY: midY,
  };
  subTileA.height = Math.min(imageHeight, midY + overlapPx) - subTileA.y;

  const subTileB: CropTileCoordinate = {
    index: parentTile.index * 10 + 1,
    totalTiles: parentTile.totalTiles * 2,
    x: 0,
    y: Math.max(0, midY - overlapPx),
    width: imageWidth,
    height: 0,
    overlapY: overlapPx,
    coreStartY: midY,
    coreEndY: parentTile.coreEndY,
  };
  subTileB.height = Math.min(imageHeight, parentTile.coreEndY + (parentTile.index < parentTile.totalTiles - 1 ? overlapPx : 0)) - subTileB.y;

  return [subTileA, subTileB];
}

/**
 * 2.5 CLASSIFICAÇÃO EXPLÍCITA DA RESPOSTA DE VISÃO
 * Diferencia sucesso, recusa (refusal), JSON inválido e erro de API.
 * NUNCA trata recusa de segurança ou erro como "0 produtos legítimos".
 */
export function classifyVisionResponse(
  rawContent: string | null | undefined,
  httpStatus: number = 200
): {
  status: VisionResponseStatus;
  itens: DanfeItemRaw[];
  reason?: string;
} {
  if (httpStatus !== 200) {
    return { status: "api_error", itens: [], reason: `HTTP status ${httpStatus}` };
  }

  if (!rawContent || rawContent.trim().length === 0) {
    return { status: "refusal", itens: [], reason: "Resposta vazia da API de Visão" };
  }

  const clean = rawContent.trim();
  const lower = clean.toLowerCase();

  // Detecção de Canned Refusal / Guardrail de Segurança da OpenAI
  const refusalPhrases = [
    "desculpe",
    "não consigo ajudar",
    "nao consigo ajudar",
    "como um modelo de linguagem",
    "i cannot help",
    "i'm sorry",
    "i am sorry",
    "cannot fulfill",
    "não posso transcrever",
    "nao posso transcrever",
    "não posso ajudar",
  ];

  for (const phrase of refusalPhrases) {
    if (lower.includes(phrase) && !lower.includes('"itens"')) {
      return { status: "refusal", itens: [], reason: `Recusa do modelo: "${clean.slice(0, 100)}"` };
    }
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(clean.replace(/^```json\s*/i, "").replace(/```$/g, "").trim());
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        // failed JSON
      }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { status: "invalid_json", itens: [], reason: "JSON inválido retornado pelo modelo" };
  }

  const rawArray: DanfeItemRaw[] = Array.isArray(parsed.itens) ? parsed.itens : [];
  if (rawArray.length === 0) {
    return { status: "empty_valid", itens: [], reason: "Nenhum produto listado no JSON válido" };
  }

  return { status: "success", itens: rawArray };
}

/**
 * 2.6 VALIDADOR ESTRUTURAL DE LINHA DE PRODUTO
 * Rejeita textos fiscais de rodapé, dados adicionais e observações que não são mercadorias.
 */
export function validateProductRow(item: DanfeItemRaw): { isValid: boolean; reason?: string } {
  if (!item) {
    return { isValid: false, reason: "Item vazio ou nulo" };
  }

  const desc = (item.descricao || "").trim();
  const descNorm = normalizeString(desc);

  // 1. Rejeição de Textos Legais, Observações e Rodapés Fiscais
  const termosFiscaisProibidos = [
    "resolucao do senado",
    "numero da fci",
    "informacoes complementares",
    "dados adicionais",
    "reservado ao fisco",
    "base de calculo",
    "icms st retido",
    "lei 12741",
    "trib aprox",
    "valor aproximado dos tributos",
    "decreto",
    "portaria",
    "beneficio fiscal",
    "recolhimento antecipado",
    "total dos produtos",
    "valor total da nota",
  ];

  for (const termo of termosFiscaisProibidos) {
    if (descNorm.includes(termo)) {
      return { isValid: false, reason: `Texto fiscal/rodapé detectado na descrição (${termo})` };
    }
  }

  // 2. Validação da Descrição
  if (desc.length < 2) {
    return { isValid: false, reason: "Descrição muito curta ou ausente" };
  }

  // 3. Validação de Quantidade e Valores
  const vt = item.valor_total != null ? Number(item.valor_total) : null;
  if (vt == null || isNaN(vt) || vt <= 0) {
    return { isValid: false, reason: "Valor total zerado ou ausente" };
  }

  // 4. Evidências Estruturais de Linha Fiscal de Produto
  const unidadeNorm = (item.unidade || "").toUpperCase().trim();
  const unidadesPlausiveis = [
    "UN", "UND", "CX", "FD", "PCT", "PC", "LT", "LATA", "KG", "G", "M", "L", "DZ", "GF",
    "GARRAFA", "FARDO", "PACK", "CJ", "PAR", "CPJ", "TB", "BL", "ROLO", "AMP", "FR", "POTE"
  ];
  const temUnidadeValida = unidadeNorm.length > 0 && (unidadesPlausiveis.includes(unidadeNorm) || (unidadeNorm.length <= 4 && !/\d/.test(unidadeNorm)));

  const temCodigoOuEan = Boolean(
    (item.codigo && item.codigo.trim().length >= 1 && !item.codigo.includes(" ")) ||
    (item.ean && item.ean.trim().length >= 7)
  );

  const ncmNorm = (item.ncm || "").replace(/\D/g, "");
  const temNcm = ncmNorm.length >= 4 && ncmNorm.length <= 8;

  const cfopNorm = (item.cfop || "").replace(/\D/g, "");
  const temCfop = cfopNorm.length === 4 && ["1", "2", "3", "5", "6", "7"].includes(cfopNorm[0]);

  const temEstruturaFiscal = temUnidadeValida || temCodigoOuEan || temNcm || temCfop;

  if (!temEstruturaFiscal) {
    return { isValid: false, reason: "Linha sem evidência de estrutura fiscal de produto (sem unidade, código, NCM ou CFOP)" };
  }

  return { isValid: true };
}

/**
 * Normaliza strings para comparação fiscal segura
 */
function normalizeString(s?: string | null): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Similaridade baseada em tokens de palavras (Jaccard) para comparação conservadora de descrições OCR
 */
function calculateTokenSimilarity(strA: string, strB: string): number {
  const tokensA = new Set(strA.split(" ").filter((t) => t.length > 1));
  const tokensB = new Set(strB.split(" ").filter((t) => t.length > 1));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const tA of tokensA) {
    if (tokensB.has(tA)) {
      intersection++;
    } else {
      // Verifica prefixo significativo (ex: "lata" vs "lt", "garrafa" vs "gf")
      for (const tB of tokensB) {
        if ((tA.length >= 3 && tB.startsWith(tA)) || (tB.length >= 3 && tA.startsWith(tB))) {
          intersection += 0.8;
          break;
        }
      }
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Avalia se dois candidatos da fronteira física representam a mesma linha da nota
 */
function isSamePhysicalItem(
  itemA: DanfeItemRaw,
  absYA: number,
  itemB: DanfeItemRaw,
  absYB: number,
  maxDistY: number = 45
): boolean {
  const distY = Math.abs(absYA - absYB);
  if (distY > maxDistY) {
    return false;
  }

  const codA = normalizeString(itemA.codigo);
  const codB = normalizeString(itemB.codigo);
  const eanA = normalizeString(itemA.ean);
  const eanB = normalizeString(itemB.ean);

  // 1. Identidade Forte (EAN ou Código Fiscal idênticos)
  const mesmoEan = Boolean(eanA && eanB && eanA === eanB);
  const mesmoCodigo = Boolean(codA && codB && codA === codB);
  const identidadeForte = mesmoEan || mesmoCodigo;

  const qtdA = itemA.quantidade != null ? Number(itemA.quantidade) : null;
  const qtdB = itemB.quantidade != null ? Number(itemB.quantidade) : null;
  const mesmaQtd = qtdA != null && qtdB != null && Math.abs(qtdA - qtdB) < 0.001;

  const vuA = itemA.valor_unitario != null ? Number(itemA.valor_unitario) : null;
  const vuB = itemB.valor_unitario != null ? Number(itemB.valor_unitario) : null;
  const mesmoVu = vuA != null && vuB != null && Math.abs(vuA - vuB) < 0.05;

  const vtA = itemA.valor_total != null ? Number(itemA.valor_total) : null;
  const vtB = itemB.valor_total != null ? Number(itemB.valor_total) : null;
  const mesmoVt = vtA != null && vtB != null && Math.abs(vtA - vtB) < 0.05;

  const mesmoValor = mesmoVu || mesmoVt;

  if (identidadeForte) {
    return mesmaQtd || mesmoValor;
  }

  // 2. Identidade Moderada (Descrição compatível + Quantidade compatível + Valor compatível)
  const descA = normalizeString(itemA.descricao);
  const descB = normalizeString(itemB.descricao);

  if (!descA || !descB) return false;

  const descA_raw = descA.replace(/\s+/g, "");
  const descB_raw = descB.replace(/\s+/g, "");

  const matchDescricao =
    descA === descB ||
    descA_raw === descB_raw ||
    (descA.length >= 6 && descB.length >= 6 && (descA.includes(descB) || descB.includes(descA))) ||
    calculateTokenSimilarity(descA, descB) >= 0.60;

  if (!matchDescricao) return false;

  const identidadeModerada = matchDescricao && mesmaQtd && mesmoValor;
  return identidadeModerada;
}

/**
 * 3. ATRIBUIÇÃO GEOMÉTRICA DE OWNERSHIP POR CORE DO TILE + VALIDADOR ESTRUTURAL DE PRODUTO + RESGATE SEGURO
 */
export function consolidateDanfeItems(
  tilesItems: Array<{ tile: CropTileCoordinate; items: DanfeItemRaw[] }>
): {
  itensFinais: DanfeItemRaw[];
  diagnostico: ItemConsolidationDiagnostic[];
} {
  const diagnostico: ItemConsolidationDiagnostic[] = [];
  const itensAceitosPorCore: DanfeItemRaw[] = [];
  let itensComPosicaoGeometricaCount = 0;
  let totalItensLidos = 0;

  for (const { tile, items } of tilesItems) {
    if (!items || !Array.isArray(items)) continue;

    for (let pos = 0; pos < items.length; pos++) {
      const item = items[pos];
      totalItensLidos++;

      // ─── VALIDADOR ESTRUTURAL DE PRODUTO ───
      const validRow = validateProductRow(item);
      if (!validRow.isValid) {
        diagnostico.push({
          tileIndex: tile.index,
          itemIndex: pos,
          descricao: item.descricao || "",
          codigo: item.codigo,
          rowCenter: item._row_center != null ? Number(item._row_center) : null,
          absoluteY: null,
          coreRange: `${tile.coreStartY}-${tile.coreEndY}`,
          accepted: false,
          reason: `rejected_not_product_row: ${validRow.reason}`,
        });
        continue;
      }

      const rawCenter = item._row_center != null ? Number(item._row_center) : null;
      const temPosicaoValida = rawCenter != null && !isNaN(rawCenter) && rawCenter >= 0.0 && rawCenter <= 1.0;

      if (temPosicaoValida) {
        itensComPosicaoGeometricaCount++;
        const absoluteY = Math.round(tile.y + rawCenter * tile.height);
        const isLastTile = tile.index === tile.totalTiles - 1 || tile.coreEndY >= Math.max(...tilesItems.map((t) => t.tile.coreEndY));

        // Pertence ao Core do Tile se: coreStartY <= absoluteY < coreEndY (ou <= coreEndY no último tile)
        const isCoreOwner = isLastTile
          ? absoluteY >= tile.coreStartY && absoluteY <= tile.coreEndY
          : absoluteY >= tile.coreStartY && absoluteY < tile.coreEndY;

        const itemClonado: DanfeItemRaw = {
          ...item,
          _row_center: rawCenter,
          _absoluteY: absoluteY,
          _sourceTile: tile.index,
          _positionInTile: pos,
          _totalItemsInTile: items.length,
          _isCoreOwner: isCoreOwner,
        };

        if (isCoreOwner) {
          itensAceitosPorCore.push(itemClonado);
          diagnostico.push({
            tileIndex: tile.index,
            itemIndex: pos,
            descricao: item.descricao || "",
            codigo: item.codigo,
            rowCenter: rawCenter,
            absoluteY,
            coreRange: `${tile.coreStartY}-${tile.coreEndY}`,
            accepted: true,
            reason: "core_owner",
          });
        } else {
          diagnostico.push({
            tileIndex: tile.index,
            itemIndex: pos,
            descricao: item.descricao || "",
            codigo: item.codigo,
            rowCenter: rawCenter,
            absoluteY,
            coreRange: `${tile.coreStartY}-${tile.coreEndY}`,
            accepted: false,
            reason: "overlap_context",
          });
        }
      } else {
        // Sem posição geométrica fornecida pelo modelo
        itensAceitosPorCore.push({
          ...item,
          _sourceTile: tile.index,
          _positionInTile: pos,
          _totalItemsInTile: items.length,
          _isCoreOwner: true,
        });

        diagnostico.push({
          tileIndex: tile.index,
          itemIndex: pos,
          descricao: item.descricao || "",
          codigo: item.codigo,
          rowCenter: null,
          absoluteY: null,
          coreRange: `${tile.coreStartY}-${tile.coreEndY}`,
          accepted: true,
          reason: "no_row_center_fallback",
        });
      }
    }
  }

  // ─── RESGATE SEGURO DE LINHAS ÓRFÃS NO OVERLAP ───
  const orfaosParaResgatar: DanfeItemRaw[] = [];

  for (const { tile, items } of tilesItems) {
    if (!items || !Array.isArray(items)) continue;

    for (let pos = 0; pos < items.length; pos++) {
      const it = items[pos];
      const validRow = validateProductRow(it);
      if (!validRow.isValid) continue;

      const rawCenter = it._row_center != null ? Number(it._row_center) : null;
      if (rawCenter == null || isNaN(rawCenter) || rawCenter < 0 || rawCenter > 1) continue;

      const absY = Math.round(tile.y + rawCenter * tile.height);
      const isLastTile = tile.index === tile.totalTiles - 1 || tile.coreEndY >= Math.max(...tilesItems.map((t) => t.tile.coreEndY));
      const isCoreOwner = isLastTile
        ? absY >= tile.coreStartY && absY <= tile.coreEndY
        : absY >= tile.coreStartY && absY < tile.coreEndY;

      if (!isCoreOwner) {
        // Verifica se algum item já aceito no Core cobre esta MESMA linha física
        const jaExisteAceito = itensAceitosPorCore.some((aceito) => {
          const acAbsY = aceito._absoluteY ?? 0;
          return isSamePhysicalItem(it, absY, aceito, acAbsY, 45);
        });

        if (!jaExisteAceito) {
          // Verifica se já não resgatamos esta mesma linha órfã
          const jaResgatado = orfaosParaResgatar.some((resg) => {
            const resgAbsY = resg._absoluteY ?? 0;
            return isSamePhysicalItem(it, absY, resg, resgAbsY, 45);
          });

          if (!jaResgatado) {
            orfaosParaResgatar.push({
              ...it,
              _row_center: rawCenter,
              _absoluteY: absY,
              _sourceTile: tile.index,
              _positionInTile: pos,
              _totalItemsInTile: items.length,
              _isCoreOwner: true,
            });

            const diagEntry = diagnostico.find((d) => d.tileIndex === tile.index && d.itemIndex === pos);
            if (diagEntry) {
              diagEntry.accepted = true;
              diagEntry.reason = "rescued_orphan_overlap";
            }
          }
        }
      }
    }
  }

  itensAceitosPorCore.push(...orfaosParaResgatar);

  let itensProcessados = itensAceitosPorCore;
  if (itensComPosicaoGeometricaCount < totalItensLidos * 0.5) {
    itensProcessados = deduplicateAndConsolidateItems(itensAceitosPorCore);
  }

  // Limpa e normaliza os itens finais
  const itensFinais = itensProcessados
    .filter((it) => (it.descricao && it.descricao.trim().length > 0) || (it.valor_total != null && it.valor_total > 0))
    .map((item) => ({
      codigo: item.codigo || null,
      ean: item.ean || null,
      descricao: item.descricao?.trim() || "Produto sem descrição",
      ncm: item.ncm || null,
      cfop: item.cfop || null,
      unidade: item.unidade || "UN",
      quantidade: item.quantidade != null ? Number(item.quantidade) : null,
      valor_unitario: item.valor_unitario != null ? Number(item.valor_unitario) : null,
      valor_total: item.valor_total != null ? Number(item.valor_total) : null,
      icms_aliquota: item.icms_aliquota != null ? Number(item.icms_aliquota) : 0,
      ipi_aliquota: item.ipi_aliquota != null ? Number(item.ipi_aliquota) : 0,
      pis_aliquota: item.pis_aliquota != null ? Number(item.pis_aliquota) : 0,
      cofins_aliquota: item.cofins_aliquota != null ? Number(item.cofins_aliquota) : 0,
      custo_unitario_liquido:
        item.custo_unitario_liquido != null
          ? Number(item.custo_unitario_liquido)
          : item.valor_unitario != null
          ? Number(item.valor_unitario)
          : null,
      confianca: item.confianca != null ? Number(item.confianca) : 1,
      _sourceTile: item._sourceTile,
      _positionInTile: item._positionInTile,
    }));

  return {
    itensFinais,
    diagnostico,
  };
}

/**
 * 3.1 DEDUPLICAÇÃO DE FRONTEIRA (USADA COMO FALLBACK QUANDO NÃO HÁ _row_center)
 */
export function deduplicateAndConsolidateItems(itens: DanfeItemRaw[]): DanfeItemRaw[] {
  if (!itens || itens.length === 0) return [];

  const resultado: DanfeItemRaw[] = [];

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const descNorm = normalizeString(item.descricao);
    const codNorm = normalizeString(item.codigo);

    if (!descNorm && !codNorm && (item.valor_total == null || item.valor_total <= 0)) {
      continue;
    }

    const itemSourceTile = item._sourceTile ?? 0;
    const itemPosInTile = item._positionInTile ?? 0;
    const isEntryOfNextTile = itemSourceTile > 0 && itemPosInTile <= 2;

    let indexExistente = -1;

    if (isEntryOfNextTile) {
      for (let j = resultado.length - 1; j >= Math.max(0, resultado.length - 4); j--) {
        const existente = resultado[j];
        const exSourceTile = existente._sourceTile ?? 0;

        if (exSourceTile === itemSourceTile - 1) {
          const exDescNorm = normalizeString(existente.descricao);
          const exCodNorm = normalizeString(existente.codigo);
          const exEanNorm = normalizeString(existente.ean);
          const eanNorm = normalizeString(item.ean);

          const mesmaQtd =
            item.quantidade != null &&
            existente.quantidade != null &&
            Math.abs(Number(item.quantidade) - Number(existente.quantidade)) < 0.001;

          const mesmoValor =
            item.valor_total != null &&
            existente.valor_total != null &&
            Math.abs(Number(item.valor_total) - Number(existente.valor_total)) < 0.05;

          const mesmoCodigo = codNorm && exCodNorm && codNorm === exCodNorm;
          const mesmoEan = eanNorm && exEanNorm && eanNorm === exEanNorm;
          const mesmaDesc = descNorm && exDescNorm && (descNorm === exDescNorm || calculateTokenSimilarity(descNorm, exDescNorm) >= 0.60);

          if ((mesmoCodigo || mesmoEan || mesmaDesc) && mesmaQtd && mesmoValor) {
            indexExistente = j;
            break;
          }
        }
      }
    }

    if (indexExistente >= 0) {
      const ex = resultado[indexExistente];
      resultado[indexExistente] = {
        codigo: ex.codigo || item.codigo || null,
        ean: ex.ean || item.ean || null,
        descricao: ex.descricao && ex.descricao.length >= (item.descricao?.length || 0) ? ex.descricao : item.descricao,
        ncm: ex.ncm || item.ncm || null,
        cfop: ex.cfop || null,
        unidade: ex.unidade || item.unidade || "UN",
        quantidade: ex.quantidade != null ? ex.quantidade : item.quantidade,
        valor_unitario: ex.valor_unitario != null ? ex.valor_unitario : item.valor_unitario,
        valor_total: ex.valor_total != null ? ex.valor_total : item.valor_total,
        icms_aliquota: ex.icms_aliquota != null ? ex.icms_aliquota : item.icms_aliquota,
        ipi_aliquota: ex.ipi_aliquota != null ? ex.ipi_aliquota : item.ipi_aliquota,
        pis_aliquota: ex.pis_aliquota != null ? ex.pis_aliquota : item.pis_aliquota,
        cofins_aliquota: ex.cofins_aliquota != null ? ex.cofins_aliquota : item.cofins_aliquota,
        custo_unitario_liquido: ex.custo_unitario_liquido != null ? ex.custo_unitario_liquido : item.custo_unitario_liquido,
        confianca: Math.max(ex.confianca || 0, item.confianca || 0),
        _sourceTile: ex._sourceTile,
        _positionInTile: ex._positionInTile,
      };
    } else {
      resultado.push({
        codigo: item.codigo || null,
        ean: item.ean || null,
        descricao: item.descricao || null,
        ncm: item.ncm || null,
        cfop: item.cfop || null,
        unidade: item.unidade || "UN",
        quantidade: item.quantidade != null ? Number(item.quantidade) : null,
        valor_unitario: item.valor_unitario != null ? Number(item.valor_unitario) : null,
        valor_total: item.valor_total != null ? Number(item.valor_total) : null,
        icms_aliquota: item.icms_aliquota != null ? Number(item.icms_aliquota) : 0,
        ipi_aliquota: item.ipi_aliquota != null ? Number(item.ipi_aliquota) : 0,
        pis_aliquota: item.pis_aliquota != null ? Number(item.pis_aliquota) : 0,
        cofins_aliquota: item.cofins_aliquota != null ? Number(item.cofins_aliquota) : 0,
        custo_unitario_liquido:
          item.custo_unitario_liquido != null
            ? Number(item.custo_unitario_liquido)
            : item.valor_unitario != null
            ? Number(item.valor_unitario)
            : null,
        confianca: item.confianca != null ? Number(item.confianca) : 1,
        _sourceTile: item._sourceTile,
        _positionInTile: item._positionInTile,
      });
    }
  }

  return resultado;
}

/**
 * 4. VALIDAÇÃO MATEMÁTICA DETERMINÍSTICA
 * Tolerâncias estritas:
 * - Item: |qnt * vu - vt| <= 0.15 ou <= 2%
 * - Soma vs valor_produtos: max(5%, R$ 5,00). Diferenças maiores reprovam para 'requer_revisao'.
 */
export function validateDanfeMath(
  itens: DanfeItemRaw[],
  totais?: DanfeTotais | null
): DanfeValidacaoResultado {
  if (!itens || itens.length === 0) {
    return {
      valido: false,
      status: "requer_revisao",
      itensValidosCount: 0,
      somaItens: 0,
      valorReferencia: 0,
      diferenca: 0,
      percentualDiferenca: 100,
      itensComErroMatematico: 0,
      motivo: "Nenhum item válido encontrado na tabela.",
    };
  }

  let somaItens = 0;
  let itensComErroMatematico = 0;
  let itensValidosCount = 0;

  for (const item of itens) {
    const qtd = item.quantidade;
    const vu = item.valor_unitario;
    const vt = item.valor_total;

    if (vt != null && !isNaN(vt) && vt > 0) {
      somaItens += vt;
      itensValidosCount++;
    }

    if (qtd != null && vu != null && vt != null && qtd > 0 && vu > 0 && vt > 0) {
      const calculoEsperado = qtd * vu;
      const diffItem = Math.abs(calculoEsperado - vt);
      if (diffItem > 0.15 && diffItem / vt > 0.02) {
        itensComErroMatematico++;
      }
    }
  }

  somaItens = Math.round(somaItens * 100) / 100;

  const valorProdutos = Number(totais?.valor_produtos || 0);
  const valorTotalNF = Number(totais?.valor_total_nf || 0);
  const valorRef = valorProdutos > 0 ? valorProdutos : valorTotalNF;

  const diferenca = Math.abs(Math.round((somaItens - valorRef) * 100) / 100);
  const percentualDiferenca = valorRef > 0 ? (diferenca / valorRef) * 100 : 0;

  const limiteDiferencaRelevante = valorRef > 0 ? Math.min(valorRef * 0.05, 5.0) : 0;
  const divergeSignificativamente = valorRef > 0 && diferenca > limiteDiferencaRelevante;

  const valido = !divergeSignificativamente && itensValidosCount > 0 && itensComErroMatematico === 0;

  let motivo: string | undefined;
  if (!valido) {
    if (divergeSignificativamente) {
      motivo = `Soma dos itens lidos (R$ ${somaItens.toFixed(2)}) diverge do valor dos produtos na NF (R$ ${valorRef.toFixed(2)}). Diferença: R$ ${diferenca.toFixed(2)}.`;
    } else if (itensComErroMatematico > 0) {
      motivo = `${itensComErroMatematico} produto(s) com divergência entre quantidade × valor unitário e total.`;
    } else {
      motivo = "Leitura incompleta da tabela de produtos.";
    }
  }

  return {
    valido,
    status: valido ? "valido" : "requer_revisao",
    itensValidosCount,
    somaItens,
    valorReferencia: valorRef,
    diferenca,
    percentualDiferenca,
    itensComErroMatematico,
    motivo,
  };
}

/**
 * 5. SEGURANÇA DE ESTOQUE E CUSTO UNITÁRIO DO PDV
 */
export function evaluateStockStatus(
  item: DanfeItemRaw,
  produtoEyemobile?: { id: string; estoque_atual?: number | null; fator_conversao?: number | null } | null
): {
  status_estoque: "processado" | "pendente";
  quantidadeParaEstoque: number;
  custoUnitarioConvertido: number | null;
  podeGravarHistoricoCusto: boolean;
  motivoPendente?: string;
} {
  if (!produtoEyemobile || !produtoEyemobile.id) {
    return {
      status_estoque: "pendente",
      quantidadeParaEstoque: 0,
      custoUnitarioConvertido: null,
      podeGravarHistoricoCusto: false,
      motivoPendente: "Produto não encontrado no cadastro do Eyemobile.",
    };
  }

  const unidadeNorm = (item.unidade || "UN").toUpperCase().trim();
  const quantidadeCompra = Number(item.quantidade) || 0;
  const custoCompraBruto = Number(item.custo_unitario_liquido || item.valor_unitario) || 0;

  const ehCaixaOuFardo = ["CX", "FD", "PACK", "FARDO", "CAIXA", "CPJ"].includes(unidadeNorm);

  if (ehCaixaOuFardo) {
    const fator = Number(produtoEyemobile.fator_conversao || 0);
    if (fator <= 1) {
      return {
        status_estoque: "pendente",
        quantidadeParaEstoque: 0,
        custoUnitarioConvertido: null,
        podeGravarHistoricoCusto: false,
        motivoPendente: `Unidade de compra é ${unidadeNorm}, mas o fator de conversão (unidades por caixa) não está definido.`,
      };
    }

    const custoUnitarioReal = custoCompraBruto / fator;
    return {
      status_estoque: "processado",
      quantidadeParaEstoque: quantidadeCompra * fator,
      custoUnitarioConvertido: custoUnitarioReal,
      podeGravarHistoricoCusto: true,
    };
  }

  return {
    status_estoque: "processado",
    quantidadeParaEstoque: quantidadeCompra,
    custoUnitarioConvertido: custoCompraBruto,
    podeGravarHistoricoCusto: true,
  };
}
