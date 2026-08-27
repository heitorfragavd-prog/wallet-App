/**
 * Boleto Service — Extração e Formatação Segura de Boletos (Etapa 2.2A)
 * 
 * Pipeline:
 * Imagem/PDF -> Gemini 2.5 Flash / Failover OpenAI Vision -> Validação Determinística -> Proposta Revisável
 * 
 * Regras de Segurança:
 * - Nenhuma mutação de banco de dados (sem cadastro automático)
 * - Divergências marcam status: requer_revisao com explicação detalhada
 * - Não expõe chaves nem dados sensíveis em logs
 */

import {
  reconcileBoleto,
  normalizeDate,
  type BoletoValidationResult,
} from "./boleto-validator.ts";
import { callVisionWithFailover } from "./danfe-fiscal-service.ts";

export interface ProcessBoletoInput {
  base64: string;
  mimeType: string;
  geminiApiKey: string;
  geminiApiKeyBackup?: string;
  openaiApiKey?: string;
  workspaceId: string;
  fetchImpl?: typeof fetch;
}

export interface BoletoExtractedData {
  banco?: string | null;
  beneficiario?: string | null;
  cnpj_cpf_beneficiario?: string | null;
  pagador?: string | null;
  cnpj_cpf_pagador?: string | null;
  data_vencimento?: string | null;
  valor?: number | string | null;
  linha_digitavel?: string | null;
  codigo_barras?: string | null;
  nosso_numero?: string | null;
  numero_documento?: string | null;
  agencia_codigo_beneficiario?: string | null;
  juros_multa?: number | null;
  desconto?: number | null;
  data_emissao?: string | null;
}

export interface ProcessBoletoOutput {
  success: boolean;
  status: "sucesso" | "requer_revisao";
  dados: BoletoExtractedData;
  validacao: BoletoValidationResult;
  mensagemFormatada: string;
  error?: string;
}

export const GEMINI_BOLETO_PROMPT = `Você é um especialista em leitura e extração de boletos bancários e guias de arrecadação brasileiras.

Analise esta imagem ou documento PDF de boleto e extraia os campos com máxima fidelidade e exatidão:

1. BANCO: Nome do banco e código (ex: "Itaú Unibanco (341)", "Banco do Brasil (001)", "Bradesco (237)", "Caixa", etc.)
2. BENEFICIÁRIO (CEDENTE): Nome/Razão Social da empresa ou pessoa que receberá o valor.
3. CNPJ/CPF DO BENEFICIÁRIO: Apenas números ou formatado.
4. PAGADOR (SACADO): Nome da pessoa/empresa que deve pagar.
5. CNPJ/CPF DO PAGADOR: Se visível.
6. DATA DE VENCIMENTO: Data de vencimento no formato YYYY-MM-DD (ou DD/MM/YYYY).
7. VALOR DO DOCUMENTO: Valor nominal a ser pago (ex: 1250.00).
8. LINHA DIGITÁVEL: A sequência de 47 ou 48 dígitos que aparece no topo ou rodapé do boleto (com ou sem pontos/espaços).
9. CÓDIGO DE BARRAS: Sequência de 44 dígitos se estiver expressa numericamente.
10. NOSSO NÚMERO: Código de identificação do título.
11. NÚMERO DO DOCUMENTO / SEU NÚMERO: Número da fatura ou documento de referência.
12. AGÊNCIA / CÓDIGO BENEFICIÁRIO: Código da agência e conta do cedente.
13. DATA DO DOCUMENTO / EMISSÃO: Data de emissão se disponível.

Retorne EXCLUSIVAMENTE um objeto JSON válido no formato:
{
  "banco": "string ou null",
  "beneficiario": "string ou null",
  "cnpj_cpf_beneficiario": "string ou null",
  "pagador": "string ou null",
  "cnpj_cpf_pagador": "string ou null",
  "data_vencimento": "YYYY-MM-DD ou DD/MM/YYYY ou null",
  "valor": 0.00,
  "linha_digitavel": "string ou null",
  "codigo_barras": "string ou null",
  "nosso_numero": "string ou null",
  "numero_documento": "string ou null",
  "agencia_codigo_beneficiario": "string ou null",
  "data_emissao": "string ou null"
}`;

/**
 * Formata a mensagem final apresentada ao usuário no chat da Wallet IA.
 */
export function formatBoletoMessage(
  dados: BoletoExtractedData,
  validacao: BoletoValidationResult,
): string {
  const lines: string[] = [];

  const valorStr = validacao.valorFinal > 0
    ? validacao.valorFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "Não identificado";

  const dataVencBr = validacao.dataVencimentoFinal
    ? normalizeDate(validacao.dataVencimentoFinal).formattedBr || validacao.dataVencimentoFinal
    : "Não identificada";

  const linhaDigitavelFmt = validacao.linhaDigitavel?.linhaFormatada || dados.linha_digitavel || "Não identificada";

  if (validacao.status === "ok") {
    lines.push(`📄 **Boleto Identificado**`);
    lines.push(``);
    if (validacao.bancoFinal) lines.push(`🏦 **Banco:** ${validacao.bancoFinal}`);
    if (validacao.beneficiarioFinal) lines.push(`🏢 **Beneficiário:** ${validacao.beneficiarioFinal}`);
    if (validacao.cnpjCpfBeneficiarioFinal) lines.push(`🧾 **CNPJ/CPF:** ${validacao.cnpjCpfBeneficiarioFinal}`);
    if (validacao.pagadorFinal) lines.push(`👤 **Pagador:** ${validacao.pagadorFinal}`);
    lines.push(`📅 **Vencimento:** ${dataVencBr}`);
    lines.push(`💰 **Valor:** R$ ${valorStr}`);
    lines.push(`🔢 **Linha digitável:** \`${linhaDigitavelFmt}\``);
    lines.push(``);
    lines.push(`✅ **Dados principais identificados**`);
    lines.push(``);
    lines.push(`🔒 *Nenhuma conta ou despesa foi cadastrada ainda.*`);
    lines.push(``);
    lines.push(`*Posso preparar este boleto para cadastro.*`);
  } else {
    lines.push(`📄 **Boleto Identificado (Requer Revisão)**`);
    lines.push(``);
    if (validacao.divergencias.length > 0) {
      lines.push(`⚠️ **Inconsistências encontradas:**`);
      for (const d of validacao.divergencias) {
        lines.push(`• ${d}`);
      }
      lines.push(``);
    }
    if (validacao.bancoFinal) lines.push(`🏦 **Banco:** ${validacao.bancoFinal}`);
    if (validacao.beneficiarioFinal) lines.push(`🏢 **Beneficiário:** ${validacao.beneficiarioFinal}`);
    if (validacao.cnpjCpfBeneficiarioFinal) lines.push(`🧾 **CNPJ/CPF:** ${validacao.cnpjCpfBeneficiarioFinal}`);
    if (validacao.pagadorFinal) lines.push(`👤 **Pagador:** ${validacao.pagadorFinal}`);
    lines.push(`📅 **Vencimento:** ${dataVencBr}`);
    lines.push(`💰 **Valor:** R$ ${valorStr}`);
    lines.push(`🔢 **Linha digitável:** \`${linhaDigitavelFmt}\``);
    lines.push(``);
    lines.push(`🔒 *Nenhuma conta ou despesa foi cadastrada ainda.*`);
    lines.push(``);
    lines.push(`*Revise os dados acima antes de prosseguir com o agendamento.*`);
  }

  return lines.join("\n");
}

/**
 * Processador principal de documento de Boleto.
 */
export async function processBoletoDocument(input: ProcessBoletoInput): Promise<ProcessBoletoOutput> {
  const fetchFn = input.fetchImpl || fetch;

  try {
    const cleanB64 = input.base64.replace(/^data:[^;]+;base64,/i, "").replace(/[\r\n\s]+/g, "");

    const visionResult = await callVisionWithFailover({
      prompt: GEMINI_BOLETO_PROMPT,
      mimeType: input.mimeType,
      base64: cleanB64,
      geminiApiKey: input.geminiApiKey,
      geminiApiKeyBackup: input.geminiApiKeyBackup,
      openaiApiKey: input.openaiApiKey,
      fetchFn,
      correlationId: input.workspaceId,
    });

    if (!visionResult.ok || !visionResult.text) {
      throw new Error(`Falha na extração visual do boleto (status: ${visionResult.status})`);
    }

    let parsedJson: Record<string, any> = {};
    try {
      const cleaned = visionResult.text.replace(/```json\s*/gi, "").replace(/```\s*$/gi, "").trim();
      parsedJson = JSON.parse(cleaned);
    } catch {
      const match = visionResult.text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsedJson = JSON.parse(match[0]);
        } catch {
          // ignora
        }
      }
    }

    const dados: BoletoExtractedData = {
      banco: parsedJson.banco || null,
      beneficiario: parsedJson.beneficiario || parsedJson.cedente || null,
      cnpj_cpf_beneficiario: parsedJson.cnpj_cpf_beneficiario || parsedJson.cnpj_beneficiario || null,
      pagador: parsedJson.pagador || parsedJson.sacado || null,
      cnpj_cpf_pagador: parsedJson.cnpj_cpf_pagador || parsedJson.cpf_cnpj_pagador || null,
      data_vencimento: parsedJson.data_vencimento || parsedJson.vencimento || null,
      valor: parsedJson.valor ?? parsedJson.valor_documento ?? null,
      linha_digitavel: parsedJson.linha_digitavel || parsedJson.linhaDigitavel || null,
      codigo_barras: parsedJson.codigo_barras || parsedJson.codigoBarras || null,
      nosso_numero: parsedJson.nosso_numero || null,
      numero_documento: parsedJson.numero_documento || null,
      agencia_codigo_beneficiario: parsedJson.agencia_codigo_beneficiario || null,
      juros_multa: parsedJson.juros_multa || null,
      desconto: parsedJson.desconto || null,
      data_emissao: parsedJson.data_emissao || null,
    };

    // Validação e Reconciliação Determinística
    const validacao = reconcileBoleto(dados);

    const mensagemFormatada = formatBoletoMessage(dados, validacao);

    return {
      success: true,
      status: validacao.status === "ok" ? "sucesso" : "requer_revisao",
      dados,
      validacao,
      mensagemFormatada,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const fallbackMsg = [
      `📄 **Boleto Identificado**`,
      ``,
      `⚠️ *Não foi possível processar todos os dados deste boleto com segurança no momento.*`,
      ``,
      `🔒 *Nenhuma conta ou despesa foi cadastrada.*`,
    ].join("\n");

    return {
      success: false,
      status: "requer_revisao",
      dados: {},
      validacao: {
        valido: false,
        status: "requer_revisao",
        divergencias: [errorMsg],
        valorFinal: 0,
        dataVencimentoFinal: null,
        beneficiarioFinal: null,
        cnpjCpfBeneficiarioFinal: null,
        pagadorFinal: null,
        cnpjCpfPagadorFinal: null,
        bancoFinal: null,
        motivo: errorMsg,
      },
      mensagemFormatada: fallbackMsg,
      error: errorMsg,
    };
  }
}
