/**
 * folguistaResponseParser.ts
 *
 * Motor de interpretação em linguagem natural das mensagens dos folguistas (Gate 3).
 * Identifica dia, turno, disponibilidade, indisponibilidade, confirmações de sexta-feira,
 * desistências e formula perguntas de esclarecimento adequadas.
 */

import type { FolguistaAvailabilityParsed, TurnoId } from "../types";

export interface ParseFolguistaMessageOptions {
  colaboradorId?: string;
  colaboradorNome?: string;
  isFridayConfirmationContext?: boolean; // Se estamos no contexto de reconfirmação da escala
}

/**
 * Normaliza o texto removendo acentos desnecessários e caracteres especiais
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Interpreta a mensagem enviada pelo folguista
 */
export function parseFolguistaMessage(
  rawText: string,
  options: ParseFolguistaMessageOptions = {}
): FolguistaAvailabilityParsed {
  const norm = normalizeText(rawText);
  const { colaboradorId, colaboradorNome, isFridayConfirmationContext = false } = options;

  // ─── 1. Detecção de Desistência / Cancelamento ─────────────────────────────────
  const desistenciaKeywords = [
    "nao vou conseguir",
    "nao consigo ir",
    "nao posso mais",
    "tive um imprevisto",
    "nao vou poder",
    "cancela minha presenca",
    "preciso cancelar",
    "nao vai dar",
    "nao posso ir",
    "infelizmente nao vou",
    "desisto",
  ];
  const isDesistencia = desistenciaKeywords.some((k) => norm.includes(k));

  if (isDesistencia) {
    return {
      colaboradorId,
      colaboradorNome,
      disponibilidadeGeral: "indisponivel",
      dias: {
        sabado: { disponivel: false, turnos: [], ambigua: false },
        domingo: { disponivel: false, turnos: [], ambigua: false },
      },
      esclarecimentoNecessario: false,
      respostaConfirmacaoAgradecimento:
        "Entendido. Registrei sua desistência para este fim de semana e os administradores foram avisados para providenciar a substituição.",
      tipoMensagem: "desistencia",
    };
  }

  // ─── 2. Detecção de Confirmação Explícita de Presença (Sexta-feira) ────────────
  const confirmacaoKeywords = [
    "confirmado",
    "confirmadissimo",
    "sim, vou sim",
    "vou sim",
    "pode contar comigo",
    "tudo certo",
    "estou confirmado",
    "confirmo",
    "fechado",
    "beleza, vou",
    "ta certo",
    "estarei la",
    "com certeza",
    "positivo",
  ];
  const isConfirmacao = confirmacaoKeywords.some((k) => norm.includes(k));

  if (isFridayConfirmationContext && (isConfirmacao || (norm.startsWith("sim") && !norm.includes("mas")))) {
    return {
      colaboradorId,
      colaboradorNome,
      disponibilidadeGeral: "disponivel",
      dias: {
        sabado: { disponivel: true, turnos: [], ambigua: false },
        domingo: { disponivel: true, turnos: [], ambigua: false },
      },
      esclarecimentoNecessario: false,
      respostaConfirmacaoAgradecimento:
        "Excelente! Sua presença foi confirmada na escala. Tenha um ótimo turno de trabalho!",
      tipoMensagem: "confirmacao_presenca",
    };
  }

  // ─── 3. Detecção de Indisponibilidade Total ("Não posso", "Não consigo") ───────
  const indisponivelTotalKeywords = [
    "nao consigo",
    "nao posso",
    "esse fim de semana nao",
    "nao estou disponivel",
    "nao vou poder",
    "nem sabado nem domingo",
    "nenhum dos dias",
    "estou viajando",
    "viajando",
    "ocupado",
    "sem chance",
  ];
  const isIndisponivelGeral =
    indisponivelTotalKeywords.some((k) => norm.includes(k)) &&
    !norm.includes("mas posso") &&
    !norm.includes("so posso");

  if (isIndisponivelGeral) {
    return {
      colaboradorId,
      colaboradorNome,
      disponibilidadeGeral: "indisponivel",
      dias: {
        sabado: { disponivel: false, turnos: [], ambigua: false },
        domingo: { disponivel: false, turnos: [], ambigua: false },
      },
      esclarecimentoNecessario: false,
      respostaConfirmacaoAgradecimento:
        "Tudo bem! Registrei sua indisponibilidade para este fim de semana. Bom descanso e obrigado pelo aviso!",
      tipoMensagem: "disponibilidade",
    };
  }

  // ─── 4. Análise Fina por Dia e Turno ───────────────────────────────────────────
  const mencionaSabado = norm.includes("sabado") || norm.includes("sab");
  const mencionaDomingo = norm.includes("domingo") || norm.includes("dom");
  const mencionaAmbos =
    norm.includes("dois dias") ||
    norm.includes("ambos") ||
    norm.includes("os dois") ||
    norm.includes("qualquer dia") ||
    norm.includes("final de semana todo") ||
    norm.includes("fim de semana todo") ||
    (mencionaSabado && mencionaDomingo);

  // Turnos gerais
  const mencionaManha = norm.includes("manha") || norm.includes("abertura") || norm.includes("05h") || norm.includes("cedo");
  const mencionaNoite = norm.includes("noite") || norm.includes("fechamento") || norm.includes("tarde") || norm.includes("22h") || norm.includes("23h");
  const mencionaQualquerTurno =
    norm.includes("qualquer turno") ||
    norm.includes("qualquer horario") ||
    norm.includes("qualquer um") ||
    norm.includes("tanto faz") ||
    norm.includes("os dois turnos");

  // Cenário: "Posso os dois dias" sem especificar turno
  if (mencionaAmbos && !mencionaManha && !mencionaNoite && !mencionaQualquerTurno) {
    return {
      colaboradorId,
      colaboradorNome,
      disponibilidadeGeral: "disponivel",
      dias: {
        sabado: { disponivel: true, turnos: [], ambigua: true },
        domingo: { disponivel: true, turnos: [], ambigua: true },
      },
      esclarecimentoNecessario: true,
      perguntaEsclarecimento:
        "Certo! Você está disponível nos dois dias. Tem preferência por algum turno (manhã, noite ou qualquer um)?",
      respostaConfirmacaoAgradecimento:
        "Registrado que você pode sábado e domingo! Aguardando apenas sua preferência de turno.",
      tipoMensagem: "disponibilidade",
    };
  }

  // Cenário: "Posso sábado" sem especificar turno
  if (mencionaSabado && !mencionaDomingo && !mencionaManha && !mencionaNoite && !mencionaQualquerTurno) {
    return {
      colaboradorId,
      colaboradorNome,
      disponibilidadeGeral: "parcial",
      dias: {
        sabado: { disponivel: true, turnos: [], ambigua: true },
        domingo: { disponivel: false, turnos: [], ambigua: false },
      },
      esclarecimentoNecessario: true,
      perguntaEsclarecimento:
        "Você pode trabalhar sábado de manhã, à noite ou nos dois turnos?",
      respostaConfirmacaoAgradecimento:
        "Registrado que você pode sábado! Por favor nos informe se prefere manhã ou noite.",
      tipoMensagem: "disponibilidade",
    };
  }

  // Cenário: "Posso domingo" sem especificar turno
  if (mencionaDomingo && !mencionaSabado && !mencionaManha && !mencionaNoite && !mencionaQualquerTurno) {
    return {
      colaboradorId,
      colaboradorNome,
      disponibilidadeGeral: "parcial",
      dias: {
        sabado: { disponivel: false, turnos: [], ambigua: false },
        domingo: { disponivel: true, turnos: [], ambigua: true },
      },
      esclarecimentoNecessario: true,
      perguntaEsclarecimento:
        "Você pode trabalhar domingo de manhã, à noite ou nos dois turnos?",
      respostaConfirmacaoAgradecimento:
        "Registrado que você pode domingo! Por favor nos informe se prefere manhã ou noite.",
      tipoMensagem: "disponibilidade",
    };
  }

  // Construção detalhada de turnos
  const sabTurnos: TurnoId[] = [];
  const domTurnos: TurnoId[] = [];

  if (mencionaQualquerTurno) {
    sabTurnos.push("manha", "noite");
    domTurnos.push("manha", "noite");
  } else {
    // Verificamos frases compostas ex: "sabado de manha e domingo a noite"
    if (mencionaManha) {
      if (mencionaSabado || mencionaAmbos) sabTurnos.push("manha");
      if (mencionaDomingo || mencionaAmbos) domTurnos.push("manha");
      // Se não mencionou o dia explicitamente mas disse "posso de manha"
      if (!mencionaSabado && !mencionaDomingo && !mencionaAmbos) {
        sabTurnos.push("manha");
        domTurnos.push("manha");
      }
    }

    if (mencionaNoite) {
      if (mencionaSabado || mencionaAmbos) sabTurnos.push("noite");
      if (mencionaDomingo || mencionaAmbos) domTurnos.push("noite");
      if (!mencionaSabado && !mencionaDomingo && !mencionaAmbos) {
        sabTurnos.push("noite");
        domTurnos.push("noite");
      }
    }
  }

  const sabDisponivel = mencionaAmbos || mencionaSabado || (!mencionaDomingo && sabTurnos.length > 0);
  const domDisponivel = mencionaAmbos || mencionaDomingo || (!mencionaSabado && domTurnos.length > 0);

  // Mensagem amigável de confirmação com base nos turnos capturados
  let respostaAgradecimento = "";
  if (sabDisponivel && domDisponivel) {
    const turnosStr = sabTurnos.includes("manha") && sabTurnos.includes("noite")
      ? "em qualquer turno"
      : sabTurnos.join(" e ");
    respostaAgradecimento = `Perfeito! Registrei sua disponibilidade para sábado e domingo (${turnosStr || "turnos informados"}). A escala ainda será confirmada pela administração.`;
  } else if (sabDisponivel) {
    const turnosStr = sabTurnos.includes("manha") && sabTurnos.includes("noite")
      ? "em qualquer turno"
      : sabTurnos.join(" e ") || "conforme informado";
    respostaAgradecimento = `Perfeito! Registrei sua disponibilidade para sábado (${turnosStr}). A escala ainda será confirmada.`;
  } else if (domDisponivel) {
    const turnosStr = domTurnos.includes("manha") && domTurnos.includes("noite")
      ? "em qualquer turno"
      : domTurnos.join(" e ") || "conforme informado";
    respostaAgradecimento = `Perfeito! Registrei sua disponibilidade para domingo (${turnosStr}). A escala ainda será confirmada.`;
  } else {
    respostaAgradecimento =
      "Obrigado pela mensagem! Registrei suas observações para a escala deste fim de semana.";
  }

  return {
    colaboradorId,
    colaboradorNome,
    disponibilidadeGeral: sabDisponivel || domDisponivel ? "disponivel" : "ambigua",
    dias: {
      sabado: {
        disponivel: sabDisponivel,
        turnos: sabTurnos,
        ambigua: sabDisponivel && sabTurnos.length === 0,
      },
      domingo: {
        disponivel: domDisponivel,
        turnos: domTurnos,
        ambigua: domDisponivel && domTurnos.length === 0,
      },
    },
    preferencias: norm,
    esclarecimentoNecessario: (sabDisponivel && sabTurnos.length === 0) || (domDisponivel && domTurnos.length === 0),
    perguntaEsclarecimento:
      sabDisponivel && sabTurnos.length === 0
        ? "Você pode trabalhar sábado de manhã, à noite ou nos dois turnos?"
        : domDisponivel && domTurnos.length === 0
        ? "Você pode trabalhar domingo de manhã, à noite ou nos dois turnos?"
        : undefined,
    respostaConfirmacaoAgradecimento: respostaAgradecimento,
    tipoMensagem: "disponibilidade",
  };
}
