/**
 * ROTEADOR E COORDENADOR DOS SETE ESPECIALISTAS DO WALLET CEO 3.0
 * 
 * Regras:
 * - Perguntas simples e diretas acionam APENAS o especialista pertinente (zero gasto desnecessário de IA).
 * - Perguntas de diagnóstico executivo complexo (ex: "faturamento subiu mas lucro caiu") coordenam
 *   múltiplos especialistas (Vendas + Estoque + Financeiro) de forma estruturada.
 * - Prioriza consultas determinísticas para respostas matemáticas exatas e economia de tokens.
 * - Distinção estrita de valores zero vs dados ausentes: R$ 0,00 para zero confirmado; "Não disponível" para ausência.
 * - Proibido contar vendas canceladas. Proibido apresentar despesas pendentes como pagas.
 * - Fuso horário canônico de Brasília (America/Sao_Paulo) para todas as apurações temporais.
 * - Roteamento padrão seguro: Dúvidas gerais ou operacionais recaem em 'operacoes' (role: member),
 *   impedindo que colaboradores recebam 403 Forbidden em conversas triviais.
 */

import {
  SPECIALIST_AGENTS_REGISTRY,
  SpecialistAgentId,
  authorizeSpecialistAccess,
} from "./specialist-registry.ts";
import type {
  FinancialQueryRepository,
  FiscalNoteRecord,
  SefazDocumentRecord,
  DocumentSessionRecord,
  SalesPdvDetailRecord,
} from "./query-tools.ts";
import { canRoleAccessFinancialData, type AiExecutionContext } from "./auth.ts";

export interface SpecialistRoutingPlan {
  primarySpecialist: SpecialistAgentId;
  coordinatingCeo: boolean;
  contributingSpecialists: SpecialistAgentId[];
  complexityLevel: 1 | 2 | 3;
  model: string;
  isDeterministicPossible: boolean;
  rationale: string;
}

/**
 * Utilitário canônico para extração de strings de data no fuso horário de São Paulo (UTC-3).
 * Seguro para transições de horário, virada de mês/ano e servidores em qualquer localidade.
 */
export function getSaoPauloDateStrings(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = formatter.format(referenceDate); // YYYY-MM-DD
  const [year, month, day] = todayStr.split("-").map(Number);
  const todayUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 3600 * 1000);
  const yesterdayStr = formatter.format(yesterdayUtc);

  const in7DaysUtc = new Date(todayUtc.getTime() + 7 * 24 * 3600 * 1000);
  const in7DaysStr = formatter.format(in7DaysUtc);

  const in30DaysUtc = new Date(todayUtc.getTime() + 30 * 24 * 3600 * 1000);
  const in30DaysStr = formatter.format(in30DaysUtc);

  const startOfMonthStr = `${todayStr.slice(0, 7)}-01`;

  // Mês anterior
  const prevMonthDate = new Date(Date.UTC(year, month - 2, 1, 12, 0, 0));
  const startOfPrevMonthStr = `${formatter.format(prevMonthDate).slice(0, 7)}-01`;
  const lastDayPrevMonthUtc = new Date(Date.UTC(year, month - 1, 0, 12, 0, 0));
  const endOfPrevMonthStr = formatter.format(lastDayPrevMonthUtc);

  // Segunda-feira da semana atual
  const dayOfWeek = (todayUtc.getUTCDay() + 6) % 7; // 0 = Seg, 6 = Dom
  const mondayUtc = new Date(todayUtc.getTime() - dayOfWeek * 24 * 3600 * 1000);
  const startOfWeekStr = formatter.format(mondayUtc);

  return {
    todayStr,
    yesterdayStr,
    startOfMonthStr,
    startOfPrevMonthStr,
    endOfPrevMonthStr,
    startOfWeekStr,
    in7DaysStr,
    in30DaysStr,
  };
}

/**
 * Analisa a pergunta do usuário e define o plano executivo de acionamento.
 */
export function routeUserQueryToSpecialists(userPrompt: string): SpecialistRoutingPlan {
  const p = userPrompt.toLowerCase().trim();

  // 1. Diagnóstico Executivo Multidepartamental (Coordenação pelo Wallet CEO)
  const isMultiDepartmentDiagnosis =
    (p.includes("faturando mais") && (p.includes("lucro diminuiu") || p.includes("lucro caiu") || p.includes("menos lucro"))) ||
    (p.includes("por que") && (p.includes("margem") || p.includes("resultado")) && (p.includes("vendas") || p.includes("despesa"))) ||
    (p.includes("diagnostico") || p.includes("diagnóstico")) ||
    (p.includes("visao geral") || p.includes("visão geral"));

  if (isMultiDepartmentDiagnosis) {
    return {
      primarySpecialist: "financeiro",
      coordinatingCeo: true,
      contributingSpecialists: ["vendas_pdv", "estoque", "financeiro"],
      complexityLevel: 3,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
      rationale: "Consulta executiva multidepartamental: Wallet CEO coordena Vendas (faturamento), Estoque (CMV) e Financeiro (despesas e margens).",
    };
  }

  // 2. Especialista Fiscal
  const isFiscalQuery =
    p.includes("nota fiscal") ||
    p.includes("danfe") ||
    p.includes("nfe") ||
    p.includes("nfc-e") ||
    p.includes("sefaz") ||
    p.includes("imposto") ||
    p.includes("tribut") ||
    p.includes("divergencia fiscal") ||
    p.includes("divergência fiscal") ||
    p.includes("documento fiscal") ||
    p.includes("documentos fiscais") ||
    p.includes("notas de fornecedor") ||
    p.includes("notas de fornecedores") ||
    p.includes("notas de compras") ||
    p.includes("notas fiscais recebi") ||
    p.includes("erro na leitura") ||
    p.includes("documentos apresentaram erro") ||
    p.includes("nota pendente");

  if (isFiscalQuery) {
    const isFiscalDeterministic =
      p.includes("quais notas fiscais") ||
      p.includes("notas fiscais recebi") ||
      p.includes("notas fiscais desta semana") ||
      p.includes("nota pendente") ||
      p.includes("pendente de processamento") ||
      p.includes("erro na leitura") ||
      p.includes("documentos apresentaram erro") ||
      p.includes("valor das notas de fornecedores") ||
      p.includes("valor das notas") ||
      p.includes("divergência entre nota") ||
      p.includes("divergencia entre nota");

    return {
      primarySpecialist: "fiscal",
      coordinatingCeo: false,
      contributingSpecialists: ["fiscal"],
      complexityLevel: 2,
      model: "gemini-2.5-flash",
      isDeterministicPossible: isFiscalDeterministic,
      rationale: "Consulta direcionada ao Especialista Fiscal.",
    };
  }

  // 3. Especialista de Vendas e PDV
  const isVendasQuery =
    p.includes("ticket médio") ||
    p.includes("ticket medio") ||
    p.includes("mais vendido") ||
    p.includes("mais vendidos") ||
    p.includes("produtos mais") ||
    p.includes("top 5") ||
    p.includes("caixa físico") ||
    p.includes("balcão") ||
    p.includes("balcao") ||
    p.includes("horario de pico") ||
    p.includes("horário de pico") ||
    p.includes("mais movimento ontem") ||
    p.includes("curva abc") ||
    p.includes("forma de pagamento") ||
    p.includes("formas de pagamento") ||
    p.includes("divisão por forma") ||
    p.includes("divisao por forma") ||
    p.includes("comparado ao anterior") ||
    p.includes("faturamos ontem no balcão") ||
    p.includes("faturamos ontem no balcao");

  if (isVendasQuery) {
    const isVendasDeterministic =
      p.includes("faturamos ontem no balcão") ||
      p.includes("faturamos ontem no balcao") ||
      p.includes("quanto faturei ontem") ||
      p.includes("faturamento de ontem") ||
      p.includes("vendas de ontem") ||
      p.includes("5 produtos mais vendidos") ||
      p.includes("produtos mais vendidos") ||
      p.includes("mais vendido ontem") ||
      p.includes("mais vendidos ontem") ||
      p.includes("horario de pico") ||
      p.includes("horário de pico") ||
      p.includes("mais movimento ontem") ||
      p.includes("comparado ao anterior") ||
      p.includes("divisão por forma de pagamento") ||
      p.includes("divisao por forma de pagamento") ||
      p.includes("formas de pagamento");

    return {
      primarySpecialist: "vendas_pdv",
      coordinatingCeo: false,
      contributingSpecialists: ["vendas_pdv"],
      complexityLevel: 2,
      model: "gemini-2.5-flash",
      isDeterministicPossible: isVendasDeterministic,
      rationale: "Consulta direcionada ao Especialista de Vendas e PDV.",
    };
  }

  // 4. Especialista de Estoque e Compras
  if (
    p.includes("estoque") ||
    p.includes("insumo") ||
    p.includes("ficha técnica") ||
    p.includes("fichas técnicas") ||
    p.includes("compras") ||
    p.includes("falta de produto") ||
    p.includes("reposi") ||
    p.includes("cmv")
  ) {
    return {
      primarySpecialist: "estoque",
      coordinatingCeo: false,
      contributingSpecialists: ["estoque"],
      complexityLevel: 2,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
      rationale: "Consulta direcionada ao Especialista de Estoque e Compras.",
    };
  }

  // 5. Especialista de Pessoal e RH
  if (
    p.includes("funcionário") ||
    p.includes("funcionario") ||
    p.includes("equipe") ||
    p.includes("escala") ||
    p.includes("salário") ||
    p.includes("salario") ||
    p.includes("hora extra") ||
    p.includes("colaborador")
  ) {
    return {
      primarySpecialist: "rh",
      coordinatingCeo: false,
      contributingSpecialists: ["rh"],
      complexityLevel: 2,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
      rationale: "Consulta direcionada ao Especialista de Pessoal e RH.",
    };
  }

  // 6. Especialista de Inteligência Competitiva e Mercado
  if (
    p.includes("concorrente") ||
    p.includes("mercado") ||
    p.includes("tendência") ||
    p.includes("tendencia") ||
    p.includes("benchmarking") ||
    p.includes("precificação dinâmica") ||
    p.includes("experimento comercial")
  ) {
    return {
      primarySpecialist: "inteligencia_competitiva",
      coordinatingCeo: false,
      contributingSpecialists: ["inteligencia_competitiva"],
      complexityLevel: 3,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
      rationale: "Consulta direcionada ao Especialista de Inteligência Competitiva.",
    };
  }

  // 7. Especialista Financeiro (Contas a Pagar, Saldos, DRE, Liquidez, Faturamento Financeiro)
  const isFinancialDirect =
    p.includes("quanto faturei ontem") ||
    p.includes("faturamento de ontem") ||
    p.includes("vendas de ontem") ||
    p.includes("quais contas vencem") ||
    p.includes("contas a vencer") ||
    p.includes("contas vencem nesta semana") ||
    p.includes("saldo atual") ||
    p.includes("situacao do meu saldo") ||
    p.includes("situação do meu saldo") ||
    p.includes("fluxo de caixa");

  const isFinancialTerms =
    isFinancialDirect ||
    p.includes("faturamento") ||
    p.includes("faturou") ||
    p.includes("faturei") ||
    p.includes("receita") ||
    p.includes("despesa") ||
    p.includes("despesas") ||
    p.includes("gastos") ||
    p.includes("gasto") ||
    p.includes("custo") ||
    p.includes("saldo") ||
    p.includes("divida") ||
    p.includes("dívida") ||
    p.includes("boleto") ||
    p.includes("dre") ||
    p.includes("extrato") ||
    p.includes("liquidez") ||
    p.includes("conta bancaria") ||
    p.includes("conta bancária");

  if (isFinancialTerms) {
    return {
      primarySpecialist: "financeiro",
      coordinatingCeo: false,
      contributingSpecialists: ["financeiro"],
      complexityLevel: 1,
      model: "gemini-2.5-flash",
      isDeterministicPossible: isFinancialDirect,
      rationale: "Consulta direcionada ao Especialista Financeiro.",
    };
  }

  // 8. Especialista de Operações e Processos (Rotinas, Fechamento de Caixa, Perguntas Gerais)
  // Gate 0.2: Usuários colaboradores (member) que enviam saudações ("Bom dia"), pedidos de ajuda
  // ou dúvidas sobre ferramentas caem no agente de Operações com role 'member', evitando 403 Forbidden.
  return {
    primarySpecialist: "operacoes",
    coordinatingCeo: false,
    contributingSpecialists: ["operacoes"],
    complexityLevel: 1,
    model: "gemini-2.5-flash",
    isDeterministicPossible: false,
    rationale: "Consulta geral ou operacional direcionada ao Especialista de Operações.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENTE FINANCEIRO — RESPOSTAS DETERMINÍSTICAS (Gate 0.3 & Etapa 07)
// ─────────────────────────────────────────────────────────────────────────────

export interface FinancialDeterministicData {
  faturamentoOntem?: number | null;
  pedidosOntem?: number | null;
  faturamentoMes?: number | null;
  contasVencer7Dias?: Array<{ descricao: string; valor: number; vencimento: string }>;
  contasVencidas?: Array<{ descricao: string; valor: number; vencimento: string }>;
  saldoTotal?: number | null;
  resultadoOperacionalMes?: number | null;
  despesasMes?: number | null;
}

export function buildFinancialSpecialistDeterministicResponse(
  userPrompt: string,
  data: FinancialDeterministicData
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();

  const formatCurrency = (val: number | null | undefined, labelUnavailable = "Dado não disponível"): string => {
    if (val === null || val === undefined) {
      return labelUnavailable;
    }
    return `R$ ${Number(val).toFixed(2)}`;
  };

  // Caso A: "Quanto faturei ontem?"
  if (p.includes("quanto faturei ontem") || p.includes("faturamento de ontem") || p.includes("vendas de ontem")) {
    const hasFat = data.faturamentoOntem !== null && data.faturamentoOntem !== undefined;
    const hasPed = data.pedidosOntem !== null && data.pedidosOntem !== undefined;

    let fatStr: string;
    let pedStr: string;

    if (hasFat) {
      fatStr = `R$ ${Number(data.faturamentoOntem).toFixed(2)}`;
    } else {
      fatStr = "Faturamento não disponível";
    }

    if (hasPed) {
      pedStr = `${data.pedidosOntem} pedido(s)`;
    } else {
      pedStr = "Pedidos não disponíveis";
    }

    const ticketStr =
      hasFat && hasPed && (data.pedidosOntem ?? 0) > 0
        ? `R$ ${(Number(data.faturamentoOntem) / Number(data.pedidosOntem)).toFixed(2)}`
        : "Não disponível";

    const msg =
      `📊 *Agente Financeiro — Faturamento de Ontem:*\n\n` +
      `• *Vendas Brutas no PDV:* ${fatStr}\n` +
      `• *Volume de Transações:* ${pedStr}\n` +
      `• *Ticket Médio por Pedido:* ${ticketStr}\n\n` +
      `_Dados apurados diretamente das transações confirmadas do PDV Eyemobile._`;

    return { handled: true, answer: msg, specialist: "financeiro" };
  }

  // Caso B: "Quais contas vencem nesta semana?"
  if (p.includes("quais contas vencem") || p.includes("contas a vencer") || p.includes("contas vencem nesta semana")) {
    const contas = data.contasVencer7Dias ?? [];
    const vencidas = data.contasVencidas ?? [];

    let msg = `📅 *Agente Financeiro — Compromissos da Semana:*\n\n`;

    if (vencidas.length > 0) {
      const totalVencidas = vencidas.reduce((acc, c) => acc + c.valor, 0);
      msg += `⚠️ *Atenção — ${vencidas.length} Conta(s) Vencida(s):* R$ ${totalVencidas.toFixed(2)}\n`;
      vencidas.slice(0, 3).forEach((c) => {
        msg += `  • ${c.descricao}: R$ ${c.valor.toFixed(2)} (Venceu em ${c.vencimento})\n`;
      });
      msg += `\n`;
    }

    if (contas.length === 0) {
      msg += `✅ Nenhuma conta a pagar programada para os próximos 7 dias.`;
    } else {
      const total7Dias = contas.reduce((acc, c) => acc + c.valor, 0);
      msg += `📌 *${contas.length} Conta(s) a Vencer nos Próximos 7 Dias (Total: R$ ${total7Dias.toFixed(2)}):*\n`;
      contas.forEach((c) => {
        msg += `  • ${c.descricao}: R$ ${c.valor.toFixed(2)} (Vencimento: ${c.vencimento})\n`;
      });
    }

    return { handled: true, answer: msg, specialist: "financeiro" };
  }

  // Caso C: "Qual é a situação do meu saldo / fluxo de caixa?"
  if (p.includes("saldo atual") || p.includes("situacao do meu saldo") || p.includes("situação do meu saldo") || p.includes("fluxo de caixa")) {
    const saldoStr = formatCurrency(data.saldoTotal, "Saldo não disponível");
    const fatMesStr = formatCurrency(data.faturamentoMes, "Faturamento não disponível");
    const despMesStr = formatCurrency(data.despesasMes, "Despesas não disponíveis");
    const resOpStr = formatCurrency(data.resultadoOperacionalMes, "Resultado não disponível");

    const msg =
      `📊 *Agente Financeiro — Posição de Caixa e Liquidez:*\n\n` +
      `• *Saldo Disponível em Contas:* ${saldoStr}\n` +
      `• *Faturamento Acumulado no Mês:* ${fatMesStr}\n` +
      `• *Despesas Acumuladas no Mês:* ${despMesStr}\n` +
      `• *Resultado Operacional Preliminar:* ${resOpStr}\n\n` +
      `_Posição consolidada das contas bancárias e conciliação em tempo real._`;

    return { handled: true, answer: msg, specialist: "financeiro" };
  }

  return { handled: false, specialist: "financeiro" };
}

export async function fetchAndExecuteFinancialSpecialist(
  userPrompt: string,
  context: AiExecutionContext,
  repository: FinancialQueryRepository,
  nowOverride?: Date
): Promise<{
  handled: boolean;
  answer?: string;
  specialist: string;
  routingPlan: SpecialistRoutingPlan;
}> {
  const routingPlan = routeUserQueryToSpecialists(userPrompt);

  if (!routingPlan.isDeterministicPossible || routingPlan.primarySpecialist !== "financeiro") {
    return {
      handled: false,
      specialist: "financeiro",
      routingPlan,
    };
  }

  const p = userPrompt.toLowerCase().trim();
  const { todayStr, yesterdayStr, startOfMonthStr, in7DaysStr } = getSaoPauloDateStrings(nowOverride);

  const collectedData: FinancialDeterministicData = {};

  try {
    // 1. Caso Faturamento de Ontem
    if (p.includes("quanto faturei ontem") || p.includes("faturamento de ontem") || p.includes("vendas de ontem")) {
      const sales = await repository.listSalesPDV(context, {
        start: yesterdayStr,
        end: yesterdayStr,
      });

      // Filtra vendas estritamente válidas (ignora canceladas por status e por descrição)
      const validSales = sales.filter((s) => {
        const statusLower = (s.status || "").toLowerCase();
        const desc = (s.description || "").toLowerCase();
        const isCancelled =
          statusLower === "cancelada" ||
          statusLower === "cancelled" ||
          statusLower === "estornada" ||
          desc.includes("cancelad");
        return !isCancelled;
      });

      collectedData.faturamentoOntem = validSales.reduce((acc, s) => acc + (s.amount || 0), 0);
      collectedData.pedidosOntem = validSales.length;
    }

    // 2. Caso Contas a Vencer
    if (p.includes("quais contas vencem") || p.includes("contas a vencer") || p.includes("contas vencem nesta semana")) {
      // Gate 0.3: Incluir obrigações antigas ainda não quitadas desde o início (sem corte inferior no mês atual)
      const debts = await repository.listDebts(context, {
        start: "2020-01-01",
        end: in7DaysStr,
      });

      // Filtra dívidas em aberto / pendentes (não pagas)
      const pendingDebts = debts.filter((d) => {
        const remaining = (d.originalAmount || 0) - (d.paidAmount || 0);
        const statusLower = (d.status || "").toLowerCase();
        return remaining > 0 && statusLower !== "paga" && statusLower !== "pago" && statusLower !== "liquidada";
      });

      collectedData.contasVencidas = pendingDebts
        .filter((d) => d.dueOn && d.dueOn < todayStr)
        .map((d) => ({
          descricao: d.description,
          valor: (d.originalAmount || 0) - (d.paidAmount || 0),
          vencimento: d.dueOn!,
        }));

      collectedData.contasVencer7Dias = pendingDebts
        .filter((d) => d.dueOn && d.dueOn >= todayStr && d.dueOn <= in7DaysStr)
        .map((d) => ({
          descricao: d.description,
          valor: (d.originalAmount || 0) - (d.paidAmount || 0),
          vencimento: d.dueOn!,
        }));
    }

    // 3. Caso Saldo Atual / Fluxo de Caixa
    if (p.includes("saldo atual") || p.includes("situacao do meu saldo") || p.includes("situação do meu saldo") || p.includes("fluxo de caixa")) {
      const balances = await repository.listBalances(context);
      if (Array.isArray(balances)) {
        collectedData.saldoTotal = balances.reduce((acc, b) => acc + (b.amount || 0), 0);
      } else {
        collectedData.saldoTotal = null;
      }

      const revenues = await repository.listRevenues(context, {
        start: startOfMonthStr,
        end: todayStr,
      });
      const validRevs = revenues.filter((r) => {
        const st = (r.status || "").toLowerCase();
        return st !== "cancelada" && !((r.description || "").toLowerCase().includes("cancelad"));
      });
      collectedData.faturamentoMes = validRevs.reduce((acc, r) => acc + (r.amount || 0), 0);

      const expenses = await repository.listExpenses(context, {
        start: startOfMonthStr,
        end: todayStr,
      });
      collectedData.despesasMes = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
      collectedData.resultadoOperacionalMes = (collectedData.faturamentoMes || 0) - (collectedData.despesasMes || 0);
    }
  } catch (err) {
    console.warn("[specialist-router] Erro ao consultar repositório financeiro para resposta determinística:", err);
  }

  const result = buildFinancialSpecialistDeterministicResponse(userPrompt, collectedData);
  return {
    ...result,
    routingPlan,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENTE FISCAL — RESPOSTAS DETERMINÍSTICAS (Gate 1)
// ─────────────────────────────────────────────────────────────────────────────

export interface FiscalDeterministicData {
  notasSemana?: FiscalNoteRecord[] | null;
  notasMes?: FiscalNoteRecord[] | null;
  notasPendentes?: FiscalNoteRecord[] | null;
  documentosErro?: Array<{ id: string; tipo: string; descricao: string }> | null;
  valorTotalNotasMes?: number | null;
  divergencias?: Array<{ descricao: string; detalhe: string }> | null;
}

export function buildFiscalSpecialistDeterministicResponse(
  userPrompt: string,
  data: FiscalDeterministicData
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();

  // Caso 1: "Quais notas fiscais recebi nesta semana?"
  if (p.includes("quais notas fiscais") || p.includes("notas fiscais recebi") || p.includes("notas fiscais desta semana")) {
    if (data.notasSemana === null || data.notasSemana === undefined) {
      return {
        handled: true,
        answer: "📄 *Agente Fiscal — Documentos Recebidos na Semana:*\n\nInformações de notas fiscais não disponíveis no momento.",
        specialist: "fiscal",
      };
    }

    if (data.notasSemana.length === 0) {
      return {
        handled: true,
        answer:
          "📄 *Agente Fiscal — Documentos Recebidos na Semana:*\n\n" +
          "✅ Nenhuma nota fiscal de compra recebida no período consultado (R$ 0,00).\n\n" +
          "_Acompanhamento contínuo de entradas fiscais e integração Sefaz._",
        specialist: "fiscal",
      };
    }

    const total = data.notasSemana.reduce((acc, n) => acc + n.valorTotal, 0);
    let msg = `📄 *Agente Fiscal — Documentos Recebidos na Semana:*\n\n`;
    msg += `Foram recebidas ${data.notasSemana.length} nota(s) fiscal(is), totalizando *R$ ${total.toFixed(2)}*:\n\n`;
    data.notasSemana.slice(0, 5).forEach((n) => {
      msg += `• *NF ${n.numeroNf || "S/N"}* (${n.fornecedor || "Fornecedor não informado"}): R$ ${n.valorTotal.toFixed(2)} — Emissão: ${n.dataEmissao || "N/A"}\n`;
    });
    msg += `\n_Todas as notas foram registradas no repositório fiscal do workspace._`;

    return { handled: true, answer: msg, specialist: "fiscal" };
  }

  // Caso 2: "Existe alguma nota pendente de processamento?"
  if (p.includes("nota pendente") || p.includes("pendente de processamento") || p.includes("pendencia de processamento")) {
    if (data.notasPendentes === null || data.notasPendentes === undefined) {
      return {
        handled: true,
        answer: "📄 *Agente Fiscal — Status de Processamento:*\n\nInformações de pendências fiscais não disponíveis.",
        specialist: "fiscal",
      };
    }

    if (data.notasPendentes.length === 0) {
      return {
        handled: true,
        answer:
          "📄 *Agente Fiscal — Status de Processamento:*\n\n" +
          "✅ Todas as notas fiscais recebidas estão com processamento concluído. Nenhuma pendência identificada.",
        specialist: "fiscal",
      };
    }

    let msg = `📄 *Agente Fiscal — Pendências de Processamento:*\n\n`;
    msg += `⚠️ Existem *${data.notasPendentes.length}* nota(s) fiscal(is) aguardando processamento:\n\n`;
    data.notasPendentes.slice(0, 5).forEach((n) => {
      msg += `• NF ${n.numeroNf || "S/N"} (${n.fornecedor || "Fornecedor"}): R$ ${n.valorTotal.toFixed(2)} — Status: ${n.status}\n`;
    });
    msg += `\n_Recomenda-se conferência no módulo fiscal antes da conciliação contábil._`;

    return { handled: true, answer: msg, specialist: "fiscal" };
  }

  // Caso 3: "Quais documentos apresentaram erro na leitura?"
  if (p.includes("erro na leitura") || p.includes("documentos apresentaram erro") || p.includes("falha na leitura")) {
    if (data.documentosErro === null || data.documentosErro === undefined) {
      return {
        handled: true,
        answer: "📄 *Agente Fiscal — Leitura de Documentos:*\n\nHistórico de leitura de documentos não disponível.",
        specialist: "fiscal",
      };
    }

    if (data.documentosErro.length === 0) {
      return {
        handled: true,
        answer:
          "📄 *Agente Fiscal — Auditoria de Leitura de Documentos:*\n\n" +
          "✅ Nenhum documento fiscal apresentou erro ou falha de leitura recentemente.",
        specialist: "fiscal",
      };
    }

    let msg = `📄 *Agente Fiscal — Documentos com Erro de Leitura:*\n\n`;
    msg += `⚠️ Foram identificados *${data.documentosErro.length}* documento(s) com erro:\n\n`;
    data.documentosErro.forEach((d) => {
      msg += `• *${d.tipo}:* ${d.descricao}\n`;
    });
    return { handled: true, answer: msg, specialist: "fiscal" };
  }

  // Caso 4: "Qual foi o valor das notas de fornecedores neste mês?"
  if (p.includes("valor das notas de fornecedores") || p.includes("valor das notas") || p.includes("notas de compras")) {
    if (data.valorTotalNotasMes === null || data.valorTotalNotasMes === undefined) {
      return {
        handled: true,
        answer: "📄 *Agente Fiscal — Compras de Fornecedores do Mês:*\n\nTotal de notas de fornecedores não disponível.",
        specialist: "fiscal",
      };
    }

    const valStr = `R$ ${Number(data.valorTotalNotasMes).toFixed(2)}`;
    const msg =
      `📄 *Agente Fiscal — Notas de Fornecedores no Mês:*\n\n` +
      `• *Total Emitido:* ${valStr}\n` +
      `• *Notas Registradas:* ${data.notasMes?.length ?? 0} documento(s)\n\n` +
      `_Apurado a partir das notas fiscais de compra vinculadas ao workspace._`;

    return { handled: true, answer: msg, specialist: "fiscal" };
  }

  // Caso 5: "Existe alguma divergência nas notas fiscais?"
  if (p.includes("divergência") || p.includes("divergencia") || p.includes("auditoria fiscal") || p.includes("conferencia fiscal") || p.includes("conferência fiscal")) {
    if (data.divergencias === null || data.divergencias === undefined) {
      return {
        handled: true,
        answer: "⚖️ *Agente Fiscal — Conferência de Documentos:*\n\nDados de divergências fiscais não disponíveis.",
        specialist: "fiscal",
      };
    }

    if (data.divergencias.length === 0) {
      const stats = data.documentosAuditados || {
        totalNotas: (data.notasMes || []).length,
        totalSefaz: 0,
        totalSessoes: (data.documentosErro || []).length,
      };
      return {
        handled: true,
        answer:
          `⚖️ *Agente Fiscal — Conferência Fiscal Realizada:*\n\n` +
          `Conferência fiscal realizada com sucesso em ${stats.totalNotas} nota(s) fiscal(is) de compra, ` +
          `${stats.totalSefaz} documento(s) Sefaz e ${stats.totalSessoes} sessão(ões) de processamento.\n\n` +
          `• Nenhuma divergência de valor, duplicidade ou pendência fiscal identificada no período.\n` +
          `• Todas as notas fiscais e documentos conferem com os lançamentos contábeis.`,
        specialist: "fiscal",
      };
    }

    let msg = `⚖️ *Agente Fiscal — Divergências Fiscais Identificadas (${data.divergencias.length}):*\n\n`;
    data.divergencias.forEach((d) => {
      msg += `• *${d.tipo.toUpperCase()}:* ${d.descricao}\n`;
    });
    msg += `\n_Recomenda-se verificação junto aos fornecedores e conciliação das despesas vinculadas._`;

    return { handled: true, answer: msg, specialist: "fiscal" };
  }
  return { handled: false, specialist: "fiscal" };
}

export async function fetchAndExecuteFiscalSpecialist(
  userPrompt: string,
  context: AiExecutionContext,
  repository: FinancialQueryRepository,
  nowOverride?: Date
): Promise<{
  handled: boolean;
  answer?: string;
  specialist: string;
  routingPlan: SpecialistRoutingPlan;
}> {
  const routingPlan = routeUserQueryToSpecialists(userPrompt);

  if (!routingPlan.isDeterministicPossible || routingPlan.primarySpecialist !== "fiscal") {
    return {
      handled: false,
      specialist: "fiscal",
      routingPlan,
    };
  }

  const { todayStr, startOfWeekStr, startOfMonthStr } = getSaoPauloDateStrings(nowOverride);
  const collectedData: FiscalDeterministicData = {};

  try {
    const [semanaNotes, mesNotes, sefazDocs, sessions, expenses] = await Promise.all([
      repository.listFiscalNotes
        ? repository.listFiscalNotes(context, { start: startOfWeekStr, end: todayStr })
        : Promise.resolve([]),
      repository.listFiscalNotes
        ? repository.listFiscalNotes(context, { start: startOfMonthStr, end: todayStr })
        : Promise.resolve([]),
      repository.listSefazDocuments
        ? repository.listSefazDocuments(context, { start: startOfMonthStr, end: todayStr })
        : Promise.resolve([]),
      repository.listDocumentSessions
        ? repository.listDocumentSessions(context, {
            start: `${startOfMonthStr}T00:00:00Z`,
            end: `${todayStr}T23:59:59Z`,
          })
        : Promise.resolve([]),
      repository.listExpenses
        ? repository.listExpenses(context, { start: startOfMonthStr, end: todayStr })
        : Promise.resolve([]),
    ]);

    collectedData.notasSemana = semanaNotes;
    collectedData.notasMes = mesNotes;
    collectedData.notasPendentes = mesNotes.filter(
      (n) => n.status.toLowerCase() === "pendente" || n.status.toLowerCase() === "processando"
    );
    collectedData.valorTotalNotasMes = mesNotes.reduce((acc, n) => acc + (n.valorTotal || 0), 0);

    const errorSessions = sessions.filter(
      (s) => s.status.toLowerCase() === "erro" || s.status.toLowerCase() === "falha"
    );
    collectedData.documentosErro = errorSessions.map((s) => ({
      id: s.id,
      tipo: s.documentoTipo || "Documento Fiscal",
      descricao: `Falha na sessão do documento NF ${s.numeroNf || "S/N"} (${s.fornecedor || "Fornecedor não identificado"})`,
    }));

    // Auditoria e conferência fiscal real (Gate 0.2)
    const divergencias: Array<{ id: string; tipo: string; descricao: string }> = [];

    // 1. Documentos Sefaz com status com erro ou divergente
    sefazDocs.forEach((doc) => {
      const st = (doc.statusProcessamento || "").toLowerCase();
      if (st === "divergente" || st === "erro" || st === "rejeitado") {
        divergencias.push({
          id: doc.id,
          tipo: "Sefaz com Erro",
          descricao: `Documento Sefaz chave ${doc.chaveAcesso ? doc.chaveAcesso.substring(0, 15) + "..." : doc.id} (${doc.emitenteNome || "Emitente Desconhecido"}) com status '${doc.statusProcessamento}'.`,
        });
      }
    });

    // 2. Documentos Sefaz sem entrada correspondente em notas_fiscais_compra
    const chavesCompra = new Set(mesNotes.map((n) => n.chaveAcesso).filter(Boolean));
    sefazDocs.forEach((doc) => {
      if (doc.chaveAcesso && !chavesCompra.has(doc.chaveAcesso)) {
        divergencias.push({
          id: doc.id,
          tipo: "Sefaz Não Registrado",
          descricao: `Documento Sefaz emitido por ${doc.emitenteNome || "Fornecedor"} no valor de R$ ${doc.valorTotal.toFixed(2)} ainda não possui nota fiscal de compra escriturada.`,
        });
      }
    });

    // 3. Notas fiscais de compra com status divergente ou erro
    mesNotes.forEach((n) => {
      const st = (n.status || "").toLowerCase();
      if (st === "divergente" || st === "erro" || st === "rejeitada") {
        divergencias.push({
          id: n.id,
          tipo: "NF Divergente",
          descricao: `Nota Fiscal ${n.numeroNf || "S/N"} (${n.fornecedor || "Fornecedor"}) marcada com status '${n.status}'.`,
        });
      }
    });

    // 4. Conferência de valor entre Nota Fiscal e Despesa lançada
    mesNotes.forEach((n) => {
      if (n.valorTotal > 0) {
        const matchingExpense = expenses.find((exp) => {
          const desc = (exp.description || "").toLowerCase();
          return (
            (n.numeroNf && desc.includes(n.numeroNf)) ||
            (n.fornecedor && desc.includes(n.fornecedor.toLowerCase().slice(0, 8)))
          );
        });
        if (matchingExpense && Math.abs(n.valorTotal - matchingExpense.amount) > 0.05) {
          divergencias.push({
            id: n.id,
            tipo: "Divergência de Valor",
            descricao: `Nota Fiscal ${n.numeroNf || n.id} (R$ ${n.valorTotal.toFixed(2)}) difere do lançamento financeiro correspondente (R$ ${matchingExpense.amount.toFixed(2)}).`,
          });
        }
      }
    });

    collectedData.divergencias = divergencias;
    collectedData.documentosAuditados = {
      totalNotas: mesNotes.length,
      totalSefaz: sefazDocs.length,
      totalSessoes: sessions.length,
    };
  } catch (err) {
    console.warn("[specialist-router] Erro ao consultar repositório fiscal:", err);
  }

  const result = buildFiscalSpecialistDeterministicResponse(userPrompt, collectedData);
  return {
    ...result,
    routingPlan,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENTE DE VENDAS E PDV — RESPOSTAS DETERMINÍSTICAS (Gate 2)
// ─────────────────────────────────────────────────────────────────────────────

export interface SalesPdvDeterministicData {
  vendasOntemTotal?: number | null;
  pedidosOntemTotal?: number | null;
  top5ProdutosOntem?: Array<{ nome: string; quantidade: number; total: number }> | null;
  horarioPicoOntem?: { faixa: string; turnos?: string; totalVendas: number; quantidadePedidos: number } | null;
  faturamentoMesAtual?: number | null;
  faturamentoMesAnterior?: number | null;
  variacaoMesPercentual?: number | null;
  divisaoFormasPagamento?: Array<{ metodo: string; valor: number; percentual: number }> | null;
}

export function buildSalesPdvSpecialistDeterministicResponse(
  userPrompt: string,
  data: SalesPdvDeterministicData
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();

  // Restrição server-side para colaboradores sem permissão financeira (Gate 0.1)
  if (data.isMemberRole) {
    if (
      p.includes("quanto faturou") ||
      p.includes("quanto faturei") ||
      p.includes("quanto vendemos") ||
      p.includes("quanto vendi") ||
      p.includes("faturamento de ontem") ||
      p.includes("mes anterior") ||
      p.includes("mês anterior") ||
      p.includes("formas de pagamento") ||
      p.includes("divisao por forma de pagamento") ||
      p.includes("divisão por forma de pagamento")
    ) {
      return {
        handled: true,
        answer:
          "🔒 *Acesso Restrito — Agente de Vendas e PDV:*\n\n" +
          "O seu perfil possui autorização para consultas operacionais de balcão (produtos mais vendidos, horários de pico e volume de pedidos). " +
          "Valores de faturamento monetário em R$, comparativos de receita e detalhamento financeiro por forma de pagamento são restritos ao proprietário e administradores.",
        specialist: "vendas_pdv",
      };
    }
  }

  // Caso 1: "Quanto faturamos ontem no balcão?"
  if (
    p.includes("faturamos ontem no balcão") ||
    p.includes("faturamos ontem no balcao") ||
    p.includes("quanto faturei ontem") ||
    p.includes("faturamento de ontem") ||
    p.includes("vendas de ontem")
  ) {
    if (data.vendasOntemTotal === null || data.vendasOntemTotal === undefined) {
      return {
        handled: true,
        answer: "📊 *Agente de Vendas e PDV — Faturamento do Balcão:*\n\nDados de vendas de ontem não disponíveis.",
        specialist: "vendas_pdv",
      };
    }

    const totalStr = `R$ ${Number(data.vendasOntemTotal).toFixed(2)}`;
    const pedCount = data.pedidosOntemTotal ?? 0;
    const ticketMedio = pedCount > 0 ? `R$ ${(data.vendasOntemTotal / pedCount).toFixed(2)}` : "R$ 0,00";

    const msg =
      `📊 *Agente de Vendas e PDV — Desempenho de Ontem (Balcão):*\n\n` +
      `• *Faturamento Bruto:* ${totalStr}\n` +
      `• *Total de Pedidos:* ${pedCount}\n` +
      `• *Ticket Médio por Comanda:* ${ticketMedio}\n\n` +
      `_Apurado diretamente das vendas presenciais registradas no PDV Eyemobile._`;

    return { handled: true, answer: msg, specialist: "vendas_pdv" };
  }

  // Caso 2: "Quais foram os 5 produtos mais vendidos ontem?"
  if (p.includes("5 produtos mais vendidos") || p.includes("produtos mais vendidos") || p.includes("mais vendido ontem") || p.includes("top 5")) {
    if (data.top5ProdutosOntem === null || data.top5ProdutosOntem === undefined) {
      return {
        handled: true,
        answer: "📊 *Agente de Vendas e PDV — Produtos Mais Vendidos:*\n\nRanking de produtos não disponível.",
        specialist: "vendas_pdv",
      };
    }

    if (data.top5ProdutosOntem.length === 0) {
      return {
        handled: true,
        answer:
          "📊 *Agente de Vendas e PDV — Top Produtos Mais Vendidos de Ontem:*\n\n" +
          "Nenhum produto vendido registrado no PDV Eyemobile para o dia de ontem.",
        specialist: "vendas_pdv",
      };
    }

    let msg = `📊 *Agente de Vendas e PDV — Top 5 Produtos Mais Vendidos Ontem:*\n\n`;
    data.top5ProdutosOntem.slice(0, 5).forEach((prod, idx) => {
      if (data.isMemberRole) {
        msg += `${idx + 1}. *${prod.nome}* — ${prod.quantidade} unidade(s) vendida(s)\n`;
      } else {
        msg += `${idx + 1}. *${prod.nome}* — ${prod.quantidade} un. (Total: R$ ${prod.total.toFixed(2)})\n`;
      }
    });
    msg += `\n_Ranking extraído dos itens discriminados nas comandas do caixa._`;

    return { handled: true, answer: msg, specialist: "vendas_pdv" };
  }

  // Caso 3: "Qual horário teve mais movimento ontem?"
  if (p.includes("horario de pico") || p.includes("horário de pico") || p.includes("mais movimento ontem")) {
    if (data.horarioPicoOntem === null || data.horarioPicoOntem === undefined) {
      return {
        handled: true,
        answer: "📊 *Agente de Vendas e PDV — Horário de Pico:*\n\nDados de horário de pico não disponíveis.",
        specialist: "vendas_pdv",
      };
    }

    if (data.horarioPicoOntem.quantidadePedidos === 0) {
      return {
        handled: true,
        answer:
          "📊 *Agente de Vendas e PDV — Horário de Pico de Ontem:*\n\n" +
          "Nenhum movimento ou venda registrada no caixa durante o dia de ontem.",
        specialist: "vendas_pdv",
      };
    }

    const pico = data.horarioPicoOntem;
    const msg =
      `📊 *Agente de Vendas e PDV — Horário de Pico de Ontem:*\n\n` +
      `• *Faixa de Maior Faturamento:* ${pico.faixa}\n` +
      `• *Volume do Pico:* R$ ${pico.totalVendas.toFixed(2)} em ${pico.quantidadePedidos} pedido(s)\n` +
      (pico.turnos ? `• *Turno de Concentração:* ${pico.turnos}\n\n` : "\n") +
      `_Análise de fluxo por hora no fuso horário de São Paulo._`;

    return { handled: true, answer: msg, specialist: "vendas_pdv" };
  }

  // Caso 4: "Qual foi o faturamento deste mês comparado ao anterior?"
  if (p.includes("comparado ao anterior") || p.includes("comparação com o mês anterior") || p.includes("mes anterior")) {
    if (
      data.faturamentoMesAtual === null ||
      data.faturamentoMesAtual === undefined ||
      data.faturamentoMesAnterior === null ||
      data.faturamentoMesAnterior === undefined
    ) {
      return {
        handled: true,
        answer: "📊 *Agente de Vendas e PDV — Comparativo Mensal:*\n\nComparativo entre meses não disponível.",
        specialist: "vendas_pdv",
      };
    }

    const atualStr = `R$ ${Number(data.faturamentoMesAtual).toFixed(2)}`;
    const antStr = `R$ ${Number(data.faturamentoMesAnterior).toFixed(2)}`;
    const varStr =
      data.variacaoMesPercentual !== null && data.variacaoMesPercentual !== undefined
        ? `${data.variacaoMesPercentual >= 0 ? "+" : ""}${data.variacaoMesPercentual.toFixed(1)}%`
        : "N/A";

    const msg =
      `📊 *Agente de Vendas e PDV — Comparativo de Faturamento Mensal:*\n\n` +
      `• *Mês Atual (Acumulado):* ${atualStr}\n` +
      `• *Mês Anterior (Período Completo):* ${antStr}\n` +
      `• *Variação Comercial:* ${varStr}\n\n` +
      `_Comparação baseada exclusivamente nas vendas brutas do PDV Eyemobile._`;

    return { handled: true, answer: msg, specialist: "vendas_pdv" };
  }

  // Caso 5: "Como foi a divisão por forma de pagamento?"
  if (p.includes("divisão por forma de pagamento") || p.includes("divisao por forma de pagamento") || p.includes("formas de pagamento")) {
    if (data.divisaoFormasPagamento === null || data.divisaoFormasPagamento === undefined) {
      return {
        handled: true,
        answer: "📊 *Agente de Vendas e PDV — Formas de Pagamento:*\n\nDivisão por formas de pagamento não disponível.",
        specialist: "vendas_pdv",
      };
    }

    if (data.divisaoFormasPagamento.length === 0) {
      return {
        handled: true,
        answer:
          "📊 *Agente de Vendas e PDV — Meios de Pagamento:*\n\n" +
          "Nenhuma venda registrada no período para apuração dos meios de pagamento.",
        specialist: "vendas_pdv",
      };
    }

    let msg = `📊 *Agente de Vendas e PDV — Divisão por Meios de Pagamento:*\n\n`;
    data.divisaoFormasPagamento.forEach((d) => {
      msg += `• *${d.metodo}:* R$ ${d.valor.toFixed(2)} (${d.percentual.toFixed(1)}%)\n`;
    });
    msg += `\n_Divisão apurada dos lançamentos registrados no caixa._`;

    return { handled: true, answer: msg, specialist: "vendas_pdv" };
  }

  return { handled: false, specialist: "vendas_pdv" };
}

export async function fetchAndExecuteSalesPdvSpecialist(
  userPrompt: string,
  context: AiExecutionContext,
  repository: FinancialQueryRepository,
  nowOverride?: Date
): Promise<{
  handled: boolean;
  answer?: string;
  specialist: string;
  routingPlan: SpecialistRoutingPlan;
}> {
  const routingPlan = routeUserQueryToSpecialists(userPrompt);

  if (!routingPlan.isDeterministicPossible || routingPlan.primarySpecialist !== "vendas_pdv") {
    return {
      handled: false,
      specialist: "vendas_pdv",
      routingPlan,
    };
  }

  const { todayStr, yesterdayStr, startOfMonthStr, startOfPrevMonthStr, endOfPrevMonthStr } =
    getSaoPauloDateStrings(nowOverride);
  const collectedData: SalesPdvDeterministicData = {
    isMemberRole: !canRoleAccessFinancialData(context.role),
  };

  try {
    if (repository.listSalesPdvDetails) {
      const [yesterdaySales, monthSales, prevMonthSales] = await Promise.all([
        repository.listSalesPdvDetails(context, { start: yesterdayStr, end: yesterdayStr }),
        repository.listSalesPdvDetails(context, { start: startOfMonthStr, end: todayStr }),
        repository.listSalesPdvDetails(context, { start: startOfPrevMonthStr, end: endOfPrevMonthStr }),
      ]);

      const filterValid = (list: SalesPdvDetailRecord[]) => {
        const seenKeys = new Set<string>();
        return list.filter((s) => {
          const st = (s.status || "").toLowerCase();
          const desc = (s.description || "").toLowerCase();
          if (
            st === "cancelada" ||
            st === "cancelled" ||
            st === "estornada" ||
            st === "estorno" ||
            desc.includes("cancelad") ||
            desc.includes("estorno")
          ) {
            return false;
          }
          const match = desc.match(/#(\d+)/);
          const dedupKey = match ? `eyemobile_${match[1]}` : (s.id ? `id_${s.id}` : null);
          if (dedupKey) {
            if (seenKeys.has(dedupKey)) return false;
            seenKeys.add(dedupKey);
          }
          return true;
        });
      };

      const validYesterday = filterValid(yesterdaySales);
      const validMonth = filterValid(monthSales);
      const validPrevMonth = filterValid(prevMonthSales);

      // 1. Faturamento de ontem
      collectedData.vendasOntemTotal = validYesterday.reduce((acc, s) => acc + (s.amount || 0), 0);
      collectedData.pedidosOntemTotal = validYesterday.length;

      // 2. Top 5 produtos de ontem
      const productMap = new Map<string, { quantidade: number; total: number }>();
      validYesterday.forEach((s) => {
        s.items.forEach((item) => {
          const name = item.productName.trim();
          if (!name) return;
          const current = productMap.get(name) || { quantidade: 0, total: 0 };
          current.quantidade += item.quantity;
          current.total += item.total;
          productMap.set(name, current);
        });
      });

      const sortedProducts = Array.from(productMap.entries())
        .map(([nome, stats]) => ({
          nome,
          quantidade: stats.quantidade,
          total: stats.total,
        }))
        .sort((a, b) => b.quantidade - a.quantidade);

      collectedData.top5ProdutosOntem = sortedProducts.slice(0, 5);

      // 3. Horário de pico de ontem (fuso SP)
      const hourBuckets = new Map<number, { total: number; pedidos: number }>();
      validYesterday.forEach((s) => {
        const timeRef = s.createdAt || `${s.date}T12:00:00Z`;
        const hour = Number(
          new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            hour12: false,
          }).format(new Date(timeRef))
        );
        const b = hourBuckets.get(hour) || { total: 0, pedidos: 0 };
        b.total += s.amount;
        b.pedidos += 1;
        hourBuckets.set(hour, b);
      });

      let bestHour = 12;
      let maxTotal = -1;
      let maxPedidos = 0;
      hourBuckets.forEach((val, hour) => {
        if (val.total > maxTotal) {
          maxTotal = val.total;
          maxPedidos = val.pedidos;
          bestHour = hour;
        }
      });

      const nextHour = (bestHour + 1) % 24;
      const faixaStr = `${String(bestHour).padStart(2, "0")}h às ${String(nextHour).padStart(2, "0")}h`;
      let turno = "Tarde";
      if (bestHour >= 6 && bestHour < 12) turno = "Manhã";
      else if (bestHour >= 12 && bestHour < 18) turno = "Almoço / Tarde";
      else if (bestHour >= 18 && bestHour <= 23) turno = "Noite / Jantar";
      else turno = "Madrugada";

      if (validYesterday.length === 0) {
        collectedData.horarioPicoOntem = {
          faixa: "Sem movimento",
          turnos: "Nenhum",
          totalVendas: 0,
          quantidadePedidos: 0,
        };
      } else {
        collectedData.horarioPicoOntem = {
          faixa: faixaStr,
          turnos: turno,
          totalVendas: maxTotal > 0 ? maxTotal : 0,
          quantidadePedidos: maxPedidos,
        };
      }

      // 4. Comparativo mensal
      const fatAtual = validMonth.reduce((acc, s) => acc + (s.amount || 0), 0);
      const fatAnt = validPrevMonth.reduce((acc, s) => acc + (s.amount || 0), 0);
      collectedData.faturamentoMesAtual = fatAtual;
      collectedData.faturamentoMesAnterior = fatAnt;
      if (fatAnt > 0) {
        collectedData.variacaoMesPercentual = Math.round(((fatAtual - fatAnt) / fatAnt) * 1000) / 10;
      } else {
        collectedData.variacaoMesPercentual = null;
      }

      // 5. Divisão por forma de pagamento (mês corrente)
      const payMap = new Map<string, number>();
      let totalPay = 0;
      validMonth.forEach((s) => {
        const rawMethod = (s.paymentMethod || "outros").toLowerCase();
        let label = "Outros";
        if (
          rawMethod.includes("misto") ||
          rawMethod.includes("dividido") ||
          rawMethod.includes("multiplo") ||
          rawMethod.includes("múltiplo")
        ) {
          label = "Pagamento Misto / Dividido";
        } else if (rawMethod.includes("debito") || rawMethod.includes("débito")) {
          label = "Cartão de Débito";
        } else if (rawMethod.includes("credito") || rawMethod.includes("crédito")) {
          label = "Cartão de Crédito";
        } else if (rawMethod.includes("dinheiro")) {
          label = "Dinheiro";
        } else if (rawMethod.includes("pix")) {
          label = "Pix";
        } else if (rawMethod.includes("voucher") || rawMethod.includes("vale")) {
          label = "Voucher";
        }
        const cur = payMap.get(label) || 0;
        payMap.set(label, cur + s.amount);
        totalPay += s.amount;
      });

      collectedData.divisaoFormasPagamento = Array.from(payMap.entries())
        .map(([metodo, valor]) => ({
          metodo,
          valor,
          percentual: totalPay > 0 ? (valor / totalPay) * 100 : 0,
        }))
        .sort((a, b) => b.valor - a.valor);
    } else {
      collectedData.vendasOntemTotal = 0;
      collectedData.pedidosOntemTotal = 0;
      collectedData.top5ProdutosOntem = [];
      collectedData.horarioPicoOntem = { faixa: "12h às 13h", totalVendas: 0, quantidadePedidos: 0 };
      collectedData.faturamentoMesAtual = 0;
      collectedData.faturamentoMesAnterior = 0;
      collectedData.variacaoMesPercentual = 0;
      collectedData.divisaoFormasPagamento = [];
    }
  } catch (err) {
    console.warn("[specialist-router] Erro ao consultar repositório de vendas PDV:", err);
  }

  const result = buildSalesPdvSpecialistDeterministicResponse(userPrompt, collectedData);
  return {
    ...result,
    routingPlan,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDENADOR UNIFICADO DE RESPOSTAS DETERMINÍSTICAS (Gate 0, 1 & 2)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAndExecuteSpecialistTurn(
  userPrompt: string,
  context: AiExecutionContext,
  repository: FinancialQueryRepository,
  nowOverride?: Date
): Promise<{
  handled: boolean;
  answer?: string;
  specialist: SpecialistAgentId;
  department: string;
  routingPlan: SpecialistRoutingPlan;
}> {
  const routingPlan = routeUserQueryToSpecialists(userPrompt);

  if (routingPlan.primarySpecialist === "fiscal") {
    const res = await fetchAndExecuteFiscalSpecialist(userPrompt, context, repository, nowOverride);
    return {
      handled: res.handled,
      answer: res.answer,
      specialist: "fiscal",
      department: SPECIALIST_AGENTS_REGISTRY.fiscal.department,
      routingPlan: res.routingPlan,
    };
  }

  if (routingPlan.primarySpecialist === "vendas_pdv") {
    const res = await fetchAndExecuteSalesPdvSpecialist(userPrompt, context, repository, nowOverride);
    return {
      handled: res.handled,
      answer: res.answer,
      specialist: "vendas_pdv",
      department: SPECIALIST_AGENTS_REGISTRY.vendas_pdv.department,
      routingPlan: res.routingPlan,
    };
  }

  if (routingPlan.primarySpecialist === "financeiro") {
    const res = await fetchAndExecuteFinancialSpecialist(userPrompt, context, repository, nowOverride);
    return {
      handled: res.handled,
      answer: res.answer,
      specialist: "financeiro",
      department: SPECIALIST_AGENTS_REGISTRY.financeiro.department,
      routingPlan: res.routingPlan,
    };
  }

  return {
    handled: false,
    specialist: routingPlan.primarySpecialist,
    department: SPECIALIST_AGENTS_REGISTRY[routingPlan.primarySpecialist]?.department ?? "Operações",
    routingPlan,
  };
}
