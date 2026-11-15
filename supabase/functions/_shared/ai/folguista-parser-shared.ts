/**
 * folguista-parser-shared.ts
 * 
 * Versão compatível com Deno / Edge Functions do parser de folguistas.
 * Utilizado por telegram-webhook e cron-folguistas-escalas.
 */

export interface WeekendDatesSaoPaulo {
  sabado: string; // YYYY-MM-DD
  domingo: string; // YYYY-MM-DD
  sabadoFormatado: string;
  domingoFormatado: string;
}

export function getNextWeekendDatesSaoPaulo(referenceDate = new Date()): WeekendDatesSaoPaulo {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = fmt.format(referenceDate).split("-").map(Number);
  const nowSP = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  const dayOfWeek = nowSP.getUTCDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

  let daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  if (daysUntilSaturday === 0 && dayOfWeek !== 6) {
    daysUntilSaturday = 7;
  }

  const saturday = new Date(nowSP);
  saturday.setUTCDate(nowSP.getUTCDate() + daysUntilSaturday);

  const sunday = new Date(saturday);
  sunday.setUTCDate(saturday.getUTCDate() + 1);

  const sabadoStr = fmt.format(saturday);
  const domingoStr = fmt.format(sunday);

  const [sAno, sMes, sDia] = sabadoStr.split("-");
  const [dAno, dMes, dDia] = domingoStr.split("-");

  return {
    sabado: sabadoStr,
    domingo: domingoStr,
    sabadoFormatado: `${sDia}/${sMes}/${sAno}`,
    domingoFormatado: `${dDia}/${dMes}/${dAno}`,
  };
}

export const HORARIOS_OFICIAIS_RODO_POINT = {
  sabado: {
    manha: { inicio: "05:00", fim: "14:30", horarioFormatado: "05h00 às 14h30", descricao: "Manhã (Abertura)" },
    noite: { inicio: "13:00", fim: "22:30", horarioFormatado: "13h00 às 22h30", descricao: "Tarde/noite (Fechamento)" },
  },
  domingo: {
    manha: { inicio: "05:00", fim: "14:30", horarioFormatado: "05h00 às 14h30", descricao: "Manhã (Abertura)" },
    noite: { inicio: "13:00", fim: "22:30", horarioFormatado: "13h00 às 22h30", descricao: "Tarde/noite (Fechamento)" },
  },
} as const;

export interface VagaDescobertaDetalhe {
  data: string; // YYYY-MM-DD
  diaSemana: "sabado" | "domingo";
  turno: "manha" | "noite";
  horario: string;
}

export function buildMondayConsultationMessage(params: {
  weekend: WeekendDatesSaoPaulo;
  vagasDescobertas: VagaDescobertaDetalhe[];
}): string {
  const vagasSabado = params.vagasDescobertas.filter((v) => v.diaSemana === "sabado");
  const vagasDomingo = params.vagasDescobertas.filter((v) => v.diaSemana === "domingo");

  const linhasSabado = vagasSabado.length > 0
    ? vagasSabado.map((v) => `📅 Sábado — ${v.horario}.`).join("\n")
    : null;

  const linhasDomingo = vagasDomingo.length > 0
    ? vagasDomingo.map((v) => `📅 Domingo — ${v.horario}.`).join("\n")
    : null;

  const partes: string[] = [];
  if (linhasSabado) partes.push(linhasSabado);
  if (linhasDomingo) partes.push(linhasDomingo);

  return (
    `Bom dia, pessoal! ☀️\n\n` +
    `Estamos organizando a escala da Rodo Point para o próximo fim de semana.\n\n` +
    `Precisamos saber quem está disponível para:\n\n` +
    partes.join("\n\n") +
    `\n\nQuem puder trabalhar, pode responder aqui informando o dia e turno.\n\n` +
    `Obrigado!`
  );
}

export function buildFridayConfirmationMessage(params: {
  colaboradorNome: string;
  data: string; // YYYY-MM-DD
  dataFormatada: string;
  diaSemana: "sabado" | "domingo";
  turno: "manha" | "noite";
  horario: string;
}): string {
  const primeiroNome = params.colaboradorNome?.trim() ? params.colaboradorNome.trim().split(" ")[0] : null;
  const saudacao = primeiroNome ? `Oi, ${primeiroNome}! Tudo bem? 😊` : `Oi! Tudo bem? 😊`;
  const diaNome = params.diaSemana === "sabado" ? "Sábado" : "Domingo";

  return (
    `${saudacao}\n\n` +
    `Passando para confirmar seu turno na Rodo Point.\n\n` +
    `📅 ${diaNome}, ${params.dataFormatada}\n` +
    `🕔 Horário: ${params.horario}\n\n` +
    `Está tudo certo para você trabalhar?`
  );
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export interface FolguistaParsedResult {
  tipoMensagem: "disponibilidade" | "confirmacao_presenca" | "desistencia" | "duvida" | "outro";
  disponibilidadeGeral: "disponivel" | "indisponivel" | "ambiguo" | "nao_informado";
  dias: {
    sabado: {
      mencionado: boolean;
      disponivel: boolean;
      turnos: string[];
      confirmado: boolean;
      desistencia: boolean;
    };
    domingo: {
      mencionado: boolean;
      disponivel: boolean;
      turnos: string[];
      confirmado: boolean;
      desistencia: boolean;
    };
  };
  precisaClarificacao: boolean;
  perguntaClarificacao?: string;
  respostaConfirmacaoAgradecimento: string;
}

export function parseFolguistaMessage(
  rawText: string,
  options: {
    colaboradorId?: string;
    colaboradorNome?: string;
    isFridayConfirmationContext?: boolean;
  } = {}
): FolguistaParsedResult {
  const norm = normalizeText(rawText);
  const { colaboradorNome = "Folguista", isFridayConfirmationContext = false } = options;

  // 1. Desistência
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
  const isDesistencia = desistenciaKeywords.some((kw) => norm.includes(kw));

  if (isDesistencia) {
    const sabMencionado = norm.includes("sabado") || norm.includes("sab");
    const domMencionado = norm.includes("domingo") || norm.includes("dom");

    return {
      tipoMensagem: "desistencia",
      disponibilidadeGeral: "indisponivel",
      dias: {
        sabado: {
          mencionado: sabMencionado,
          disponivel: false,
          turnos: [],
          confirmado: false,
          desistencia: sabMencionado || !domMencionado,
        },
        domingo: {
          mencionado: domMencionado,
          disponivel: false,
          turnos: [],
          confirmado: false,
          desistencia: domMencionado || !sabMencionado,
        },
      },
      precisaClarificacao: false,
      respostaConfirmacaoAgradecimento: `Entendido, ${colaboradorNome}. Registrei que você teve um imprevisto e não poderá comparecer. A administração foi comunicada para providenciar a substituição. Obrigado por avisar!`,
    };
  }

  // 2. Confirmação explícita
  const confirmacaoKeywords = [
    "confirmado",
    "confirmo",
    "pode confirmar",
    "vou sim",
    "estarei la",
    "pode contar comigo",
    "to dentro",
    "estou confirmado",
    "presenca confirmada",
  ];
  const isConfirmacao = confirmacaoKeywords.some((kw) => norm.includes(kw));

  if (isConfirmacao || (isFridayConfirmationContext && (norm === "sim" || norm === "ok" || norm === "certo"))) {
    return {
      tipoMensagem: "confirmacao_presenca",
      disponibilidadeGeral: "disponivel",
      dias: {
        sabado: {
          mencionado: true,
          disponivel: true,
          turnos: ["qualquer"],
          confirmado: true,
          desistencia: false,
        },
        domingo: {
          mencionado: true,
          disponivel: true,
          turnos: ["qualquer"],
          confirmado: true,
          desistencia: false,
        },
      },
      precisaClarificacao: false,
      respostaConfirmacaoAgradecimento: `Excelente, ${colaboradorNome}! Sua presença está confirmada na escala. Bom trabalho!`,
    };
  }

  // 3. Indisponibilidade geral
  const indisponivelKeywords = [
    "nao posso",
    "nao consigo",
    "nao vai dar",
    "impossivel",
    "sem chance",
    "vou viajar",
    "estou ocupado",
    "indisponivel",
    "nao estou disponivel",
    "nao dou conta",
    "esse fim de semana nao",
  ];
  const isIndisponivel = indisponivelKeywords.some((kw) => norm.includes(kw));

  if (isIndisponivel) {
    return {
      tipoMensagem: "disponibilidade",
      disponibilidadeGeral: "indisponivel",
      dias: {
        sabado: { mencionado: true, disponivel: false, turnos: [], confirmado: false, desistencia: false },
        domingo: { mencionado: true, disponivel: false, turnos: [], confirmado: false, desistencia: false },
      },
      precisaClarificacao: false,
      respostaConfirmacaoAgradecimento: `Sem problemas, ${colaboradorNome}! Registrei que você não poderá trabalhar neste fim de semana. Obrigado por responder!`,
    };
  }

  // 4. Incerteza / Dúvida explícita ("talvez", "acho que", "vou ver", "depende")
  const duvidaKeywords = ["talvez", "acho que", "nao tenho certeza", "vou ver", "depende", "quem sabe", "nao sei"];
  const isDuvida = duvidaKeywords.some((kw) => norm.includes(kw));

  if (isDuvida) {
    return {
      tipoMensagem: "duvida",
      disponibilidadeGeral: "ambiguo",
      dias: {
        sabado: { mencionado: false, disponivel: false, turnos: [], confirmado: false, desistencia: false },
        domingo: { mencionado: false, disponivel: false, turnos: [], confirmado: false, desistencia: false },
      },
      precisaClarificacao: true,
      perguntaClarificacao: "Você consegue confirmar com certeza se poderá trabalhar no sábado ou domingo?",
      respostaConfirmacaoAgradecimento: `Olá, ${colaboradorNome}! Como você mencionou que ainda não tem certeza, por favor nos avise assim que confirmar sua disponibilidade para que possamos organizar a escala.`,
    };
  }

  // 5. Detecção de turnos e dias
  const sabMencionado = norm.includes("sabado") || norm.includes("sab");
  const domMencionado = norm.includes("domingo") || norm.includes("dom");

  const turnosDetectados: string[] = [];
  if (norm.includes("manha") || norm.includes("abertura") || norm.includes("cedo") || norm.includes("05h") || norm.includes("5h")) {
    turnosDetectados.push("manha");
  }
  if (norm.includes("noite") || norm.includes("fechamento") || norm.includes("tarde") || norm.includes("23h")) {
    turnosDetectados.push("noite");
  }

  const positivoKeywords = ["posso", "disponivel", "consigo", "da pra ir", "vou", "pode por", "pode colocar"];
  const isPositivo = positivoKeywords.some((kw) => norm.includes(kw)) || turnosDetectados.length > 0;

  if (isPositivo) {
    if ((sabMencionado || domMencionado) && turnosDetectados.length === 0) {
      const diaTexto = sabMencionado && domMencionado ? "sábado e domingo" : sabMencionado ? "sábado" : "domingo";
      return {
        tipoMensagem: "disponibilidade",
        disponibilidadeGeral: "ambiguo",
        dias: {
          sabado: {
            mencionado: sabMencionado,
            disponivel: sabMencionado,
            turnos: [],
            confirmado: false,
            desistencia: false,
          },
          domingo: {
            mencionado: domMencionado,
            disponivel: domMencionado,
            turnos: [],
            confirmado: false,
            desistencia: false,
          },
        },
        precisaClarificacao: true,
        perguntaClarificacao: `Você prefere o turno da manhã (abertura 05:00 às 14:30) ou o turno da noite (fechamento 15:00 às 23:30)?`,
        respostaConfirmacaoAgradecimento: `Olá, ${colaboradorNome}! Para ${diaTexto}, você prefere o turno da manhã (05h às 14h30) ou noite (15h às 23h30)?`,
      };
    }

    const tFinais = turnosDetectados.length > 0 ? turnosDetectados : ["qualquer"];
    return {
      tipoMensagem: "disponibilidade",
      disponibilidadeGeral: "disponivel",
      dias: {
        sabado: {
          mencionado: sabMencionado || !domMencionado,
          disponivel: sabMencionado || !domMencionado,
          turnos: tFinais,
          confirmado: false,
          desistencia: false,
        },
        domingo: {
          mencionado: domMencionado || !sabMencionado,
          disponivel: domMencionado || !sabMencionado,
          turnos: tFinais,
          confirmado: false,
          desistencia: false,
        },
      },
      precisaClarificacao: false,
      respostaConfirmacaoAgradecimento: `Perfeito, ${colaboradorNome}! Registrei sua disponibilidade no sistema. A escala final será confirmada pela administração.`,
    };
  }

  return {
    tipoMensagem: "duvida",
    disponibilidadeGeral: "ambiguo",
    dias: {
      sabado: { mencionado: false, disponivel: false, turnos: [], confirmado: false, desistencia: false },
      domingo: { mencionado: false, disponivel: false, turnos: [], confirmado: false, desistencia: false },
    },
    precisaClarificacao: true,
    respostaConfirmacaoAgradecimento: `Olá, ${colaboradorNome}! Poderia confirmar se você está disponível para trabalhar neste próximo fim de semana (sábado ou domingo)?`,
  };
}
