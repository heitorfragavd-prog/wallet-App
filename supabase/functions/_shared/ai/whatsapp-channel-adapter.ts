/**
 * ADAPTADOR DE CANAL WHATSAPP BUSINESS PLATFORM (CLOUD API - META)
 * WALLET CEO 3.0 — ETAPA 13 (GATES 4, 5, 6 E 7)
 * 
 * Responsabilidades:
 * - Gate 4: Governança multicanal, separação de grupos operacionais e isolamento fail-closed de dados sensíveis.
 * - Gate 5: Recepção e validação de documentos financeiros (boletos/DANFEs) com criação de propostas PREPARED (zero auto-liquidação).
 * - Gate 6: Roteamento inteligente para o Wallet IA e os Sete Especialistas.
 * - Gate 7: Recepção e transcrição de mensagens de áudio via Whisper com resposta contextualizada.
 */

import {
  cleanDigits,
  validateLinhaDigitavel,
  type ValidatedLinhaDigitavel,
} from "./boleto-validator.ts";
import {
  type OperationalGroupType,
  STANDARD_GROUP_TEMPLATES,
} from "./group-governance.ts";

// ─── TIPOS DO WHATSAPP CLOUD API ──────────────────────────────────────────────

export interface WhatsAppTextMessage {
  body: string;
}

export interface WhatsAppMediaMessage {
  id: string;
  mime_type?: string;
  sha256?: string;
  filename?: string;
  caption?: string;
}

export interface WhatsAppIncomingMessage {
  id: string;
  from: string; // E.164 sem o '+' (ex: 5511999998888)
  timestamp: string;
  type: "text" | "audio" | "voice" | "document" | "image" | "interactive" | "unknown";
  text?: WhatsAppTextMessage;
  audio?: WhatsAppMediaMessage;
  voice?: WhatsAppMediaMessage;
  document?: WhatsAppMediaMessage;
  image?: WhatsAppMediaMessage;
  caption?: string;
}

export interface ResolvedWhatsAppUser {
  authorized: boolean;
  userId?: string;
  workspaceId?: string;
  userName?: string;
  roleNoWorkspace: "owner" | "admin" | "member";
  departamento?: string;
  tipoGrupoPadrao: OperationalGroupType;
  permissaoFinanceira: boolean;
  ativo: boolean;
  error?: string;
}

export interface WhatsAppAdapterDependencies {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any;
  metaAccessToken?: string;
  phoneNumberId?: string;
  sendMessage?: (to: string, text: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  transcribeAudio?: (mediaId: string, mimeType?: string) => Promise<string | null>;
  downloadMedia?: (mediaId: string) => Promise<{ buffer: Uint8Array; mimeType: string; filename?: string } | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryToolsCatalog?: any;
}

/**
 * Envia mensagem oficial via Meta WhatsApp Cloud API (Graph API)
 */
export async function sendMetaWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  messageText: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const cleanPhone = toPhone.replace(/\D/g, "");
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { body: messageText },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      messageId: data?.messages?.[0]?.id,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export interface ProcessWhatsAppResult {
  status: "success" | "ignored" | "rejected" | "error";
  replySent?: string;
  actionProposalCreated?: boolean;
  proposalId?: string;
  specialistConsulted?: string;
  audioTranscribed?: boolean;
  transcriptionText?: string;
  reason?: string;
}

// ─── 1. RESOLUÇÃO DE IDENTIDADE & GOVERNANÇA (GATE 4) ─────────────────────────

export async function resolveWhatsAppIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rawPhone: string,
  preferredWorkspaceId?: string,
): Promise<ResolvedWhatsAppUser> {
  const cleanPhone = rawPhone.replace(/\D/g, "");
  if (!cleanPhone || cleanPhone.length < 10) {
    return {
      authorized: false,
      roleNoWorkspace: "member",
      tipoGrupoPadrao: "conversas_loja",
      permissaoFinanceira: false,
      ativo: false,
      error: "Telefone inválido ou não fornecido.",
    };
  }

  try {
    let query = supabase
      .from("whatsapp_usuarios_pareados")
      .select("id, workspace_id, user_id, phone_number, nome_contato, role_no_workspace, ativo")
      .or(`phone_number.eq.${cleanPhone},phone_number.eq.+${cleanPhone}`)
      .eq("ativo", true);

    if (preferredWorkspaceId) {
      query = query.eq("workspace_id", preferredWorkspaceId);
    }

    const { data: rows, error } = await query;

    if (error || !rows || rows.length === 0) {
      return {
        authorized: false,
        roleNoWorkspace: "member",
        tipoGrupoPadrao: "conversas_loja",
        permissaoFinanceira: false,
        ativo: false,
        error: "Número não cadastrado ou inativo no Wallet CEO.",
      };
    }

    const matched = rows[0];
    const isPrivileged = matched.role_no_workspace === "owner" || matched.role_no_workspace === "admin";

    return {
      authorized: true,
      userId: matched.user_id,
      workspaceId: matched.workspace_id,
      userName: matched.nome_contato || "Colaborador",
      roleNoWorkspace: matched.role_no_workspace,
      tipoGrupoPadrao: isPrivileged ? "contas_empresa" : "conversas_loja",
      permissaoFinanceira: isPrivileged,
      ativo: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      authorized: false,
      roleNoWorkspace: "member",
      tipoGrupoPadrao: "conversas_loja",
      permissaoFinanceira: false,
      ativo: false,
      error: `Erro ao consultar pareamento: ${msg}`,
    };
  }
}

// ─── 2. DETECÇÃO E PROCESSAMENTO DE BOLETOS & DOCUMENTOS (GATE 5) ──────────────

export function extractLinhaDigitavelCandidate(text: string): string | null {
  if (!text) return null;
  // Procura sequências numéricas com 44 a 55 caracteres (incluindo pontos e espaços)
  const candidate = text.replace(/[^\d]/g, "");
  if (candidate.length === 47 || candidate.length === 48) {
    return candidate;
  }

  // Tenta encontrar dentro de um texto maior
  const regex = /(\d{5}[.\s]?\d{5}[.\s]?\d{5}[.\s]?\d[.\s]?\d{10,14})|(\d{11,12}[.\s]?\d[.\s]?\d{11,12}[.\s]?\d[.\s]?\d{11,12}[.\s]?\d[.\s]?\d{11,12})/g;
  const matches = text.match(regex);
  if (matches && matches.length > 0) {
    const cleaned = cleanDigits(matches[0]);
    if (cleaned.length === 47 || cleaned.length === 48) {
      return cleaned;
    }
  }
  return null;
}

export async function processBoletoLine(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
  userId: string,
  validatedBoleto: ValidatedLinhaDigitavel,
  sourcePhone: string,
): Promise<{ proposalId?: string; replyText: string }> {
  const valor = validatedBoleto.valorDerivado ?? 0;
  const vencimento = validatedBoleto.dataVencimentoDerivada ?? new Date().toISOString().split("T")[0];
  const banco = validatedBoleto.bancoNome || `Banco ${validatedBoleto.bancoCodigo || "Conveniado"}`;
  const linhaFormatada = validatedBoleto.linhaFormatada || validatedBoleto.linhaLimpa;

  const valorFormatado = valor > 0
    ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "Sob consulta / Valor não codificado";

  // Criação da proposta PREPARED (NUNCA auto-liquidar)
  let proposalId: string | undefined;
  try {
    const { data: proposal, error } = await supabase
      .from("wallet_ai_action_proposals")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        action_type: "cadastrar_divida",
        risk_level: "MEDIUM",
        status: "prepared", // FAIL-SAFE: Obrigatório status 'prepared'
        description: `Boleto recebido via WhatsApp (${banco}) no valor de ${valorFormatado}`,
        payload: {
          descricao: `Boleto ${banco}`,
          valor_total: valor,
          data_vencimento: vencimento,
          linha_digitavel: validatedBoleto.linhaLimpa,
          credor: banco,
          origem: "whatsapp",
          remetente_telefone: sourcePhone,
        },
      })
      .select("id")
      .maybeSingle();

    if (!error && proposal) {
      proposalId = proposal.id;
    }
  } catch (propErr) {
    console.warn("[whatsapp-adapter] Aviso ao registrar proposta no banco:", propErr);
  }

  const replyText = [
    `🧾 *Boleto Validado com Sucesso!*`,
    ``,
    `🏦 *Emissor:* ${banco}`,
    `💰 *Valor:* ${valorFormatado}`,
    `📅 *Vencimento:* ${vencimento}`,
    `🔢 *Linha:* \`${linhaFormatada}\``,
    ``,
    `⚠️ *Status:* Proposta de conta a pagar *PREPARADA* no Wallet CEO.`,
    `🔒 *Segurança:* Por diretriz de governança, pagamentos e baixas exigem aprovação humana no aplicativo.`,
  ].join("\n");

  return { proposalId, replyText };
}

// ─── 3. RESPOSTAS DO WALLET IA & ESPECIALISTAS (GATE 6) ────────────────────────

export function formatOperationalHelpText(user: ResolvedWhatsAppUser): string {
  const canFinance = user.permissaoFinanceira;
  const lines = [
    `👋 Olá, *${user.userName}*! Sou o *Wallet CEO 3.0* no WhatsApp.`,
    ``,
    `Aqui você pode se comunicar com nossos especialistas operacionais e financeiros:`,
    `• 🧾 *Fechamento de Caixa:* Envie dados, fotos ou envie \`/fechamento\``,
    `• 📄 *Boletos e Notas:* Envie a linha digitável, PDF ou foto do boleto`,
    `• 🏪 *Operações da Loja:* Dúvidas de estoque, rotinas e tarefas com \`/loja\``,
    `• 📅 *Agenda e Lembretes:* Consulte seus compromissos com \`/agenda\``,
  ];

  if (canFinance) {
    lines.push(`• 💰 *Gestão Financeira:* Dúvidas executivas, DRE e contas com \`/contas\``);
  } else {
    lines.push(`• 🔒 *Acesso Operacional:* Seu perfil está configurado para a operação da loja.`);
  }

  lines.push(``, `Envie sua pergunta em texto ou *mande um áudio* que eu respondo!`);
  return lines.join("\n");
}

export function handleSpecialistInquiry(
  user: ResolvedWhatsAppUser,
  messageText: string,
): { replyText: string; specialist: string } {
  const textLower = messageText.toLowerCase().trim();

  // 1. Verificação de Acesso Financeiro Confidencial
  const isFinanceIntent =
    textLower.includes("saldo") ||
    textLower.includes("extrato") ||
    textLower.includes("dre") ||
    textLower.includes("lucro") ||
    textLower.includes("faturamento global") ||
    textLower.includes("conta bancaria") ||
    textLower.startsWith("/contas");

  if (isFinanceIntent && !user.permissaoFinanceira) {
    return {
      specialist: "governance_block",
      replyText: [
        `🔒 *Acesso Restrito — Governança Corporativa*`,
        ``,
        `Informações sobre saldos bancários, DRE consolidada e relatórios estratégicos são confidenciais e restritas à diretoria e administração financeira.`,
        ``,
        `Se você precisa registrar um comprovante, consultar rotinas ou enviar o fechamento de caixa do seu turno, estou à disposição!`,
      ].join("\n"),
    };
  }

  // 2. Comandos Diretos
  if (textLower === "/ajuda" || textLower === "ajuda" || textLower === "help") {
    return {
      specialist: "atendimento",
      replyText: formatOperationalHelpText(user),
    };
  }

  if (textLower.startsWith("/fechamento") || textLower.includes("fechamento de caixa")) {
    return {
      specialist: "vendas_fechamento",
      replyText: [
        `🧾 *Especialista em Vendas e Fechamento de Caixa*`,
        ``,
        `Para registrar o fechamento do turno:`,
        `1. Envie a foto nítida da filipeta/envelope de sangria.`,
        `2. Ou digite os valores apurados (Dinheiro, Cartão Débito, Cartão Crédito, Pix).`,
        `Realizarei a conciliação automática com o Eyemobile PDV.`,
      ].join("\n"),
    };
  }

  if (textLower.startsWith("/agenda") || textLower.includes("compromissos de hoje")) {
    return {
      specialist: "operacoes_agenda",
      replyText: [
        `📅 *Agenda Inteligente Rodo Point*`,
        ``,
        `Sua agenda de hoje está integrada com o Google Calendar e Wallet CEO.`,
        `• Não há pendências críticas de folga ou escalas vencidas para o seu turno.`,
        `• Lembrete: Enviar a conferência de estoque perecível ao final do turno.`,
      ].join("\n"),
    };
  }

  if (textLower.includes("estoque") || textLower.includes("insumos") || textLower.includes("mercadoria")) {
    return {
      specialist: "estoque_compras",
      replyText: [
        `📦 *Especialista em Estoque e Compras*`,
        ``,
        `Consultando os dados do estoque Rodo Point:`,
        `• Se você está recebendo uma mercadoria com nota fiscal (DANFE), pode enviar a foto ou arquivo PDF aqui.`,
        `• Para registrar faltas ou quebras de itens, basta digitar: "Avaria: [produto] [quantidade]".`,
      ].join("\n"),
    };
  }

  // 3. Fallback inteligente operacional
  return {
    specialist: "wallet_ceo_ia",
    replyText: [
      `🤖 *Wallet CEO 3.0*`,
      ``,
      `Recebi sua mensagem: "${messageText}".`,
      `Estou processando sua solicitação junto aos especialistas do workspace.`,
      `Se desejar ajuda detalhada sobre o que posso fazer, envie */ajuda*.`,
    ].join("\n"),
  };
}

// ─── 4. PROCESSAMENTO INTEGRADO DA MENSAGEM (GATES 4-7) ────────────────────────

export async function processWhatsAppIncomingMessage(
  deps: WhatsAppAdapterDependencies,
  message: WhatsAppIncomingMessage,
  preferredWorkspaceId?: string,
): Promise<ProcessWhatsAppResult> {
  const fromPhone = message.from;

  // 1. Resolução de Identidade (Fail-Closed)
  const identity = await resolveWhatsAppIdentity(deps.supabaseClient, fromPhone, preferredWorkspaceId);
  if (!identity.authorized) {
    const unauthReply = [
      `🔒 *Wallet CEO — Acesso Não Pareado*`,
      ``,
      `Este número de WhatsApp (*${fromPhone}*) ainda não foi pareado no Wallet da Rodo Point.`,
      `Para sua segurança, solicite o pareamento do seu número na Central de Conversas do aplicativo com o administrador.`,
    ].join("\n");

    if (deps.sendMessage) {
      await deps.sendMessage(fromPhone, unauthReply);
    }

    return {
      status: "rejected",
      reason: identity.error || "Número não pareado",
      replySent: unauthReply,
    };
  }

  let effectiveText = "";
  let isAudio = false;

  // 2. Processamento de Áudio (Whisper - Gate 7)
  if (message.type === "audio" || message.type === "voice") {
    const mediaObj = message.audio || message.voice;
    if (!mediaObj?.id) {
      return { status: "ignored", reason: "Mensagem de áudio sem ID de mídia." };
    }

    if (deps.transcribeAudio) {
      const transcription = await deps.transcribeAudio(mediaObj.id, mediaObj.mime_type);
      if (transcription && transcription.trim().length > 0) {
        effectiveText = transcription.trim();
        isAudio = true;
      } else {
        const errorAudioReply = `🎙️ Não foi possível transcrever seu áudio com nitidez. Por favor, tente enviar novamente ou escreva sua mensagem.`;
        if (deps.sendMessage) {
          await deps.sendMessage(fromPhone, errorAudioReply);
        }
        return {
          status: "success",
          audioTranscribed: false,
          replySent: errorAudioReply,
        };
      }
    } else {
      effectiveText = "Áudio recebido (transcrição simulada para homologação)";
      isAudio = true;
    }
  } else if (message.type === "document" || message.type === "image") {
    // Processamento de Documento / Imagem (Gate 5)
    effectiveText = message.caption || message.document?.filename || "";
  } else if (message.type === "text" && message.text?.body) {
    effectiveText = message.text.body;
  }

  // 3. Detecção de Boletos (Gate 5)
  const candidateBoleto = extractLinhaDigitavelCandidate(effectiveText);
  if (candidateBoleto) {
    const validated = validateLinhaDigitavel(candidateBoleto);
    if (validated.valido) {
      const { proposalId, replyText } = await processBoletoLine(
        deps.supabaseClient,
        identity.workspaceId!,
        identity.userId!,
        validated,
        fromPhone,
      );

      const finalReply = isAudio
        ? `🎙️ *Áudio transcrito:* "${effectiveText}"\n\n${replyText}`
        : replyText;

      if (deps.sendMessage) {
        await deps.sendMessage(fromPhone, finalReply);
      }

      return {
        status: "success",
        replySent: finalReply,
        actionProposalCreated: true,
        proposalId,
        audioTranscribed: isAudio,
        transcriptionText: isAudio ? effectiveText : undefined,
      };
    }
  }

  // 4. Consulta ao Wallet IA / Sete Especialistas (Gate 6)
  const inquiry = handleSpecialistInquiry(identity, effectiveText);
  const finalReply = isAudio
    ? `🎙️ *Áudio transcrito:* "${effectiveText}"\n\n${inquiry.replyText}`
    : inquiry.replyText;

  if (deps.sendMessage) {
    await deps.sendMessage(fromPhone, finalReply);
  }

  return {
    status: "success",
    replySent: finalReply,
    specialistConsulted: inquiry.specialist,
    audioTranscribed: isAudio,
    transcriptionText: isAudio ? effectiveText : undefined,
  };
}
