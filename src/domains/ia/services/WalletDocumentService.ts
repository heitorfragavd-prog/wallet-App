/**
 * WalletDocumentService — Etapa 2.2A (Boleto & DANFE)
 * 
 * Orquestrador de Document Intelligence no frontend da Wallet IA.
 * Roteia documentos para:
 * - DANFE Fiscal Service V2 (process_danfe)
 * - Boleto Service (process_boleto — Etapa 2.2A)
 * - Comprovante (GAP 2.2B Declarado)
 */

import { supabase } from "@/integrations/supabase/client";
import { classifyDocument, type WalletDocumentInput } from "../types/document";
import type { DanfeSessionState } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";
import type { BoletoExtractedData } from "../../../../supabase/functions/_shared/ai/boleto-service";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";

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
  const classification = classifyDocument(input.fileName, input.mimeType, input.textContext);

  // ── 1. BOLETO (Etapa 2.2A — Extração e Validação Determinística) ─────────────
  if (classification.tipo === "BOLETO") {
    try {
      const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
        body: {
          action: "process_boleto",
          base64: input.base64,
          mime_type: input.mimeType,
          workspace_id: input.workspaceId,
          conversation_id: input.conversationId,
        },
      });

      if (!error && data?.mensagemFormatada) {
        const isValido = data.status === "validado" || data.status === "validado_com_alerta";
        let actionProposal: ActionProposal | undefined;

        if (isValido && data.dados) {
          actionProposal = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            workspaceId: input.workspaceId,
            userId: "",
            actionType: "create_debt",
            actionVersion: "1.0",
            summary: `Cadastrar Boleto: ${data.dados.beneficiario || "Boleto Bancário"} - R$ ${(data.dados.valor_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            payload: {
              descricao: `Boleto ${data.dados.beneficiario || ""}`.trim() || "Boleto a Pagar",
              valor: data.dados.valor_total || 0,
              data_vencimento: data.dados.data_vencimento || "",
              linha_digitavel: data.dados.linha_digitavel || "",
              codigo_barras: data.dados.codigo_barras || "",
              banco: data.dados.banco_nome || data.dados.banco_codigo || "",
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
          content: data.mensagemFormatada,
          boletoDados: data.dados,
          actionProposal,
        };
      }
    } catch {
      // Fallback gracioso se a edge function estiver offline
    }

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

  // ── 2. COMPROVANTE (GAP Etapa 2.2B Declarado) ──────────────────────────────
  if (classification.tipo === "COMPROVANTE") {
    const msg = [
      `🧾 **Comprovante de Pagamento Identificado**`,
      ``,
      `• **Arquivo:** ${input.fileName}`,
      `• **Tipo:** Comprovante / Recibo`,
      ``,
      `ℹ️ *A conciliação automática de comprovantes com contas bancárias e extrato será ativada na Etapa 2.2B.*`,
      ``,
      `🔒 *Nenhuma alteração foi realizada nas suas contas.*`,
    ].join("\n");

    return { tipo: "COMPROVANTE", status: "pendente", content: msg };
  }

  // ── 3. DANFE FISCAL SERVICE V2 (Backend Edge Function) ───────────────────
  if (classification.tipo === "DANFE") {
    try {
      const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
        body: {
          action: "process_danfe",
          base64: input.base64,
          mime_type: input.mimeType,
          workspace_id: input.workspaceId,
          conversation_id: input.conversationId,
        },
      });

      if (!error && data?.mensagemFormatada) {
        const isSucesso = data.status === "sucesso";
        let actionProposal: ActionProposal | undefined;

        if (isSucesso) {
          const numNota = data.cabecalho?.numero_nota || data.sessionState?.numeroNf || "S/N";
          const fornecedor = data.cabecalho?.emitente_razao_social || data.sessionState?.fornecedor || "Fornecedor";
          const valorTotal = data.valores_totais?.valor_total_nota || data.sessionState?.valorProdutosDeclarado || 0;

          actionProposal = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            workspaceId: input.workspaceId,
            userId: "",
            actionType: "import_invoice",
            actionVersion: "1.0",
            summary: `Importar NF ${numNota} (${fornecedor}) - R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            payload: {
              numero_nota: numNota,
              fornecedor,
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
          content: data.mensagemFormatada,
          sessionState: data.sessionState,
          actionProposal,
        };
      }
    } catch {
      // Fallback gracioso se a edge function estiver offline
    }

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

  // ── 4. OUTRO / DESCONHECIDO ───────────────────────────────────────────────
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
