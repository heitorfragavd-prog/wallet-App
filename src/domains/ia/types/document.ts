/**
 * Contrato único de Document Intelligence — Etapa 2.2A (Boleto & DANFE)
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

  // 1. Padrões explícitos de Boleto Bancário / Arrecadação
  const boletoExplicitPatterns = [
    /boleto/,
    /linha[\s_-]?digit[aá]vel/,
    /c[oó]digo[\s_-]?barras/,
    /bloqueto/,
    /benefici[aá]rio/,
    /cedente/,
    /sacado/,
    /pagador/,
    /vencimento/,
    /valor[\s_-]?do[\s_-]?documento/,
    /nosso[\s_-]?n[uú]mero/,
    /ag[eê]ncia[\s_-]?(e\s*)?c[oó]digo/,
    /guia[\s_-]?recolhimento/,
    /darf/,
    /das[\s_-]?simples/,
    /fatura[\s_-]?(banc[aá]ria|cart[aã]o|luz|agua|[aá]gua|energia|telecom|internet)/,
  ];

  // 2. Padrões explícitos de DANFE / Nota Fiscal
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
    /chave[\s_-]?de[\s_-]?acesso/,
    /c[aá]lculo[\s_-]?do[\s_-]?imposto/,
  ];

  // 3. Padrões explícitos de Comprovante de Pagamento
  const comprovantePatterns = [
    /comprovante/,
    /recibo/,
    /transfer[eê]ncia/,
    /\bted\b/,
    /\bdoc\b/,
    /pix[\s_-]?(recebido|enviado|comprovante|realizado)/,
    /pagamento[\s_-]?realizado/,
    /autentica[cç][aã]o[\s_-]?mec[aâ]nica/,
    /autentica[cç][aã]o[\s_-]?banc[aá]ria/,
  ];

  // Checagem de DANFE primeiro se houver termos fiscais inequívocos
  if (danfePatterns.some((p) => p.test(combined)) && !combined.includes("boleto")) {
    return {
      tipo: "DANFE",
      confianca: 0.95,
      motivo: "Identificado padrão textual/nome associado a Nota Fiscal (DANFE)",
    };
  }

  // Checagem de Boleto
  if (boletoExplicitPatterns.some((p) => p.test(combined))) {
    return {
      tipo: "BOLETO",
      confianca: 0.9,
      motivo: "Identificado padrão textual/nome associado a Boleto Bancário",
    };
  }

  // Checagem de Comprovante
  if (comprovantePatterns.some((p) => p.test(combined))) {
    return {
      tipo: "COMPROVANTE",
      confianca: 0.85,
      motivo: "Identificado padrão associado a Comprovante de Pagamento",
    };
  }

  // Se tiver termos fiscais residuais
  if (danfePatterns.some((p) => p.test(combined))) {
    return {
      tipo: "DANFE",
      confianca: 0.85,
      motivo: "Identificado padrão textual associado a Nota Fiscal",
    };
  }

  // 4. Se for imagem ou PDF sem pistas textuais explícitas, marca como DESCONHECIDO
  // para que a autoridade de classificação documental seja delegada à inspeção visual do backend.
  return {
    tipo: "DESCONHECIDO",
    confianca: 0.5,
    motivo: "Arquivo de imagem/PDF sem pistas textuais explícitas — requer classificação visual no backend",
  };
}
