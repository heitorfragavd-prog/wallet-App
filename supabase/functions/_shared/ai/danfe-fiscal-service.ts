/**
 * DANFE Fiscal Service V2 — Módulo Reutilizável
 * 
 * Reutiliza o core determinístico de danfe-gemini-v2.ts sem duplicação de regras.
 * Suporta leitura de imagem/PDF via Gemini, validação matemática e multipágina.
 */

import {
  GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS,
  GEMINI_V2_PROMPT_TABELA,
  validateProductRowV2,
  reconcileAndDeduplicateV2,
  validateDanfeMathV2,
  parseFiscalNumber,
  type DanfeItemV2,
  type DanfeValidationResultV2,
} from "../danfe-gemini-v2.ts";

export {
  GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS,
  GEMINI_V2_PROMPT_TABELA,
  validateProductRowV2,
  reconcileAndDeduplicateV2,
  validateDanfeMathV2,
  parseFiscalNumber,
  type DanfeItemV2,
  type DanfeValidationResultV2,
};




export interface DanfeSessionState {
  chaveAcesso?: string | null;
  numeroNf?: string | null;
  fornecedor?: string | null;
  cnpjFornecedor?: string | null;
  dataEmissao?: string | null;
  valorProdutosDeclarado?: number;
  valorTotalNfDeclarado?: number;
  totalPaginas: number;
  paginasRecebidas: number[];
  itensAcumulados: DanfeItemV2[];
  workspaceId: string;
}

export interface ProcessDanfeInput {
  base64: string;
  mimeType: string;
  geminiApiKey: string;
  workspaceId: string;
  existingSession?: DanfeSessionState | null;
  fetchImpl?: typeof fetch;
  model?: string;
}

export interface ProcessDanfeOutput {
  success: boolean;
  status: "sucesso" | "parcial_multipagina" | "requer_revisao" | "erro";
  cabecalho?: {
    fornecedor?: string | null;
    cnpj_fornecedor?: string | null;
    numero_nf?: string | null;
    serie_nf?: string | null;
    data_emissao?: string | null;
    chave_acesso?: string | null;
    pagina_atual?: number;
    total_paginas?: number;
  };
  valores_totais?: {
    valor_produtos?: number;
    valor_total_nf?: number;
  };
  itens: DanfeItemV2[];
  validacao: DanfeValidationResultV2;
  mensagemFormatada: string;
  sessionState?: DanfeSessionState;
}

import {
  normalizeAndRotateImageMatrix,
  cropTableRegionMatrix,
  PROMPT_ORIENTACAO_DANFE,
} from "./danfe-visual-pipeline.ts";

export {
  normalizeAndRotateImageMatrix,
  cropTableRegionMatrix,
  PROMPT_ORIENTACAO_DANFE,
};

const DEFAULT_DANFE_MODEL = "gemini-3.6-flash";

export async function processDanfeDocument(
  input: ProcessDanfeInput,
): Promise<ProcessDanfeOutput> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  const model = input.model || DEFAULT_DANFE_MODEL;
  
  // Normalizar MIME type (suportar PDF e imagens corretamente)
  let cleanMimeType = "image/jpeg";
  const isPdf = input.mimeType === "application/pdf";
  if (isPdf) {
    cleanMimeType = "application/pdf";
  } else if (input.mimeType.startsWith("image/")) {
    cleanMimeType = input.mimeType;
  }

  // Sanitizar Base64: remover data URL prefix e caracteres de quebra de linha
  let cleanBase64 = String(input.base64 || "")
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/[\r\n\s]+/g, "");

  console.log(`[DANFE_FISCAL_SERVICE] Processando documento: mime=${cleanMimeType}, base64_len=${cleanBase64.length}, model=${model}`);

  if (!cleanBase64 || cleanBase64.length < 4) {
    console.warn("[DANFE_FISCAL_SERVICE] Base64 inválido ou vazio recebido");
    return {
      success: false,
      status: "erro",
      itens: [],
      validacao: { valido: false, somaItens: 0, valorReferencia: 0, diferenca: 0, status: "requer_revisao", toleranciaUtilizada: 0.05, totalItensComCamposIncompletos: 0 },
      mensagemFormatada: "⚠️ Não foi possível processar o arquivo anexado. Envie uma foto nítida ou PDF da Nota Fiscal.",
    };
  }

  // ── 0 & 1. Detecção de Orientação e Rotação Matricial (apenas para imagens) ──
  let rotationApplied: 0 | 90 | 180 | 270 = 0;
  let docAnalysis: Record<string, any> | null = null;

  if (!isPdf) {
    try {
      const orientResp = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: PROMPT_ORIENTACAO_DANFE },
                  { inline_data: { mime_type: cleanMimeType, data: cleanBase64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.0,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 1 },
            },
          }),
        },
      );

      if (orientResp && orientResp.ok) {
        const oJson = await orientResp.json();
        const oText = oJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = JSON.parse(oText.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim());

        if (parsed?.cabecalho || parsed?.valores_totais) {
          docAnalysis = parsed;
        } else {
          const degrees = Number(parsed?.orientacao_leitura);
          if ([90, 180, 270].includes(degrees)) {
            rotationApplied = degrees as 90 | 180 | 270;
            console.log(`[DANFE_FISCAL_SERVICE] Orientação detectada: ${rotationApplied}°. Aplicando rotação matricial...`);
            const rotatedMatrix = await normalizeAndRotateImageMatrix(cleanBase64, rotationApplied);
            cleanBase64 = rotatedMatrix.base64;
          } else {
            console.log(`[DANFE_FISCAL_SERVICE] Orientação normal (0°).`);
          }
        }
      }
    } catch (err) {
      console.warn("[DANFE_FISCAL_SERVICE] Falha na detecção de orientação, prosseguindo com original:", err);
    }
  }

  // ── 2. Extração de Cabeçalho e Totais com Gemini (se não processado anteriormente) ──
  if (!docAnalysis) {
    try {
      const headerResp = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS },
                  { inline_data: { mime_type: cleanMimeType, data: cleanBase64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.0,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 1 },
            },
          }),
        },
      );

      if (headerResp && headerResp.ok) {
        const gJson = await headerResp.json();
        const gText = gJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
        docAnalysis = JSON.parse(
          gText.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim(),
        );
        console.log(`[DANFE_FISCAL_SERVICE] Cabeçalho extraído com sucesso: fornecedor=${docAnalysis?.cabecalho?.fornecedor}, NF=${docAnalysis?.cabecalho?.numero_nf}`);
      } else if (headerResp) {
        const errText = await headerResp.text();
        console.warn(`[DANFE_FISCAL_SERVICE] Gemini header retornou HTTP ${headerResp.status}: ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      console.error("[DANFE_FISCAL_SERVICE] Erro ao extrair cabeçalho:", err instanceof Error ? err.message : String(err));
    }
  }


  // ── 3. Recorte (Crop) da Tabela de Produtos ──────────────────────────────
  let tableImageBase64 = cleanBase64;
  if (!isPdf && docAnalysis?.regiao_tabela_produtos) {
    try {
      const { top, bottom } = docAnalysis.regiao_tabela_produtos;
      const cropRes = await cropTableRegionMatrix(cleanBase64, top, bottom);
      tableImageBase64 = cropRes.base64;
      console.log(`[DANFE_FISCAL_SERVICE] Recorte contínuo da tabela aplicado (top: ${top}, bottom: ${bottom})`);
    } catch (err) {
      console.warn("[DANFE_FISCAL_SERVICE] Falha ao recortar tabela, usando imagem completa:", err);
    }
  }

  // ── 4. Extração de Itens da Tabela com Gemini ───────────────────────────
  let rawItemsList: any[] = [];
  try {
    const tableResp = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: GEMINI_V2_PROMPT_TABELA },
                { inline_data: { mime_type: cleanMimeType, data: tableImageBase64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.0,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 1 },
          },
        }),
      },
    );

    if (tableResp.ok) {
      const tJson = await tableResp.json();
      const tText = tJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = JSON.parse(
        tText.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim(),
      );
      if (Array.isArray(parsed)) rawItemsList = parsed;
      else if (Array.isArray(parsed.itens)) rawItemsList = parsed.itens;
      else if (Array.isArray(parsed.produtos)) rawItemsList = parsed.produtos;
      console.log(`[DANFE_FISCAL_SERVICE] Tabela de itens extraída: ${rawItemsList.length} itens brutos`);
    } else {
      const errText = await tableResp.text();
      console.warn(`[DANFE_FISCAL_SERVICE] Gemini table retornou HTTP ${tableResp.status}: ${errText.slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[DANFE_FISCAL_SERVICE] Erro ao extrair tabela:", err instanceof Error ? err.message : String(err));
  }



  // ── 3. Validação Estrutural Estrita de Produtos ───────────────────────────
  const itensValidados: DanfeItemV2[] = [];
  for (const raw of rawItemsList) {
    const res = validateProductRowV2(raw);
    if (res.isValid && res.item) {
      itensValidados.push(res.item);
    }
  }

  // ── 4. Normalização Determinística de Cabeçalho e Totais (com Aliases) ────
  const rawCabecalho = docAnalysis?.cabecalho || docAnalysis || {};
  const rawTotais = docAnalysis?.valores_totais || docAnalysis?.totais || docAnalysis || {};

  const fornecedor = (
    rawCabecalho.fornecedor ||
    rawCabecalho.emitente ||
    rawCabecalho.razao_social ||
    rawCabecalho.nome_fornecedor ||
    docAnalysis?.fornecedor ||
    docAnalysis?.emitente ||
    docAnalysis?.razao_social ||
    null
  );

  const cnpjFornecedor = (
    rawCabecalho.cnpj_fornecedor ||
    rawCabecalho.cnpj_emitente ||
    rawCabecalho.cnpj ||
    docAnalysis?.cnpj_fornecedor ||
    docAnalysis?.cnpj_emitente ||
    docAnalysis?.cnpj ||
    null
  );

  const numeroNf = (
    rawCabecalho.numero_nf ||
    rawCabecalho.numero ||
    rawCabecalho.n_nf ||
    docAnalysis?.numero_nf ||
    docAnalysis?.numero ||
    docAnalysis?.n_nf ||
    null
  );

  const serieNf = (
    rawCabecalho.serie_nf ||
    rawCabecalho.serie ||
    docAnalysis?.serie_nf ||
    docAnalysis?.serie ||
    null
  );

  const dataEmissao = (
    rawCabecalho.data_emissao ||
    rawCabecalho.emissao ||
    docAnalysis?.data_emissao ||
    docAnalysis?.emissao ||
    null
  );

  const chaveAcesso = (
    rawCabecalho.chave_acesso ||
    rawCabecalho.chave ||
    docAnalysis?.chave_acesso ||
    docAnalysis?.chave ||
    null
  );

  const paginaAtual = Number(rawCabecalho.pagina_atual || docAnalysis?.pagina_atual) || 1;
  const totalPaginas = Number(rawCabecalho.total_paginas || docAnalysis?.total_paginas) || 1;

  // Parsing Monetário com parseFiscalNumber (suporta "1.105,25", "1105.25", 1105.25)
  const valorProdutosRaw = rawTotais.valor_produtos ?? rawTotais.total_produtos ?? rawTotais.valor_total_produtos ?? docAnalysis?.valor_produtos;
  const valorTotalNfRaw = rawTotais.valor_total_nf ?? rawTotais.valor_total ?? rawTotais.total_nota ?? docAnalysis?.valor_total_nf;

  const valorProdutosDeclaradoNF = valorProdutosRaw != null ? parseFiscalNumber(valorProdutosRaw) : 0;
  const valorTotalNf = valorTotalNfRaw != null ? parseFiscalNumber(valorTotalNfRaw) : valorProdutosDeclaradoNF;

  const cabecalhoConsolidado = {
    fornecedor,
    cnpj_fornecedor: cnpjFornecedor,
    numero_nf: numeroNf,
    serie_nf: serieNf,
    data_emissao: dataEmissao,
    chave_acesso: chaveAcesso,
    pagina_atual: paginaAtual,
    total_paginas: totalPaginas,
  };

  const valoresTotaisConsolidados = {
    valor_produtos: valorProdutosDeclaradoNF,
    valor_total_nf: valorTotalNf,
  };

  // ── 5. Gestão de Multipágina ─────────────────────────────────────────────
  let itensFinais: DanfeItemV2[] = itensValidados;
  let session: DanfeSessionState;

  if (input.existingSession && input.existingSession.workspaceId === input.workspaceId) {
    // Continuação de sessão multipágina
    const acumulados = input.existingSession.itensAcumulados || [];
    itensFinais = reconcileAndDeduplicateV2(acumulados, itensValidados);
    session = {
      ...input.existingSession,
      paginasRecebidas: [...new Set([...input.existingSession.paginasRecebidas, paginaAtual])],
      itensAcumulados: itensFinais,
    };
  } else {
    // Nova sessão
    session = {
      chaveAcesso,
      numeroNf,
      fornecedor,
      cnpjFornecedor,
      dataEmissao,
      valorProdutosDeclarado: valorProdutosDeclaradoNF,
      valorTotalNfDeclarado: valorTotalNf,
      totalPaginas,
      paginasRecebidas: [paginaAtual],
      itensAcumulados: itensFinais,
      workspaceId: input.workspaceId,
    };
  }

  // Verifica se faltam páginas
  const isMultipaginaPendente =
    session.totalPaginas > 1 && session.paginasRecebidas.length < session.totalPaginas;

  if (isMultipaginaPendente) {
    const paginasFaltantes = Array.from(
      { length: session.totalPaginas },
      (_, i) => i + 1,
    ).filter((p) => !session.paginasRecebidas.includes(p));

    const msg = [
      `🧾 **Nota Fiscal identificada (Multipágina)**`,
      ``,
      `• **Fornecedor:** ${session.fornecedor || "Não identificado"}`,
      `• **NF:** ${session.numeroNf || "Sem número"}`,
      `• **Páginas:** ${paginaAtual}/${session.totalPaginas}`,
      `• **Itens lidos nesta folha:** ${itensValidados.length}`,
      ``,
      `⏳ Recebi a página ${paginaAtual} de ${session.totalPaginas}.`,
      `Estou aguardando a página ${paginasFaltantes.join(", ")} para consolidar o documento completo.`,
      ``,
      `🔒 *Nenhuma alteração foi feita no estoque.*`,
    ].join("\n");

    return {
      success: true,
      status: "parcial_multipagina",
      cabecalho: { ...cabecalhoConsolidado, pagina_atual: paginaAtual, total_paginas: session.totalPaginas },
      valores_totais: valoresTotaisConsolidados,
      itens: itensFinais,
      validacao: {
        valido: false,
        status: "requer_revisao",
        somaItens: itensFinais.reduce((s, it) => s + it.valor_total, 0),
        valorReferencia: valorProdutosDeclaradoNF,
        diferenca: 0,
        toleranciaUtilizada: 0.05,
        motivo: "Aguardando páginas complementares da DANFE",
        totalItensComCamposIncompletos: 0,
      },
      mensagemFormatada: msg,
      sessionState: session,
    };
  }

  // ── 6. Validação Matemática Determinística ────────────────────────────────
  const valorProdutosCalculadoItens = +(itensFinais.reduce((s, it) => s + (Number(it.valor_total) || 0), 0)).toFixed(2);
  const refProdutos = session.valorProdutosDeclarado || valorProdutosDeclaradoNF;
  const validacao = validateDanfeMathV2(itensFinais, refProdutos);

  const statusFinal: "sucesso" | "requer_revisao" = validacao.valido
    ? "sucesso"
    : "requer_revisao";

  // Formatação explícita e transparente: NUNCA usar fallback de soma de itens no valor declarado
  const valorProdutosDeclaradoFormatado = refProdutos > 0
    ? refProdutos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Não identificado no quadro de totais";

  const somaItensFormatada = valorProdutosCalculadoItens.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  // Log diagnóstico seguro
  console.log(`[DANFE_HEADER_DEBUG] provider=${model}, fornecedor="${session.fornecedor || fornecedor}", cnpj="${session.cnpjFornecedor || cnpjFornecedor}", numeroNF="${session.numeroNf || numeroNf}", serie="${serieNf}", dataEmissao="${session.dataEmissao || dataEmissao}", valorTotalNF=${valorTotalNf}, valorProdutosDeclaradoNF=${refProdutos}, valorProdutosCalculadoItens=${valorProdutosCalculadoItens}, quantidadeItens=${itensFinais.length}, validationStatus="${statusFinal}", validationReasons="${validacao.motivo || 'OK'}"`);

  const previewItens = itensFinais
    .slice(0, 5)
    .map(
      (it) =>
        `  • ${it.descricao} — ${it.quantidade} ${it.unidade || "UN"} x R$ ${it.valor_unitario.toFixed(2)} = R$ ${it.valor_total.toFixed(2)}`,
    )
    .join("\n");

  const extraItens =
    itensFinais.length > 5 ? `\n  *... e mais ${itensFinais.length - 5} itens.*` : "";

  const msgLines = [
    `🧾 **Nota Fiscal (DANFE) Analisada**`,
    ``,
    `• **Fornecedor:** ${session.fornecedor || fornecedor || "Não identificado"}`,
    `• **CNPJ:** ${session.cnpjFornecedor || cnpjFornecedor || "Não identificado"}`,
    `• **NF:** ${session.numeroNf || numeroNf || "Sem número"}${serieNf ? ` (Série ${serieNf})` : ""}`,
    `• **Data de Emissão:** ${session.dataEmissao || dataEmissao || "Não identificada"}`,
    `• **Valor dos Produtos (NF):** ${valorProdutosDeclaradoFormatado}`,
    `• **Soma dos Itens:** ${somaItensFormatada}`,
    `• **Total de Itens Validados:** ${itensFinais.length}`,
    `• **Status Fiscal:** ${validacao.valido ? "✅ Validação Matemática OK" : `⚠️ Requer Revisão (${validacao.motivo})`}`,
    ``,
    `📦 **Prévia dos Produtos:**`,
    previewItens || "  • Nenhum item identificado",
    extraItens,
    ``,
    `🔒 *Nenhuma alteração foi feita no estoque.*`,
  ];

  return {
    success: true,
    status: statusFinal,
    cabecalho: { ...cabecalhoConsolidado, pagina_atual: paginaAtual, total_paginas: session.totalPaginas },
    valores_totais: { valor_produtos: refProdutos, valor_total_nf: valorTotalNf },
    itens: itensFinais,
    validacao,
    mensagemFormatada: msgLines.filter((l) => l !== undefined).join("\n"),
    sessionState: session,
  };
}

