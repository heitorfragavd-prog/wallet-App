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
  type BoletoValidationResult,
} from "./boleto-validator.ts";
import {
  processBoletoDocument,
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

export function detectPromptInjectionInValues(values: unknown[]): { hasInjection: boolean; matches: string[] } {
  const allMatches: string[] = [];
  for (const val of values) {
    if (typeof val === "string") {
      const check = detectPromptInjection(val);
      if (check.hasInjection) {
        allMatches.push(...check.matches);
      }
    } else if (Array.isArray(val)) {
      const check = detectPromptInjectionInValues(val);
      if (check.hasInjection) {
        allMatches.push(...check.matches);
      }
    } else if (val && typeof val === "object") {
      const check = detectPromptInjectionInValues(Object.values(val as Record<string, unknown>));
      if (check.hasInjection) {
        allMatches.push(...check.matches);
      }
    }
  }
  return {
    hasInjection: allMatches.length > 0,
    matches: Array.from(new Set(allMatches)),
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

  if (totalDeclarado <= 0) {
    errors.push("Valor total da nota fiscal deve ser maior que zero.");
  }
  if (itens.length === 0) {
    errors.push("Nota fiscal não contém itens discriminados.");
  }

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
      const warn = `Item '${item.descricao || "Sem descrição"}': cálculo (${qtd} × R$ ${unit.toFixed(2)} = R$ ${totalItemCalculado.toFixed(2)}) difere do total declarado (R$ ${totalItemDeclarado.toFixed(2)}).`;
      warnings.push(warn);
      errors.push(warn);
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
  const somaItensValida = itens.length > 0 && totalDeclarado > 0 && diferencaTotal <= 0.05;

  if (!somaItensValida && itens.length > 0 && totalDeclarado > 0) {
    const warn = `Soma calculada dos itens (R$ ${somaCalculadaItens.toFixed(2)}) difere do total declarado da nota (R$ ${totalDeclarado.toFixed(2)}). Diferença: R$ ${diferencaTotal.toFixed(2)}.`;
    warnings.push(warn);
    errors.push(warn);
  }

  const isValid = itensValidos && somaItensValida && errors.length === 0 && totalDeclarado > 0 && itens.length > 0;

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
  const docType = classifyDocumentType({
    documentTypeHint: input.documentTypeHint,
    fileName: input.fileName,
    textContext: input.textContext,
  });

  if (injectionCheck.hasInjection) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      documentType: docType,
      status: "requer_revisao",
      confidence: 0,
      data: {},
      validation: {
        isValid: false,
        errors: ["Tentativa de manipulação de instruções / prompt injection detectada no documento."],
        warnings: [],
      },
      hasPromptInjection: true,
      isDuplicate: false,
      formattedMessage: "🛡️ **Aviso de Segurança:** O documento contém padrões suspeitos ou instruções maliciosas e foi bloqueado para revisão.",
      correlationId,
      durationMs,
      error: "WALLET_AI_DOCUMENT_UNTRUSTED_CONTENT",
      errorCode: "WALLET_AI_DOCUMENT_UNTRUSTED_CONTENT",
    };
  }

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

      // Verificação de injeção em dados extraídos e contexto
      const injectionInExtracted = detectPromptInjectionInValues([
        dados.beneficiario,
        dados.pagador,
        dados.instrucoes,
        dados.linha_digitavel,
        dados.codigo_barras,
      ]);
      const hasInjection = injectionCheck.hasInjection || injectionInExtracted.hasInjection;

      // Gate 1: Prompt Injection Fail-Closed
      if (hasInjection) {
        const durationMs = Date.now() - startTime;
        return {
          success: false,
          documentType: "BOLETO",
          status: "requer_revisao",
          confidence: 0,
          data: dados as Record<string, unknown>,
          validation: {
            isValid: false,
            errors: ["Tentativa de manipulação de instruções / prompt injection detectada."],
            warnings: [],
            febrabanValidation: validacao,
          },
          hasPromptInjection: true,
          isDuplicate: false,
          formattedMessage: "🛡️ **Aviso de Segurança:** O documento contém padrões suspeitos ou instruções maliciosas e foi bloqueado para revisão.",
          correlationId,
          durationMs,
          error: "WALLET_AI_DOCUMENT_UNTRUSTED_CONTENT",
          errorCode: "WALLET_AI_DOCUMENT_UNTRUSTED_CONTENT",
        };
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
          }
        } catch {
          // Detecção de duplicata é defensiva e não quebra o pipeline
        }
      }

      // Gate 2: Duplicidade Fail-Closed
      if (isDuplicate) {
        const durationMs = Date.now() - startTime;
        return {
          success: false,
          documentType: "BOLETO",
          status: "duplicata_detectada",
          confidence: validacao?.confianca ?? 95,
          data: dados as Record<string, unknown>,
          validation: {
            isValid: validacao?.valido === true,
            errors: ["Boleto já cadastrado anteriormente."],
            warnings: validacao?.divergencias || [],
            febrabanValidation: validacao,
          },
          hasPromptInjection: false,
          isDuplicate: true,
          duplicateDetails,
          formattedMessage: `⚠️ **Boleto Duplicado Detectado:** Este boleto já foi cadastrado anteriormente (Registro: ${duplicateDetails?.existingRecordId || "existente"}).`,
          correlationId,
          durationMs,
          error: "WALLET_AI_DOCUMENT_DUPLICATE",
          errorCode: "WALLET_AI_DOCUMENT_DUPLICATE",
        };
      }

      // Reconciliação determinística e validação FEBRABAN + Dados Mínimos
      const numValor = typeof dados.valor === "number" ? dados.valor : parseFloat(String(dados.valor || 0));
      const hasMinimumBoletoData = Boolean(
        dados.beneficiario &&
        dados.data_vencimento &&
        (dados.linha_digitavel || dados.codigo_barras)
      );
      const isFebrabanValid = validacao?.valido === true;

      const errors: string[] = [];
      const warnings: string[] = validacao?.divergencias ? [...validacao.divergencias] : [];

      if (!isFebrabanValid) {
        errors.push(validacao?.erro || "Validação FEBRABAN do código de barras / linha digitável falhou.");
      }
      if (numValor <= 0) {
        errors.push("Valor do boleto deve ser maior que zero.");
      }
      if (!hasMinimumBoletoData) {
        if (!dados.beneficiario) errors.push("Beneficiário do boleto não identificado.");
        if (!dados.data_vencimento) errors.push("Data de vencimento do boleto não identificada.");
        if (!dados.linha_digitavel && !dados.codigo_barras) errors.push("Código de barras ou linha digitável ausente.");
      }

      // Gate 3: Validação FEBRABAN + Dados Mínimos + Valor Positivo Fail-Closed
      if (!isFebrabanValid || numValor <= 0 || !hasMinimumBoletoData) {
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
          hasPromptInjection: false,
          isDuplicate: false,
          duplicateDetails,
          formattedMessage: boletoOutput.mensagemFormatada || "⚠️ **Boleto com Inconsistências:** Dados não puderam ser validados com segurança.",
          correlationId,
          durationMs,
          error: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
          errorCode: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
        };
      }

      // Se válido em TODOS os gates, gerar Action Proposal canônica (100% proposal-only)
      const proposalPayload: Record<string, unknown> = {
        beneficiario: dados.beneficiario || "Beneficiário do Boleto",
        cnpj_cpf_beneficiario: dados.cnpj_cpf_beneficiario || undefined,
        pagador: dados.pagador || undefined,
        valor: numValor,
        valor_total: numValor,
        data_vencimento: dados.data_vencimento,
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
        status: "sucesso",
        confidence: validacao?.confianca ?? 95,
        data: dados as Record<string, unknown>,
        validation: {
          isValid: true,
          errors: [],
          warnings,
          febrabanValidation: validacao,
        },
        hasPromptInjection: false,
        isDuplicate: false,
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
      let danfeOutput: ProcessDanfeOutput;
      try {
        danfeOutput = await processDanfeDocument({
          base64: cleanBase64,
          mimeType: input.mimeType,
          geminiApiKey: input.geminiApiKey || "",
          geminiApiKeyBackup: input.geminiApiKeyBackup,
          openaiApiKey: input.openaiApiKey,
          workspaceId: input.workspaceId,
        });
      } catch (_err: unknown) {
        const durationMs = Date.now() - startTime;
        return {
          success: false,
          documentType: "DANFE",
          status: "requer_revisao",
          confidence: 0,
          data: {},
          validation: {
            isValid: false,
            errors: [err?.message || "Falha na extração dos dados da Nota Fiscal."],
            warnings: [],
          },
          hasPromptInjection: false,
          isDuplicate: false,
          formattedMessage: "⚠️ **Nota Fiscal com Inconsistências:** Dados fiscais não puderam ser validados com segurança.",
          correlationId,
          durationMs,
          error: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
          errorCode: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
        };
      }

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

      const injectionInDanfe = detectPromptInjectionInValues([
        cabecalho.emitente_razao_social,
        cabecalho.emitente_nome_fantasia,
        cabecalho.natureza_operacao,
        cabecalho.destinatario_razao_social,
        ...itens.map((it) => it.descricao),
      ]);
      const hasInjection = injectionCheck.hasInjection || injectionInDanfe.hasInjection;

      // Gate 1: Prompt Injection Fail-Closed
      if (hasInjection) {
        const durationMs = Date.now() - startTime;
        return {
          success: false,
          documentType: "DANFE",
          status: "requer_revisao",
          confidence: 0,
          data: {
            cabecalho,
            valores_totais: valoresTotais,
            itens,
          },
          validation: {
            isValid: false,
            errors: ["Tentativa de manipulação de instruções / prompt injection detectada no documento."],
            warnings: [],
          },
          hasPromptInjection: true,
          isDuplicate: false,
          formattedMessage: "🛡️ **Aviso de Segurança:** A Nota Fiscal contém padrões suspeitos ou instruções maliciosas e foi bloqueada para revisão.",
          correlationId,
          durationMs,
          error: "WALLET_AI_DOCUMENT_UNTRUSTED_CONTENT",
          errorCode: "WALLET_AI_DOCUMENT_UNTRUSTED_CONTENT",
        };
      }

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
          }
        } catch {
          // Detecção de duplicata defensiva
        }
      }

      // Gate 2: Duplicidade Fail-Closed
      if (isDuplicate) {
        const durationMs = Date.now() - startTime;
        return {
          success: false,
          documentType: "DANFE",
          status: "duplicata_detectada",
          confidence: 90,
          data: {
            cabecalho,
            valores_totais: valoresTotais,
            itens,
          },
          validation: {
            isValid: true,
            errors: ["Nota Fiscal já importada anteriormente."],
            warnings: [],
          },
          hasPromptInjection: false,
          isDuplicate: true,
          duplicateDetails,
          formattedMessage: `⚠️ **DANFE Duplicado Detectado:** Esta Nota Fiscal já foi cadastrada anteriormente (Registro: ${duplicateDetails?.existingRecordId || "existente"}).`,
          correlationId,
          durationMs,
          error: "WALLET_AI_DOCUMENT_DUPLICATE",
          errorCode: "WALLET_AI_DOCUMENT_DUPLICATE",
        };
      }

      // Validação matemática determinística de DANFE
      const mathValidation = validateDanfeMathStrict({
        valores_totais: valoresTotais,
        itens: itens,
      });

      const valorTotalNota = Number(valoresTotais.valor_total_nota ?? valoresTotais.valor_total_produtos ?? 0);
      const fornecedorNome = (cabecalho.emitente_razao_social || cabecalho.emitente_nome_fantasia || "").trim();
      const hasNumeroOuChave = Boolean(cabecalho.numero_nota || cabecalho.chave_acesso);
      const hasMinimumData = Boolean(fornecedorNome && hasNumeroOuChave && valorTotalNota > 0 && itens.length > 0);

      const allErrors = [...mathValidation.errors];
      if (!hasMinimumData) {
        if (!fornecedorNome) allErrors.push("Fornecedor / emitente da nota fiscal não identificado.");
        if (!hasNumeroOuChave) allErrors.push("Nota fiscal sem número de nota e sem chave de acesso.");
        if (valorTotalNota <= 0 && !allErrors.some((e) => e.includes("maior que zero"))) {
          allErrors.push("Valor total da nota fiscal deve ser maior que zero.");
        }
        if (itens.length === 0 && !allErrors.some((e) => e.includes("itens"))) {
          allErrors.push("Nota fiscal sem itens discriminados.");
        }
      }

      const isDanfeValid = danfeOutput.status === "sucesso" && mathValidation.isValid && hasMinimumData;

      // Gate 3: Validação Fiscal e Matemática Fail-Closed
      if (!isDanfeValid) {
        const durationMs = Date.now() - startTime;
        return {
          success: false,
          documentType: "DANFE",
          status: "requer_revisao",
          confidence: 70,
          data: {
            cabecalho,
            valores_totais: valoresTotais,
            itens,
          },
          validation: {
            isValid: false,
            errors: allErrors.length > 0 ? allErrors : ["Validação fiscal ou matemática da DANFE falhou."],
            warnings: mathValidation.warnings,
            mathValidation: mathValidation.mathValidation,
          },
          hasPromptInjection: false,
          isDuplicate: false,
          duplicateDetails,
          formattedMessage: danfeOutput.mensagemFormatada || "⚠️ **Nota Fiscal com Inconsistências:** Dados matemáticos ou cadastrais divergentes.",
          correlationId,
          durationMs,
          error: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
          errorCode: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
        };
      }

      // Se passou em TODOS os gates, gerar Action Proposal canônica (proposal-only)
      const numNota = cabecalho.numero_nota || "S/N";
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

      const actionProposal = prepareActionProposal({
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

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        documentType: "DANFE",
        status: "sucesso",
        confidence: 90,
        data: {
          cabecalho,
          valores_totais: valoresTotais,
          itens,
        },
        validation: {
          isValid: true,
          errors: [],
          warnings: mathValidation.warnings,
          mathValidation: mathValidation.mathValidation,
        },
        hasPromptInjection: false,
        isDuplicate: false,
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
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : "Erro interno no processamento do documento.";
    return {
      success: false,
      documentType: docType,
      status: "erro",
      confidence: 0,
      data: {},
      validation: {
        isValid: false,
        errors: [errMsg],
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