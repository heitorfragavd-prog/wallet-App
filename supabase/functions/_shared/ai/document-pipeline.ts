/**
 * Document Pipeline — Processamento Documental Canônico (DANFE + Boletos)
 * 
 * Pipeline Unificado:
 * 1. Validação de Payload & Limites de Segurança (MIME, Tamanho <= 10MB, Sanitização)
 * 2. Detecção e Proteção contra Prompt Injection
 * 3. Roteamento Fail-Closed (DANFE, BOLETO, COMPROVANTE, DESCONHECIDO)
 * 4. Extração com Failover (Gemini 2.5 Flash / OpenAI Vision)
 * 5. Validação Determinística:
 *    - Boleto: FEBRABAN Módulo 10/11, Ciclos de Fator 1 e 2, Dígitos Verificadores
 *    - DANFE: Matemática estrita (quantidade * unitario = total, soma itens = total NF)
 * 6. Detecção de Duplicatas (Idempotência Documental)
 * 7. Geração Canônica de Action Proposals (Status: 'prepared', 100% proposal-only)
 * 8. Observabilidade e Redação de Dados Sensíveis (sem base64 em logs)
 */

import {
  cleanDigits,
  validateLinhaDigitavel,
  reconcileBoleto,
  type BoletoValidationResult,
} from "./boleto-validator.ts";
import {
  processBoletoDocument,
  type BoletoExtractedData,
  type ProcessBoletoOutput,
} from "./boleto-service.ts";
import {
  processDanfeDocument,
  type ProcessDanfeOutput,
} from "./danfe-fiscal-service.ts";
import {
  prepareActionProposal,
  type ActionProposal,
} from "./action-gateway.ts";
import type { ActionRiskLevel } from "./action-types.ts";

// ─── LIMITES E CONSTANTES DE SEGURANÇA ─────────────────────────────────────────

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_BASE64_LENGTH = Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 1024; // ~14MB

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const INJECTION_PATTERNS: RegExp[] = [
  /(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
  /system\s+prompt/i,
  /new\s+system\s+role/i,
  /you\s+are\s+now\s+/i,
  /delete\s+from\s+[a-z_]+/i,
  /drop\s+table\s+[a-z_]+/i,
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript\s*:/i,
  /union\s+select\s+/i,
  /base64\s*,\s*execute/i,
];

// ─── INTERFACES DE ENTRADA E SAÍDA ─────────────────────────────────────────────

export interface ProcessDocumentPipelineInput {
  workspaceId: string;
  userId: string;
  conversationId?: string;
  base64: string;
  mimeType: string;
  fileName?: string;
  documentTypeHint?: "DANFE" | "BOLETO" | "COMPROVANTE" | "DESCONHECIDO";
  textContext?: string;
  correlationId?: string;
  geminiApiKey?: string;
  geminiApiKeyBackup?: string;
  openaiApiKey?: string;
  // Hook opcional para detecção de duplicatas em banco
  findDuplicateFn?: (params: {
    workspaceId: string;
    chaveAcesso?: string;
    numeroNf?: string;
    cnpj?: string;
    linhaDigitavel?: string;
    codigoBarras?: string;
  }) => Promise<{ isDuplicate: boolean; existingRecordId?: string; type?: string }>;
  // Hook opcional para persistência de propostas de ação
  saveProposalFn?: (proposal: ActionProposal) => Promise<void>;
  // Hook opcional para auditoria estruturada
  auditLogFn?: (event: Record<string, unknown>) => Promise<void>;
}

export interface DocumentMathValidationItem {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  calculado: number;
  diferenca: number;
  valido: boolean;
}

export interface DocumentValidationSummary {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  mathValidation?: {
    itensValidos: boolean;
    somaItensValida: boolean;
    somaCalculadaItens: number;
    valorTotalDeclarado: number;
    diferencaTotal: number;
    detalhesItens?: DocumentMathValidationItem[];
  };
  febrabanValidation?: BoletoValidationResult;
}

export interface ProcessDocumentPipelineResult {
  success: boolean;
  documentType: "DANFE" | "BOLETO" | "COMPROVANTE" | "DESCONHECIDO";
  status: "sucesso" | "requer_revisao" | "erro" | "duplicata_detectada";
  confidence: number;
  data: Record<string, unknown>;
  validation: DocumentValidationSummary;
  hasPromptInjection: boolean;
  isDuplicate: boolean;
  duplicateDetails?: { existingRecordId?: string; type?: string };
  actionProposal?: ActionProposal;
  formattedMessage: string;
  correlationId: string;
  durationMs: number;
  error?: string;
  errorCode?: string;
}

// ─── UTILITÁRIOS DE SEGURANÇA E HIGIENIZAÇÃO ──────────────────────────────────

export function detectPromptInjection(text: string): { hasInjection: boolean; matches: string[] } {
  if (!text || typeof text !== "string") {
    return { hasInjection: false, matches: [] };
  }
  const matches: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(pattern.source);
    }
  }
  return {
    hasInjection: matches.length > 0,
    matches,
  };
}

export function sanitizeDocumentString(text: string): string {
  if (!text || typeof text !== "string") return "";
  let clean = text;
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, "[CONTEÚDO_FILTRADO]");
  }
  return clean.replace(/[<>]/g, "").trim();
}

export function validateDocumentInput(
  base64: string,
  mimeType: string,
): { valid: boolean; error?: string; code?: string } {
  if (!base64 || typeof base64 !== "string" || base64.trim().length === 0) {
    return {
      valid: false,
      error: "Arquivo não fornecido ou vazio.",
      code: "WALLET_AI_INVALID_PAYLOAD",
    };
  }

  const cleanBase64 = base64.includes(",") ? base64.split(",")[1] : base64;
  if (cleanBase64.length > MAX_BASE64_LENGTH) {
    return {
      valid: false,
      error: "Tamanho do arquivo excede o limite máximo permitido de 10MB.",
      code: "WALLET_AI_PAYLOAD_TOO_LARGE",
    };
  }

  const normalizedMime = (mimeType || "").trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return {
      valid: false,
      error: `Formato de arquivo '${normalizedMime}' não suportado. Envie imagens (JPEG, PNG, WebP) ou PDF.`,
      code: "WALLET_AI_UNSUPPORTED_MEDIA_TYPE",
    };
  }

  return { valid: true };
}

// ─── CLASSIFICAÇÃO DETERMINÍSTICA HEURÍSTICA ───────────────────────────────────

export function classifyDocumentType(params: {
  documentTypeHint?: string;
  fileName?: string;
  textContext?: string;
}): "DANFE" | "BOLETO" | "COMPROVANTE" | "DESCONHECIDO" {
  const { documentTypeHint, fileName, textContext } = params;

  if (documentTypeHint) {
    const hint = documentTypeHint.toUpperCase();
    if (hint === "DANFE" || hint === "NOTA_FISCAL" || hint === "NFE") return "DANFE";
    if (hint === "BOLETO") return "BOLETO";
    if (hint === "COMPROVANTE" || hint === "RECIBO") return "COMPROVANTE";
  }

  const combined = `${fileName || ""} ${textContext || ""}`.toLowerCase();

  // Heurística de DANFE / Nota Fiscal
  if (
    /(?:^|[^a-z0-9])(danfe|nf-?e|nota[_\s-]*fiscal|chave[_\s-]*acesso|xml)(?:$|[^a-z0-9])/i.test(combined) ||
    combined.includes("danfe") ||
    combined.includes("nfe") ||
    combined.includes("nota fiscal")
  ) {
    return "DANFE";
  }

  // Heurística de Boleto
  if (
    /(?:^|[^a-z0-9])(boleto|linha[_\s-]*digit[aá]vel|c[oó]digo[_\s-]*barras|ficha[_\s-]*compensa[cç][aã]o|fatura|vencimento|benefici[aá]rio)(?:$|[^a-z0-9])/i.test(combined) ||
    combined.includes("boleto") ||
    combined.includes("fatura") ||
    combined.includes("linha digitavel") ||
    combined.includes("linha digitável")
  ) {
    return "BOLETO";
  }

  // Heurística de Comprovante
  if (
    /(?:^|[^a-z0-9])(comprovante|recibo|transfer[eê]ncia|pix[_\s-]*enviado|ted|autentica[cç][aã]o[_\s-]*banc[aá]ria)(?:$|[^a-z0-9])/i.test(combined) ||
    combined.includes("comprovante") ||
    combined.includes("recibo") ||
    combined.includes("pix")
  ) {
    return "COMPROVANTE";
  }

  return "DESCONHECIDO";
}

// ─── VALIDAÇÃO MATEMÁTICA DE DANFE ─────────────────────────────────────────────

export function validateDanfeMathStrict(danfeData: {
  valores_totais?: {
    valor_total_nota?: number;
    valor_total_produtos?: number;
    valor_frete?: number;
    valor_seguro?: number;
    valor_desconto?: number;
    outras_despesas?: number;
  };
  itens?: Array<{
    descricao?: string;
    quantidade?: number;
    valor_unitario?: number;
    valor_total?: number;
  }>;
}): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  mathValidation: {
    itensValidos: boolean;
    somaItensValida: boolean;
    somaCalculadaItens: number;
    valorTotalDeclarado: number;
    diferencaTotal: number;
    detalhesItens: DocumentMathValidationItem[];
  };
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const detalhesItens: DocumentMathValidationItem[] = [];

  const itens = danfeData.itens || [];
  const totais = danfeData.valores_totais || {};
  const totalDeclarado = Number(totais.valor_total_nota ?? totais.valor_total_produtos ?? 0);

  let somaCalculadaItens = 0;
  let itensValidos = true;

  for (const item of itens) {
    const qtd = Number(item.quantidade || 0);
    const unit = Number(item.valor_unitario || 0);
    const totalItemDeclarado = Number(item.valor_total || 0);
    const totalItemCalculado = Math.round(qtd * unit * 100) / 100;
    const diffItem = Math.abs(Math.round((totalItemCalculado - totalItemDeclarado) * 100) / 100);

    // Tolerância de R$ 0,02 por item devido a arredondamento fiscal
    const itemOk = diffItem <= 0.02 || (qtd === 0 && totalItemDeclarado === 0);
    if (!itemOk && totalItemDeclarado > 0) {
      itensValidos = false;
      warnings.push(
        `Item '${item.descricao || "Sem descrição"}': cálculo (${qtd} × R$ ${unit.toFixed(2)} = R$ ${totalItemCalculado.toFixed(2)}) difere do total declarado (R$ ${totalItemDeclarado.toFixed(2)}).`
      );
    }

    somaCalculadaItens += totalItemDeclarado > 0 ? totalItemDeclarado : totalItemCalculado;
    detalhesItens.push({
      descricao: item.descricao || "Item",
      quantidade: qtd,
      valor_unitario: unit,
      valor_total: totalItemDeclarado,
      calculado: totalItemCalculado,
      diferenca: diffItem,
      valido: itemOk,
    });
  }

  somaCalculadaItens = Math.round(somaCalculadaItens * 100) / 100;

  // Tolerância de até R$ 0,05 na soma de itens vs total geral
  const diferencaTotal = Math.abs(Math.round((totalDeclarado - somaCalculadaItens) * 100) / 100);
  const somaItensValida = itens.length === 0 || totalDeclarado === 0 || diferencaTotal <= 0.05;

  if (!somaItensValida) {
    warnings.push(
      `Soma calculada dos itens (R$ ${somaCalculadaItens.toFixed(2)}) difere do total declarado da nota (R$ ${totalDeclarado.toFixed(2)}). Diferença: R$ ${diferencaTotal.toFixed(2)}.`
    );
  }

  const isValid = itensValidos && somaItensValida;

  return {
    isValid,
    errors,
    warnings,
    mathValidation: {
      itensValidos,
      somaItensValida,
      somaCalculadaItens,
      valorTotalDeclarado: totalDeclarado,
      diferencaTotal,
      detalhesItens,
    },
  };
}

// ─── PIPELINE PRINCIPAL UNIFICADO ──────────────────────────────────────────────

export async function processDocumentPipeline(
  input: ProcessDocumentPipelineInput,
): Promise<ProcessDocumentPipelineResult> {
  const startTime = Date.now();
  const correlationId =
    input.correlationId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

  // 1. Validação defensiva de entrada (tamanho, formato)
  const validationCheck = validateDocumentInput(input.base64, input.mimeType);
  if (!validationCheck.valid) {
    return {
      success: false,
      documentType: "DESCONHECIDO",
      status: "erro",
      confidence: 0,
      data: {},
      validation: { isValid: false, errors: [validationCheck.error!], warnings: [] },
      hasPromptInjection: false,
      isDuplicate: false,
      formattedMessage: `❌ **Erro no Documento:** ${validationCheck.error}`,
      correlationId,
      durationMs: Date.now() - startTime,
      error: validationCheck.error,
      errorCode: validationCheck.code,
    };
  }

  // 2. Proteção contra Prompt Injection no contexto de texto
  const injectionCheck = detectPromptInjection(
    `${input.fileName || ""} ${input.textContext || ""}`
  );

  // 3. Classificação Fail-Closed
  let docType = classifyDocumentType({
    documentTypeHint: input.documentTypeHint,
    fileName: input.fileName,
    textContext: input.textContext,
  });

  const cleanBase64 = input.base64.includes(",")
    ? input.base64.split(",")[1]
    : input.base64;

  try {
    // ───────────────────────────────────────────────────────────────────────────
    // FLUXO A: BOLETO BANCÁRIO
    // ───────────────────────────────────────────────────────────────────────────
    if (docType === "BOLETO") {
      const boletoOutput: ProcessBoletoOutput = await processBoletoDocument({
        base64: cleanBase64,
        mimeType: input.mimeType,
        geminiApiKey: input.geminiApiKey || "",
        geminiApiKeyBackup: input.geminiApiKeyBackup,
        openaiApiKey: input.openaiApiKey,
        workspaceId: input.workspaceId,
      });

      const dados = boletoOutput.dados || {};
      const validacao = boletoOutput.validacao;

      // Sanitizar campos textuais contra prompt injection
      if (dados.beneficiario) dados.beneficiario = sanitizeDocumentString(dados.beneficiario);
      if (dados.pagador) dados.pagador = sanitizeDocumentString(dados.pagador);

      // Verificação de injeção em dados extraídos
      const injectionInExtracted = detectPromptInjection(
        `${dados.beneficiario || ""} ${dados.pagador || ""}`
      );
      const hasInjection = injectionCheck.hasInjection || injectionInExtracted.hasInjection;

      // Reconciliação determinística e validação FEBRABAN
      const isFebrabanValid = validacao?.valido === true;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!isFebrabanValid) {
        errors.push(validacao?.erro || "Validação FEBRABAN do código de barras / linha digitável falhou.");
      }
      if (validacao?.divergencias && validacao.divergencias.length > 0) {
        warnings.push(...validacao.divergencias);
      }

      // Detecção de Duplicatas
      let isDuplicate = false;
      let duplicateDetails: { existingRecordId?: string; type?: string } | undefined;

      if (input.findDuplicateFn) {
        try {
          const dupResult = await input.findDuplicateFn({
            workspaceId: input.workspaceId,
            linhaDigitavel: dados.linha_digitavel || undefined,
            codigoBarras: dados.codigo_barras || undefined,
          });
          if (dupResult.isDuplicate) {
            isDuplicate = true;
            duplicateDetails = dupResult;
            warnings.push(
              `Atenção: Este boleto já foi cadastrado anteriormente (Registro: ${dupResult.existingRecordId || "existente"}).`
            );
          }
        } catch {
          // Detecção de duplicata é defensiva e não quebra o pipeline
        }
      }

      // Validação estrita: se não for válido FEBRABAN, rejeita com erro explícito
      if (!isFebrabanValid) {
        const durationMs = Date.now() - startTime;
        return {
          success: false,
          documentType: "BOLETO",
          status: "requer_revisao",
          confidence: validacao?.confianca ?? 0,
          data: dados as Record<string, unknown>,
          validation: {
            isValid: false,
            errors,
            warnings,
            febrabanValidation: validacao,
          },
          hasPromptInjection: hasInjection,
          isDuplicate,
          duplicateDetails,
          formattedMessage: boletoOutput.mensagemFormatada || "⚠️ **Boleto com Inconsistências:** Dados não puderam ser validados com segurança.",
          correlationId,
          durationMs,
          error: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
          errorCode: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
        };
      }

      // Se válido, gerar Action Proposal canônica (100% proposal-only)
      const numValor = typeof dados.valor === "number" ? dados.valor : parseFloat(String(dados.valor || 0));
      const proposalPayload: Record<string, unknown> = {
        beneficiario: dados.beneficiario || "Beneficiário do Boleto",
        cnpj_cpf_beneficiario: dados.cnpj_cpf_beneficiario || undefined,
        pagador: dados.pagador || undefined,
        valor: numValor > 0 ? numValor : 0,
        valor_total: numValor > 0 ? numValor : 0,
        data_vencimento: dados.data_vencimento || new Date().toISOString().split("T")[0],
        linha_digitavel: dados.linha_digitavel || undefined,
        codigo_barras: dados.codigo_barras || undefined,
        banco: dados.banco || undefined,
        descricao: `Boleto ${dados.beneficiario || "a Pagar"}`.trim(),
      };

      const proposal = prepareActionProposal({
        workspaceId: input.workspaceId,
        userId: input.userId,
        conversationId: input.conversationId,
        actionType: "cadastrar_divida_boleto",
        summary: `Cadastrar Boleto: ${dados.beneficiario || "Boleto"} - R$ ${numValor.toFixed(2)}`,
        payload: proposalPayload,
      });

      if (input.saveProposalFn) {
        try {
          await input.saveProposalFn(proposal);
        } catch {
          // Persistência defensiva
        }
      }

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        documentType: "BOLETO",
        status: isDuplicate ? "duplicata_detectada" : "sucesso",
        confidence: validacao?.confianca ?? 95,
        data: dados as Record<string, unknown>,
        validation: {
          isValid: true,
          errors: [],
          warnings,
          febrabanValidation: validacao,
        },
        hasPromptInjection: hasInjection,
        isDuplicate,
        duplicateDetails,
        actionProposal: proposal,
        formattedMessage: boletoOutput.mensagemFormatada,
        correlationId,
        durationMs,
      };
    }

    // ───────────────────────────────────────────────────────────────────────────
    // FLUXO B: NOTA FISCAL (DANFE)
    // ───────────────────────────────────────────────────────────────────────────
    if (docType === "DANFE") {
      const danfeOutput: ProcessDanfeOutput = await processDanfeDocument({
        base64: cleanBase64,
        mimeType: input.mimeType,
        geminiApiKey: input.geminiApiKey || "",
        geminiApiKeyBackup: input.geminiApiKeyBackup,
        openaiApiKey: input.openaiApiKey,
        workspaceId: input.workspaceId,
      });

      const cabecalho = danfeOutput.cabecalho || {};
      const valoresTotais = danfeOutput.valores_totais || {};
      const itens = danfeOutput.itens || [];

      // Sanitizar campos textuais de DANFE contra prompt injection
      if (cabecalho.emitente_razao_social) {
        cabecalho.emitente_razao_social = sanitizeDocumentString(cabecalho.emitente_razao_social);
      }
      if (cabecalho.emitente_nome_fantasia) {
        cabecalho.emitente_nome_fantasia = sanitizeDocumentString(cabecalho.emitente_nome_fantasia);
      }
      for (const it of itens) {
        if (it.descricao) it.descricao = sanitizeDocumentString(it.descricao);
      }

      const injectionInDanfe = detectPromptInjection(
        `${cabecalho.emitente_razao_social || ""} ${cabecalho.natureza_operacao || ""}`
      );
      const hasInjection = injectionCheck.hasInjection || injectionInDanfe.hasInjection;

      // Validação matemática determinística de DANFE
      const mathValidation = validateDanfeMathStrict({
        valores_totais: valoresTotais,
        itens: itens,
      });

      // Detecção de Duplicatas por Chave de Acesso ou Número da Nota + CNPJ
      let isDuplicate = false;
      let duplicateDetails: { existingRecordId?: string; type?: string } | undefined;

      if (input.findDuplicateFn) {
        try {
          const dupResult = await input.findDuplicateFn({
            workspaceId: input.workspaceId,
            chaveAcesso: cabecalho.chave_acesso || undefined,
            numeroNf: cabecalho.numero_nota || undefined,
            cnpj: cabecalho.emitente_cnpj || undefined,
          });
          if (dupResult.isDuplicate) {
            isDuplicate = true;
            duplicateDetails = dupResult;
            mathValidation.warnings.push(
              `Atenção: Esta Nota Fiscal já foi importada anteriormente (Registro: ${dupResult.existingRecordId || "existente"}).`
            );
          }
        } catch {
          // Detecção de duplicata defensiva
        }
      }

      // Preparar proposta canônica se DANFE tiver dados mínimos
      const valorTotalNota = Number(valoresTotais.valor_total_nota ?? valoresTotais.valor_total_produtos ?? 0);
      const fornecedorNome = cabecalho.emitente_razao_social || cabecalho.emitente_nome_fantasia || "Fornecedor";
      const numNota = cabecalho.numero_nota || "S/N";

      let actionProposal: ActionProposal | undefined;

      if (danfeOutput.status === "sucesso" && valorTotalNota > 0) {
        const proposalPayload: Record<string, unknown> = {
          fornecedor: fornecedorNome,
          cnpj_fornecedor: cabecalho.emitente_cnpj || undefined,
          numero_nf: numNota,
          serie_nf: cabecalho.serie || undefined,
          data_emissao: cabecalho.data_emissao || new Date().toISOString().split("T")[0],
          chave_acesso: cabecalho.chave_acesso || undefined,
          valor_total: valorTotalNota,
          valor_produtos: Number(valoresTotais.valor_total_produtos ?? valorTotalNota),
          itens: itens.map((i) => ({
            codigo: i.codigo_produto || undefined,
            descricao: i.descricao,
            quantidade: i.quantidade,
            valor_unitario: i.valor_unitario,
            valor_total: i.valor_total,
          })),
        };

        actionProposal = prepareActionProposal({
          workspaceId: input.workspaceId,
          userId: input.userId,
          conversationId: input.conversationId,
          actionType: "cadastrar_despesa_nf",
          summary: `Importar NF ${numNota} (${fornecedorNome}) - R$ ${valorTotalNota.toFixed(2)}`,
          payload: proposalPayload,
        });

        if (input.saveProposalFn) {
          try {
            await input.saveProposalFn(actionProposal);
          } catch {
            // Persistência defensiva
          }
        }
      }

      const durationMs = Date.now() - startTime;
      return {
        success: danfeOutput.status === "sucesso",
        documentType: "DANFE",
        status: isDuplicate
          ? "duplicata_detectada"
          : mathValidation.isValid
          ? "sucesso"
          : "requer_revisao",
        confidence: 90,
        data: {
          cabecalho,
          valores_totais: valoresTotais,
          itens,
        },
        validation: {
          isValid: mathValidation.isValid,
          errors: mathValidation.errors,
          warnings: mathValidation.warnings,
          mathValidation: mathValidation.mathValidation,
        },
        hasPromptInjection: hasInjection,
        isDuplicate,
        duplicateDetails,
        actionProposal,
        formattedMessage: danfeOutput.mensagemFormatada,
        correlationId,
        durationMs,
      };
    }

    // ───────────────────────────────────────────────────────────────────────────
    // FLUXO C: DOCUMENTO NÃO RECONHECIDO (FAIL-CLOSED)
    // ───────────────────────────────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      documentType: "DESCONHECIDO",
      status: "requer_revisao",
      confidence: 0,
      data: {},
      validation: {
        isValid: false,
        errors: ["Tipo de documento não identificado com precisão suficiente."],
        warnings: [],
      },
      hasPromptInjection: injectionCheck.hasInjection,
      isDuplicate: false,
      formattedMessage: [
        "📎 **Documento Não Reconhecido**",
        "",
        `• **Arquivo:** ${input.fileName || "documento"}`,
        "",
        "Não identifiquei este arquivo como uma Nota Fiscal (DANFE) ou Boleto Bancário.",
        "Para processamento automático, envie uma imagem ou PDF nítido de um Boleto ou Nota Fiscal.",
        "",
        "🔒 *Nenhuma ação financeira foi executada.*",
      ].join("\n"),
      correlationId,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      documentType: docType,
      status: "erro",
      confidence: 0,
      data: {},
      validation: {
        isValid: false,
        errors: [err?.message || "Erro interno no processamento do documento."],
        warnings: [],
      },
      hasPromptInjection: injectionCheck.hasInjection,
      isDuplicate: false,
      formattedMessage: `❌ **Erro ao processar documento:** ${err?.message || "Falha inesperada."}`,
      correlationId,
      durationMs,
      error: err?.message || "internal_document_error",
      errorCode: "WALLET_AI_DOCUMENT_PROCESSING_FAILED",
    };
  }
}