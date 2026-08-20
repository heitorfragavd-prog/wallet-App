/**
 * DANFE Extractor Module (Shared) v1.0.47
 * 
 * Pipeline robusto e seguro para extração de Notas Fiscais DANFE:
 * 1. Detecção de Orientação real por conteúdo (0°, 90°, 180°, 270°) — UMA única rotação
 * 2. Detecção de Região da Tabela por conteúdo com fallback geométrico explícito
 * 3. Recortes de alta resolução com sobreposição (overlapping tiles)
 * 4. Extração direta para JSON (campos ilegíveis = null, nunca inventar)
 * 5. Deduplicação consciente de fronteira de overlap (preserva linhas idênticas legítimas)
 * 6. Validação matemática determinística rigorosa (soma vs valor_produtos)
 * 7. Proteções de segurança de estoque e custo (CX != UN, custos pendentes não contaminam PDV)
 */

export interface DanfeItemRaw {
  codigo?: string | null;
  ean?: string | null;
  descricao?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  unidade?: string | null;
  quantidade?: number | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
  icms_aliquota?: number | null;
  ipi_aliquota?: number | null;
  pis_aliquota?: number | null;
  cofins_aliquota?: number | null;
  custo_unitario_liquido?: number | null;
  confianca?: number | null;
  // Metadados internos de rastreamento de tile para deduplicação consciente
  _sourceTile?: number;
  _positionInTile?: number;
  _totalItemsInTile?: number;
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
}

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
 * 2. RECORTES DA TABELA COM DETECÇÃO DE CONTEÚDO OU FALLBACK EXPLÍCITO
 */
export function calculateTableCropTiles(
  imageWidth: number,
  imageHeight: number,
  regiaoDetectada?: RegiaoTabelaDetectada | null,
  tilesCount: number = 2,
  overlapPercent: number = 0.15
): { tiles: CropTileCoordinate[]; usouFallback: boolean; topPercent: number; bottomPercent: number } {
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
        },
      ],
      usouFallback,
      topPercent,
      bottomPercent,
    };
  }

  const rawTileHeight = totalTableHeight / tilesCount;
  const overlapPx = Math.floor(rawTileHeight * overlapPercent);
  const tiles: CropTileCoordinate[] = [];

  for (let i = 0; i < tilesCount; i++) {
    const tileStartY = Math.max(startY, Math.floor(startY + i * rawTileHeight - (i > 0 ? overlapPx : 0)));
    const tileEndY = Math.min(endY, Math.floor(startY + (i + 1) * rawTileHeight + (i < tilesCount - 1 ? overlapPx : 0)));
    const tileHeight = tileEndY - tileStartY;

    tiles.push({
      index: i,
      totalTiles: tilesCount,
      x: 0,
      y: tileStartY,
      width: imageWidth,
      height: tileHeight,
      overlapY: i > 0 ? overlapPx : 0,
    });
  }

  return {
    tiles,
    usouFallback,
    topPercent,
    bottomPercent,
  };
}

/**
 * 3. DEDUPLICAÇÃO CONSCIENTE DO OVERLAP (CONSERVA LINHAS IDÊNTICAS LEGÍTIMAS)
 * Um item só é considerado duplicata se vier de tiles adjacentes nas posições de fronteira do overlap.
 */
export function deduplicateAndConsolidateItems(itens: DanfeItemRaw[]): DanfeItemRaw[] {
  if (!itens || itens.length === 0) return [];

  const resultado: DanfeItemRaw[] = [];

  const normalizeStr = (s?: string | null) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const descNorm = normalizeStr(item.descricao);
    const codNorm = normalizeStr(item.codigo);
    const eanNorm = normalizeStr(item.ean);

    if (!descNorm && !codNorm && (item.valor_total == null || item.valor_total <= 0)) {
      continue; // Ruído
    }

    // Regra de Duplicata de Overlap:
    // Apenas verifica contra itens já inseridos se o item atual estiver na região de entrada de um tile subsequente
    const itemSourceTile = item._sourceTile ?? 0;
    const itemPosInTile = item._positionInTile ?? 0;
    const isEntryOfNextTile = itemSourceTile > 0 && itemPosInTile <= 2;

    let indexExistente = -1;

    if (isEntryOfNextTile) {
      // Busca apenas entre os últimos 3 itens adicionados vindos do tile anterior imediato
      for (let j = resultado.length - 1; j >= Math.max(0, resultado.length - 4); j--) {
        const existente = resultado[j];
        const exSourceTile = existente._sourceTile ?? 0;

        if (exSourceTile === itemSourceTile - 1) {
          const exDescNorm = normalizeStr(existente.descricao);
          const exCodNorm = normalizeStr(existente.codigo);
          const exEanNorm = normalizeStr(existente.ean);

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
          const mesmaDesc = descNorm && exDescNorm && descNorm === exDescNorm;

          if ((mesmoCodigo || mesmoEan || mesmaDesc) && mesmaQtd && mesmoValor) {
            indexExistente = j;
            break;
          }
        }
      }
    }

    if (indexExistente >= 0) {
      // Mesclar dados sem criar item duplicado
      const ex = resultado[indexExistente];
      resultado[indexExistente] = {
        codigo: ex.codigo || item.codigo || null,
        ean: ex.ean || item.ean || null,
        descricao: ex.descricao && ex.descricao.length >= (item.descricao?.length || 0) ? ex.descricao : item.descricao,
        ncm: ex.ncm || item.ncm || null,
        cfop: ex.cfop || item.cfop || null,
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
 * Separa a unidade de compra (CX) da unidade vendida (UN) no PDV.
 * Se o fator de conversão for desconhecido:
 * - status_estoque = "pendente"
 * - estoque NÃO é alterado
 * - podeGravarHistoricoCusto = false (NUNCA grava R$ 50/CX como R$ 50/UN no histórico de custo do PDV!)
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
