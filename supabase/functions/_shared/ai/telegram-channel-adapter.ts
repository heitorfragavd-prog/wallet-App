import type { ActionProposal } from "./action-types.ts";
import type { AiExecutionContext } from "./auth.ts";
import {
  cleanDigits,
  validateLinhaDigitavel,
  normalizeDate,
} from "./boleto-validator.ts";
import { prepareActionProposal } from "./action-gateway.ts";
import type {
  ActionRepository,
  ActionDatabaseMutator,
  AuditEventSinkLike,

} from "./action-gateway.ts";
import {
  runOrchestratorTurn,
  type LlmRunner,
} from "./orchestrator-core.ts";
import {
  createQueryToolCatalog,
  type FinancialQueryRepository,
} from "./query-tools.ts";
import {
  processDocumentPipeline,
  type ProcessDocumentPipelineInput,
  type ProcessDocumentPipelineResult,
} from "./document-pipeline.ts";
import {
  OperationsAgent,
  createSupabaseOperationsRepository,
} from "./operations-agent.ts";
import { calculateEstimatedCost } from "./cost-calculator.ts";
import { redactSensitiveAiData } from "./audit-observability.ts";
import {
  type ConversationRepository,
  buildTurnContext,
  DEFAULT_RECENT_MESSAGES,
  shouldSummarizeConversation,
  generateConversationSummary,
  type SummarizerRunner,
  SUMMARIZATION_THRESHOLD_MESSAGES,
} from "./memory-core.ts";
import { DEFAULT_SUMMARY_MODEL } from "./model-policy.ts";
import { FINANCIAL_AGENT_SYSTEM_PROMPT, type LlmMessage } from "./orchestrator-core.ts";

// ─── TIPOS DO TELEGRAM ────────────────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id?: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  voice?: TelegramVoice;
  audio?: TelegramVoice;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface ResolvedTelegramIdentity {
  authorized: boolean;
  userId?: string;
  workspaceId?: string;
  userRole?: string; // 'owner' | 'admin' | 'member' | 'viewer'
  userName?: string;
  error?: string;
  errorCode?: "UNAUTHORIZED" | "NOT_LINKED" | "GROUP_NOT_CONFIGURED" | "NO_WORKSPACE" | "FORBIDDEN" | "NEED_WORKSPACE_SELECTION";
}

// ─── CACHE DE IDEMPOTÊNCIA DE UPDATE_ID (TELEGRAM REPLAY PROTECTION) ──────────

const PROCESSED_UPDATE_CACHE = new Map<number, number>();
const MAX_UPDATE_CACHE_SIZE = 5000;
const UPDATE_CACHE_TTL_MS = 3600 * 1000; // 1 hora de retenção

export function isTelegramUpdateProcessed(updateId?: number): boolean {
  if (!updateId) return false;
  const now = Date.now();
  const timestamp = PROCESSED_UPDATE_CACHE.get(updateId);
  if (!timestamp) return false;
  if (now - timestamp > UPDATE_CACHE_TTL_MS) {
    PROCESSED_UPDATE_CACHE.delete(updateId);
    return false;
  }
  return true;
}

export function markTelegramUpdateProcessed(updateId?: number): void {
  if (!updateId) return;
  if (PROCESSED_UPDATE_CACHE.size >= MAX_UPDATE_CACHE_SIZE) {
    const oldestKey = PROCESSED_UPDATE_CACHE.keys().next().value;
    if (oldestKey !== undefined) PROCESSED_UPDATE_CACHE.delete(oldestKey);
  }
  PROCESSED_UPDATE_CACHE.set(updateId, Date.now());
}

export function clearTelegramUpdateCache(): void {
  PROCESSED_UPDATE_CACHE.clear();
}

// ─── IDEMPOTÊNCIA DISTRIBUÍDA (EDGE MULTI-INSTÂNCIA) ──────────────────────────

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hora entre expurgos oportunísticos

export interface TelegramIdempotencyRepository {
  /**
   * Reivindica atomicamente o processamento de um update_id do Telegram.
   * Retorna:
   * - true: reivindicação bem-sucedida (primeira vez que este update é visto)
   * - false: já reivindicado anteriormente (replay detectado - deve ser descartado)
   * Lança exceção se o repositório falhar (FAIL-CLOSED: banco indisponível, timeout, erro de rede).
   */
  claimUpdate(updateId: number, botId?: string, chatId?: number): Promise<boolean>;
}

export class SupabaseTelegramIdempotencyRepository implements TelegramIdempotencyRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly client: any) {}

  async claimUpdate(updateId: number, botId = "default", chatId?: number): Promise<boolean> {
    // 1. Otimização L1 (leitura rápida em memória na mesma instância)
    if (isTelegramUpdateProcessed(updateId)) {
      return false; // Replay já registrado localmente
    }

    // 2. Limpeza oportunística não-bloqueante de registros expirados (> 48h)
    const now = Date.now();
    if (now - lastCleanupAt > CLEANUP_INTERVAL_MS) {
      lastCleanupAt = now;
      try {
        Promise.resolve(
          this.client
            .from("telegram_processed_updates")
            .delete()
            .lt("expires_at", new Date(now).toISOString()),
        ).catch((cleanErr: unknown) => {
          const msg = cleanErr instanceof Error ? cleanErr.message : String(cleanErr);
          console.warn("[telegram-idempotency] Cleanup oportunístico falhou:", msg);
        });
      } catch {
        // Safe fire-and-forget
      }
    }

    // 3. Reivindicação atômica no banco de dados (distribuído)
    try {
      const res = await this.client
        .from("telegram_processed_updates")
        .insert({
          update_id: updateId,
          bot_id: botId,
          chat_id: chatId ?? null,
        })
        .select("update_id")
        .maybeSingle();

      const data = res?.data;
      const error = res?.error;

      // 4. Se o banco retornou erro de chave duplicada (23505) ou similar:
      if (error) {
        if (
          error.code === "23505" ||
          error.message?.includes("duplicate") ||
          error.message?.includes("unique") ||
          error.message?.includes("already exists")
        ) {
          // Marca no cache local L1 também para otimizar futuras checagens locais
          markTelegramUpdateProcessed(updateId);
          return false; // Replay detectado no banco
        }

        // FAIL-CLOSED: Qualquer outro erro de banco rejeita o claim e propaga o erro
        console.error("[telegram-idempotency] Erro no banco durante claimUpdate (FAIL-CLOSED):", error);
        throw new Error(`DB_IDEMPOTENCY_CLAIM_FAILED: ${error.message || "Unknown database error"}`);
      }

      // Se inseriu com sucesso, é o primeiro processamento (claim bem-sucedido)
      if (data) {
        markTelegramUpdateProcessed(updateId);
        return true;
      }

      return false;
    } catch (dbEx: unknown) {
      // FAIL-CLOSED: Queda de banco/rede lançada como exceção fatal para impedir processamento
      console.error("[telegram-idempotency] Exceção de rede no claim distribuído (FAIL-CLOSED):", dbEx);
      const msg = dbEx instanceof Error ? dbEx.message : "Erro de conexão com o banco";
      throw new Error(`DB_IDEMPOTENCY_CLAIM_FAILED: ${msg}`);
    }
  }
}

// ─── CLIENTE TELEGRAM API ─────────────────────────────────────────────────────

export interface TelegramApiClient {
  sendMessage(params: {
    chatId: string | number;
    text: string;
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    inlineKeyboard?: TelegramInlineButton[][];
  }): Promise<{ message_id?: number; ok?: boolean }>;
  editMessageText(params: {
    chatId: string | number;
    messageId: number;
    text: string;
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  }): Promise<{ ok?: boolean }>;
  editMessageReplyMarkup(params: {
    chatId: string | number;
    messageId: number;
    inlineKeyboard?: TelegramInlineButton[][];
  }): Promise<{ ok?: boolean }>;
  answerCallbackQuery(params: {
    callbackQueryId: string;
    text?: string;
    showAlert?: boolean;
  }): Promise<{ ok?: boolean }>;
  downloadFileAsBase64(fileId: string): Promise<{ base64: string; mimeType?: string; size?: number } | null>;
  transcribeAudio?(fileId: string, mimeType?: string): Promise<string | null>;
}

export function createDefaultTelegramApiClient(
  botToken: string,
  openaiApiKey?: string,
): TelegramApiClient {
  return {
    async sendMessage({ chatId, text, parseMode = "HTML", inlineKeyboard }) {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      };
      if (inlineKeyboard && inlineKeyboard.length > 0) {
        body.reply_markup = { inline_keyboard: inlineKeyboard };
      }
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let result = await resp.json().catch(() => ({ ok: false }));
      if (!resp.ok && parseMode) {
        const desc = (result as Record<string, unknown>)?.description || "";
        if (typeof desc === "string" && (desc.includes("parse entities") || desc.includes("can't parse") || resp.status === 400)) {
          console.warn("[telegram-adapter] Erro de parsing Telegram HTML. Executando fallback plain text:", desc);
          const fallbackBody = { ...body };
          delete fallbackBody.parse_mode;
          const fallbackResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackBody),
          });
          result = await fallbackResp.json().catch(() => ({ ok: false }));
        }
      }
      return result;
    },

    async editMessageText({ chatId, messageId, text, parseMode = "HTML" }) {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: parseMode,
        }),
      });
      return await resp.json().catch(() => ({ ok: false }));
    },

    async editMessageReplyMarkup({ chatId, messageId, inlineKeyboard = [] }) {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: inlineKeyboard },
        }),
      });
      return await resp.json().catch(() => ({ ok: false }));
    },

    async answerCallbackQuery({ callbackQueryId, text, showAlert = false }) {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        }),
      });
      return await resp.json().catch(() => ({ ok: false }));
    },

    async downloadFileAsBase64(fileId: string) {
      try {
        const fileInfoResp = await fetch(
          `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
        );
        const fileInfo = await fileInfoResp.json();
        if (!fileInfo.ok || !fileInfo.result?.file_path) {
          return null;
        }

        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
        const fileDownloadResp = await fetch(fileUrl);
        const arrayBuf = await fileDownloadResp.arrayBuffer();

        const uint8 = new Uint8Array(arrayBuf);
        let binary = "";
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);

        return {
          base64,
          size: arrayBuf.byteLength,
          mimeType: fileInfo.result.file_path.endsWith(".pdf")
            ? "application/pdf"
            : "image/jpeg",
        };
      } catch (err) {
        console.error("[telegram-adapter] Erro ao baixar arquivo do Telegram:", err);
        return null;
      }
    },

    async transcribeAudio(fileId: string) {
      if (!openaiApiKey) return null;
      try {
        const fileInfoResp = await fetch(
          `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
        );
        const fileInfo = await fileInfoResp.json();
        if (!fileInfo.ok || !fileInfo.result?.file_path) return null;

        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
        const fileDownload = await fetch(fileUrl);
        const audioBlob = await fileDownload.blob();

        const formData = new FormData();
        formData.append("file", audioBlob, "audio.ogg");
        formData.append("model", "whisper-1");
        formData.append("language", "pt");

        const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: formData,
        });

        const data = await whisperResp.json();
        return data?.text ?? null;
      } catch (err) {
        console.error("[telegram-adapter] Erro ao transcrever áudio Whisper:", err);
        return null;
      }
    },
  };
}

// ─── UTILITÁRIOS DE FORMATAÇÃO ────────────────────────────────────────────────

/**
 * Sanitiza mensagens de erro técnicas para exibição clara e amigável ao usuário do Telegram.
 * Remove códigos internos de erro como [WALLET_AI_...] ou Error: e substitui mensagens técnicas
 * por instruções claras em português.
 */
export function sanitizeUserFacingErrorMessage(rawMessage: string | null | undefined): string {
  if (!rawMessage) return "Ocorreu um erro no processamento. Por favor, tente novamente.";

  let cleaned = String(rawMessage).trim();

  // Remove códigos entre colchetes como [WALLET_AI_ACTION_INVALID]
  cleaned = cleaned.replace(/^\[WALLET_AI_[A-Z0-9_]+\]\s*/i, "");
  cleaned = cleaned.replace(/^Error:\s*/i, "");

  // Mapeamentos específicos amigáveis
  if (/Data inválida para o campo data_vencimento/i.test(cleaned) || /inválida no calendário/i.test(cleaned)) {
    return "A data de vencimento do boleto é inválida no calendário ou não pôde ser confirmada.";
  }
  if (/Valor do boleto deve ser maior que zero/i.test(cleaned)) {
    return "O valor identificado para o boleto é inválido ou igual a zero.";
  }
  if (/Beneficiário do boleto não identificado/i.test(cleaned)) {
    return "Não foi possível identificar com clareza o beneficiário deste boleto.";
  }
  if (/Validação FEBRABAN do código de barras/i.test(cleaned)) {
    return "A linha digitável ou código de barras não passou na validação bancária FEBRABAN.";
  }
  if (/WALLET_AI_DOCUMENT_UNTRUSTED_CONTENT/i.test(rawMessage)) {
    return "O documento contém instruções suspeitas ou formato não autorizado.";
  }
  if (/WALLET_AI_DOCUMENT_DUPLICATE/i.test(rawMessage)) {
    return "Este documento já foi registrado anteriormente.";
  }

  return cleaned || "Ocorreu uma falha inesperada no processamento.";
}
export function escapeTelegramHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatCurrencyBrl(val: unknown): string {
  if (val == null) return "R$ 0,00";
  const n = Number(val);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00A0/g, " ");
}

export function markdownToTelegramHtml(md: string): string {
  if (!md) return "";

  // Protege blocos de código com placeholders imunes a sublinhado/asterisco
  const codeBlocks: string[] = [];
  let converted = md.replace(/```([\s\S]*?)```/g, (_match, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeTelegramHtml(code.trim())}</code></pre>`);
    return `%%CODEBLOCK${idx}%%`;
  });

  const inlineCodes: string[] = [];
  converted = converted.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeTelegramHtml(code)}</code>`);
    return `%%INLINECODE${idx}%%`;
  });

  // Converte formatação básica
  converted = escapeTelegramHtml(converted);

  // Bold (**text** ou __text__)
  converted = converted.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  converted = converted.replace(/__([^_]+)__/g, "<b>$1</b>");

  // Italic (*text* ou _text_)
  converted = converted.replace(/\*([^*]+)\*/g, "<i>$1</i>");
  converted = converted.replace(/_([^_]+)_/g, "<i>$1</i>");

  // Restaura blocos de código
  codeBlocks.forEach((block, idx) => {
    converted = converted.replace(`%%CODEBLOCK${idx}%%`, block);
  });
  inlineCodes.forEach((inline, idx) => {
    converted = converted.replace(`%%INLINECODE${idx}%%`, inline);
  });

  return converted;
}

export function formatProposalMessage(proposal: ActionProposal): {
  text: string;
  buttons: TelegramInlineButton[][];
} {
  const p = proposal.payload || {};

  // Formatação específica para boletos identificados (Requisito 4)
  if (proposal.actionType === "cadastrar_divida_boleto") {
    const beneficiario = p.beneficiario || p.credor || "Beneficiário do Boleto";
    const valor = Number(p.valor_total ?? p.valor ?? 0);
    const vencimento = p.data_vencimento || p.vencimento || "N/A";
    const linhaDigitavel = p.linha_digitavel || p.codigo_barras || "Validada via FEBRABAN";

    const lines: string[] = [
      `📄 <b>Boleto identificado</b>`,
      ``,
      `🏢 <b>Beneficiário:</b> ${escapeTelegramHtml(String(beneficiario))}`,
      `💰 <b>Valor:</b> ${formatCurrencyBrl(valor)}`,
      `🗓️ <b>Vencimento:</b> ${escapeTelegramHtml(String(vencimento))}`,
      `🔢 <b>Linha digitável validada:</b> <code>${escapeTelegramHtml(String(linhaDigitavel))}</code>`,
      `⏳ <b>Status:</b> Aguardando confirmação`,
      ``,
      `<i>Clique abaixo para cadastrar esta dívida pendente na sua carteira.</i>`,
    ];

    const buttons: TelegramInlineButton[][] = [
      [
        { text: "✅ Cadastrar boleto", callback_data: `confirm_prop:${proposal.id}` },
        { text: "❌ Cancelar", callback_data: `cancel_prop:${proposal.id}` },
      ],
    ];

    return {
      text: lines.join("\n"),
      buttons,
    };
  }

  const valor = p.valor || p.valor_total || p.valor_alvo || p.novo_custo || 0;
  const data = p.data || p.data_vencimento || p.data_limite || "N/A";
  const desc = p.descricao || p.titulo || p.nome || proposal.summary;
  const cat = p.categoria || p.categoria_id || "Geral";

  let riskEmoji = "🟡";
  if (proposal.riskLevel === "LOW") riskEmoji = "🟢";
  if (proposal.riskLevel === "HIGH") riskEmoji = "🔴";

  const lines: string[] = [
    `📋 <b>Proposta de Ação: ${escapeTelegramHtml(proposal.actionType)}</b>`,
    ``,
    `📝 <b>Descrição:</b> ${escapeTelegramHtml(String(desc))}`,
    `💰 <b>Valor:</b> ${formatCurrencyBrl(valor)}`,
    `🗓️ <b>Data:</b> ${escapeTelegramHtml(String(data))}`,
    `📁 <b>Categoria:</b> ${escapeTelegramHtml(String(cat))}`,
    `${riskEmoji} <b>Nível de Risco:</b> ${proposal.riskLevel}`,
    ``,
    `<i>⚠️ Nenhuma alteração foi realizada ainda. Confirme abaixo para executar no seu workspace.</i>`,
  ];

  const buttons: TelegramInlineButton[][] = [
    [
      { text: "✅ Confirmar", callback_data: `confirm_prop:${proposal.id}` },
      { text: "❌ Cancelar", callback_data: `cancel_prop:${proposal.id}` },
    ],
  ];

  return {
    text: lines.join("\n"),
    buttons,
  };
}

// ─── IDENTIFICAÇÃO E RBAC (FAIL-CLOSED) ────────────────────────────────────────

export async function resolveTelegramIdentity(
  params: {
    telegramUserId?: string | number;
    telegramChatId?: string | number;
    isGroup: boolean;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<ResolvedTelegramIdentity> {
  const { telegramUserId, telegramChatId, isGroup } = params;

  if (!telegramUserId && !telegramChatId) {
    return {
      authorized: false,
      errorCode: "UNAUTHORIZED",
      error: "Identificador de usuário ou chat ausente na requisição.",
    };
  }

  let matchedUserId: string | null = null;
  let matchedWorkspaceId: string | null = null;
  let matchedAccessLevel: string | null = null;
  let userName: string | null = null;

  // 1. Consulta em channel_mappings (prioridade canônica)
  if (telegramUserId) {
    const { data: cmUser } = await supabase
      .from("channel_mappings")
      .select("user_id, workspace_id, access_level, is_active, nome_exibicao")
      .eq("channel_type", "telegram")
      .eq("channel_id", String(telegramUserId))
      .eq("is_active", true)
      .maybeSingle();

    if (cmUser?.user_id) {
      matchedUserId = cmUser.user_id;
      matchedWorkspaceId = cmUser.workspace_id;
      matchedAccessLevel = cmUser.access_level;
      userName = cmUser.nome_exibicao;
    }
  }

  if (!matchedUserId && telegramChatId && !isGroup) {
    const { data: cmChat } = await supabase
      .from("channel_mappings")
      .select("user_id, workspace_id, access_level, is_active, nome_exibicao")
      .eq("channel_type", "telegram")
      .eq("channel_id", String(telegramChatId))
      .eq("is_active", true)
      .maybeSingle();

    if (cmChat?.user_id) {
      matchedUserId = cmChat.user_id;
      matchedWorkspaceId = cmChat.workspace_id;
      matchedAccessLevel = cmChat.access_level;
      userName = cmChat.nome_exibicao;
    }
  }

  // 2. Consulta em usuarios_telegram (fallback legado autenticado)
  if (!matchedUserId && telegramUserId) {
    const { data: utUser } = await supabase
      .from("usuarios_telegram")
      .select("user_id, telegram_username, ativo")
      .eq("telegram_chat_id", String(telegramUserId))
      .eq("ativo", true)
      .maybeSingle();

    if (utUser?.user_id) {
      matchedUserId = utUser.user_id;
      userName = utUser.telegram_username;
    }
  }

  if (!matchedUserId && telegramChatId && !isGroup) {
    const { data: utChat } = await supabase
      .from("usuarios_telegram")
      .select("user_id, telegram_username, ativo")
      .eq("telegram_chat_id", String(telegramChatId))
      .eq("ativo", true)
      .maybeSingle();

    if (utChat?.user_id) {
      matchedUserId = utChat.user_id;
      userName = utChat.telegram_username;
    }
  }

  // FAIL-CLOSED: Se o usuário não foi identificado em nenhuma tabela autenticada
  if (!matchedUserId) {
    return {
      authorized: false,
      errorCode: "NOT_LINKED",
      error:
        "Sua conta do Telegram ainda não está vinculada à Wallet. Envie /start no privado do bot para vincular.",
    };
  }

  // 3. Resolução de Workspace & Grupo
  if (isGroup) {
    if (!telegramChatId) {
      return {
        authorized: false,
        errorCode: "GROUP_NOT_CONFIGURED",
        error: "Identificador de chat do grupo não informado.",
      };
    }

    const { data: grupoConfig } = await supabase
      .from("telegram_grupos_config")
      .select("workspace_id, chat_id")
      .eq("chat_id", String(telegramChatId))
      .maybeSingle();

    if (!grupoConfig?.workspace_id) {
      return {
        authorized: false,
        errorCode: "GROUP_NOT_CONFIGURED",
        error:
          "Este grupo do Telegram ainda não está configurado na Wallet. Solicite ao administrador vincular o grupo.",
      };
    }

    matchedWorkspaceId = grupoConfig.workspace_id;

    // Valida se o usuário que enviou a mensagem pertence ao workspace do grupo
    const { data: member } = await supabase
      .from("workspace_members")
      .select("role, status")
      .eq("workspace_id", matchedWorkspaceId)
      .eq("user_id", matchedUserId)
      .eq("status", "active")
      .maybeSingle();

    const { data: wsOwner } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", matchedWorkspaceId)
      .eq("user_id", matchedUserId)
      .maybeSingle();

    if (!member && !wsOwner) {
      return {
        authorized: false,
        errorCode: "FORBIDDEN",
        error: "Você não possui permissão de acesso ao workspace deste grupo.",
      };
    }

    const role = wsOwner ? "owner" : (member?.role || "member");
    return {
      authorized: true,
      userId: matchedUserId,
      workspaceId: matchedWorkspaceId,
      userRole: role,
      userName: userName || undefined,
    };
  }

  // 4. Resolução de Workspace em Chat Privado
  if (!matchedWorkspaceId) {
    // 4.1 Verifica preferência salva em channel_mappings (channel_config)
    if (telegramUserId || telegramChatId) {
      const { data: cmCfg } = await supabase
        .from("channel_mappings")
        .select("channel_config")
        .eq("channel_type", "telegram")
        .eq("channel_id", String(telegramUserId || telegramChatId))
        .eq("is_active", true)
        .maybeSingle();

      const savedWs = cmCfg?.channel_config?.selected_workspace_id || cmCfg?.channel_config?.workspace_id;
      if (savedWs) {
        matchedWorkspaceId = savedWs;
      }
    }
  }

  if (!matchedWorkspaceId) {
    // 4.2 Coleta todos os workspaces aos quais o usuário pertence (dono ou membro ativo)
    const { data: ownedWs } = await supabase
      .from("workspaces")
      .select("id")
      .eq("user_id", matchedUserId);

    const { data: memberWs } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", matchedUserId)
      .eq("status", "active");

    const allWorkspaces = new Map<string, string>(); // wsId -> role

    if (ownedWs && Array.isArray(ownedWs)) {
      for (const w of ownedWs) {
        if (w?.id) allWorkspaces.set(w.id, "owner");
      }
    }

    if (memberWs && Array.isArray(memberWs)) {
      for (const m of memberWs) {
        if (m?.workspace_id && !allWorkspaces.has(m.workspace_id)) {
          allWorkspaces.set(m.workspace_id, m.role || "member");
        }
      }
    }

    const totalWs = allWorkspaces.size;

    if (totalWs === 0) {
      return {
        authorized: false,
        errorCode: "NO_WORKSPACE",
        error: "Nenhum workspace ativo encontrado para esta conta.",
      };
    }

    if (totalWs === 1) {
      // Exatamente 1 workspace: auto-resolve
      const [singleWsId, singleRole] = Array.from(allWorkspaces.entries())[0];
      matchedWorkspaceId = singleWsId;
      matchedAccessLevel = singleRole;
    } else {
      // > 1 workspaces: NÃO escolher arbitrariamente!
      return {
        authorized: false,
        errorCode: "NEED_WORKSPACE_SELECTION",
        error:
          "Você possui múltiplos workspaces cadastrados. Selecione o workspace ativo nas configurações da Wallet antes de interagir via Telegram.",
      };
    }
  }

  // Converte access_level para papéis RBAC canônicos
  let resolvedRole = "member";
  if (matchedAccessLevel === "owner" || matchedAccessLevel === "socio") {
    resolvedRole = "owner";
  } else if (matchedAccessLevel === "admin") {
    resolvedRole = "admin";
  } else if (matchedAccessLevel === "viewer" || matchedAccessLevel === "leitor") {
    resolvedRole = "viewer";
  }

  return {
    authorized: true,
    userId: matchedUserId,
    workspaceId: matchedWorkspaceId,
    userRole: resolvedRole,
    userName: userName || undefined,
  };
}

// ─── DEPENDÊNCIAS DO ADAPTER ──────────────────────────────────────────────────

export interface TelegramAdapterDependencies {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  telegramBotToken: string;
  telegramApi?: TelegramApiClient;
  runnerFactory: (model?: string) => LlmRunner;
  repoFactory: (context: AiExecutionContext) => FinancialQueryRepository;
  proposalRepo: ActionRepository;
  conversationRepo?: ConversationRepository;
  mutator?: ActionDatabaseMutator;
  auditSink?: AuditEventSinkLike;
  documentPipelineRunner?: typeof processDocumentPipeline;
  openaiApiKey?: string;
  geminiApiKey?: string;
  geminiApiKeyBackup?: string;
  fetchFn?: typeof fetch;
  findDuplicateFn?: (
    context: AiExecutionContext,
    params: {
      workspaceId: string;
      chaveAcesso?: string;
      numeroNf?: string;
      cnpj?: string;
      linhaDigitavel?: string;
      codigoBarras?: string;
    },
  ) => Promise<{ isDuplicate: boolean; existingRecordId?: string; type?: string }>;
  operationsAgent?: OperationsAgent;
  operationsAgentFactory?: (context: AiExecutionContext) => OperationsAgent;
  idempotencyRepo?: TelegramIdempotencyRepository;
  allowMemoryOnlyIdempotency?: boolean;
}

// ─── MANIPULADORES DE MENSAGENS E EVENTOS ─────────────────────────────────────

/**
 * Processa mensagens de texto e perguntas financeiras via Wallet AI Orchestrator.
 * Consultas de leitura (READ) retornam resposta formatada.
 * Solicitações de alteração (WRITE) geram Action Proposals com botões inline de confirmação.
 */
export async function handleTelegramTextMessage(
  params: {
    text: string;
    identity: ResolvedTelegramIdentity;
    chatId: string | number;
    correlationId?: string;
  },
  deps: TelegramAdapterDependencies,
): Promise<{
  text: string;
  inlineKeyboard?: TelegramInlineButton[][];
  actionProposals?: ActionProposal[];
}> {
  const { text, identity } = params;

  if (!identity.authorized || !identity.userId || !identity.workspaceId) {
    return {
      text: identity.error || "Usuário ou chat não autorizado.",
    };
  }

  // ─── Interceptação Determinística de Linha Digitável Digitada / Corrigida Manualmente ───
  const digitsOnly = cleanDigits(text);
  if (digitsOnly.length >= 46 && digitsOnly.length <= 48) {
    const validacaoLinha = validateLinhaDigitavel(text);
    if (validacaoLinha.valido && validacaoLinha.valorDerivado && validacaoLinha.valorDerivado > 0) {
      // 1. Verificação de Duplicidade (FAIL-CLOSED)
      let isDup = false;
      if (deps.findDuplicateFn) {
        try {
          const dupRes = await deps.findDuplicateFn(
            { workspaceId: identity.workspaceId },
            {
              workspaceId: identity.workspaceId,
              linhaDigitavel: validacaoLinha.linhaLimpa,
              codigoBarras: validacaoLinha.codigoBarrasDerivado,
            }
          );
          if (dupRes?.isDuplicate) isDup = true;
        } catch {
          // Defensivo
        }
      }

      if (isDup) {
        return {
          text:
            `⚠️ <b>Boleto Duplicado Detectado!</b>\n\n` +
            `Este boleto (<code>${escapeTelegramHtml(validacaoLinha.linhaFormatada)}</code>) já foi registrado anteriormente no seu workspace.\n\n` +
            `<i>Para garantir a integridade financeira, nenhuma proposta em duplicidade foi gerada.</i>`,
        };
      }

      // 2. Criar Action Proposal Canônica (100% human-in-the-loop, sem execução direta)
      const numValor = validacaoLinha.valorDerivado;
      const dataVenc = validacaoLinha.dataVencimentoDerivada || new Date().toISOString().split("T")[0];
      const bancoNome = validacaoLinha.bancoNome || "Boleto Bancário";

      const proposal = prepareActionProposal({
        workspaceId: identity.workspaceId,
        userId: identity.userId,
        actionType: "cadastrar_divida_boleto",
        summary: `Cadastrar Boleto: ${bancoNome} - R$ ${numValor.toFixed(2)}`,
        payload: {
          beneficiario: bancoNome,
          banco: bancoNome,
          valor: numValor,
          valor_total: numValor,
          data_vencimento: dataVenc,
          linha_digitavel: validacaoLinha.linhaLimpa,
          codigo_barras: validacaoLinha.codigoBarrasDerivado,
          descricao: `Boleto ${bancoNome}`.trim(),
        },
      });

      if (deps.proposalRepo) {
        await deps.proposalRepo.saveProposal(proposal);
      }

      const formatted = formatProposalMessage(proposal);
      return {
        text: formatted.text,
        inlineKeyboard: formatted.buttons,
        actionProposals: [proposal],
      };
    } else if (!validacaoLinha.valido) {
      // Usuário forneceu expressamente uma linha digitável, mas os dígitos são matematicamente inválidos
      const errList = validacaoLinha.erros.map((e) => `• ${escapeTelegramHtml(e)}`).join("\n");
      return {
        text:
          `⚠️ <b>Linha Digitável Inválida</b>\n\n` +
          `A linha digitável informada não passou na validação matemática FEBRABAN:\n${errList}\n\n` +
          `<i>Por favor, confira os números digitados e tente novamente.</i>`,
      };
    }
  }

  const generatedTgCorrelationId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `tg_${crypto.randomUUID()}`
      : `tg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const context: AiExecutionContext = {
    userId: identity.userId,
    workspaceId: identity.workspaceId,
    userRole: identity.userRole,
    channel: "telegram",
    correlationId: params.correlationId || generatedTgCorrelationId,
  };

  const repo = deps.repoFactory(context);
  const operationsAgent =
    deps.operationsAgent ??
    (deps.operationsAgentFactory
      ? deps.operationsAgentFactory(context)
      : new OperationsAgent({
          repository: createSupabaseOperationsRepository(deps.supabase),
          auditSink: deps.auditSink,
        }));
  const catalog = createQueryToolCatalog(repo, { extended: true, operationsAgent });
  const runner = deps.runnerFactory();

  let conversationId: string | undefined;
  let turnMessages: LlmMessage[] = [{ role: "user", content: text }];

  if (deps.conversationRepo) {
    try {
      const conv = await deps.conversationRepo.createConversation({
        workspaceId: identity.workspaceId,
        userId: identity.userId,
        title: `Telegram Chat ${params.chatId}`,
        channel: "telegram",
      });
      conversationId = conv.id;
      const recent = await deps.conversationRepo.listRecentMessages(
        conversationId,
        identity.workspaceId,
        DEFAULT_RECENT_MESSAGES,
      );
      const historyAsLlm: LlmMessage[] = recent.map((m) => ({
        role: m.role as "user" | "assistant" | "system" | "tool",
        content: m.content,
        tool_calls: m.tool_calls as LlmMessage["tool_calls"],
      }));
      const ctxResult = buildTurnContext({
        systemPrompt: FINANCIAL_AGENT_SYSTEM_PROMPT,
        summary: conv.summary,
        historyMessages: historyAsLlm,
        currentMessage: { role: "user", content: text },
      });
      turnMessages = ctxResult.messages;
    } catch (err) {
      console.warn("[telegram-adapter] Erro ao carregar memória canônica:", err);
    }
  }

  const turnResult = await runOrchestratorTurn(
    turnMessages,
    context,
    catalog,
    runner,
  );

  // Persistência das mensagens na memória canônica se repositório ativo
  if (deps.conversationRepo && conversationId) {
    try {
      await deps.conversationRepo.appendMessage({
        conversationId,
        workspaceId: identity.workspaceId,
        userId: identity.userId,
        role: "user",
        content: text,
      });
      if (turnResult.finalMessage?.content) {
        await deps.conversationRepo.appendMessage({
          conversationId,
          workspaceId: identity.workspaceId,
          userId: identity.userId,
          role: "assistant",
          content: turnResult.finalMessage.content,
          tokensCount: turnResult.usage?.totalTokens ?? 0,
        });
      }

      // Ciclo de Sumarização Canônica do Telegram (Threshold -> Chamada -> Scoped Update -> Fail-safe)
      const msgCount = await deps.conversationRepo.countMessages(
        conversationId,
        identity.workspaceId,
      );
      if (
        shouldSummarizeConversation({
          messageCount: msgCount,
          estimatedTokens: turnResult.usage?.totalTokens,
        })
      ) {
        try {
          const recentAll = await deps.conversationRepo.listRecentMessages(
            conversationId,
            identity.workspaceId,
            SUMMARIZATION_THRESHOLD_MESSAGES + 5,
          );
          const historyForSummary = recentAll.map((m) => ({
            role: m.role,
            content: m.content,
          }));
          const summarizerRunner: SummarizerRunner = async (msgs, opts) => {
            const sumRunner = deps.runnerFactory(opts?.model || DEFAULT_SUMMARY_MODEL);
            const sumResp = await sumRunner.generateCompletion(msgs, []);
            return sumResp.message.content || "";
          };
          const newSummary = await generateConversationSummary({
            historyMessages: historyForSummary,
            runner: summarizerRunner,
            options: { correlationId: context.correlationId, model: DEFAULT_SUMMARY_MODEL },
          });
          if (newSummary && newSummary.trim()) {
            await deps.conversationRepo.updateSummary(
              conversationId,
              identity.workspaceId,
              identity.userId,
              newSummary.trim(),
            );
          }
        } catch (sumErr) {
          console.warn("[telegram-adapter] Falha ao resumir conversa:", sumErr);
        }
      }
    } catch (err) {
      console.warn("[telegram-adapter] Erro ao persistir mensagens:", err);
    }
  }

  // Telemetria de custo e auditoria canônica protegida por redaction
  if (deps.auditSink) {
    const estimatedCostUsd = calculateEstimatedCost("gpt-4o-mini", turnResult.usage);
    await deps.auditSink.logEvent({
      userId: identity.userId,
      workspaceId: identity.workspaceId,
      toolName: "wallet_ai_orchestrator_telegram",
      durationMs: 0,
      status: "success",
      metadata: redactSensitiveAiData({
        correlationId: context.correlationId,
        conversationId,
        channel: "telegram",
        tokens: turnResult.usage.totalTokens,
        estimatedCostUsd,
      }) as Record<string, unknown>,
    });
  }

  // Se foram geradas Action Proposals (intenção de escrita / WRITE)
  if (turnResult.actionProposals && turnResult.actionProposals.length > 0) {
    // Persiste todas as propostas no repositório canônico
    for (const proposal of turnResult.actionProposals) {
      await deps.proposalRepo.saveProposal(proposal);
    }

    const firstProposal = turnResult.actionProposals[0];
    const formatted = formatProposalMessage(firstProposal);

    let prefix = "";
    if (turnResult.finalMessage?.content) {
      prefix = `${markdownToTelegramHtml(turnResult.finalMessage.content)}\n\n`;
    }

    return {
      text: `${prefix}${formatted.text}`,
      inlineKeyboard: formatted.buttons,
      actionProposals: turnResult.actionProposals,
    };
  }

  // Consulta de leitura pura (READ)
  const replyContent = turnResult.finalMessage?.content || "Nenhuma informação encontrada.";
  return {
    text: markdownToTelegramHtml(replyContent),
  };
}

/**
 * Processa callbacks de botões inline do Telegram (`confirm_prop:<id>` e `cancel_prop:<id>`).
 * Revalida RBAC, isolamento e status atômico.
 */
export async function handleTelegramCallback(
  params: {
    callbackData: string;
    callbackQueryId: string;
    messageId?: number;
    chatId?: string | number;
    telegramUserId: string | number;
    isGroup?: boolean;
  },
  deps: TelegramAdapterDependencies,
): Promise<{
  answerText: string;
  updatedMessageText?: string;
  removeKeyboard: boolean;
}> {
  const { callbackData, telegramUserId, chatId } = params;

  let proposalId = "";
  let isConfirm = false;
  let isCancel = false;

  if (callbackData.startsWith("confirm_prop:")) {
    proposalId = callbackData.replace("confirm_prop:", "").trim();
    isConfirm = true;
  } else if (callbackData.startsWith("confirmar_proposta:")) {
    proposalId = callbackData.replace("confirmar_proposta:", "").trim();
    isConfirm = true;
  } else if (callbackData.startsWith("cancel_prop:")) {
    proposalId = callbackData.replace("cancel_prop:", "").trim();
    isCancel = true;
  } else if (callbackData.startsWith("cancelar_proposta:")) {
    proposalId = callbackData.replace("cancelar_proposta:", "").trim();
    isCancel = true;
  }

  if (!proposalId) {
    return {
      answerText: "Comando de proposta não reconhecido.",
      removeKeyboard: false,
    };
  }

  // 1. Re-identificação do usuário que clicou (RBAC) preservando o contexto do chat (grupo vs privado)
  const isGroup = params.isGroup ?? (chatId ? Number(chatId) < 0 : false);
  const identity = await resolveTelegramIdentity(
    { telegramUserId, telegramChatId: chatId, isGroup },
    deps.supabase,
  );

  if (!identity.authorized || !identity.userId || !identity.workspaceId) {
    return {
      answerText: `Acesso negado: ${identity.error || "sua conta não está autorizada."}`,
      removeKeyboard: false,
    };
  }

  // 2. Busca a proposta no repositório canônico
  const proposal = await deps.proposalRepo.getProposal(proposalId);
  if (!proposal) {
    return {
      answerText: "Proposta de ação não encontrada.",
      removeKeyboard: true,
    };
  }

  // 3. Isolamento de Tenant estrito: a proposta DEVE pertencer ao workspace resolvido
  if (proposal.workspaceId !== identity.workspaceId) {
    return {
      answerText: "Acesso negado: a proposta pertence a outro workspace.",
      removeKeyboard: true,
    };
  }

  // 4. Bloqueio incondicional de exclusão (deletar_transacao)
  if (proposal.actionType === "deletar_transacao") {
    return {
      answerText: "Ação de exclusão bloqueada por política de segurança.",
      updatedMessageText:
        "⚠️ <b>Ação Bloqueada:</b> Exclusões de transações são bloqueadas por política de segurança e não podem ser confirmadas via Telegram.",
      removeKeyboard: true,
    };
  }

  const context: AiExecutionContext = {
    userId: identity.userId,
    workspaceId: identity.workspaceId,
    userRole: identity.userRole,
    channel: "telegram",
    correlationId: `cb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  // 5. Fluxo de Cancelamento
  if (isCancel) {
    // Se já foi cancelada:
    if (proposal.status === "cancelled") {
      return {
        answerText: "Esta proposta já foi cancelada anteriormente.",
        updatedMessageText: "❌ <i>Esta proposta já havia sido cancelada anteriormente.</i>",
        removeKeyboard: true,
      };
    }
    // Se já foi confirmada ou executada:
    if (proposal.status !== "prepared") {
      return {
        answerText: `Não é possível cancelar uma proposta no status "${proposal.status}".`,
        updatedMessageText: `⚠️ <i>Esta proposta já foi processada (${proposal.status}) e não pode ser cancelada.</i>`,
        removeKeyboard: true,
      };
    }

    try {
      const cancelled = typeof deps.proposalRepo.cancelProposalAtomically === "function"
        ? await deps.proposalRepo.cancelProposalAtomically(proposalId, context)
        : (await deps.proposalRepo.updateStatus(proposalId, "cancelled"), true);

      if (!cancelled) {
        return {
          answerText: "Esta proposta já foi cancelada ou processada concorrentemente.",
          removeKeyboard: true,
        };
      }

      return {
        answerText: "Proposta cancelada.",
        updatedMessageText: "❌ <b>Proposta Cancelada</b>\n\nNenhuma alteração foi realizada na sua carteira.",
        removeKeyboard: true,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "falha na operação";
      return {
        answerText: `Erro ao cancelar: ${errMsg}`,
        removeKeyboard: true,
      };
    }
  }

  // 6. Fluxo de Confirmação
  if (isConfirm) {
    // Se já foi cancelada:
    if (proposal.status === "cancelled") {
      return {
        answerText: "⚠️ Esta proposta foi cancelada e não pode ser confirmada.",
        updatedMessageText: "❌ <i>Esta proposta foi cancelada anteriormente e não pode ser confirmada.</i>",
        removeKeyboard: true,
      };
    }
    // Se já foi confirmada ou executada (duplo clique / replay):
    if (proposal.status === "confirmed" || proposal.status === "executed") {
      return {
        answerText: "⚠️ Esta proposta já foi processada anteriormente.",
        updatedMessageText: "ℹ️ <i>Esta proposta já havia sido confirmada anteriormente (duplo clique prevenido).</i>",
        removeKeyboard: true,
      };
    }
    // Se expirou:
    if (proposal.status === "expired" || new Date(proposal.expiresAt).getTime() < Date.now()) {
      return {
        answerText: "⚠️ Esta proposta de ação expirou.",
        updatedMessageText: "⚠️ <i>Esta proposta de ação expirou. Por favor, solicite novamente.</i>",
        removeKeyboard: true,
      };
    }

    // RBAC: viewer não pode aprovar
    if (identity.userRole === "viewer" || identity.userRole === "leitor") {
      return {
        answerText: "Acesso negado: usuários com permissão somente leitura não podem aprovar propostas.",
        removeKeyboard: false,
      };
    }

    // RBAC: member só pode aprovar próprias propostas
    const isElevated = identity.userRole === "owner" || identity.userRole === "admin";
    if (!isElevated && proposal.userId !== identity.userId) {
      return {
        answerText: "Acesso negado: você só pode aprovar suas próprias propostas de ação.",
        removeKeyboard: false,
      };
    }

    // Confirmação atômica condicional no repositório (prepared -> confirmed)
    let confirmedProposal: ActionProposal = proposal;
    if (typeof deps.proposalRepo.confirmProposalAtomically === "function") {
      const confirmResult = await deps.proposalRepo.confirmProposalAtomically(
        proposalId,
        context,
        identity.userRole,
      );
      if (!confirmResult.success || !confirmResult.proposal) {
        const code = confirmResult.code;
        if (code === "WALLET_AI_ACTION_ALREADY_PROCESSED") {
          return {
            answerText: "⚠️ Esta proposta já foi processada anteriormente.",
            updatedMessageText: "ℹ️ <i>Esta proposta já havia sido confirmada anteriormente (duplo clique prevenido).</i>",
            removeKeyboard: true,
          };
        }
        return {
          answerText: `⚠️ ${confirmResult.error || "Falha ao confirmar proposta."}`,
          removeKeyboard: true,
        };
      }
      confirmedProposal = confirmResult.proposal;
    } else {
      await deps.proposalRepo.updateStatus(proposalId, "confirmed", { confirmedAt: new Date().toISOString() });
      confirmedProposal.status = "confirmed";
    }

    // Auditoria de confirmação
    if (deps.auditSink) {
      await deps.auditSink.logEvent({
        eventName: "proposal_confirmed",
        proposalId: confirmedProposal.id,
        actionType: confirmedProposal.actionType,
        riskLevel: confirmedProposal.riskLevel,
        workspaceId: context.workspaceId,
        userId: context.userId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
      });
    }

    // SE NÃO HOUVER MUTATOR ATIVO (Fase 1 / Proposal-Only com 0 executores financeiros):
    // Permanece em status 'confirmed', NÃO marca 'executed', NÃO cria mock recordId
    if (!deps.mutator) {
      return {
        answerText: "Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.",
        updatedMessageText: `✅ <b>Proposta Confirmada</b>\n\n${escapeTelegramHtml(
          confirmedProposal.summary,
        )}\n\n<i>Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.</i>`,
        removeKeyboard: true,
      };
    }

    // SE HOUVER MUTATOR FORNECIDO (ex: testes com mutator real ou executores futuros):
    try {
      await deps.mutator.executeMutation(
        confirmedProposal.actionType,
        confirmedProposal.payload as Record<string, unknown>,
        context,
      );

      if (typeof deps.proposalRepo.executeProposalAtomically === "function") {
        await deps.proposalRepo.executeProposalAtomically(proposalId);
      } else {
        await deps.proposalRepo.updateStatus(proposalId, "executed", { executedAt: new Date().toISOString() });
      }

      if (confirmedProposal.actionType === "cadastrar_divida_boleto") {
        const p = confirmedProposal.payload || {};
        const ben = p.beneficiario || p.credor || "Boleto";
        const val = formatCurrencyBrl(Number(p.valor_total ?? p.valor ?? 0));
        const venc = p.data_vencimento || "N/A";
        return {
          answerText: "✅ Boleto cadastrado com sucesso como dívida pendente!",
          updatedMessageText: `✅ <b>Boleto Cadastrado com Sucesso!</b>\n\n` +
            `🏢 <b>Beneficiário:</b> ${escapeTelegramHtml(String(ben))}\n` +
            `💰 <b>Valor:</b> ${val}\n` +
            `🗓️ <b>Vencimento:</b> ${escapeTelegramHtml(String(venc))}\n` +
            `📌 <b>Status:</b> Dívida pendente cadastrada na carteira.\n\n` +
            `<i>O boleto não foi marcado como pago nem liquidado.</i>`,
          removeKeyboard: true,
        };
      }

      return {
        answerText: "✅ Ação confirmada com sucesso!",
        updatedMessageText: `✅ <b>Ação Confirmada e Executada!</b>\n\n${escapeTelegramHtml(
          confirmedProposal.summary,
        )}\n\n<i>Status: Confirmado via Telegram por você.</i>`,
        removeKeyboard: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: string }).code : undefined;
      if (msg.includes("Proposal-only") || code === "WALLET_AI_ACTION_FORBIDDEN") {
        return {
          answerText: "Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.",
          updatedMessageText: `✅ <b>Proposta Confirmada</b>\n\n${escapeTelegramHtml(
            confirmedProposal.summary,
          )}\n\n<i>Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.</i>`,
          removeKeyboard: true,
        };
      }

      return {
        answerText: `⚠️ Falha ao executar: ${msg}`,
        updatedMessageText: `⚠️ <b>Ação Não Executada</b>\n\n${escapeTelegramHtml(sanitizeUserFacingErrorMessage(msg))}`,
        removeKeyboard: true,
      };
    }
  }

  return {
    answerText: "Ação não suportada.",
    removeKeyboard: false,
  };
}

/**
 * Processa upload de fotos ou documentos (DANFE / Boletos / PDFs) via Telegram.
 * Conecta diretamente ao Document Pipeline seguro da Etapa 9.4B.
 */
export async function handleTelegramDocument(
  params: {
    fileId: string;
    fileType?: string;
    fileName?: string;
    caption?: string;
    identity: ResolvedTelegramIdentity;
  },
  deps: TelegramAdapterDependencies,
): Promise<{
  text: string;
  inlineKeyboard?: TelegramInlineButton[][];
  pipelineResult?: ProcessDocumentPipelineResult;
}> {
  const { fileId, fileType = "image/jpeg", fileName, caption, identity } = params;

  if (!identity.authorized || !identity.userId || !identity.workspaceId) {
    return {
      text: identity.error || "Usuário ou chat não autorizado.",
    };
  }

  const api = deps.telegramApi ?? createDefaultTelegramApiClient(deps.telegramBotToken, deps.openaiApiKey);
  const downloadResult = await api.downloadFileAsBase64(fileId);

  if (!downloadResult || !downloadResult.base64) {
    return {
      text: "❌ Não foi possível baixar o arquivo do Telegram. Tente enviar novamente.",
    };
  }

  const context: AiExecutionContext = {
    userId: identity.userId,
    workspaceId: identity.workspaceId,
    userRole: identity.userRole,
    channel: "telegram",
    correlationId: `tg_doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  const documentRunner = deps.documentPipelineRunner ?? processDocumentPipeline;

  let effectiveOpenAiKey = deps.openaiApiKey;
  if ((!effectiveOpenAiKey || !effectiveOpenAiKey.startsWith("sk-")) && deps.supabase && identity.userId) {
    try {
      const { data: userCfg } = await deps.supabase
        .from("ia_configuracoes")
        .select("api_key")
        .eq("user_id", identity.userId)
        .maybeSingle();
      if (userCfg?.api_key && userCfg.api_key.startsWith("sk-")) {
        effectiveOpenAiKey = userCfg.api_key;
      }
    } catch {
      // Fallback defensivo silencioso
    }
  }

  // Monta entrada estritamente tipada com ProcessDocumentPipelineInput
  const pipelineInput: ProcessDocumentPipelineInput = {
    workspaceId: identity.workspaceId,
    userId: identity.userId,
    base64: downloadResult.base64,
    mimeType: downloadResult.mimeType || fileType,
    fileName: fileName || "telegram_upload",
    textContext: caption,
    correlationId: context.correlationId,
    geminiApiKey: deps.geminiApiKey,
    geminiApiKeyBackup: deps.geminiApiKeyBackup,
    openaiApiKey: effectiveOpenAiKey,
    fetchFn: deps.fetchFn,
    findDuplicateFn: deps.findDuplicateFn
      ? (params) => deps.findDuplicateFn!(context, params)
      : undefined,
  };

  const pipelineResult: ProcessDocumentPipelineResult = await documentRunner(pipelineInput);

  // 1. Duplicata detectada (FAIL-CLOSED)
  if (pipelineResult.isDuplicate || pipelineResult.status === "duplicata_detectada") {
    const ident =
      pipelineResult.data?.linha_digitavel ||
      pipelineResult.data?.codigo_barras ||
      pipelineResult.data?.chave_acesso ||
      (pipelineResult as any).extractedData?.chave_acesso ||
      (pipelineResult as any).extractedData?.linha_digitavel ||
      (pipelineResult as any).extractedData?.numero_nf ||
      "identificador do documento";

    const isBoleto =
      pipelineResult.documentType === "BOLETO" ||
      Boolean(pipelineResult.data?.linha_digitavel || (pipelineResult as any).extractedData?.linha_digitavel);

    const titulo = isBoleto ? "Boleto Duplicado Detectado!" : "Documento Duplicado Detectado!";

    return {
      text:
        `⚠️ <b>${titulo}</b>\n\n` +
        `Este documento (<code>${escapeTelegramHtml(String(ident))}</code>) já foi registrado anteriormente no seu workspace.\n\n` +
        `<i>Para garantir a integridade financeira, nenhuma proposta em duplicidade foi gerada.</i>`,
      pipelineResult,
    };
  }

  // 2. Proposta de ação gerada pronta para confirmação
  if (pipelineResult.actionProposal) {
    // Se o pipeline já possuía saveProposalFn, já foi persistido; caso contrário salva como salvaguarda
    if (!pipelineInput.saveProposalFn) {
      await deps.proposalRepo.saveProposal(pipelineResult.actionProposal);
    }
    const formatted = formatProposalMessage(pipelineResult.actionProposal);

    return {
      text: formatted.text,
      inlineKeyboard: formatted.buttons,
      pipelineResult,
    };
  }

  // 3. Tratamento de Erros, Rejeições e Revisões Específicas (Elimina retorno genérico)
  const errors: string[] = [
    ...(pipelineResult.validation?.errors || []),
    ...((pipelineResult as any).errors || []),
  ];
  const warnings: string[] = [
    ...(pipelineResult.validation?.warnings || []),
    ...((pipelineResult as any).warnings || []),
  ];

  // A: Prompt Injection bloqueado
  if (pipelineResult.hasPromptInjection || pipelineResult.errorCode === "WALLET_AI_DOCUMENT_UNTRUSTED_CONTENT") {
    return {
      text: "🛡️ <b>Aviso de Segurança:</b> O documento contém padrões suspeitos ou instruções maliciosas e foi bloqueado para revisão.",
      pipelineResult,
    };
  }

  // B: Comprovante de pagamento identificado (informativo, não gera dívida pendente)
  if (pipelineResult.documentType === "COMPROVANTE" || pipelineResult.errorCode === "WALLET_AI_RECEIPT_NOT_SUPPORTED") {
    return {
      text:
        `🧾 <b>Comprovante de Pagamento Identificado</b>\n\n` +
        `Identificamos que este documento é um comprovante de pagamento ou transferência já realizada.\n` +
        `O cadastro automático aceita <b>boletos bancários pendentes</b> ou <b>notas fiscais (DANFE)</b>.\n\n` +
        `<i>Nenhuma alteração financeira foi realizada.</i>`,
      pipelineResult,
    };
  }

  // C: Boleto com linha digitável inválida ou divergência FEBRABAN
  if (
    pipelineResult.documentType === "BOLETO" &&
    errors.some((e) => /linha digit[aá]vel|c[oó]digo de barras|febraban|d[íi]gito verificador/i.test(e))
  ) {
    const errList = errors.map((e) => `• ${escapeTelegramHtml(sanitizeUserFacingErrorMessage(e))}`).join("\n");
    const data = pipelineResult.data || {};

    const infoLines: string[] = [];
    if (data.beneficiario) infoLines.push(`🏢 <b>Beneficiário:</b> ${escapeTelegramHtml(String(data.beneficiario))}`);
    if (data.banco) infoLines.push(`🏦 <b>Banco:</b> ${escapeTelegramHtml(String(data.banco))}`);
    if (data.data_vencimento) {
      const vencFmt = normalizeDate(data.data_vencimento).formattedBr || String(data.data_vencimento);
      infoLines.push(`📅 <b>Vencimento:</b> ${escapeTelegramHtml(vencFmt)}`);
    }
    const valNum = typeof data.valor === "number" ? data.valor : parseFloat(String(data.valor || 0));
    if (valNum > 0) {
      infoLines.push(`💰 <b>Valor:</b> R$ ${valNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    if (data.linha_digitavel) {
      infoLines.push(`🔢 <b>Linha lida:</b> <code>${escapeTelegramHtml(String(data.linha_digitavel))}</code>`);
    }

    const infoBlock = infoLines.length > 0 ? `\n\n<b>Dados identificados no documento:</b>\n${infoLines.join("\n")}` : "";
    return {
      text:
        `⚠️ <b>Boleto com Linha Digitável Inválida</b>\n\n` +
        `A linha digitável do boleto não passou na validação matemática FEBRABAN:\n${errList}${infoBlock}\n\n` +
        `<i>Por favor, tire uma nova foto mais nítida ou digite a linha digitável por mensagem de texto para continuarmos com segurança.</i>`,
      pipelineResult,
    };
  }

  // D: Boleto com informações incompletas (beneficiário, vencimento, valor)
  if (
    pipelineResult.documentType === "BOLETO" &&
    errors.some((e) => /benefici[aá]rio|vencimento|valor|ausente|n[aã]o identificad/i.test(e))
  ) {
    const errList = errors.map((e) => `• ${escapeTelegramHtml(e)}`).join("\n");
    const data = pipelineResult.data || {};

    const infoLines: string[] = [];
    if (data.beneficiario) infoLines.push(`🏢 <b>Beneficiário:</b> ${escapeTelegramHtml(String(data.beneficiario))}`);
    if (data.banco) infoLines.push(`🏦 <b>Banco:</b> ${escapeTelegramHtml(String(data.banco))}`);
    if (data.data_vencimento) {
      const vencFmt = normalizeDate(data.data_vencimento).formattedBr || String(data.data_vencimento);
      infoLines.push(`📅 <b>Vencimento:</b> ${escapeTelegramHtml(vencFmt)}`);
    }
    const valNum = typeof data.valor === "number" ? data.valor : parseFloat(String(data.valor || 0));
    if (valNum > 0) {
      infoLines.push(`💰 <b>Valor:</b> R$ ${valNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    if (data.linha_digitavel) {
      infoLines.push(`🔢 <b>Linha lida:</b> <code>${escapeTelegramHtml(String(data.linha_digitavel))}</code>`);
    }

    const infoBlock = infoLines.length > 0 ? `\n\n<b>Dados identificados no documento:</b>\n${infoLines.join("\n")}` : "";
    return {
      text:
        `⚠️ <b>Informações Incompletas no Boleto</b>\n\n` +
        `Não foi possível extrair todos os dados essenciais para o cadastro:\n${errList}\n\n` +
        `<i>Envie uma foto em que apareçam claramente o beneficiário, data de vencimento e valor do boleto.</i>`,
      pipelineResult,
    };
  }

  // E: Falha técnica temporária no processador visual / provedor externo (executa ANTES de documento não identificado)
  if (
    pipelineResult.status === "erro" ||
    pipelineResult.errorCode?.startsWith("WALLET_AI_VISION_") ||
    pipelineResult.errorCode === "WALLET_AI_DOCUMENT_PROCESSING_FAILED" ||
    pipelineResult.errorCode === "WALLET_AI_INVALID_PAYLOAD"
  ) {
    const rawErrMsg = pipelineResult.error || errors[0] || "Falha temporária de comunicação com o processador visual.";
    const errMsg = sanitizeUserFacingErrorMessage(rawErrMsg);
    return {
      text:
        `⚠️ <b>Falha Temporária no Processamento Visual</b>\n\n` +
        `Não foi possível analisar o documento no momento devido a uma instabilidade no serviço de visão computacional:\n` +
        `• <i>${escapeTelegramHtml(errMsg)}</i>\n\n` +
        `<i>Por favor, tente enviar novamente em alguns instantes.</i>`,
      pipelineResult,
    };
  }

  // F: Documento Não Identificado / Imagem Ilegível (somente quando NÃO for falha técnica)
  if (
    pipelineResult.documentType === "DESCONHECIDO" ||
    pipelineResult.errorCode === "WALLET_AI_DOCUMENT_UNRECOGNIZED" ||
    (pipelineResult.documentType !== "BOLETO" && pipelineResult.documentType !== "DANFE" && errors.some((e) => /não identificado|ileg[íi]vel|desconhecido/i.test(e)))
  ) {
    return {
      text:
        `📎 <b>Documento Não Identificado</b>\n\n` +
        `Não foi possível identificar este arquivo como um Boleto Bancário ou Nota Fiscal (DANFE) legível.\n\n` +
        `• <i>Dica:</i> Envie uma foto nítida e bem iluminada do boleto, com o código de barras e a linha digitável visíveis e sem cortes.`,
      pipelineResult,
    };
  }

  // G: Documento Requer Revisão Geral (ex: DANFE com inconsistências)
  const allNotes = [...errors, ...warnings];
  if (allNotes.length > 0) {
    const notesList = allNotes.map((n) => `• ${escapeTelegramHtml(n)}`).join("\n");
    return {
      text:
        `⚠️ <b>Documento Requer Revisão Manual</b>\n\n` +
        `Não foi possível validar as informações fiscais com precisão suficiente:\n${notesList}\n\n` +
        `<i>Envie o arquivo como PDF/XML original ou revise os dados no app web.</i>`,
      pipelineResult,
    };
  }

  // H: Fallback seguro usando formattedMessage se disponível
  if (pipelineResult.formattedMessage) {
    return {
      text: pipelineResult.formattedMessage,
      pipelineResult,
    };
  }

  return {
    text: "⚠️ <b>Não foi possível identificar ação financeira no documento</b>.\n\n<i>Envie uma foto nítida de um Boleto Bancário ou Nota Fiscal (DANFE).</i>",
    pipelineResult,
  };
}

/**
 * Dispatcher principal para webhook do Telegram.
 * Encaminha callbacks, textos e documentos para as rotas canônicas.
 */
export async function processTelegramUpdate(
  update: TelegramUpdate,
  deps: TelegramAdapterDependencies,
  options?: { correlationId?: string },
): Promise<{ handled: boolean; result?: unknown; error?: string }> {
  // 0. Idempotência de Updates: Distribuída (Postgres) com Fail-Closed Estrito
  if (update?.update_id) {
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    let claimed = false;

    if (deps.idempotencyRepo) {
      try {
        claimed = await deps.idempotencyRepo.claimUpdate(update.update_id, "default", chatId);
      } catch (err: unknown) {
        // FAIL-CLOSED: Falha de infraestrutura no claim distribuído rejeita o update
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[telegram-idempotency] Update rejeitado por fail-closed (idempotencyRepo):", errMsg);
        return {
          handled: false,
          error: `Erro de idempotência distribuída (fail-closed): ${errMsg}`,
        };
      }
    } else if (deps.supabase) {
      try {
        const defaultRepo = new SupabaseTelegramIdempotencyRepository(deps.supabase);
        claimed = await defaultRepo.claimUpdate(update.update_id, "default", chatId);
      } catch (err: unknown) {
        // FAIL-CLOSED: Falha de infraestrutura no claim distribuído rejeita o update
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[telegram-idempotency] Update rejeitado por fail-closed (defaultRepo):", errMsg);
        return {
          handled: false,
          error: `Erro de idempotência distribuída (fail-closed): ${errMsg}`,
        };
      }
    } else {
      // Política explícita: Em produção/Edge, repositório persistente é obrigatório.
      // Somente permite memory-only se expressamente habilitado para testes/dev
      const allowMemoryOnly = Boolean(deps.allowMemoryOnlyIdempotency);
      if (!allowMemoryOnly) {
        console.error("[telegram-idempotency] FAIL-CLOSED: Repositório persistente de idempotência não fornecido.");
        return {
          handled: false,
          error: "IDEMPOTENCY_REPOSITORY_REQUIRED: Repositório persistente obrigatório em ambiente de execução.",
        };
      }
      if (isTelegramUpdateProcessed(update.update_id)) {
        return { handled: true };
      }
      markTelegramUpdateProcessed(update.update_id);
      claimed = true;
    }

    if (!claimed) {
      // Replay detectado no cluster distribuído ou cache L1: descarta silenciosamente
      return { handled: true };
    }
  }

  const api = deps.telegramApi ?? createDefaultTelegramApiClient(deps.telegramBotToken, deps.openaiApiKey);

  // 1. Processamento de Callbacks (Inline Buttons)
  if (update.callback_query) {
    const cb = update.callback_query;
    const cbData = cb.data || "";

    if (
      cbData.startsWith("confirm_prop:") ||
      cbData.startsWith("confirmar_proposta:") ||
      cbData.startsWith("cancel_prop:") ||
      cbData.startsWith("cancelar_proposta:")
    ) {
      const cbResult = await handleTelegramCallback(
        {
          callbackData: cbData,
          callbackQueryId: cb.id,
          messageId: cb.message?.message_id,
          chatId: cb.message?.chat?.id,
          telegramUserId: cb.from.id,
        },
        deps,
      );

      await api.answerCallbackQuery({
        callbackQueryId: cb.id,
        text: cbResult.answerText,
      });

      if (cbResult.removeKeyboard && cb.message?.chat?.id && cb.message?.message_id) {
        await api.editMessageReplyMarkup({
          chatId: cb.message.chat.id,
          messageId: cb.message.message_id,
          inlineKeyboard: [],
        });
      }

      if (cbResult.updatedMessageText && cb.message?.chat?.id && cb.message?.message_id) {
        await api.editMessageText({
          chatId: cb.message.chat.id,
          messageId: cb.message.message_id,
          text: cbResult.updatedMessageText,
          parseMode: "HTML",
        });
      }

      return { handled: true, result: cbResult };
    }

    return { handled: false };
  }

  // 2. Processamento de Mensagens
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const fromId = msg.from?.id || chatId;
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

    // Resolução estrita de identidade (FAIL-CLOSED)
    const identity = await resolveTelegramIdentity(
      { telegramUserId: fromId, telegramChatId: chatId, isGroup },
      deps.supabase,
    );

    if (!identity.authorized) {
      await api.sendMessage({
        chatId,
        text: escapeTelegramHtml(identity.error || "Acesso não autorizado."),
        parseMode: "HTML",
      });
      return { handled: true, error: identity.error };
    }

    // A: Fotos / Imagens
    if (msg.photo && msg.photo.length > 0) {
      const bestPhoto = msg.photo[msg.photo.length - 1];
      const docResult = await handleTelegramDocument(
        {
          fileId: bestPhoto.file_id,
          fileType: "image/jpeg",
          caption: msg.caption,
          identity,
        },
        deps,
      );

      await api.sendMessage({
        chatId,
        text: docResult.text,
        parseMode: "HTML",
        inlineKeyboard: docResult.inlineKeyboard,
      });

      return { handled: true, result: docResult };
    }

    // B: Documentos (PDF, XML, etc.)
    if (msg.document) {
      const doc = msg.document;
      const docResult = await handleTelegramDocument(
        {
          fileId: doc.file_id,
          fileType: doc.mime_type || "application/pdf",
          fileName: doc.file_name,
          caption: msg.caption,
          identity,
        },
        deps,
      );

      await api.sendMessage({
        chatId,
        text: docResult.text,
        parseMode: "HTML",
        inlineKeyboard: docResult.inlineKeyboard,
      });

      return { handled: true, result: docResult };
    }

    // C: Áudio / Voz (Whisper)
    if (msg.voice || msg.audio) {
      const audio = msg.voice || msg.audio;
      if (audio?.file_id && api.transcribeAudio) {
        const transcript = await api.transcribeAudio(audio.file_id, audio.mime_type);
        if (transcript) {
          const textResult = await handleTelegramTextMessage(
            { text: transcript, identity, chatId, correlationId: options?.correlationId },
            deps,
          );

          await api.sendMessage({
            chatId,
            text: `🎙️ <i>"${escapeTelegramHtml(transcript)}"</i>\n\n${textResult.text}`,
            parseMode: "HTML",
            inlineKeyboard: textResult.inlineKeyboard,
          });

          return { handled: true, result: textResult };
        }
      }
    }

    // D: Mensagem de Texto
    if (msg.text) {
      const trimmed = msg.text.trim();

      // Deixa comandos administrativos básicos para manipulação legada/onboarding se necessário
      if (trimmed === "/start" || trimmed === "/help" || trimmed === "/ajuda" || trimmed.startsWith("/vincular")) {
        return { handled: false };
      }

      const textResult = await handleTelegramTextMessage(
        { text: trimmed, identity, chatId, correlationId: options?.correlationId },
        deps,
      );

      await api.sendMessage({
        chatId,
        text: textResult.text,
        parseMode: "HTML",
        inlineKeyboard: textResult.inlineKeyboard,
      });

      return { handled: true, result: textResult };
    }
  }

  return { handled: false };
}
