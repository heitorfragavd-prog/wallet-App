import type { ActionProposal } from "./action-types.ts";
import type { AiExecutionContext } from "./auth.ts";
import {
  executeConfirmedProposal,
  ActionGatewayError,
  type ActionRepository,
  type ActionDatabaseMutator,
  type AuditEventSinkLike,
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
      return await resp.json().catch(() => ({ ok: false }));
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
  const valor = p.valor || p.valor_total || p.valor_alvo || 0;
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
  supabase: any;
  telegramBotToken: string;
  telegramApi?: TelegramApiClient;
  runnerFactory: (model?: string) => LlmRunner;
  repoFactory: (context: AiExecutionContext) => FinancialQueryRepository;
  proposalRepo: ActionRepository;
  mutator?: ActionDatabaseMutator;
  auditSink?: AuditEventSinkLike;
  documentPipelineRunner?: typeof processDocumentPipeline;
  openaiApiKey?: string;
  geminiApiKey?: string;
  geminiApiKeyBackup?: string;
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

  const context: AiExecutionContext = {
    userId: identity.userId,
    workspaceId: identity.workspaceId,
    userRole: identity.userRole,
    channel: "telegram",
    correlationId: `tg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  const repo = deps.repoFactory(context);
  const catalog = createQueryToolCatalog(repo);
  const runner = deps.runnerFactory();

  const turnResult = await runOrchestratorTurn(
    [{ role: "user", content: text }],
    context,
    catalog,
    runner,
  );

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
    } catch (err: any) {
      return {
        answerText: `Erro ao cancelar: ${err?.message || "falha na operação"}`,
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

      return {
        answerText: "✅ Ação confirmada com sucesso!",
        updatedMessageText: `✅ <b>Ação Confirmada e Executada!</b>\n\n${escapeTelegramHtml(
          confirmedProposal.summary,
        )}\n\n<i>Status: Confirmado via Telegram por você.</i>`,
        removeKeyboard: true,
      };
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("Proposal-only") || err?.code === "WALLET_AI_ACTION_FORBIDDEN") {
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
        updatedMessageText: `⚠️ <b>Ação Não Executada</b>\n\n${escapeTelegramHtml(msg)}`,
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

  const pipelineInput: ProcessDocumentPipelineInput = {
    fileBase64: downloadResult.base64,
    fileType: downloadResult.mimeType || fileType,
    fileName: fileName || "telegram_upload",
    caption,
  };

  const pipelineResult = await documentRunner(pipelineInput, context, {
    geminiApiKey: deps.geminiApiKey,
    openaiApiKey: deps.openaiApiKey,
    findDuplicateFn: deps.findDuplicateFn,
  });

  // Duplicata detectada (FAIL-CLOSED)
  if (pipelineResult.isDuplicate || pipelineResult.status === "duplicata_detectada") {
    const ident =
      pipelineResult.extractedData?.chave_acesso ||
      pipelineResult.extractedData?.linha_digitavel ||
      pipelineResult.extractedData?.numero_nf ||
      "identificador do documento";

    return {
      text:
        `⚠️ <b>Documento Duplicado Detectado!</b>\n\n` +
        `Este documento (<code>${escapeTelegramHtml(String(ident))}</code>) já foi registrado anteriormente no seu workspace.\n\n` +
        `<i>Para garantir a integridade financeira, nenhuma proposta em duplicidade foi gerada.</i>`,
      pipelineResult,
    };
  }

  // Falha de validação matemática ou classificação suspeita
  if (pipelineResult.status === "requer_revisao" && !pipelineResult.actionProposal) {
    const warnings = pipelineResult.warnings.join("\n• ");
    return {
      text:
        `⚠️ <b>Documento Requer Revisão Manual</b>\n\n` +
        `Não foi possível validar as informações fiscais com precisão:\n• ${escapeTelegramHtml(warnings)}\n\n` +
        `<i>Envie o arquivo como PDF/XML original ou revise os dados no app web.</i>`,
      pipelineResult,
    };
  }

  // Proposta de ação gerada
  if (pipelineResult.actionProposal) {
    await deps.proposalRepo.saveProposal(pipelineResult.actionProposal);
    const formatted = formatProposalMessage(pipelineResult.actionProposal);

    return {
      text: formatted.text,
      inlineKeyboard: formatted.buttons,
      pipelineResult,
    };
  }

  return {
    text: "📄 Documento processado, porém nenhuma ação financeira foi identificada.",
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
): Promise<{ handled: boolean; result?: any; error?: string }> {
  // 0. Idempotência de Updates via Sliding Window (FAIL-CLOSED contra replay de rede)
  if (update?.update_id) {
    if (isTelegramUpdateProcessed(update.update_id)) {
      return { handled: true };
    }
    markTelegramUpdateProcessed(update.update_id);
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
            { text: transcript, identity, chatId },
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
      if (trimmed === "/start" || trimmed === "/help" || trimmed.startsWith("/vincular")) {
        return { handled: false };
      }

      const textResult = await handleTelegramTextMessage(
        { text: trimmed, identity, chatId },
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
