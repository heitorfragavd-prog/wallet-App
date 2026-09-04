/**
 * WalletDocumentService — Gateway de Entrada para Processamento Documental na Wallet IA
 *
 * Roteia documentos para:
 * - DANFE Fiscal Service (process_danfe)
 * - Boleto Service (process_boleto)
 * - Comprovante de Pagamento
 */

import { supabase } from "@/integrations/supabase/client";
import { classifyDocument, type WalletDocumentInput } from "../types/document";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";

export interface BoletoExtractedData {
  valor_total?: number;
  data_vencimento?: string;
  linha_digitavel?: string;
  codigo_barras?: string;
  banco_nome?: string;
  banco_codigo?: string;
  beneficiario?: string;
}

export interface DanfeSessionState {
  numeroNf?: string;
  fornecedor?: string;
  chaveAcesso?: string;
  valorProdutosDeclarado?: number;
  itensAcumulados?: unknown[];
}

export interface ProcessDocumentResponse {
  tipo: "DANFE" | "BOLETO" | "COMPROVANTE" | "OUTRO" | "DESCONHECIDO";
  content: string;
  status?: string;
  sessionState?: DanfeSessionState;
  boletoDados?: BoletoExtractedData;
  actionProposal?: ActionProposal;
}

export async function processWalletDocument(
  input: WalletDocumentInput,
): Promise<ProcessDocumentResponse> {
  try {
    const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
      body: {
        action: "process_document",
        base64: input.base64,
        mime_type: input.mimeType,
        fileName: input.fileName,
        file_name: input.fileName,
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        textContext: input.textContext,
        text_context: input.textContext,
      },
    });

    if (!error && data) {
      // ── 1. Resposta de Boleto ──────────────────────────────────────────────
      if (
        data.documentType === "BOLETO" ||
        data.dados ||
        data.validacao ||
        data.tipo === "BOLETO" ||
        data.status === "validado" ||
        data.status === "validado_com_alerta"
      ) {
        const isValido =
          data.status === "validado" ||
          data.status === "validado_com_alerta" ||
          data.status === "sucesso" ||
          data.success === true;
        let actionProposal: ActionProposal | undefined =
          data.actionProposal || data.action_proposal;

        if (!actionProposal && isValido && data.dados) {
          actionProposal = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            workspaceId: input.workspaceId,
            userId: "",
            actionType: "cadastrar_divida_boleto",
            actionVersion: "1.0",
            summary: `Cadastrar Boleto: ${data.dados.beneficiario || "Boleto Bancário"} - R$ ${(data.dados.valor_total || data.dados.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            payload: {
              descricao: `Boleto ${data.dados.beneficiario || ""}`.trim() || "Boleto a Pagar",
              valor: data.dados.valor_total || data.dados.valor || 0,
              data_vencimento: data.dados.data_vencimento || "",
              linha_digitavel: data.dados.linha_digitavel || "",
              codigo_barras: data.dados.codigo_barras || "",
              banco: data.dados.banco_nome || data.dados.banco_codigo || data.dados.banco || "",
              beneficiario: data.dados.beneficiario || "",
            },
            idempotencyHash: data.dados.linha_digitavel || String(Date.now()),
            status: "prepared",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          };
        }

        return {
          tipo: "BOLETO",
          status: data.status,
          content: data.formattedMessage || data.mensagemFormatada || "📄 **Boleto Processado**",
          boletoDados: data.dados,
          actionProposal,
        };
      }

      // ── 2. Resposta de DANFE / Fiscal ──────────────────────────────────────
      if (
        data.documentType === "DANFE" ||
        data.cabecalho ||
        data.valores_totais ||
        data.itens ||
        data.tipo === "DANFE"
      ) {
        const isSucesso = data.status === "sucesso" || data.success === true;
        let actionProposal: ActionProposal | undefined =
          data.actionProposal || data.action_proposal;

        if (!actionProposal && isSucesso) {
          const numNota = data.cabecalho?.numero_nota || data.sessionState?.numeroNf || "S/N";
          const fornecedor = data.cabecalho?.emitente_razao_social || data.sessionState?.fornecedor || "Fornecedor";
          const valorTotal = data.valores_totais?.valor_total_nota || data.sessionState?.valorProdutosDeclarado || 0;

          actionProposal = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            workspaceId: input.workspaceId,
            userId: "",
            actionType: "cadastrar_despesa_nf",
            actionVersion: "1.0",
            summary: `Importar NF ${numNota} (${fornecedor}) - R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            payload: {
              fornecedor,
              numero_nf: numNota,
              chave_acesso: data.cabecalho?.chave_acesso || data.sessionState?.chaveAcesso || "",
              valor_total: valorTotal,
              itens_count: (data.itens || data.sessionState?.itensAcumulados || []).length,
            },
            idempotencyHash: data.cabecalho?.chave_acesso || String(Date.now()),
            status: "prepared",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          };
        }

        return {
          tipo: "DANFE",
          status: data.status,
          content: data.formattedMessage || data.mensagemFormatada || "🧾 **Nota Fiscal Processada**",
          sessionState: data.sessionState,
          actionProposal,
        };
      }

      // ── 3. Resposta de documento não reconhecido / OUTRO ──────────────────
      return {
        tipo: "DESCONHECIDO",
        status: data.status || "desconhecido",
        content: data.mensagemFormatada || [
          `📎 **Documento Não Reconhecido**`,
          ``,
          `• **Arquivo:** ${input.fileName}`,
          ``,
          `Não identifiquei este arquivo como uma Nota Fiscal (DANFE) ou Boleto Bancário.`,
          `Para análise fiscal ou financeira, envie uma imagem ou PDF nítido de uma Nota Fiscal ou Boleto.`,
          ``,
          `🔒 *Nenhuma ação foi executada.*`,
        ].join("\n"),
      };
    }
  } catch {
    // Fallback gracioso se a edge function estiver offline
  }

  // ── 4. Fallback Fail-Closed em caso de offline / sem resposta da Edge Function ─
  const localHint = classifyDocument(input.fileName, input.mimeType, input.textContext);

  if (localHint.tipo === "BOLETO") {
    const msg = [
      `📄 **Boleto Identificado**`,
      ``,
      `• **Arquivo:** ${input.fileName}`,
      `• **Tipo:** Boleto Bancário / Fatura`,
      ``,
      `Identifiquei o anexo como um Boleto Bancário.`,
      ``,
      `🔒 *Nenhum pagamento ou lançamento foi realizado.*`,
      ``,
      `*Posso preparar este boleto para cadastro.*`,
    ].join("\n");
    return { tipo: "BOLETO", status: "pendente", content: msg };
  }

  if (localHint.tipo === "COMPROVANTE") {
    const msg = [
      `🧾 **Comprovante de Pagamento Identificado**`,
      ``,
      `• **Arquivo:** ${input.fileName}`,
      `• **Tipo:** Comprovante / Recibo`,
      ``,
      `ℹ️ *A conciliação automática de comprovantes com contas bancárias e extrato será ativada.*`,
      ``,
      `🔒 *Nenhuma alteração foi realizada nas suas contas.*`,
    ].join("\n");
    return { tipo: "COMPROVANTE", status: "pendente", content: msg };
  }

  if (localHint.tipo === "DANFE") {
    const msg = [
      `🧾 **Nota Fiscal (DANFE) Recebida**`,
      ``,
      `• **Arquivo:** ${input.fileName}`,
      `• **Documento:** Nota Fiscal / DANFE`,
      ``,
      `Documento recebido e integrado ao pipeline fiscal.`,
      ``,
      `🔒 *Nenhuma alteração de custo ou estoque foi aplicada sem confirmação.*`,
    ].join("\n");
    return { tipo: "DANFE", status: "pendente", content: msg };
  }

  const msg = [
    `📎 **Arquivo Recebido**`,
    ``,
    `• **Arquivo:** ${input.fileName} (${input.mimeType || "tipo desconhecido"})`,
    ``,
    `Não identifiquei este arquivo como uma Nota Fiscal (DANFE), Boleto ou Comprovante.`,
    `Para análise fiscal ou financeira, por favor envie uma imagem ou PDF nítido de uma Nota Fiscal ou Boleto.`,
    ``,
    `🔒 *Nenhuma ação foi executada.*`,
  ].join("\n");

  return { tipo: "DESCONHECIDO", status: "desconhecido", content: msg };
}
