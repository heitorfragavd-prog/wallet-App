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
  type DanfeItemV2,
  type DanfeValidationResultV2,
} from "../danfe-gemini-v2.ts";

export {
  GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS,
  GEMINI_V2_PROMPT_TABELA,
  validateProductRowV2,
  reconcileAndDeduplicateV2,
  validateDanfeMathV2,
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

const DEFAULT_DANFE_MODEL = "gemini-2.5-flash";

export async function processDanfeDocument(
  input: ProcessDanfeInput,
): Promise<ProcessDanfeOutput> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  const model = input.model || DEFAULT_DANFE_MODEL;
  
  // Normalizar MIME type (suportar PDF e imagens corretamente)
  let cleanMimeType = "image/jpeg";
  if (input.mimeType === "application/pdf") {
    cleanMimeType = "application/pdf";
  } else if (input.mimeType.startsWith("image/")) {
    cleanMimeType = input.mimeType;
  }

  // Sanitizar Base64: remover data URL prefix e caracteres de quebra de linha
  const cleanBase64 = String(input.base64 || "")
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


  // ── 1. Extração de Cabeçalho e Totais com Gemini ─────────────────────────
  let docAnalysis: Record<string, any> | null = null;
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
          },
        }),
      },
    );

    if (headerResp.ok) {
      const gJson = await headerResp.json();
      const gText = gJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
      docAnalysis = JSON.parse(
        gText.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim(),
      );
      console.log(`[DANFE_FISCAL_SERVICE] Cabeçalho extraído com sucesso: fornecedor=${docAnalysis?.cabecalho?.fornecedor}, NF=${docAnalysis?.cabecalho?.numero_nf}`);
    } else {
      const errText = await headerResp.text();
      console.warn(`[DANFE_FISCAL_SERVICE] Gemini header retornou HTTP ${headerResp.status}: ${errText.slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[DANFE_FISCAL_SERVICE] Erro ao extrair cabeçalho:", err instanceof Error ? err.message : String(err));
  }

  // ── 2. Extração de Itens da Tabela com Gemini ───────────────────────────
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
                { inline_data: { mime_type: cleanMimeType, data: cleanBase64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.0,
            responseMimeType: "application/json",
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


  // ── 3. Validação Estrutural Estrita ──────────────────────────────────────
  const itensValidados: DanfeItemV2[] = [];
  for (const raw of rawItemsList) {
    const res = validateProductRowV2(raw);
    if (res.isValid && res.item) {
      itensValidados.push(res.item);
    }
  }

  const cabecalho = docAnalysis?.cabecalho || {};
  const valoresTotais = docAnalysis?.valores_totais || {};
  const paginaAtual = Number(cabecalho.pagina_atual) || 1;
  const totalPaginas = Number(cabecalho.total_paginas) || 1;
  const valorProdutos = Number(valoresTotais.valor_produtos || 0);
  const valorTotalNf = Number(valoresTotais.valor_total_nf || valorProdutos);

  // ── 4. Gestão de Multipágina ─────────────────────────────────────────────
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
      chaveAcesso: cabecalho.chave_acesso,
      numeroNf: cabecalho.numero_nf,
      fornecedor: cabecalho.fornecedor,
      cnpjFornecedor: cabecalho.cnpj_fornecedor,
      dataEmissao: cabecalho.data_emissao,
      valorProdutosDeclarado: valorProdutos,
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
      cabecalho: { ...cabecalho, pagina_atual: paginaAtual, total_paginas: session.totalPaginas },
      valores_totais: valoresTotais,
      itens: itensFinais,
      validacao: {
        valido: false,
        status: "requer_revisao",
        somaItens: itensFinais.reduce((s, it) => s + it.valor_total, 0),
        valorReferencia: valorProdutos,
        diferenca: 0,
        toleranciaUtilizada: 0.05,
        motivo: "Aguardando páginas complementares da DANFE",
        totalItensComCamposIncompletos: 0,
      },
      mensagemFormatada: msg,
      sessionState: session,
    };
  }

  // ── 5. Validação Matemática Determinística ────────────────────────────────
  const refProdutos = session.valorProdutosDeclarado || valorProdutos;
  const validacao = validateDanfeMathV2(itensFinais, refProdutos);

  const statusFinal: "sucesso" | "requer_revisao" = validacao.valido
    ? "sucesso"
    : "requer_revisao";

  const totalFormatado = (refProdutos || validacao.somaItens).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const somaFormatada = validacao.somaItens.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

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
    `• **Fornecedor:** ${session.fornecedor || cabecalho.fornecedor || "Não identificado"}`,
    `• **CNPJ:** ${session.cnpjFornecedor || cabecalho.cnpj_fornecedor || "Não identificado"}`,
    `• **NF:** ${session.numeroNf || cabecalho.numero_nf || "Sem número"}${cabecalho.serie_nf ? ` (Série ${cabecalho.serie_nf})` : ""}`,
    `• **Data de Emissão:** ${session.dataEmissao || cabecalho.data_emissao || "Não identificada"}`,
    `• **Valor dos Produtos:** ${totalFormatado}`,
    `• **Soma dos Itens:** ${somaFormatada}`,
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
    cabecalho: { ...cabecalho, pagina_atual: paginaAtual, total_paginas: session.totalPaginas },
    valores_totais: { valor_produtos: refProdutos, valor_total_nf: valorTotalNf },
    itens: itensFinais,
    validacao,
    mensagemFormatada: msgLines.filter((l) => l !== undefined).join("\n"),
    sessionState: session,
  };
}
