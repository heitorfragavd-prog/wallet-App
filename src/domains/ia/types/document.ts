/**
 * Contrato único de Document Intelligence — Etapa 2.1
 */

export type DocumentClassification =
  | "DANFE"
  | "BOLETO"
  | "COMPROVANTE"
  | "OUTRO"
  | "DESCONHECIDO";

export interface WalletDocumentInput {
  fileName: string;
  mimeType: string;
  base64: string;
  workspaceId: string;
  conversationId?: string;
  textContext?: string;
}

export interface DocumentClassificationResult {
  tipo: DocumentClassification;
  confianca: number;
  motivo: string;
}

/**
 * Classificador determinístico de documentos para roteamento.
 * Não confia unicamente no nome do arquivo: cruza nome, extensão, mimeType e contexto de texto.
 */
export function classifyDocument(
  fileName: string,
  mimeType: string,
  textContext: string = "",
): DocumentClassificationResult {
  const normFile = (fileName || "").toLowerCase();
  const normText = (textContext || "").toLowerCase();
  const combined = `${normFile} ${normText}`;

  // 1. Padrões de DANFE / Nota Fiscal
  const danfePatterns = [
    /danfe/,
    /nota[\s_-]?fiscal/,
    /\bnf\b/,
    /\bnfe\b/,
    /\bnf-e\b/,
    /\bnfc-e\b/,
    /xml[\s_-]?nfe/,
    /cupom[\s_-]?fiscal/,
    /faturamento/,
  ];

  if (danfePatterns.some((p) => p.test(combined))) {
    return {
      tipo: "DANFE",
      confianca: 0.9,
      motivo: "Identificado padrão textual/nome associado a Nota Fiscal (DANFE)",
    };
  }

  // 2. Padrões de Boleto Bancário
  const boletoPatterns = [
    /boleto/,
    /linha[\s_-]?digitavel/,
    /codigo[\s_-]?barras/,
    /bloqueto/,
    /fatura[\s_-]?(bancaria|cartao|luz|agua|energia)/,
  ];

  if (boletoPatterns.some((p) => p.test(combined))) {
    return {
      tipo: "BOLETO",
      confianca: 0.9,
      motivo: "Identificado padrão associado a Boleto Bancário",
    };
  }

  // 3. Padrões de Comprovante de Pagamento
  const comprovantePatterns = [
    /comprovante/,
    /recibo/,
    /transferencia/,
    /ted/,
    /doc/,
    /pix[\s_-]?(recebido|enviado|comprovante)/,
    /pagamento[\s_-]?realizado/,
  ];

  if (comprovantePatterns.some((p) => p.test(combined))) {
    return {
      tipo: "COMPROVANTE",
      confianca: 0.85,
      motivo: "Identificado padrão associado a Comprovante de Pagamento",
    };
  }

  // 4. Se for imagem ou PDF sem pistas explícitas de boleto/comprovante:
  // Em contexto empresarial / PDV, fotos de documentos são predominantemente NFs ou recibos
  if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
    return {
      tipo: "DANFE",
      confianca: 0.6,
      motivo: "Arquivo de imagem/PDF encaminhado para verificação no pipeline fiscal DANFE",
    };
  }

  return {
    tipo: "DESCONHECIDO",
    confianca: 0.3,
    motivo: "Tipo de arquivo não reconhecido pelo classificador",
  };
}
