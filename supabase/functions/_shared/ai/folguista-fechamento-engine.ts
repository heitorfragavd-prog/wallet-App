// Supabase Edge Functions & Deno Shared Module
// Engine Determinístico de Fechamentos Integrados dos Folguistas (Etapa 3D.1)
// Correção de Integridade Financeira, Deduplicação Robusta e Menor Privilégio

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
  outros?: number;
  sobra?: number;
}

export interface FechamentoAnexoItem {
  id: string;
  file_id: string;
  storage_path: string;
  mime_type: string;
  tipo_documento: "relatorio_consolidado" | "comprovante_individual" | "envelope" | "comprovante_voucher" | "outro";
  caption?: string;
  created_at: string;
  sha256?: string;
  is_duplicata?: boolean;
  valor_extraido?: Partial<FechamentoValores>;
}

export interface EyemobileDeduplicatedSummary {
  dinheiro: number;
  debito: number;
  credito: number;
  pix: number;
  voucher: number;
  outros: number;
  total: number;
  vendasContabilizadas: number;
  vendasDeduplicadasIgnoradas: number;
  vendasCanceladasIgnoradas: number;
}

export interface ConferenciaEyemobileResult {
  tipoConferencia: "total" | "parcial" | "sem_dados_eyemobile";
  diferencas: string[];
  status: "pendente_conferencia" | "divergencia" | "confirmado";
  observacaoPeriodo?: string;
}

/**
 * Retorna a data operacional no fuso America/Sao_Paulo (UTC-3) no formato YYYY-MM-DD.
 * Evita que envios após 21h em São Paulo caiam no dia seguinte em UTC.
 */
export function getOperationalDateBR(date?: Date): string {
  const d = date || new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Converte YYYY-MM-DD para DD/MM/AAAA
 */
export function formatDateBR(dateIso: string): string {
  if (!dateIso) return "";
  if (dateIso.includes("/")) return dateIso;
  const parts = dateIso.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateIso;
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

export interface TurnoOperacionalResolution {
  turno: string;
  isAmbiguo: boolean;
  motivoAmbiguidade?: string;
  dataOperacionalEfetiva: string;
  origemDecisao: "escala" | "legenda_ou_relatorio" | "horario_operacional" | "madrugada_expediente_anterior";
}

/**
 * Determina o turno do colaborador com detalhamento analítico (Gate 3).
 * Prioridade estrita:
 * 1. Escala cadastrada e válida.
 * 2. Funcionário responsável vinculado à escala.
 * 3. Identificação do relatório de caixa ou legenda explícita.
 * 4. Horários operacionais configurados:
 *    - Fins de semana:
 *      - 05h00 às 12h59: Manhã (Abertura)
 *      - 13h00 às 14h30: Janela de sobreposição (AMBÍGUO se não houver escala/legenda)
 *      - 14h31 às 23h59: Noite (Fechamento)
 *      - 00h00 às 04h59: Noite do expediente anterior (saída da loja de madrugada)
 */
export function resolveTurnoOperacionalDetalhado(params: {
  escala?: EscalaInfo | null;
  horaEnvio?: Date;
  captionOuTexto?: string;
  relatorioTexto?: string;
}): TurnoOperacionalResolution {
  const { escala, horaEnvio, captionOuTexto, relatorioTexto } = params;
  const now = horaEnvio || new Date();
  const hojeOp = getOperationalDateBR(now);

  // 1. Escala ativa do colaborador é a fonte normativa primária (Prioridade 1 & 2)
  if (escala?.turno && escala.turno !== "outro") {
    const t = escala.turno.toLowerCase();
    return {
      turno: t,
      isAmbiguo: false,
      dataOperacionalEfetiva: escala.data || hojeOp,
      origemDecisao: "escala",
    };
  }

  // 2. Menção na legenda ou no texto do relatório (Prioridade 3)
  const fullText = normalizeTextSafe(`${captionOuTexto || ""} ${relatorioTexto || ""}`);
  if (fullText.includes("manha") || fullText.includes("abertura") || fullText.includes("1o turno") || fullText.includes("1º turno")) {
    return {
      turno: "manha",
      isAmbiguo: false,
      dataOperacionalEfetiva: hojeOp,
      origemDecisao: "legenda_ou_relatorio",
    };
  }

  if (
    fullText.includes("noite") ||
    fullText.includes("fechamento") ||
    fullText.includes("2o turno") ||
    fullText.includes("2º turno") ||
    fullText.includes("tarde")
  ) {
    return {
      turno: "noite",
      isAmbiguo: false,
      dataOperacionalEfetiva: hojeOp,
      origemDecisao: "legenda_ou_relatorio",
    };
  }

  if (fullText.includes("integral")) {
    return {
      turno: "integral",
      isAmbiguo: false,
      dataOperacionalEfetiva: hojeOp,
      origemDecisao: "legenda_ou_relatorio",
    };
  }

  // 3. Horário operacional no fuso America/Sao_Paulo (Prioridade 4)
  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  });

  const timeParts = timeFormatter.format(now).split(":");
  const spHours = parseInt(timeParts[0], 10);
  const spMinutes = parseInt(timeParts[1], 10);
  const timeInMinutes = spHours * 60 + spMinutes;

  const weekday = weekdayFormatter.format(now).toLowerCase();
  const isWeekend = weekday.startsWith("sat") || weekday.startsWith("sun");

  // Madrugada pós-fechamento (00h00 às 04h59): folguista enviando após sair da loja
  if (timeInMinutes < 5 * 60) {
    // Retroage a data operacional para o dia anterior
    const ontemEpoch = now.getTime() - 24 * 60 * 60 * 1000;
    const ontemOp = getOperationalDateBR(new Date(ontemEpoch));
    return {
      turno: "noite",
      isAmbiguo: false,
      dataOperacionalEfetiva: ontemOp,
      origemDecisao: "madrugada_expediente_anterior",
    };
  }

  if (isWeekend) {
    // Fins de semana:
    // 05:00 às 12:59 -> Manhã
    if (timeInMinutes < 13 * 60) {
      return {
        turno: "manha",
        isAmbiguo: false,
        dataOperacionalEfetiva: hojeOp,
        origemDecisao: "horario_operacional",
      };
    }

    // 13:00 às 14:30 -> Janela de sobreposição real na Rodo Point (AMBÍGUO se não houver escala/legenda)
    if (timeInMinutes <= 14 * 60 + 30) {
      return {
        turno: "ambiguo_transicao",
        isAmbiguo: true,
        motivoAmbiguidade: `Envio realizado às ${timeParts.join(":")} (janela de sobreposição 13h00 às 14h30) sem escala ou indicação explícita. Requer validação de turno.`,
        dataOperacionalEfetiva: hojeOp,
        origemDecisao: "horario_operacional",
      };
    }

    // 14:31 às 23:59 -> Noite
    return {
      turno: "noite",
      isAmbiguo: false,
      dataOperacionalEfetiva: hojeOp,
      origemDecisao: "horario_operacional",
    };
  }

  // Dias úteis: corte padrão às 13h30
  if (timeInMinutes < 13 * 60 + 30) {
    return {
      turno: "manha",
      isAmbiguo: false,
      dataOperacionalEfetiva: hojeOp,
      origemDecisao: "horario_operacional",
    };
  }

  return {
    turno: "noite",
    isAmbiguo: false,
    dataOperacionalEfetiva: hojeOp,
    origemDecisao: "horario_operacional",
  };
}

/**
 * Retorna o turno do colaborador como string pura retrocompatível.
 */
export function resolveTurnoOperacional(params: {
  escala?: EscalaInfo | null;
  horaEnvio?: Date;
  captionOuTexto?: string;
  relatorioTexto?: string;
}): string {
  return resolveTurnoOperacionalDetalhado(params).turno;
}

/**
 * Identifica o folguista com estrita segurança (Gate 3).
 * NÃO vincula nem aprova identidade de terceiros baseado em nome coincidente.
 * Requer correspondência direta do Telegram imutável (telegram_user_id ou telegram_username pré-cadastrado).
 * Se não houver correspondência, marca como PENDENTE de identificação.
 */
export function resolveColaboradorSeguro(params: {
  telegramUserId?: number | null;
  telegramUsername?: string | null;
  senderFullName?: string | null;
  colaboradores: ColaboradorInfo[];
  escalasHoje: EscalaInfo[];
}): {
  colaborador: ColaboradorInfo | null;
  candidatoSugerido: ColaboradorInfo | null;
  modo: "telegram_user_id" | "telegram_username" | "pendente";
  identidadePendente: boolean;
  escala: EscalaInfo | null;
} {
  const { telegramUserId, telegramUsername, senderFullName, colaboradores, escalasHoje } = params;

  // 1. Prioridade absoluta: telegram_user_id imutável
  if (telegramUserId) {
    const byId = colaboradores.find((c) => Number(c.telegram_user_id) === Number(telegramUserId));
    if (byId) {
      const esc = escalasHoje.find((e) => e.colaborador_id === byId.id) || null;
      return {
        colaborador: byId,
        candidatoSugerido: byId,
        modo: "telegram_user_id",
        identidadePendente: false,
        escala: esc,
      };
    }
  }

  // 2. Prioridade secundária: username pré-cadastrado no banco
  if (telegramUsername) {
    const cleanUsername = telegramUsername.replace(/^@/, "").toLowerCase();
    const byUsername = colaboradores.find(
      (c) => c.telegram_username && c.telegram_username.replace(/^@/, "").toLowerCase() === cleanUsername
    );
    if (byUsername) {
      const esc = escalasHoje.find((e) => e.colaborador_id === byUsername.id) || null;
      return {
        colaborador: byUsername,
        candidatoSugerido: byUsername,
        modo: "telegram_username",
        identidadePendente: false,
        escala: esc,
      };
    }
  }

  // 3. Se não há vínculo imutável pré-existente, NÃO vincular automaticamente.
  // Pode registrar um candidato sugerido para auditoria humana, mas o status permanece PENDENTE.
  let candidato: ColaboradorInfo | null = null;
  let escCandidato: EscalaInfo | null = null;

  if (senderFullName) {
    const normSender = normalizeTextSafe(senderFullName);
    const candidateColabs = colaboradores.filter((c) => {
      const normColab = normalizeTextSafe(c.nome);
      return normColab.includes(normSender) || normSender.includes(normColab.split(" ")[0]);
    });

    if (candidateColabs.length === 1) {
      candidato = candidateColabs[0];
      escCandidato = escalasHoje.find((e) => e.colaborador_id === candidato?.id) || null;
    }
  }

  return {
    colaborador: null,
    candidatoSugerido: candidato,
    modo: "pendente",
    identidadePendente: true,
    escala: escCandidato,
  };
}

/**
 * Classifica o documento recebido pelo conteúdo e legenda para evitar dupla contagem (Gate 1).
 */
export function classifyDocumentType(params: {
  caption?: string;
  detectedValues?: Partial<FechamentoValores>;
  isDocPdf?: boolean;
}): "relatorio_consolidado" | "comprovante_individual" | "envelope" | "comprovante_voucher" | "outro" {
  const { caption, detectedValues, isDocPdf } = params;
  const txt = normalizeTextSafe(caption || "");

  if (txt.includes("relatorio") || txt.includes("fechamento de caixa") || txt.includes("totalizador") || txt.includes("fiscal") || isDocPdf) {
    return "relatorio_consolidado";
  }

  if (txt.includes("envelope") || txt.includes("sangria") || txt.includes("sobra")) {
    return "envelope";
  }

  if (
    txt.includes("voucher") ||
    txt.includes("alelo") ||
    txt.includes("sodexo") ||
    txt.includes("ticket") ||
    /\b(vr|va)\b/i.test(txt) ||
    txt.includes("vale refeicao") ||
    txt.includes("vale alimentacao")
  ) {
    return "comprovante_voucher";
  }

  // Se tem múltiplas formas de pagamento preenchidas simultaneamente, provável relatório/fechamento geral
  const formsFilled = [
    (detectedValues?.dinheiro || 0) > 0,
    (detectedValues?.debito || 0) > 0,
    (detectedValues?.credito || 0) > 0,
    (detectedValues?.pix || 0) > 0,
  ].filter(Boolean).length;

  if (formsFilled >= 2) {
    return "relatorio_consolidado";
  }

  if ((detectedValues?.voucher || 0) > 0 && formsFilled === 0) {
    return "comprovante_voucher";
  }

  return "comprovante_individual";
}

/**
 * Consolida com precisão matemática os valores de múltiplos anexos de um mesmo turno (Gate 1).
 * Regras:
 * - Fotos repetidas (mesmo sha256 ou mesmo file_id) são ignoradas.
 * - Se houver relatório consolidado, seus valores servem como autoridade primária;
 *   comprovantes individuais adicionais não são somados por cima dele para evitar duplicação.
 * - Se NÃO houver relatório consolidado, comprovantes individuais complementares são SOMADOS.
 * - Vouchers individuais separados são SOMADOS.
 * - O envelope informa dinheiro físico e eventual sobra.
 */
export function consolidateFechamentoValues(anexos: FechamentoAnexoItem[]): {
  valores: FechamentoValores;
  sobra: number;
  totalGeral: number;
  anexosProcessados: FechamentoAnexoItem[];
} {
  const round2 = (v: number) => Math.round((v || 0) * 100) / 100;

  const seenHashes = new Set<string>();
  const seenFileIds = new Set<string>();
  const validAnexos: FechamentoAnexoItem[] = [];

  // 1. Filtrar duplicatas exatas
  for (const anexo of anexos) {
    const hash = anexo.sha256;
    const fileId = anexo.file_id;

    if (hash && seenHashes.has(hash)) {
      anexo.is_duplicata = true;
      validAnexos.push(anexo);
      continue;
    }
    if (fileId && seenFileIds.has(fileId)) {
      anexo.is_duplicata = true;
      validAnexos.push(anexo);
      continue;
    }

    if (hash) seenHashes.add(hash);
    if (fileId) seenFileIds.add(fileId);
    anexo.is_duplicata = false;
    validAnexos.push(anexo);
  }

  const activeAnexos = validAnexos.filter((a) => !a.is_duplicata);

  // 2. Verificar se existe ao menos um relatório consolidado
  const relatorioConsolidado = activeAnexos.find((a) => a.tipo_documento === "relatorio_consolidado");

  let dinheiro = 0;
  let debito = 0;
  let credito = 0;
  let pix = 0;
  let voucher = 0;
  let outros = 0;
  let sobra = 0;

  if (relatorioConsolidado && relatorioConsolidado.valor_extraido) {
    // Relatório consolidado é autoridade primária
    const rTot = relatorioConsolidado.valor_extraido;
    dinheiro = rTot.dinheiro || 0;
    debito = rTot.debito || 0;
    credito = rTot.credito || 0;
    pix = rTot.pix || 0;
    voucher = rTot.voucher || 0;
    outros = rTot.outros || 0;
    sobra = rTot.sobra || 0;

    // Se houver anexo de envelope específico, este pode refinar o dinheiro ou anotar a sobra física
    const envelope = activeAnexos.find((a) => a.tipo_documento === "envelope");
    if (envelope?.valor_extraido) {
      if ((envelope.valor_extraido.sobra || 0) > 0) {
        sobra = envelope.valor_extraido.sobra || 0;
      }
      if ((envelope.valor_extraido.dinheiro || 0) > 0 && dinheiro === 0) {
        dinheiro = envelope.valor_extraido.dinheiro || 0;
      }
    }

    // Se o relatório não registrou vouchers, mas há comprovantes de voucher avulsos, inclui
    if (voucher === 0) {
      const voucherAnexos = activeAnexos.filter(
        (a) => a.id !== relatorioConsolidado.id && a.tipo_documento === "comprovante_voucher"
      );
      for (const va of voucherAnexos) {
        voucher += va.valor_extraido?.voucher || 0;
      }
    }
  } else {
    // Sem relatório consolidado: SOMA comprovantes individuais complementares
    for (const anexo of activeAnexos) {
      const val = anexo.valor_extraido;
      if (!val) continue;

      dinheiro += val.dinheiro || 0;
      debito += val.debito || 0;
      credito += val.credito || 0;
      pix += val.pix || 0;
      voucher += val.voucher || 0;
      outros += val.outros || 0;
      if ((val.sobra || 0) > 0 && sobra === 0) {
        sobra = val.sobra || 0;
      }
    }
  }

  const valores: FechamentoValores = {
    dinheiro: round2(dinheiro),
    debito: round2(debito),
    credito: round2(credito),
    pix: round2(pix),
    voucher: round2(voucher),
    outros: round2(outros),
    sobra: round2(sobra),
  };

  const totalGeral = round2(
    valores.dinheiro + valores.debito + valores.credito + valores.pix + valores.voucher + (valores.outros || 0)
  );

  return {
    valores,
    sobra: round2(sobra),
    totalGeral,
    anexosProcessados: validAnexos,
  };
}

/**
 * Deduplica e totaliza as vendas do Eyemobile para o dia informado (Gate 2 & Gate 8).
 * - Considera apenas origem Eyemobile.
 * - Desconsidera cancelamentos e estornos.
 * - Deduplica vendas respeitando splits de pagamentos múltiplos.
 * - Métodos desconhecidos NÃO são convertidos em dinheiro (são classificados como 'outros').
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
    outros: 0,
    total: 0,
    vendasContabilizadas: 0,
    vendasDeduplicadasIgnoradas: 0,
    vendasCanceladasIgnoradas: 0,
  };

  const seenSplitKeys = new Set<string>();

  for (const tx of transactions) {
    // 1. Filtrar origem estrita Eyemobile se informada
    const origem = (tx.origem || "").toLowerCase();
    const dedupKey = tx.deduplication_key || "";
    const isEyemobile =
      origem === "eyemobile" ||
      dedupKey.startsWith("eyemobile:") ||
      (tx.descricao || "").toLowerCase().includes("eyemobile");

    if (!isEyemobile && origem !== "") {
      // Ignora transações que pertencem a outra origem (ex: divipay, manual)
      continue;
    }

    // 2. Filtra cancelamentos e estornos
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

    // 3. Deduplicação canônica por split e ID de venda
    // Uma venda pode ter splits (ex: R$ 30 dinheiro + R$ 20 cartão).
    // O split key canônico é deduplication_key OU `${saleId}_${metodo}_${valor}`
    const keyId = dedupKey.startsWith("eyemobile:") ? dedupKey.replace("eyemobile:", "") : null;
    const textMatch = `${tx.descricao || ""} ${tx.observacoes || ""}`;
    const idMatch = textMatch.match(/#(\d+)/);
    const saleId = keyId || (idMatch?.[1] ? idMatch[1] : tx.id || null);

    const m = (tx.metodo_pagamento || "outros").toLowerCase();
    const val = Number(tx.valor) || 0;
    if (val <= 0) continue;

    // Chave única para evitar duplicatas exatas mantendo splits distintos
    const uniqueSplitKey = dedupKey || `${saleId}_${m}_${val}`;

    if (seenSplitKeys.has(uniqueSplitKey)) {
      result.vendasDeduplicadasIgnoradas++;
      continue;
    }
    seenSplitKeys.add(uniqueSplitKey);

    // 4. Classificação canônica sem converter método desconhecido em dinheiro
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
      // Método não identificado não vai para dinheiro por segurança
      result.outros += val;
    }
  }

  const round2 = (v: number) => Math.round(v * 100) / 100;
  result.dinheiro = round2(result.dinheiro);
  result.debito = round2(result.debito);
  result.credito = round2(result.credito);
  result.pix = round2(result.pix);
  result.voucher = round2(result.voucher);
  result.outros = round2(result.outros);
  result.total = round2(result.total);

  return result;
}

/**
 * Compara valores informados vs totais apurados do Eyemobile (Gate 2).
 * Suporta assinatura por objeto ou posicional para retrocompatibilidade.
 */
export function compareFechamentoVsEyemobile(
  paramsOrEnvelope:
    | {
        envelope: FechamentoValores;
        eyemobile: EyemobileDeduplicatedSummary;
        turno?: string;
      }
    | FechamentoValores,
  legacyEyemobile?: EyemobileDeduplicatedSummary,
  legacyTurno?: string
): ConferenciaEyemobileResult & Array<string> {
  let envelope: FechamentoValores;
  let eyemobile: EyemobileDeduplicatedSummary;
  let turno = "integral";

  if ("envelope" in (paramsOrEnvelope as Record<string, unknown>)) {
    const p = paramsOrEnvelope as {
      envelope: FechamentoValores;
      eyemobile: EyemobileDeduplicatedSummary;
      turno?: string;
    };
    envelope = p.envelope;
    eyemobile = p.eyemobile;
    turno = p.turno || "integral";
  } else {
    envelope = paramsOrEnvelope as FechamentoValores;
    eyemobile = legacyEyemobile || ({} as EyemobileDeduplicatedSummary);
    turno = legacyTurno || "integral";
  }

  const diferencas: string[] = [];
  const fmt = (v: number) =>
    (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (!eyemobile || eyemobile.total <= 0) {
    const semDados = Object.assign([] as string[], {
      tipoConferencia: "sem_dados_eyemobile" as const,
      diferencas: [],
      status: "pendente_conferencia" as const,
      observacaoPeriodo: "Não foram encontradas transações registradas no Eyemobile para esta data.",
    });
    return semDados;
  }

  const totalEnvelope =
    (envelope.dinheiro || 0) +
    (envelope.debito || 0) +
    (envelope.credito || 0) +
    (envelope.pix || 0) +
    (envelope.voucher || 0) +
    (envelope.outros || 0);

  // Se o fechamento for de turno específico (manhã ou noite) e o faturamento do Eyemobile for substancialmente maior
  const isTurnoParcial = (turno === "manha" || turno === "noite") && totalEnvelope < eyemobile.total - 1.0;

  if (isTurnoParcial) {
    const parcial = Object.assign([] as string[], {
      tipoConferencia: "parcial" as const,
      diferencas: [],
      status: "pendente_conferencia" as const,
      observacaoPeriodo: `Conferência Parcial do Turno: O envelope registrou ${fmt(totalEnvelope)} para o turno ${turno.toUpperCase()}, enquanto o Eyemobile acumula ${fmt(eyemobile.total)} no dia. Requer aprovação executiva com a escala do período.`,
    });
    return parcial;
  }

  // Comparação detalhada por modalidade
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

  const resultObj = Object.assign([...diferencas], {
    tipoConferencia: "total" as const,
    diferencas,
    status: (diferencas.length > 0 ? "divergencia" : "confirmado") as "divergencia" | "confirmado",
  });

  return resultObj;
}

/**
 * Gera mensagem amigável e com sigilo absoluto para o grupo Folguistas (Gate 11)
 */
export function buildFolguistaConfirmationMessage(params: {
  nomeColaborador: string;
  dataFechamento: string;
  turno: string;
  totalFotos: number;
  identidadePendente?: boolean;
  espelhamentoSucesso?: boolean;
  isAmbiguo?: boolean;
}): string {
  const { nomeColaborador, dataFechamento, turno, totalFotos, identidadePendente, espelhamentoSucesso, isAmbiguo } = params;

  let msg = `✅ <b>Fechamento Recebido com Sucesso!</b>\n\n`;
  msg += `Olá, <b>${nomeColaborador}</b>! Recebemos seu envio para o turno de <b>${turno.toUpperCase()}</b> em <b>${dataFechamento}</b>.\n`;
  msg += `📸 Documentos recebidos: <b>${totalFotos} foto(s)/comprovante(s)</b>.\n\n`;

  if (isAmbiguo) {
    msg += `⚠️ <i>Atenção: Seu envio ocorreu no horário de sobreposição de turnos (13h00 às 14h30) sem escala vinculada. Caso seu fechamento seja especificamente da Noite ou da Manhã, você pode confirmar respondendo com "Manhã" ou "Noite".</i>\n\n`;
  }

  if (identidadePendente) {
    msg += `ℹ️ <i>Aviso: Identificamos que seu perfil de Telegram aguarda validação cadastral da administração. Seus comprovantes foram salvos com segurança para conferência.</i>\n\n`;
  }

  if (espelhamentoSucesso === false) {
    msg += `Os documentos foram arquivados com segurança no sistema e a conferência administrativa será realizada em seguida. Obrigado pelo seu trabalho!`;
  } else {
    msg += `Os documentos foram consolidados e encaminhados para a conferência administrativa no grupo oficial de fechamento. Obrigado pelo seu trabalho!`;
  }

  return msg;
}

/**
 * Gera mensagem rica e formatada para o grupo oficial de fechamento (Gate 7 & Gate 9)
 * Retorna string formatada (com suporte a toString para retrocompatibilidade) e propriedades estruturadas.
 */
export function buildOfficialClosingForwardMessage(params: {
  colaboradorNome: string;
  dataFechamento: string;
  turno: string;
  envelope: FechamentoValores;
  eyemobile: EyemobileDeduplicatedSummary;
  conferencia?: ConferenciaEyemobileResult;
  diferencas?: string[];
  status?: string;
  sobra?: number;
  totalFotos: number;
  fechamentoId: string;
  identidadePendente?: boolean;
  fotosDuplicadasIgnoradas?: number;
}): {
  captionResumido: string;
  relatorioCompleto: string;
  toString: () => string;
} & string {
  const {
    colaboradorNome,
    dataFechamento,
    turno,
    envelope,
    eyemobile,
    conferencia,
    diferencas: legacyDiffs,
    sobra,
    totalFotos,
    identidadePendente,
    fotosDuplicadasIgnoradas,
  } = params;

  const fmt = (v: number) =>
    (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const totalEnv =
    (envelope.dinheiro || 0) +
    (envelope.debito || 0) +
    (envelope.credito || 0) +
    (envelope.pix || 0) +
    (envelope.voucher || 0) +
    (envelope.outros || 0);

  const diffs = conferencia?.diferencas || legacyDiffs || [];
  const tipoConf = conferencia?.tipoConferencia || "total";

  // 1. Caption Resumido para sendPhoto (máximo 1024 caracteres no Telegram)
  let cap = `🧾 <b>FECHAMENTO CAIXA — RODO POINT</b>\n`;
  cap += `👤 <b>${identidadePendente ? "⚠️ IDENTIDADE PENDENTE: " : ""}${colaboradorNome}</b>\n`;
  cap += `📅 <b>Data:</b> ${dataFechamento} | <b>Turno:</b> ${turno.toUpperCase()}\n`;
  cap += `📸 <b>Anexos:</b> ${totalFotos} válido(s)`;
  if (fotosDuplicadasIgnoradas && fotosDuplicadasIgnoradas > 0) {
    cap += ` (${fotosDuplicadasIgnoradas} repetida(s) ignorada(s))`;
  }
  cap += `\n💰 <b>Total Informado: ${fmt(totalEnv)}</b>\n`;

  if (sobra && sobra > 0) {
    cap += `💵 Sobra Informada: ${fmt(sobra)} (pendente aprovação)\n`;
  }

  if (tipoConf === "parcial") {
    cap += `⚠️ <b>Conferência Parcial:</b> Turno vs Dia Eyemobile (${fmt(eyemobile.total)})\n`;
  } else if (diffs.length > 0) {
    cap += `⚠️ <b>Status: DIVERGÊNCIA</b> (Aguardando conferência)\n`;
  } else {
    cap += `✅ <b>Status: CONFERIDO</b> (Eyemobile: ${fmt(eyemobile.total)})\n`;
  }

  // 2. Relatório Completo para sendMessage
  let rel = `🧾 <b>FECHAMENTO DE CAIXA — FOLGUISTAS RODO POINT</b>\n\n`;
  if (identidadePendente) {
    rel += `⚠️ <b>AVISO DE SEGURANÇA: IDENTIDADE PENDENTE</b>\n`;
    rel += `O remetente (${colaboradorNome}) não possui telegram_user_id pré-vinculado. Requer confirmação executiva.\n\n`;
  }
  rel += `👤 <b>Responsável:</b> ${colaboradorNome}\n`;
  rel += `📅 <b>Data:</b> ${dataFechamento} | <b>Turno:</b> ${turno.toUpperCase()}\n`;
  rel += `📸 <b>Anexos recebidos:</b> ${totalFotos} fotografia(s)/comprovante(s)\n`;
  if (fotosDuplicadasIgnoradas && fotosDuplicadasIgnoradas > 0) {
    rel += `ℹ️ <i>${fotosDuplicadasIgnoradas} fotografia(s) repetida(s) ignorada(s) com segurança.</i>\n`;
  }
  rel += `\n<b>📄 Valores Extraídos / Consolidados:</b>\n`;
  rel += `💰 Dinheiro: <b>${fmt(envelope.dinheiro)}</b>\n`;
  rel += `💳 Débito: <b>${fmt(envelope.debito)}</b>\n`;
  rel += `💳 Crédito: <b>${fmt(envelope.credito)}</b>\n`;
  rel += `📲 Pix: <b>${fmt(envelope.pix)}</b>\n`;
  if ((envelope.voucher || 0) > 0) {
    rel += `🎫 Voucher (VA/VR): <b>${fmt(envelope.voucher)}</b>\n`;
  }
  if ((envelope.outros || 0) > 0) {
    rel += `🏷️ Outros / Desconhecido: <b>${fmt(envelope.outros)}</b>\n`;
  }
  rel += `📊 <b>Total Geral: ${fmt(totalEnv)}</b>\n\n`;

  if (sobra && sobra > 0) {
    rel += `💵 <b>Sobra Informada pelo Caixa:</b> ${fmt(sobra)}\n`;
    rel += `⚠️ <i>A sobra só será lançada no saldo após aprovação administrativa.</i>\n\n`;
  }

  if (eyemobile.total > 0) {
    rel += `<b>💻 Sistema Eyemobile (Deduplicado):</b>\n`;
    rel += `• Total PDV: <b>${fmt(eyemobile.total)}</b> (${eyemobile.vendasContabilizadas} vendas válidas)\n`;
    if (eyemobile.vendasDeduplicadasIgnoradas > 0) {
      rel += `• Duplicatas ignoradas com segurança: ${eyemobile.vendasDeduplicadasIgnoradas}\n`;
    }
    if (eyemobile.vendasCanceladasIgnoradas > 0) {
      rel += `• Vendas canceladas excluídas: ${eyemobile.vendasCanceladasIgnoradas}\n`;
    }
    rel += `\n`;
  }

  if (conferencia?.observacaoPeriodo) {
    rel += `ℹ️ <b>Observação de Período:</b>\n${conferencia.observacaoPeriodo}\n\n`;
  }

  if (diffs.length > 0) {
    rel += `⚠️ <b>Divergências Encontradas:</b>\n`;
    diffs.forEach((d) => (rel += `${d}\n`));
    rel += `\nStatus: <b>DIVERGÊNCIA</b> (Aguardando conferência administrativa)\n`;
  } else if (tipoConf === "parcial") {
    rel += `Status: <b>AGUARDANDO CONFERÊNCIA DE TURNO</b>\n`;
  } else {
    rel += `✅ <b>Valores conferem perfeitamente com o Eyemobile!</b>\n`;
    rel += `Status: <b>AGUARDANDO APROVAÇÃO</b>\n`;
  }

  rel += `\n🔒 <i>Disponível para conferência, visualização das fotos e aprovação na Central de Conversas.</i>`;

  const ret = Object.assign(new String(rel), {
    captionResumido: cap,
    relatorioCompleto: rel,
    toString: () => rel,
  }) as any;

  return ret;
}
