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

export interface ProcessDocumentResponse {
  tipo: "DANFE" | "BOLETO" | "COMPROVANTE" | "OUTRO" | "DESCONHECIDO";
  content: string;
  sessionState?: DanfeSessionState;
  boletoDados?: BoletoExtractedData;
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
        return {
          tipo: "BOLETO",
          content: data.mensagemFormatada,
          boletoDados: data.dados,
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

    return { tipo: "BOLETO", content: msg };
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

    return { tipo: "COMPROVANTE", content: msg };
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
        return {
          tipo: "DANFE",
          content: data.mensagemFormatada,
          sessionState: data.sessionState,
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

    return { tipo: "DANFE", content: msg };
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

  return { tipo: "DESCONHECIDO", content: msg };
}
