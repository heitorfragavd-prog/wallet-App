/**
 * financial-deduplication.ts
 *
 * Motor de Deduplicação Global Trilateral do Wallet CEO (Etapa 11 - Gate 6).
 * Reconhece e previne duplicidades entre documentos originados de:
 * 1. Gmail (e-mails com boletos, faturas, XML ou DANFE)
 * 2. Telegram (fotos de boletos, PDFs enviados em grupos ou privado)
 * 3. Upload Manual no Aplicativo Web (arrastar/soltar na Central de Conversas ou Dívidas)
 *
 * Regras:
 * - Idempotente e Fail-Closed.
 * - Nunca exclui registros históricos para resolver duplicidades.
 * - Preserva a rastreabilidade da fonte original.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export interface DuplicateCheckParams {
  workspaceId: string;
  linhaDigitavel?: string | null;
  codigoBarras?: string | null;
  chaveAcesso?: string | null;
  numeroNota?: string | null;
  cnpjEmitente?: string | null;
  valor?: number | null;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  source?: "dividas" | "proposal" | "gmail" | "outro";
  existingRecordId?: string;
  matchedField?: "linha_digitavel" | "codigo_barras" | "chave_acesso" | "numero_nota_cnpj";
  details?: string;
}

export async function findGlobalFinancialDuplicate(
  supabase: SupabaseClient,
  params: DuplicateCheckParams
): Promise<DuplicateCheckResult> {
  const { workspaceId, linhaDigitavel, codigoBarras, chaveAcesso, numeroNota, cnpjEmitente } = params;

  if (!workspaceId) {
    throw new Error("[financial-deduplication] workspaceId é obrigatório para verificação de duplicidade.");
  }

  try {
    // ─── 1. Checagem em DIVIDAS (Contas a pagar cadastradas ou já quitadas) ───
    if (linhaDigitavel || codigoBarras) {
      let divQuery = supabase
        .from("dividas")
        .select("id, status, descricao, valor_total")
        .eq("workspace_id", workspaceId);

      const orFilters: string[] = [];
      if (linhaDigitavel) {
        orFilters.push(`linha_digitavel.eq.${linhaDigitavel}`);
      }
      if (codigoBarras) {
        orFilters.push(`codigo_barras.eq.${codigoBarras}`);
      }

      divQuery = divQuery.or(orFilters.join(","));
      const { data: divData, error: divErr } = await divQuery.limit(1);

      if (divErr) {
        console.error("[financial-deduplication] Erro ao consultar dividas:", divErr);
        throw new Error(`Falha na consulta de duplicidade em dividas: ${divErr.message}`);
      }

      if (divData && divData.length > 0) {
        return {
          isDuplicate: true,
          source: "dividas",
          existingRecordId: divData[0].id,
          matchedField: linhaDigitavel ? "linha_digitavel" : "codigo_barras",
          details: `Documento já cadastrado como dívida (${divData[0].descricao || "Dívida"} - Status: ${divData[0].status}).`,
        };
      }
    }

    // ─── 2. Checagem em WALLET_AI_ACTION_PROPOSALS (Propostas ativas: prepared, confirmed, executed) ───
    // A: Por Linha Digitável
    if (linhaDigitavel) {
      const { data: propLinha, error: propLinhaErr } = await supabase
        .from("wallet_ai_action_proposals")
        .select("id, status, summary")
        .eq("workspace_id", workspaceId)
        .neq("status", "cancelled")
        .contains("payload", { linha_digitavel: linhaDigitavel })
        .limit(1);

      if (propLinhaErr) {
        console.error("[financial-deduplication] Erro ao consultar propostas por linha:", propLinhaErr);
        throw new Error(`Falha na consulta de propostas por linha: ${propLinhaErr.message}`);
      }

      if (propLinha && propLinha.length > 0) {
        return {
          isDuplicate: true,
          source: "proposal",
          existingRecordId: propLinha[0].id,
          matchedField: "linha_digitavel",
          details: `Proposta de ação já existente para este boleto (Status: ${propLinha[0].status}).`,
        };
      }
    }

    // B: Por Código de Barras
    if (codigoBarras) {
      const { data: propBarras, error: propBarrasErr } = await supabase
        .from("wallet_ai_action_proposals")
        .select("id, status, summary")
        .eq("workspace_id", workspaceId)
        .neq("status", "cancelled")
        .contains("payload", { codigo_barras: codigoBarras })
        .limit(1);

      if (propBarrasErr) {
        console.error("[financial-deduplication] Erro ao consultar propostas por código de barras:", propBarrasErr);
        throw new Error(`Falha na consulta de propostas por código de barras: ${propBarrasErr.message}`);
      }

      if (propBarras && propBarras.length > 0) {
        return {
          isDuplicate: true,
          source: "proposal",
          existingRecordId: propBarras[0].id,
          matchedField: "codigo_barras",
          details: `Proposta de ação já existente para este código de barras (Status: ${propBarras[0].status}).`,
        };
      }
    }

    // C: Por Chave de Acesso da NF-e (44 dígitos)
    if (chaveAcesso && chaveAcesso.length === 44) {
      const { data: propDanfe, error: propDanfeErr } = await supabase
        .from("wallet_ai_action_proposals")
        .select("id, status, summary")
        .eq("workspace_id", workspaceId)
        .neq("status", "cancelled")
        .contains("payload", { chave_acesso: chaveAcesso })
        .limit(1);

      if (propDanfeErr) {
        console.error("[financial-deduplication] Erro ao consultar propostas por chave de acesso:", propDanfeErr);
        throw new Error(`Falha na consulta de propostas por chave de acesso: ${propDanfeErr.message}`);
      }

      if (propDanfe && propDanfe.length > 0) {
        return {
          isDuplicate: true,
          source: "proposal",
          existingRecordId: propDanfe[0].id,
          matchedField: "chave_acesso",
          details: `Nota fiscal eletrônica já possui proposta registrada no workspace (Chave: ${chaveAcesso}).`,
        };
      }
    }

    // D: Por Número da Nota + CNPJ do Emitente
    if (numeroNota && cnpjEmitente) {
      const { data: propNota, error: propNotaErr } = await supabase
        .from("wallet_ai_action_proposals")
        .select("id, status, summary")
        .eq("workspace_id", workspaceId)
        .neq("status", "cancelled")
        .contains("payload", { numero_nota: numeroNota, cnpj_emitente: cnpjEmitente })
        .limit(1);

      if (propNotaErr) {
        console.error("[financial-deduplication] Erro ao consultar propostas por número de nota/CNPJ:", propNotaErr);
        throw new Error(`Falha na consulta de propostas por número de nota/CNPJ: ${propNotaErr.message}`);
      }

      if (propNota && propNota.length > 0) {
        return {
          isDuplicate: true,
          source: "proposal",
          existingRecordId: propNota[0].id,
          matchedField: "numero_nota_cnpj",
          details: `Nota Fiscal nº ${numeroNota} do emitente CNPJ ${cnpjEmitente} já possui proposta em andamento.`,
        };
      }
    }

    return { isDuplicate: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[financial-deduplication] Falha na verificação de duplicidade (FAIL-CLOSED):", msg);
    throw err;
  }
}
