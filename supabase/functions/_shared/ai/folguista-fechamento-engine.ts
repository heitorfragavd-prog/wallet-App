// Supabase Edge Functions & Deno Shared Module
// Engine Determinístico de Fechamentos Integrados dos Folguistas (Etapa 3D)

export interface ColaboradorInfo {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  telefone?: string | null;
  telegram_user_id?: number | null;
  telegram_username?: string | null;
}

export interface EscalaInfo {
  id: string;
  colaborador_id: string;
  data: string;
  turno: string;
  status: string;
}

export interface FechamentoValores {
  dinheiro: number;
  debito: number;
  credito: number;
  pix: number;
  voucher: number;
  sobra?: number;
}

export interface FechamentoAnexoItem {
  id: string;
  file_id: string;
  storage_path: string;
  mime_type: string;
  tipo_documento: "envelope" | "relatorio_caixa" | "relatorio_eyemobile" | "comprovante_voucher" | "comprovante_cartao_pix" | "outro";
  caption?: string;
  created_at: string;
  valor_extraido?: Partial<FechamentoValores>;
}

export interface EyemobileDeduplicatedSummary {
  dinheiro: number;
  debito: number;
  credito: number;
  pix: number;
  voucher: number;
  total: number;
  vendasContabilizadas: number;
  vendasDeduplicadasIgnoradas: number;
  vendasCanceladasIgnoradas: number;
}

export interface FechamentoConsolidacaoResult {
  fechamentoId: string;
  chaveOperacional: string;
  colaborador: {
    id?: string;
    nome: string;
    identificado: boolean;
    modoIdentificacao: "telegram_user_id" | "telegram_username" | "nome_e_escala" | "pendente";
  };
  escala?: {
    id: string;
    turno: string;
    data: string;
  } | null;
  dataFechamento: string;
  turno: string;
  valoresConsolidados: FechamentoValores;
  totalEnvelope: number;
  eyemobile: EyemobileDeduplicatedSummary;
  diferencas: string[];
  status: "recebendo_documentos" | "pendente_conferencia" | "divergencia" | "confirmado";
  sobraInformada: number;
  anexos: FechamentoAnexoItem[];
  novoRegistro: boolean;
  grupoDestinoCanonicaId?: string;
  mensagemGrupoFolguistas: string;
  mensagemGrupoOficial: string;
}

/**
 * Normaliza strings para matching seguro (sem acentos, minúsculas)
 */
export function normalizeTextSafe(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Determina o turno do colaborador com base na escala, horários operacionais da Rodo Point e comprovantes.
 * Regras:
 * - Fins de semana:
 *   - Manhã: 05h00 às 14h30
 *   - Tarde/Noite: 13h00 às 22h30
 * - Dias úteis: corte padrão às 13h30
 * - Se houver escala cadastrada, prioriza a escala do funcionário.
 */
export function resolveTurnoOperacional(params: {
  escala?: EscalaInfo | null;
  horaEnvio?: Date;
  captionOuTexto?: string;
}): string {
  const { escala, horaEnvio, captionOuTexto } = params;

  // 1. Se o colaborador possui escala ativa para a data, ela é a fonte prioritária
  if (escala?.turno && escala.turno !== "outro") {
    return escala.turno.toLowerCase();
  }

  const txt = normalizeTextSafe(captionOuTexto || "");
  if (txt.includes("manha") || txt.includes("abertura")) return "manha";
  if (txt.includes("noite") || txt.includes("fechamento") || txt.includes("tarde")) return "noite";
  if (txt.includes("integral")) return "integral";

  // 2. Horário do envio em America/Sao_Paulo (UTC-3)
  const now = horaEnvio || new Date();
  const utcHours = now.getUTCHours();
  const spHours = (utcHours - 3 + 24) % 24;
  const spMinutes = now.getUTCMinutes();
  const timeInMinutes = spHours * 60 + spMinutes;

  const dayOfWeek = (now.getUTCDay() - (utcHours < 3 ? 1 : 0) + 7) % 7; // 0=Dom, 6=Sáb
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend) {
    // Fins de semana: 05:00 a 14:30 = manhã; 14:31 em diante = noite
    if (timeInMinutes >= 5 * 60 && timeInMinutes <= 14 * 60 + 30) {
      return "manha";
    }
    return "noite";
  }

  // Dias úteis: corte às 13h30
  if (timeInMinutes < 13 * 60 + 30) {
    return "manha";
  }
  return "noite";
}

/**
 * Identifica o folguista de forma estrita e segura (Gate 3)
 */
export function resolveColaboradorSeguro(params: {
  telegramUserId?: number | null;
  telegramUsername?: string | null;
  senderFullName?: string | null;
  colaboradores: ColaboradorInfo[];
  escalasHoje: EscalaInfo[];
}): {
  colaborador: ColaboradorInfo | null;
  modo: "telegram_user_id" | "telegram_username" | "nome_e_escala" | "pendente";
  escala: EscalaInfo | null;
} {
  const { telegramUserId, telegramUsername, senderFullName, colaboradores, escalasHoje } = params;

  // 1. Prioridade absoluta: identificador imutável de Telegram (telegram_user_id)
  if (telegramUserId) {
    const byId = colaboradores.find((c) => Number(c.telegram_user_id) === Number(telegramUserId));
    if (byId) {
      const esc = escalasHoje.find((e) => e.colaborador_id === byId.id) || null;
      return { colaborador: byId, modo: "telegram_user_id", escala: esc };
    }
  }

  // 2. Prioridade secundária: username do Telegram
  if (telegramUsername) {
    const cleanUsername = telegramUsername.replace(/^@/, "").toLowerCase();
    const byUsername = colaboradores.find(
      (c) => c.telegram_username && c.telegram_username.replace(/^@/, "").toLowerCase() === cleanUsername
    );
    if (byUsername) {
      const esc = escalasHoje.find((e) => e.colaborador_id === byUsername.id) || null;
      return { colaborador: byUsername, modo: "telegram_username", escala: esc };
    }
  }

  // 3. Fallback controlado: nome do remetente cruzado OBRIGATORIAMENTE com escala ativa na data
  if (senderFullName) {
    const normSender = normalizeTextSafe(senderFullName);
    const candidateColabs = colaboradores.filter((c) => {
      const normColab = normalizeTextSafe(c.nome);
      return normColab.includes(normSender) || normSender.includes(normColab.split(" ")[0]);
    });

    if (candidateColabs.length === 1) {
      const colab = candidateColabs[0];
      // Verifica se o colaborador candidato realmente possui escala cadastrada para hoje
      const esc = escalasHoje.find((e) => e.colaborador_id === colab.id);
      if (esc) {
        return { colaborador: colab, modo: "nome_e_escala", escala: esc };
      }
    }
  }

  // Não foi possível identificar com certeza inquestionável
  return { colaborador: null, modo: "pendente", escala: null };
}

/**
 * Deduplica e totaliza as vendas do Eyemobile para o dia informado (Gate 8).
 * Elimina duplicatas históricas e cancelamentos sem truncamento.
 */
export function summarizeEyemobileTransactions(
  transactions: Array<{
    id?: string;
    valor: number | string;
    metodo_pagamento?: string | null;
    tipo?: string | null;
    status?: string | null;
    descricao?: string | null;
    observacoes?: string | null;
    origem?: string | null;
    deduplication_key?: string | null;
  }>
): EyemobileDeduplicatedSummary {
  const result: EyemobileDeduplicatedSummary = {
    dinheiro: 0,
    debito: 0,
    credito: 0,
    pix: 0,
    voucher: 0,
    total: 0,
    vendasContabilizadas: 0,
    vendasDeduplicadasIgnoradas: 0,
    vendasCanceladasIgnoradas: 0,
  };

  const seenSaleIds = new Set<string>();

  for (const tx of transactions) {
    // 1. Filtra cancelamentos e estornos
    const status = (tx.status || "").toLowerCase();
    const desc = (tx.descricao || "").toLowerCase();
    const obs = (tx.observacoes || "").toLowerCase();

    if (
      status === "cancelada" ||
      status === "cancelado" ||
      status === "estorno" ||
      desc.includes("cancelad") ||
      obs.includes("cancelad") ||
      desc.includes("estorno") ||
      obs.includes("estorno")
    ) {
      result.vendasCanceladasIgnoradas++;
      continue;
    }

    // 2. Extrai ID canônico de venda do Eyemobile
    const dedupKey = tx.deduplication_key || "";
    const keyId = dedupKey.startsWith("eyemobile:") ? dedupKey.replace("eyemobile:", "") : null;
    const textMatch = `${tx.descricao || ""} ${tx.observacoes || ""}`;
    const idMatch = textMatch.match(/#(\d+)/);
    const saleId = keyId || (idMatch?.[1] ? idMatch[1] : tx.id || null);

    if (saleId) {
      if (seenSaleIds.has(saleId)) {
        result.vendasDeduplicadasIgnoradas++;
        continue;
      }
      seenSaleIds.add(saleId);
    }

    // 3. Classifica forma de recebimento
    const val = Number(tx.valor) || 0;
    if (val <= 0) continue;

    const m = (tx.metodo_pagamento || "").toLowerCase();
    result.total += val;
    result.vendasContabilizadas++;

    if (m.includes("dinheiro")) {
      result.dinheiro += val;
    } else if (m.includes("deb") || m.includes("debito")) {
      result.debito += val;
    } else if (m.includes("cred") || m.includes("credito")) {
      result.credito += val;
    } else if (m.includes("pix")) {
      result.pix += val;
    } else if (
      m.includes("voucher") ||
      m.includes("alimentacao") ||
      m.includes("refeicao") ||
      m.includes("alelo") ||
      m.includes("sodexo") ||
      m.includes("ticket")
    ) {
      result.voucher += val;
    } else {
      // Método não mapeado expressamente vai para dinheiro por segurança ou débito
      result.dinheiro += val;
    }
  }

  // Arredonda para 2 casas decimais
  result.dinheiro = Math.round(result.dinheiro * 100) / 100;
  result.debito = Math.round(result.debito * 100) / 100;
  result.credito = Math.round(result.credito * 100) / 100;
  result.pix = Math.round(result.pix * 100) / 100;
  result.voucher = Math.round(result.voucher * 100) / 100;
  result.total = Math.round(result.total * 100) / 100;

  return result;
}

/**
 * Compara valores informados no fechamento físico vs totais apurados do Eyemobile
 */
export function compareFechamentoVsEyemobile(
  envelope: FechamentoValores,
  eyemobile: EyemobileDeduplicatedSummary
): string[] {
  const diferencas: string[] = [];
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (eyemobile.total <= 0) {
    return diferencas;
  }

  const checkDiff = (label: string, envVal: number, sysVal: number) => {
    const diff = envVal - sysVal;
    if (Math.abs(diff) > 0.5) {
      const diffStr = diff > 0 ? `+${fmt(diff)}` : fmt(diff);
      diferencas.push(
        `• <b>${label}:</b> Informado ${fmt(envVal)} vs PDV ${fmt(sysVal)} (diferença: ${diffStr})`
      );
    }
  };

  checkDiff("Dinheiro", envelope.dinheiro || 0, eyemobile.dinheiro || 0);
  checkDiff("Cartão Débito", envelope.debito || 0, eyemobile.debito || 0);
  checkDiff("Cartão Crédito", envelope.credito || 0, eyemobile.credito || 0);
  checkDiff("Pix", envelope.pix || 0, eyemobile.pix || 0);
  if ((envelope.voucher || 0) > 0 || (eyemobile.voucher || 0) > 0) {
    checkDiff("Voucher (Refeição/Alimentação)", envelope.voucher || 0, eyemobile.voucher || 0);
  }

  return diferencas;
}

/**
 * Gera mensagem de confirmação para o grupo Folguistas (Sigilosa, sem segredos financeiros)
 */
export function buildFolguistaConfirmationMessage(params: {
  nomeColaborador: string;
  dataFechamento: string;
  turno: string;
  totalFotos: number;
}): string {
  const { nomeColaborador, dataFechamento, turno, totalFotos } = params;
  return (
    `✅ <b>Fechamento Recebido com Sucesso!</b>\n\n` +
    `Olá, <b>${nomeColaborador}</b>! Recebemos seu envio para o turno de <b>${turno.toUpperCase()}</b> em <b>${dataFechamento}</b>.\n` +
    `📸 Documentos recebidos: <b>${totalFotos} foto(s)/comprovante(s)</b>.\n\n` +
    `Os documentos foram consolidados e encaminhados para a conferência administrativa no grupo oficial de fechamento. Obrigado pelo seu trabalho!`
  );
}

/**
 * Gera mensagem rica para o grupo oficial de fechamento (🧾 Fechamento Rodo Point)
 */
export function buildOfficialClosingForwardMessage(params: {
  colaboradorNome: string;
  dataFechamento: string;
  turno: string;
  envelope: FechamentoValores;
  eyemobile: EyemobileDeduplicatedSummary;
  diferencas: string[];
  status: string;
  sobra?: number;
  totalFotos: number;
  fechamentoId: string;
}): string {
  const {
    colaboradorNome,
    dataFechamento,
    turno,
    envelope,
    eyemobile,
    diferencas,
    status,
    sobra,
    totalFotos,
  } = params;

  const fmt = (v: number) =>
    (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const totalEnv =
    (envelope.dinheiro || 0) +
    (envelope.debito || 0) +
    (envelope.credito || 0) +
    (envelope.pix || 0) +
    (envelope.voucher || 0);

  let msg = `🧾 <b>FECHAMENTO DE CAIXA — FOLGUISTAS RODO POINT</b>\n\n`;
  msg += `👤 <b>Responsável:</b> ${colaboradorNome}\n`;
  msg += `📅 <b>Data:</b> ${dataFechamento} | <b>Turno:</b> ${turno.toUpperCase()}\n`;
  msg += `📸 <b>Anexos recebidos:</b> ${totalFotos} fotografia(s)/comprovante(s)\n\n`;

  msg += `<b>📄 Valores Extraídos / Conferidos:</b>\n`;
  msg += `💰 Dinheiro: <b>${fmt(envelope.dinheiro)}</b>\n`;
  msg += `💳 Débito: <b>${fmt(envelope.debito)}</b>\n`;
  msg += `💳 Crédito: <b>${fmt(envelope.credito)}</b>\n`;
  msg += `📲 Pix: <b>${fmt(envelope.pix)}</b>\n`;
  if ((envelope.voucher || 0) > 0) {
    msg += `🎫 Voucher (VA/VR): <b>${fmt(envelope.voucher)}</b>\n`;
  }
  msg += `📊 <b>Total Geral: ${fmt(totalEnv)}</b>\n\n`;

  if (sobra && sobra > 0) {
    msg += `💵 <b>Sobra Informada pelo Caixa:</b> ${fmt(sobra)}\n`;
    msg += `⚠️ <i>A sobra só será lançada no saldo após aprovação administrativa.</i>\n\n`;
  }

  if (eyemobile.total > 0) {
    msg += `<b>💻 Sistema Eyemobile (Deduplicado):</b>\n`;
    msg += `• Total PDV: <b>${fmt(eyemobile.total)}</b> (${eyemobile.vendasContabilizadas} vendas válidas)\n`;
    if (eyemobile.vendasDeduplicadasIgnoradas > 0) {
      msg += `• Duplicatas ignoradas com segurança: ${eyemobile.vendasDeduplicadasIgnoradas}\n`;
    }
    msg += `\n`;
  }

  if (diferencas.length > 0) {
    msg += `⚠️ <b>Divergências Encontradas:</b>\n`;
    diferencas.forEach((d) => (msg += `${d}\n`));
    msg += `\nStatus: <b>DIVERGÊNCIA</b> (Aguardando conferência administrativa)\n`;
  } else {
    msg += `✅ <b>Valores conferem perfeitamente com o Eyemobile!</b>\n`;
    msg += `Status: <b>AGUARDANDO APROVAÇÃO</b>\n`;
  }

  msg += `\n🔒 <i>Disponível para conferência, visualização das fotos e aprovação na Central de Conversas.</i>`;
  return msg;
}
