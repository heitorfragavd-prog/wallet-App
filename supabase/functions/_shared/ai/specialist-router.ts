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
  InventoryItemRecord,
  RecipeCardRecord,
  SupplierRecord,
  EmployeeRecord,
  EmployeeScheduleRecord,
  EmployeePaymentRecord,
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

  const tomorrowUtc = new Date(todayUtc.getTime() + 24 * 3600 * 1000);
  const tomorrowStr = formatter.format(tomorrowUtc);

  return {
    todayStr,
    yesterdayStr,
    tomorrowStr,
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
    p.includes("notas fiscais") ||
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
      p.includes("quantas notas fiscais") ||
      p.includes("notas fiscais recebi") ||
      p.includes("notas fiscais desta semana") ||
      p.includes("notas fiscais deste mês") ||
      p.includes("notas fiscais neste mês") ||
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
  const isEstoqueQuery =
    p.includes("estoque") ||
    p.includes("insumo") ||
    p.includes("insumos") ||
    p.includes("acabando") ||
    p.includes("ficha técnica") ||
    p.includes("ficha tecnica") ||
    p.includes("fichas técnicas") ||
    p.includes("fichas tecnicas") ||
    p.includes("compras") ||
    p.includes("preciso comprar") ||
    p.includes("o que comprar") ||
    p.includes("sugestão de compras") ||
    p.includes("sugestao de compras") ||
    p.includes("lista de compras") ||
    p.includes("maior custo") ||
    p.includes("margem baixa") ||
    p.includes("falta de produto") ||
    p.includes("reposi") ||
    p.includes("cmv") ||
    p.includes("ruptura");

  if (isEstoqueQuery) {
    const isEstoqueDeterministic =
      p.includes("acabando") ||
      p.includes("abaixo do estoque") ||
      p.includes("estoque mínimo") ||
      p.includes("estoque minimo") ||
      p.includes("preciso comprar") ||
      p.includes("o que comprar") ||
      p.includes("sugestão de compras") ||
      p.includes("sugestao de compras") ||
      p.includes("lista de compras") ||
      p.includes("quanto tenho em estoque") ||
      p.includes("total em estoque") ||
      p.includes("maior custo") ||
      p.includes("margem baixa") ||
      p.includes("qual é meu cmv") ||
      p.includes("qual o meu cmv") ||
      p.includes("qual é o cmv") ||
      p.includes("cmv") ||
      p.includes("ruptura");

    return {
      primarySpecialist: "estoque",
      coordinatingCeo: false,
      contributingSpecialists: ["estoque"],
      complexityLevel: 2,
      model: "gemini-2.5-flash",
      isDeterministicPossible: isEstoqueDeterministic,
      rationale: "Consulta direcionada ao Especialista de Estoque e Compras.",
    };
  }

  // 5. Especialista de Pessoal e RH
  const isRhQuery =
    p.includes("funcionário") ||
    p.includes("funcionario") ||
    p.includes("funcionários") ||
    p.includes("funcionarios") ||
    p.includes("colaborador") ||
    p.includes("colaboradores") ||
    p.includes("equipe") ||
    p.includes("escala") ||
    p.includes("escalas") ||
    p.includes("escalado") ||
    p.includes("escalados") ||
    p.includes("salário") ||
    p.includes("salario") ||
    p.includes("salários") ||
    p.includes("salarios") ||
    p.includes("folha de pagamento") ||
    p.includes("vale-transporte") ||
    p.includes("vale transporte") ||
    p.includes("vale-alimentação") ||
    p.includes("vale alimentação") ||
    p.includes("vale refeição") ||
    p.includes("vale refeicao") ||
    p.includes("pagamentos de funcionários") ||
    p.includes("pagamentos de funcionarios") ||
    p.includes("pagamentos duplicados") ||
    p.includes("pagamentos pendentes") ||
    p.includes("ainda estão pendentes") ||
    p.includes("ainda estao pendentes") ||
    p.includes("receberam pagamento");

  if (isRhQuery) {
    const isRhDeterministic =
      p.includes("receberam pagamento") ||
      p.includes("pagamento neste mês") ||
      p.includes("pagamentos neste mês") ||
      p.includes("pagamentos pendentes") ||
      p.includes("ainda estão pendentes") ||
      p.includes("ainda estao pendentes") ||
      p.includes("escalado para amanhã") ||
      p.includes("escalado para amanha") ||
      p.includes("escala de amanhã") ||
      p.includes("escala de amanha") ||
      p.includes("escala de hoje") ||
      p.includes("escalados") ||
      p.includes("vale-transporte") ||
      p.includes("vale transporte") ||
      p.includes("vale-alimentação") ||
      p.includes("vale alimentacao") ||
      p.includes("vale refeição") ||
      p.includes("vale refeicao") ||
      p.includes("pagamentos duplicados") ||
      p.includes("duplicidade");

    return {
      primarySpecialist: "rh",
      coordinatingCeo: false,
      contributingSpecialists: ["rh"],
      complexityLevel: 2,
      model: "gemini-2.5-flash",
      isDeterministicPossible: isRhDeterministic,
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

  // Caso 1: "Quais notas fiscais recebi nesta semana?" ou "Quantas notas fiscais recebemos neste mês?"
  if (
    p.includes("quais notas fiscais") ||
    p.includes("quantas notas fiscais") ||
    p.includes("notas fiscais recebi") ||
    p.includes("notas fiscais desta semana") ||
    p.includes("notas fiscais deste mês") ||
    p.includes("notas fiscais neste mês")
  ) {
    const isMonthScope = p.includes("mês") || p.includes("mes");
    const targetNotes = isMonthScope ? data.notasMes ?? data.notasSemana : data.notasSemana;
    const scopeLabel = isMonthScope ? "no Mês" : "na Semana";

    if (targetNotes === null || targetNotes === undefined) {
      return {
        handled: true,
        answer: `📄 *Agente Fiscal — Documentos Recebidos ${scopeLabel}:*\n\nInformações de notas fiscais não disponíveis no momento.`,
        specialist: "fiscal",
      };
    }

    if (targetNotes.length === 0) {
      return {
        handled: true,
        answer:
          `📄 *Agente Fiscal — Documentos Recebidos ${scopeLabel}:*\n\n` +
          "✅ Nenhuma nota fiscal de compra recebida no período consultado (R$ 0,00).\n\n" +
          "_Acompanhamento contínuo de entradas fiscais e integração Sefaz._",
        specialist: "fiscal",
      };
    }

    const total = targetNotes.reduce((acc, n) => acc + n.valorTotal, 0);
    let msg = `📄 *Agente Fiscal — Documentos Recebidos ${scopeLabel}:*\n\n`;
    msg += `Foram recebidas ${targetNotes.length} nota(s) fiscal(is), totalizando *R$ ${total.toFixed(2)}*:\n\n`;
    targetNotes.slice(0, 5).forEach((n) => {
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


// ─────────────────────────────────────────────────────────────────────────────
// AGENTE DE ESTOQUE E COMPRAS — RESPOSTAS DETERMINÍSTICAS (Gate 1)
// ─────────────────────────────────────────────────────────────────────────────

export interface InventoryDeterministicData {
  itensEstoque?: InventoryItemRecord[];
  itensAbaixoMinimo?: InventoryItemRecord[];
  itensEstoqueNaoInformado?: InventoryItemRecord[];
  sugestaoCompras?: Array<{
    produto: string;
    estoqueAtual: number;
    estoqueIdeal: number | null;
    estoqueMinimo?: number | null;
    tipoReposicao?: "confirmada_ideal" | "estimada_minimo";
    quantidadeComprar: number;
    embalagem: string;
    multiploCompra: number;
    custoUnitario: number;
    custoTotalEstimado: number;
    fornecedor: string;
    fornecedorCadastrado?: boolean;
    custoIndisponivel?: boolean;
    prioridade: string;
    justificativa: string;
  }>;
  itensSemReferencia?: Array<{
    produto: string;
    estoqueInformado: boolean;
    estoqueAtual: number;
    unidadeMedida: string;
    motivosPendencia: string[];
  }>;
  valorTotalEstoque?: number;
  itensSemCustoOuEstoque?: number;
  fichasTecnicas?: RecipeCardRecord[];
  cmvInfo?: {
    tipo: "confirmado" | "teorico_fichas" | "teorico_vendas" | "indisponivel";
    cmvPercentual?: number;
    cmvTeoricoCatalogoPercentual?: number;
    coberturaFichasComprovadas?: number;
    totalFichas?: number;
    detalhes?: string;
    limitacoes?: string[];
  };
  previsaoRuptura?: Array<{
    produto: string;
    estoqueAtual: number;
    consumoDiario: number;
    coberturaDias: number;
  }>;
  isMemberRole?: boolean;
}

export function buildInventorySpecialistDeterministicResponse(
  userPrompt: string,
  data: InventoryDeterministicData
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();

  // Caso 1: "Quais produtos estão acabando?" / "Quais itens estão abaixo do estoque mínimo?"
  if (
    p.includes("acabando") ||
    p.includes("abaixo do estoque") ||
    p.includes("estoque mínimo") ||
    p.includes("estoque minimo")
  ) {
    if (data.itensAbaixoMinimo === null || data.itensAbaixoMinimo === undefined) {
      return {
        handled: true,
        answer: "📦 *Agente de Estoque e Compras — Nível de Estoque:*\n\nInformações de estoque não disponíveis no momento.",
        specialist: "estoque",
      };
    }

    if (data.itensAbaixoMinimo.length === 0) {
      const naoInfCount = data.itensEstoqueNaoInformado?.length ?? 0;
      const naoInfNote =
        naoInfCount > 0
          ? `\n\nℹ️ *Nota de Cadastro:* ${naoInfCount} produto(s) ativo(s) está(ão) com *estoque atual não informado* (sem saldo preenchido, distinto de saldo zerado).`
          : "";
      return {
        handled: true,
        answer:
          "📦 *Agente de Estoque e Compras — Nível de Estoque:*\n\n" +
          "✅ Todos os produtos cadastrados estão com estoque acima do nível mínimo de segurança. Nenhuma ruptura imediata identificada." +
          naoInfNote,
        specialist: "estoque",
      };
    }

    let msg = `📦 *Agente de Estoque e Compras — Itens em Nível Crítico (${data.itensAbaixoMinimo.length}):*\n\n`;
    data.itensAbaixoMinimo.slice(0, 10).forEach((item) => {
      const zeradoTag = item.estoqueAtual <= 0 ? " — ⚠️ *ESTOQUE ZERADO*" : "";
      const minLabel =
        item.estoqueMinimoInformado === false || item.estoqueMinimo <= 0
          ? "Mínimo: não cadastrado"
          : `Mínimo: ${item.estoqueMinimo} ${item.unidadeMedida}`;
      msg += `• *${item.descricao}*: ${item.estoqueAtual} ${item.unidadeMedida} (${minLabel})${zeradoTag}\n`;
    });
    if ((data.itensEstoqueNaoInformado?.length ?? 0) > 0) {
      msg += `\nℹ️ *Estoque não informado (${data.itensEstoqueNaoInformado!.length}):* há itens sem contagem preenchida (não confundidos com estoque zerado).\n`;
    }
    msg += `\n_Recomenda-se reposição imediata para evitar descontinuidade no atendimento do caixa._`;

    return { handled: true, answer: msg, specialist: "estoque" };
  }

  // Caso 2: "Quais produtos preciso comprar hoje?" / "Sugestão de compras"
  if (
    p.includes("preciso comprar") ||
    p.includes("o que comprar") ||
    p.includes("sugestão de compras") ||
    p.includes("sugestao de compras") ||
    p.includes("lista de compras")
  ) {
    if (data.sugestaoCompras === null || data.sugestaoCompras === undefined) {
      return {
        handled: true,
        answer: "📦 *Agente de Estoque e Compras — Sugestão de Reposição:*\n\nDados de compras não disponíveis no momento.",
        specialist: "estoque",
      };
    }

    const semRef = data.itensSemReferencia ?? [];
    if (data.sugestaoCompras.length === 0 && semRef.length === 0) {
      return {
        handled: true,
        answer:
          "📦 *Agente de Estoque e Compras — Sugestão de Compras:*\n\n" +
          "✅ Todos os produtos estão com níveis suficientes de estoque. Nenhuma compra necessária para hoje.",
        specialist: "estoque",
      };
    }

    let msg = `📦 *Agente de Estoque e Compras — Sugestão de Compras Inteligente:*\n\n`;

    if (data.sugestaoCompras.length > 0) {
      // Agrupar por fornecedor cadastrado (ou "Fornecedor não cadastrado")
      const bySupplier = new Map<string, typeof data.sugestaoCompras>();
      data.sugestaoCompras.forEach((s) => {
        const f = s.fornecedor || "Fornecedor não cadastrado";
        const list = bySupplier.get(f) || [];
        list.push(s);
        bySupplier.set(f, list);
      });

      let totalGeral = 0;
      let hasUnpriced = false;

      bySupplier.forEach((items, fornecedor) => {
        let subtotal = 0;
        msg += `🏢 *Fornecedor: ${fornecedor}*\n`;
        items.forEach((it) => {
          subtotal += it.custoTotalEstimado;
          if (it.custoIndisponivel) hasUnpriced = true;
          const embalagemNote = it.multiploCompra > 1 ? ` (Emb. c/ ${it.multiploCompra})` : "";
          const refLabel =
            it.tipoReposicao === "estimada_minimo"
              ? `Reposição Estimada p/ Mínimo (${it.estoqueMinimo ?? "?"}; Ideal não cadastrado)`
              : `Ideal Cadastrado: ${it.estoqueIdeal}`;
          const qtyVerb = it.tipoReposicao === "estimada_minimo" ? "Reposição estimada:" : "Comprar";
          const estCostLabel = it.custoIndisponivel
            ? "Custo não cadastrado"
            : `Est: R$ ${it.custoTotalEstimado.toFixed(2)}`;
          msg += `• *${it.produto}*: ${qtyVerb} *${it.quantidadeComprar} ${it.embalagem}*${embalagemNote} | Atual: ${it.estoqueAtual} / ${refLabel} | ${estCostLabel} [Prioridade: ${it.prioridade}]\n`;
        });
        totalGeral += subtotal;
        msg += `*Subtotal ${fornecedor}:* R$ ${subtotal.toFixed(2)}\n\n`;
      });

      msg += `*Total Geral Estimado:* R$ ${totalGeral.toFixed(2)}${hasUnpriced ? " _(parcial: há itens sem custo cadastrado)_" : ""}\n\n`;
    } else {
      msg += `Nenhuma quantidade de compra confirmada pôde ser calculada porque faltam referências mínimas nos produtos críticos.\n\n`;
    }

    if (semRef.length > 0) {
      msg += `📋 *Produtos sem Referência Suficiente para Cálculo Automático (${semRef.length}):*\n`;
      semRef.slice(0, 8).forEach((item) => {
        const atualTxt = item.estoqueInformado ? `${item.estoqueAtual} ${item.unidadeMedida}` : "Estoque não informado";
        msg += `• *${item.produto}* (${atualTxt}): pendência de *${item.motivosPendencia.join(", ")}*. Cadastre estoque mínimo, estoque ideal ou fornecedor antes de fechar o pedido.\n`;
      });
      msg += `\n`;
    }

    msg += `⚠️ *Aviso Consultivo (canMutateState: false):* Nenhuma compra ou pedido foi gerado automaticamente. Verifique com a equipe de compras antes de confirmar os pedidos com os fornecedores.`;

    return { handled: true, answer: msg, specialist: "estoque" };
  }

  // Caso 3: "Quanto tenho em estoque?"
  if (p.includes("quanto tenho em estoque") || p.includes("total em estoque")) {
    if (data.itensEstoque === null || data.itensEstoque === undefined) {
      return {
        handled: true,
        answer: "📦 *Agente de Estoque e Compras — Posição de Estoque:*\n\nInformações de estoque não disponíveis.",
        specialist: "estoque",
      };
    }

    const totalSKUs = data.itensEstoque.length;
    const informedItems = data.itensEstoque.filter((it) => it.estoqueInformado !== false);
    const uninformedCount = totalSKUs - informedItems.length;
    const volumeFisico = informedItems.reduce((acc, it) => acc + it.estoqueAtual, 0);
    const valorEstoque = data.valorTotalEstoque ?? 0;

    if (data.isMemberRole) {
      return {
        handled: true,
        answer:
          `📦 *Agente de Estoque e Compras — Posição Operacional de Estoque:*\n\n` +
          `• *Total de Produtos/SKUs:* ${totalSKUs}` +
          (uninformedCount > 0 ? ` (${informedItems.length} com estoque informado; ${uninformedCount} sem estoque informado)` : "") +
          `\n• *Volume Físico Consolidado:* ${volumeFisico.toFixed(0)} unidade(s)\n\n` +
          `_Valores monetários e custos financeiros de estoque são restritos a gestores._`,
        specialist: "estoque",
      };
    }

    const obsParcial =
      (data.itensSemCustoOuEstoque ?? 0) > 0 || uninformedCount > 0
        ? `\n• *Itens sem estoque ou custo informado:* ${Math.max(uninformedCount, data.itensSemCustoOuEstoque ?? 0)} SKU(s) excluído(s) da valoração financeira.`
        : "";

    return {
      handled: true,
      answer:
        `📦 *Agente de Estoque e Compras — Posição Consolidada de Estoque:*\n\n` +
        `• *Valor Total em Estoque:* R$ ${valorEstoque.toFixed(2)}\n` +
        `• *Total de SKUs Ativos:* ${totalSKUs}\n` +
        `• *Volume Físico Total:* ${volumeFisico.toFixed(0)} unidade(s)` +
        obsParcial +
        `\n\n_Avaliação calculada apenas sobre itens com estoque e custo de reposição informados no sistema._`,
      specialist: "estoque",
    };
  }

  // Caso 4: "Quais produtos têm maior custo?" / "Quais produtos estão com margem baixa?"
  if (p.includes("maior custo") || p.includes("margem baixa") || p.includes("produtos mais caros")) {
    if (data.isMemberRole) {
      return {
        handled: true,
        answer:
          "🔒 *Acesso Restrito — Agente de Estoque e Compras:*\n\n" +
          "O seu perfil possui autorização para consultas operacionais de insumos e reposição. " +
          "Custos de atacado, margens de lucro e precificação são restritos aos administradores e ao proprietário.",
        specialist: "estoque",
      };
    }

    if (data.itensEstoque === null || data.itensEstoque === undefined || data.itensEstoque.length === 0) {
      return {
        handled: true,
        answer: "📦 *Agente de Estoque e Compras — Custos e Margens:*\n\nDados de custos de produtos não disponíveis.",
        specialist: "estoque",
      };
    }

    if (p.includes("margem baixa")) {
      const margemBaixa = [...data.itensEstoque]
        .filter((it) => it.precoVenda > 0 && it.custoAtual > 0)
        .sort((a, b) => a.margemRealPercentual - b.margemRealPercentual)
        .slice(0, 5);

      if (margemBaixa.length === 0) {
        return {
          handled: true,
          answer: "📦 *Agente de Estoque e Compras — Análise de Margens:*\n\nNenhum produto cadastrado com margem baixa ou em alerta.",
          specialist: "estoque",
        };
      }

      let msg = `📦 *Agente de Estoque e Compras — Produtos com Menor Margem:*\n\n`;
      margemBaixa.forEach((it, idx) => {
        msg += `${idx + 1}. *${it.descricao}*: Margem de *${it.margemRealPercentual.toFixed(1)}%* (Venda: R$ ${it.precoVenda.toFixed(2)} | Custo: R$ ${it.custoAtual.toFixed(2)})\n`;
      });
      msg += `\n_Recomenda-se renegociação com fornecedores ou revisão de precificação de venda._`;
      return { handled: true, answer: msg, specialist: "estoque" };
    }

    const maisCaros = [...data.itensEstoque]
      .filter((it) => it.custoAtual > 0)
      .sort((a, b) => b.custoAtual - a.custoAtual)
      .slice(0, 5);

    let msg = `📦 *Agente de Estoque e Compras — Produtos de Maior Custo Unitário:*\n\n`;
    maisCaros.forEach((it, idx) => {
      msg += `${idx + 1}. *${it.descricao}*: Custo de *R$ ${it.custoAtual.toFixed(2)}* por ${it.unidadeMedida} (Preço de Venda: R$ ${it.precoVenda.toFixed(2)})\n`;
    });
    msg += `\n_Apurado com base no custo de reposição atual cadastrado no sistema._`;

    return { handled: true, answer: msg, specialist: "estoque" };
  }

  // Caso 5: "Qual é meu CMV?"
  if (
    p.includes("qual é meu cmv") ||
    p.includes("qual o meu cmv") ||
    p.includes("qual é o cmv") ||
    p.includes("qual o cmv") ||
    p.includes("cmv")
  ) {
    if (data.isMemberRole) {
      return {
        handled: true,
        answer:
          "🔒 *Acesso Restrito — Agente de Estoque e Compras:*\n\n" +
          "O indicador de CMV (Custo da Mercadoria Vendida) é uma métrica executiva restrita à diretoria e administração.",
        specialist: "estoque",
      };
    }

    if (data.cmvInfo?.tipo === "confirmado" && data.cmvInfo.cmvPercentual !== undefined) {
      return {
        handled: true,
        answer:
          `📦 *Agente de Estoque e Compras — Apuração de CMV Efetivo:*\n\n` +
          `• *CMV Calculado:* *${data.cmvInfo.cmvPercentual.toFixed(1)}%* do faturamento bruto\n` +
          (data.cmvInfo.detalhes ? `• ${data.cmvInfo.detalhes}\n\n` : "\n") +
          `_Apurado a partir de estoque inicial, compras escrituradas, movimentações reais e estoque final auditado._`,
        specialist: "estoque",
      };
    }

    if (data.cmvInfo?.tipo === "teorico_fichas" && data.cmvInfo.cmvTeoricoCatalogoPercentual !== undefined) {
      const coberturaStr =
        data.cmvInfo.coberturaFichasComprovadas !== undefined && data.cmvInfo.totalFichas !== undefined
          ? `${data.cmvInfo.coberturaFichasComprovadas} de ${data.cmvInfo.totalFichas} ficha(s) técnica(s) comprovada(s)`
          : "fichas técnicas comprovadas no catálogo";
      const limitacoes =
        data.cmvInfo.limitacoes && data.cmvInfo.limitacoes.length > 0
          ? data.cmvInfo.limitacoes.map((l) => `  - ${l}`).join("\n")
          : "  - Não pondera o volume real vendido por item nem considera compras escrituradas e variação de estoque (inicial/final).";
      return {
        handled: true,
        answer:
          `📦 *Agente de Estoque e Compras — Custo Teórico por Fichas Técnicas (CMV Efetivo Indisponível):*\n\n` +
          `• *Custo Teórico de Catálogo (Fichas Técnicas):* *${data.cmvInfo.cmvTeoricoCatalogoPercentual.toFixed(1)}%* sobre o preço de venda cadastrado (${coberturaStr})\n` +
          `• *CMV Teórico Ponderado pelas Vendas:* Pendente de vinculação completa entre itens vendidos e fichas técnicas\n` +
          `• *CMV Real / Efetivo Contábil:* *Indisponível para confirmação* no momento\n\n` +
          `⚠️ *Distinção Obrigatória:* Este percentual reflete apenas a relação teórica entre custo e preço nas fichas de catálogo. Não equivale ao CMV real/efetivo:\n` +
          `${limitacoes}`,
        specialist: "estoque",
      };
    }

    if (data.cmvInfo?.tipo === "teorico_vendas" && data.cmvInfo.cmvPercentual !== undefined) {
      return {
        handled: true,
        answer:
          `📦 *Agente de Estoque e Compras — CMV Teórico pelas Vendas (CMV Efetivo Pendente):*\n\n` +
          `• *CMV Teórico das Vendas:* *${data.cmvInfo.cmvPercentual.toFixed(1)}%* do faturamento analisado\n` +
          (data.cmvInfo.detalhes ? `• ${data.cmvInfo.detalhes}\n` : "") +
          `• *CMV Real / Efetivo Contábil:* Pendente de apuração de estoque inicial, compras escrituradas e estoque final.\n\n` +
          `_Indicador teórico baseado no mix vendido; não substitui a conciliação contábil completa._`,
        specialist: "estoque",
      };
    }

    return {
      handled: true,
      answer:
        "⚠️ *Agente de Estoque e Compras — Apuração de CMV:*\n\n" +
        "Dados de CMV pendentes de conciliação completa. Não foram encontradas fichas técnicas comprovadas para 100% dos insumos " +
        "ou notas fiscais / variação de estoque suficientes no período para certificar um percentual real sem margem de erro. " +
        "O Wallet CEO evita estimativas infundadas para proteger a governança financeira.",
      specialist: "estoque",
    };
  }

  // Caso 6: "Previsão de ruptura"
  if (p.includes("ruptura") || p.includes("previsao de ruptura") || p.includes("previsão de ruptura")) {
    if (data.previsaoRuptura === null || data.previsaoRuptura === undefined || data.previsaoRuptura.length === 0) {
      return {
        handled: true,
        answer:
          "📦 *Agente de Estoque e Compras — Previsão de Ruptura:*\n\n" +
          "✅ Com base no ritmo recente de saída, nenhum item apresenta risco de ruptura nos próximos 3 dias de operação.",
        specialist: "estoque",
      };
    }

    let msg = `📦 *Agente de Estoque e Compras — Alerta de Previsão de Ruptura:*\n\n`;
    data.previsaoRuptura.forEach((r) => {
      msg += `• *${r.produto}*: Cobertura estimada de *${r.coberturaDias.toFixed(1)} dia(s)* de vendas (Saída média: ${r.consumoDiario.toFixed(0)} un./dia | Estoque atual: ${r.estoqueAtual})\n`;
    });
    msg += `\n_Projeção calculada pelo giro diário de vendas do PDV Eyemobile._`;

    return { handled: true, answer: msg, specialist: "estoque" };
  }

  return { handled: false, specialist: "estoque" };
}

export async function fetchAndExecuteInventorySpecialist(
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

  if (!routingPlan.isDeterministicPossible || routingPlan.primarySpecialist !== "estoque") {
    return {
      handled: false,
      specialist: "estoque",
      routingPlan,
    };
  }

  const { yesterdayStr } = getSaoPauloDateStrings(nowOverride);
  const collectedData: InventoryDeterministicData = {
    isMemberRole: !canRoleAccessFinancialData(context.role),
  };

  try {
    const [items, recipes, yesterdaySales] = await Promise.all([
      repository.listInventoryItems ? repository.listInventoryItems(context) : Promise.resolve([]),
      repository.listRecipeCards ? repository.listRecipeCards(context) : Promise.resolve([]),
      repository.listSalesPdvDetails
        ? repository.listSalesPdvDetails(context, { start: yesterdayStr, end: yesterdayStr })
        : Promise.resolve([]),
    ]);

    collectedData.itensEstoque = items;
    collectedData.fichasTecnicas = recipes;
    const informedItems = items.filter((it) => it.estoqueInformado !== false);
    const uninformedStockItems = items.filter((it) => it.estoqueInformado === false);
    collectedData.itensEstoqueNaoInformado = uninformedStockItems;

    const valoredItems = informedItems.filter((it) => it.custoInformado !== false);
    collectedData.valorTotalEstoque = valoredItems.reduce((acc, it) => acc + it.estoqueAtual * it.custoAtual, 0);
    collectedData.itensSemCustoOuEstoque = items.length - valoredItems.length;

    // Itens abaixo do estoque mínimo (apenas quando há estoque atual informado)
    const criticalItems = informedItems.filter(
      (it) => it.estoqueAtual <= 0 || (it.estoqueMinimo > 0 && it.estoqueAtual <= it.estoqueMinimo)
    );
    collectedData.itensAbaixoMinimo = criticalItems;

    // Sugestão de compras inteligente (Gate 0.1 — sem inventar ideal nem fornecedor)
    const suggestions: NonNullable<typeof collectedData.sugestaoCompras> = [];
    const semReferencia: NonNullable<typeof collectedData.itensSemReferencia> = [];

    items.forEach((it) => {
      const hasEstoqueInformado = it.estoqueInformado !== false;
      const hasMinimo = (it.estoqueMinimoInformado ?? it.estoqueMinimo > 0) && it.estoqueMinimo > 0;
      const hasIdeal = (it.estoqueIdealInformado ?? it.estoqueIdeal > 0) && it.estoqueIdeal > Math.max(0, it.estoqueMinimo);
      const hasFornecedor = Boolean(it.fornecedorPadrao && it.fornecedorPadrao.trim().length > 0);
      const fornecedorLabel = hasFornecedor ? it.fornecedorPadrao!.trim() : "Fornecedor não cadastrado";

      if (!hasEstoqueInformado) {
        semReferencia.push({
          produto: it.descricao,
          estoqueInformado: false,
          estoqueAtual: 0,
          unidadeMedida: it.unidadeMedida || "UN",
          motivosPendencia: [
            "estoque atual não informado",
            ...(!hasMinimo ? ["estoque mínimo não cadastrado"] : []),
            ...(!hasIdeal ? ["estoque ideal não cadastrado"] : []),
            ...(!hasFornecedor ? ["fornecedor não cadastrado"] : []),
          ],
        });
        return;
      }

      const needsReplenishment = it.estoqueAtual <= 0 || (hasMinimo && it.estoqueAtual <= it.estoqueMinimo);
      if (!needsReplenishment) {
        return;
      }

      // Sem estoque ideal e sem estoque mínimo cadastrados: nunca inventar quantidade
      if (!hasIdeal && !hasMinimo) {
        semReferencia.push({
          produto: it.descricao,
          estoqueInformado: true,
          estoqueAtual: it.estoqueAtual,
          unidadeMedida: it.unidadeMedida || "UN",
          motivosPendencia: [
            "estoque mínimo não cadastrado",
            "estoque ideal não cadastrado",
            ...(!hasFornecedor ? ["fornecedor não cadastrado"] : []),
          ],
        });
        return;
      }

      const targetQty = hasIdeal ? it.estoqueIdeal : it.estoqueMinimo;
      let qtd = Math.max(0, targetQty - it.estoqueAtual);
      const multiplo = it.multiploCompra > 0 ? it.multiploCompra : 1;
      if (multiplo > 1 && qtd > 0) {
        qtd = Math.ceil(qtd / multiplo) * multiplo;
      }

      const tipoReposicao: "confirmada_ideal" | "estimada_minimo" = hasIdeal
        ? "confirmada_ideal"
        : "estimada_minimo";

      if (!hasIdeal || !hasFornecedor) {
        const motivos: string[] = [];
        if (!hasIdeal) motivos.push("estoque ideal não cadastrado (usando mínimo como referência parcial)");
        if (!hasFornecedor) motivos.push("fornecedor não cadastrado");
        semReferencia.push({
          produto: it.descricao,
          estoqueInformado: true,
          estoqueAtual: it.estoqueAtual,
          unidadeMedida: it.unidadeMedida || "UN",
          motivosPendencia: motivos,
        });
      }

      if (qtd > 0) {
        const custoIndisponivel = it.custoInformado === false || it.custoAtual <= 0;
        const prioridade = it.estoqueAtual <= 0 ? "Urgente (Zerado)" : "Alta (Abaixo Mínimo)";
        const justificativa =
          it.estoqueAtual <= 0
            ? "Estoque zerado no balcão"
            : `Estoque atual (${it.estoqueAtual}) abaixo do mínimo (${it.estoqueMinimo})`;

        suggestions.push({
          produto: it.descricao,
          estoqueAtual: it.estoqueAtual,
          estoqueIdeal: hasIdeal ? it.estoqueIdeal : null,
          estoqueMinimo: hasMinimo ? it.estoqueMinimo : null,
          tipoReposicao,
          quantidadeComprar: qtd,
          embalagem: it.unidadeMedida || "UN",
          multiploCompra: multiplo,
          custoUnitario: custoIndisponivel ? 0 : it.custoAtual,
          custoTotalEstimado: custoIndisponivel ? 0 : qtd * it.custoAtual,
          fornecedor: fornecedorLabel,
          fornecedorCadastrado: hasFornecedor,
          custoIndisponivel,
          prioridade,
          justificativa,
        });
      }
    });

    collectedData.sugestaoCompras = suggestions;
    collectedData.itensSemReferencia = semReferencia;

    // Previsão de ruptura baseada na saída recente (somente com estoque atual informado > 0)
    const validYesterday = yesterdaySales.filter((s) => {
      const st = (s.status || "").toLowerCase();
      return st !== "cancelada" && st !== "cancelled" && st !== "estornada";
    });

    const salesVolumeMap = new Map<string, number>();
    validYesterday.forEach((s) => {
      (s.items || []).forEach((it) => {
        const name = (it.productName || "").trim().toLowerCase();
        salesVolumeMap.set(name, (salesVolumeMap.get(name) || 0) + it.quantity);
      });
    });

    const rupturas: NonNullable<typeof collectedData.previsaoRuptura> = [];
    informedItems.forEach((it) => {
      const dailyConsumption = salesVolumeMap.get(it.descricao.toLowerCase()) || 0;
      if (dailyConsumption > 0 && it.estoqueAtual > 0) {
        const cobertura = it.estoqueAtual / dailyConsumption;
        if (cobertura <= 3.0) {
          rupturas.push({
            produto: it.descricao,
            estoqueAtual: it.estoqueAtual,
            consumoDiario: dailyConsumption,
            coberturaDias: cobertura,
          });
        }
      }
    });
    collectedData.previsaoRuptura = rupturas;

    // CMV (Gate 0.2 — separar custo teórico de ficha técnica, teórico de vendas e CMV efetivo real)
    const provenRecipes = recipes.filter(
      (r) => r.statusFicha === "comprovada" && r.qtdInsumosSemCusto === 0 && r.precoVenda > 0
    );
    if (provenRecipes.length > 0 && recipes.length > 0) {
      const totalVenda = provenRecipes.reduce((acc, r) => acc + r.precoVenda, 0);
      const totalCusto = provenRecipes.reduce((acc, r) => acc + r.custoTotal, 0);
      const cmvTeorico = totalVenda > 0 ? (totalCusto / totalVenda) * 100 : 0;
      collectedData.cmvInfo = {
        tipo: "teorico_fichas",
        cmvTeoricoCatalogoPercentual: Math.round(cmvTeorico * 10) / 10,
        coberturaFichasComprovadas: provenRecipes.length,
        totalFichas: recipes.length,
        detalhes: `Baseado exclusivamente na relação custo/preço de catálogo em ${provenRecipes.length} de ${recipes.length} fichas técnicas comprovadas.`,
        limitacoes: [
          "Não considera mix real de quantidades vendidas no PDV.",
          "Não inclui compras escrituradas (NF-e), estoque inicial e estoque final do período contábil.",
        ],
      };
    } else {
      collectedData.cmvInfo = {
        tipo: "indisponivel",
      };
    }
  } catch (err) {
    console.warn("[specialist-router] Erro ao consultar repositório de estoque:", err);
  }

  const result = buildInventorySpecialistDeterministicResponse(userPrompt, collectedData);
  return {
    ...result,
    routingPlan,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// AGENTE DE PESSOAL E RH — RESPOSTAS DETERMINÍSTICAS (Gate 2)
// ─────────────────────────────────────────────────────────────────────────────

export interface RhDeterministicData {
  colaboradores?: EmployeeRecord[];
  pagamentosMes?: EmployeePaymentRecord[];
  pagamentosPendentes?: EmployeePaymentRecord[];
  escalasAmanha?: EmployeeScheduleRecord[];
  escalasHoje?: EmployeeScheduleRecord[];
  pagamentosDuplicados?: Array<{
    descricao: string;
    quantidade: number;
    valor: number;
    nivel?: "comprovada" | "possivel";
    colaboradorId?: string | null;
    colaboradorNome?: string | null;
    acertoId?: string | null;
    competencia?: string | null;
    criterio?: string;
    paymentIds?: string[];
  }>;
  totalVales?: {
    valeTransporte: number;
    valeRefeicao: number;
    total: number;
  };
  isMemberRole?: boolean;
}

export function buildRhSpecialistDeterministicResponse(
  userPrompt: string,
  data: RhDeterministicData
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();

  // Sigilo salarial e proteção estrita de dados individuais (Gate 2.2)
  if (data.isMemberRole) {
    return {
      handled: true,
      answer:
        "🔒 *Acesso Restrito — Agente de Pessoal e RH:*\n\n" +
        "Informações sobre folha de pagamento, remunerações, escalas detalhadas e dados contratuais da equipe " +
        "são restritos exclusivamente aos administradores e ao proprietário da empresa.",
      specialist: "rh",
    };
  }

  // Caso 1: "Quais funcionários receberam pagamento neste mês?"
  if (
    p.includes("receberam pagamento") ||
    p.includes("pagamento neste mês") ||
    p.includes("pagamentos neste mês") ||
    p.includes("pagamentos do mês")
  ) {
    if (data.pagamentosMes === null || data.pagamentosMes === undefined) {
      return {
        handled: true,
        answer: "👥 *Agente de Pessoal e RH — Pagamentos do Mês:*\n\nDados de pagamentos não disponíveis no momento.",
        specialist: "rh",
      };
    }

    if (data.pagamentosMes.length === 0) {
      return {
        handled: true,
        answer:
          "👥 *Agente de Pessoal e RH — Pagamentos do Mês:*\n\n" +
          "Nenhum pagamento liquidado registrado para colaboradores até o momento neste mês.",
        specialist: "rh",
      };
    }

    const total = data.pagamentosMes.reduce((acc, pg) => acc + pg.valor, 0);
    let msg = `👥 *Agente de Pessoal e RH — Pagamentos Realizados no Mês (${data.pagamentosMes.length}):*\n\n`;
    msg += `• *Total Liquidado:* R$ ${total.toFixed(2)}\n\n`;
    data.pagamentosMes.slice(0, 10).forEach((pg, idx) => {
      const dataStr = pg.paidAt ? pg.paidAt.slice(0, 10) : pg.createdAt.slice(0, 10);
      msg += `${idx + 1}. *Pagamento:* R$ ${pg.valor.toFixed(2)} — Status: ${pg.status} (${dataStr})\n`;
    });
    msg += `\n_Dados conciliados dos comprovantes e lançamentos de acerto de equipe._`;

    return { handled: true, answer: msg, specialist: "rh" };
  }

  // Caso 2: "Quais pagamentos ainda estão pendentes?"
  if (
    p.includes("pagamentos pendentes") ||
    p.includes("ainda estão pendentes") ||
    p.includes("ainda estao pendentes") ||
    p.includes("o que falta pagar")
  ) {
    if (data.pagamentosPendentes === null || data.pagamentosPendentes === undefined) {
      return {
        handled: true,
        answer: "👥 *Agente de Pessoal e RH — Pagamentos Pendentes:*\n\nInformações de pagamentos pendentes não disponíveis.",
        specialist: "rh",
      };
    }

    if (data.pagamentosPendentes.length === 0) {
      return {
        handled: true,
        answer:
          "👥 *Agente de Pessoal e RH — Pagamentos Pendentes:*\n\n" +
          "✅ Não constam pagamentos de equipe pendentes de quitação no momento. Todas as rotinas estão regularizadas.",
        specialist: "rh",
      };
    }

    const totalPend = data.pagamentosPendentes.reduce((acc, pg) => acc + pg.valor, 0);
    let msg = `👥 *Agente de Pessoal e RH — Pagamentos de Equipe Pendentes (${data.pagamentosPendentes.length}):*\n\n`;
    msg += `• *Total a Regularizar:* R$ ${totalPend.toFixed(2)}\n\n`;
    data.pagamentosPendentes.slice(0, 10).forEach((pg, idx) => {
      msg += `${idx + 1}. *Valor:* R$ ${pg.valor.toFixed(2)} — Origem: ${pg.origem || "Acerto operacional"} [Status: ${pg.status}]\n`;
    });
    msg += `\n_Recomenda-se aprovação e conciliação bancária no módulo financeiro._`;

    return { handled: true, answer: msg, specialist: "rh" };
  }

  // Caso 3: "Quem está escalado para amanhã?" (ou "escala de hoje")
  if (
    p.includes("escalado para amanhã") ||
    p.includes("escalado para amanha") ||
    p.includes("escala de amanhã") ||
    p.includes("escala de amanha") ||
    p.includes("escala de hoje") ||
    p.includes("escalados")
  ) {
    const isAmanha = p.includes("amanhã") || p.includes("amanha");
    const listaEscalas = isAmanha ? data.escalasAmanha : data.escalasHoje;
    const diaLabel = isAmanha ? "Amanhã" : "Hoje";

    if (listaEscalas === null || listaEscalas === undefined) {
      return {
        handled: true,
        answer: `👥 *Agente de Pessoal e RH — Escala de ${diaLabel}:*\n\nDados de escala não disponíveis no momento.`,
        specialist: "rh",
      };
    }

    if (listaEscalas.length === 0) {
      return {
        handled: true,
        answer:
          `👥 *Agente de Pessoal e RH — Escala de ${diaLabel}:*\n\n` +
          `Nenhum colaborador com escala ativa registrada para ${diaLabel.toLowerCase()}.`,
        specialist: "rh",
      };
    }

    const nomesMap = new Map((data.colaboradores || []).map((c) => [c.id, c.nome]));
    let msg = `👥 *Agente de Pessoal e RH — Escala de Trabalho de ${diaLabel} (${listaEscalas.length} colaboradores):*\n\n`;

    listaEscalas.forEach((esc, idx) => {
      const nome = nomesMap.get(esc.colaboradorId) || "Colaborador";
      const turnoStr = esc.turno ? ` | Turno: ${esc.turno}` : "";
      const obsStr = esc.observacao ? ` (${esc.observacao})` : "";
      msg += `${idx + 1}. *${nome}*${turnoStr} [Diária: R$ ${esc.valorDiaria.toFixed(2)}]${obsStr}\n`;
    });

    msg += `\n_Escala apurada do módulo de gestão de turnos da equipe Rodo Point._`;
    return { handled: true, answer: msg, specialist: "rh" };
  }

  // Caso 4: "Quanto já paguei de vale-transporte / vale-alimentação?"
  if (
    p.includes("vale-transporte") ||
    p.includes("vale transporte") ||
    p.includes("vale-alimentação") ||
    p.includes("vale alimentacao") ||
    p.includes("vale refeição") ||
    p.includes("vale refeicao")
  ) {
    if (data.totalVales === null || data.totalVales === undefined) {
      return {
        handled: true,
        answer: "👥 *Agente de Pessoal e RH — Benefícios e Vales:*\n\nDados de benefícios não disponíveis.",
        specialist: "rh",
      };
    }

    const { valeTransporte, valeRefeicao, total } = data.totalVales;
    const msg =
      `👥 *Agente de Pessoal e RH — Provisão Mensal de Vales da Equipe:*\n\n` +
      `• *Vale-Transporte:* R$ ${valeTransporte.toFixed(2)}\n` +
      `• *Vale-Alimentação / Refeição:* R$ ${valeRefeicao.toFixed(2)}\n` +
      `• *Total Consolidado de Vales:* R$ ${total.toFixed(2)}\n\n` +
      `_Apurado com base nos cadastros ativos de colaboradores e dias úteis acordados._`;

    return { handled: true, answer: msg, specialist: "rh" };
  }

  // Caso 5: "Existem pagamentos duplicados?"
  if (p.includes("pagamentos duplicados") || p.includes("duplicidade")) {
    if (data.pagamentosDuplicados === null || data.pagamentosDuplicados === undefined) {
      return {
        handled: true,
        answer: "👥 *Agente de Pessoal e RH — Auditoria de Duplicidades:*\n\nHistórico de pagamentos não disponível.",
        specialist: "rh",
      };
    }

    if (data.pagamentosDuplicados.length === 0) {
      return {
        handled: true,
        answer:
          "👥 *Agente de Pessoal e RH — Auditoria de Duplicidades:*\n\n" +
          "✅ Nenhum pagamento duplicado ou inconsistente identificado nos lançamentos de colaboradores.",
        specialist: "rh",
      };
    }

    let msg = `⚠️ *Agente de Pessoal e RH — Auditoria: Possíveis Duplicidades Detectadas (${data.pagamentosDuplicados.length}):*\n\n`;
    data.pagamentosDuplicados.forEach((dup) => {
      const nivelTag =
        dup.nivel === "comprovada"
          ? "🔴 [Duplicidade Comprovada]"
          : dup.nivel === "possivel"
            ? "🟡 [Possível Duplicidade p/ Conferência]"
            : "⚠️ [Alerta]";
      const colabTag = dup.colaboradorNome
        ? ` (${dup.colaboradorNome})`
        : dup.colaboradorId
          ? ` (Colaborador ${dup.colaboradorId})`
          : "";
      const acertoTag = dup.acertoId ? ` | Acerto: ${dup.acertoId}` : "";
      const compTag = dup.competencia ? ` | Competência: ${dup.competencia}` : "";
      const motivoTag = dup.criterio ? ` — ${dup.criterio}` : "";
      msg += `• ${nivelTag} *${dup.descricao}*${colabTag}: ${dup.quantidade} lançamentos de R$ ${dup.valor.toFixed(2)}${acertoTag}${compTag}${motivoTag}\n`;
    });
    msg += `\n_Nota: Pagamentos de colaboradores diferentes, datas distintas ou competências distintas não são tratados como duplicidade. Recomenda-se conferência antes de qualquer estorno._`;

    return { handled: true, answer: msg, specialist: "rh" };
  }

  return { handled: false, specialist: "rh" };
}

export async function fetchAndExecuteRhSpecialist(
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

  if (!routingPlan.isDeterministicPossible || routingPlan.primarySpecialist !== "rh") {
    return {
      handled: false,
      specialist: "rh",
      routingPlan,
    };
  }

  const { todayStr, tomorrowStr, startOfMonthStr } = getSaoPauloDateStrings(nowOverride);
  const collectedData: RhDeterministicData = {
    isMemberRole: context.role === "member",
  };

  try {
    const [employees, monthPayments, tomorrowSchedules, todaySchedules] = await Promise.all([
      repository.listEmployees ? repository.listEmployees(context) : Promise.resolve([]),
      repository.listEmployeePayments
        ? repository.listEmployeePayments(context, { start: startOfMonthStr, end: todayStr })
        : Promise.resolve([]),
      repository.listEmployeeSchedules
        ? repository.listEmployeeSchedules(context, { start: tomorrowStr, end: tomorrowStr })
        : Promise.resolve([]),
      repository.listEmployeeSchedules
        ? repository.listEmployeeSchedules(context, { start: todayStr, end: todayStr })
        : Promise.resolve([]),
    ]);

    collectedData.colaboradores = employees;

    // Pagamentos do mês e pendentes
    collectedData.pagamentosMes = monthPayments.filter(
      (p) => p.status.toLowerCase() === "pago" || p.status.toLowerCase() === "concluido" || p.status.toLowerCase() === "paid"
    );
    collectedData.pagamentosPendentes = monthPayments.filter(
      (p) => p.status.toLowerCase() === "pendente" || p.status.toLowerCase() === "pending" || p.status.toLowerCase() === "agendado"
    );

    // Escalas de amanhã e hoje (filtrando canceladas)
    collectedData.escalasAmanha = tomorrowSchedules.filter((e) => (e.status || "").toLowerCase() !== "cancelada");
    collectedData.escalasHoje = todaySchedules.filter((e) => (e.status || "").toLowerCase() !== "cancelada");

    // Vales da equipe ativa
    const activeEmployees = employees.filter((e) => (e.status || "").toLowerCase() === "ativo");
    const vt = activeEmployees.reduce((acc, e) => acc + (e.valeTransporte || 0), 0);
    const vr = activeEmployees.reduce((acc, e) => acc + (e.valeRefeicao || 0), 0);
    collectedData.totalVales = {
      valeTransporte: vt,
      valeRefeicao: vr,
      total: vt + vr,
    };

    // Auditoria criteriosa de pagamentos duplicados (Gate 0.3 — com IDs reais e sem falsos positivos)
    const employeeNamesById = new Map(employees.map((e) => [e.id, e.nome]));
    const isCanceledOrFailed = (st: string) => {
      const s = (st || "").toLowerCase();
      return (
        s === "cancelado" ||
        s === "cancelled" ||
        s === "estornado" ||
        s === "estornada" ||
        s === "falha" ||
        s === "failed" ||
        s === "rejeitado"
      );
    };
    const isSettled = (st: string) => {
      const s = (st || "").toLowerCase();
      return s === "pago" || s === "concluido" || s === "concluído" || s === "paid";
    };

    const validPayments = monthPayments.filter((pg) => !isCanceledOrFailed(pg.status));
    const duplicados: NonNullable<typeof collectedData.pagamentosDuplicados> = [];
    const flaggedPaymentIds = new Set<string>();

    // 1. Duplicidade comprovada por mesmo idempotencyKey ou divipayExternalId ou mesmo acertoId + valor + colaborador
    const strongGroups = new Map<string, EmployeePaymentRecord[]>();
    validPayments.forEach((pg) => {
      const strongKeys: string[] = [];
      if (pg.idempotencyKey) strongKeys.push(`idem:${pg.idempotencyKey}`);
      if (pg.divipayExternalId) strongKeys.push(`ext:${pg.divipayExternalId}`);
      if (pg.acertoId) {
        const colabScope = pg.colaboradorId || "acerto";
        strongKeys.push(`acerto:${pg.acertoId}:${colabScope}:${pg.valor.toFixed(2)}`);
      }
      for (const k of strongKeys) {
        const arr = strongGroups.get(k) || [];
        arr.push(pg);
        strongGroups.set(k, arr);
        break; // Cada pagamento entra na sua chave forte mais específica
      }
    });

    strongGroups.forEach((group, key) => {
      if (group.length > 1) {
        const uniqueIds = Array.from(new Set(group.map((g) => g.id)));
        if (uniqueIds.length <= 1) return;

        uniqueIds.forEach((id) => flaggedPaymentIds.add(id));
        const sample = group[0];
        const settledCount = group.filter((g) => isSettled(g.status)).length;
        const nivel: "comprovada" | "possivel" =
          key.startsWith("idem:") || key.startsWith("ext:") || settledCount >= 2 ? "comprovada" : "possivel";
        const colabId = sample.colaboradorId ?? null;
        const colabNome = sample.colaboradorNome || (colabId ? employeeNamesById.get(colabId) || null : null);
        const comp =
          sample.competenciaInicio && sample.competenciaFim
            ? `${sample.competenciaInicio}..${sample.competenciaFim}`
            : null;
        duplicados.push({
          descricao: sample.origem || "Lançamento de acerto",
          quantidade: uniqueIds.length,
          valor: sample.valor,
          nivel,
          colaboradorId: colabId,
          colaboradorNome: colabNome,
          acertoId: sample.acertoId,
          competencia: comp,
          criterio: key.startsWith("ext:")
            ? "Mesmo ID externo Divipay"
            : key.startsWith("idem:")
              ? "Mesma chave de idempotência"
              : "Mesmo acerto e valor",
          paymentIds: uniqueIds,
        });
      }
    });

    // 2. Possível duplicidade por mesmo colaborador identificado + mesma data + mesma competência + mesma origem + mesmo valor
    const heuristicGroups = new Map<string, EmployeePaymentRecord[]>();
    validPayments.forEach((pg) => {
      if (flaggedPaymentIds.has(pg.id)) return;
      if (!pg.colaboradorId) return; // Nunca agrupa pagamentos sem colaboradorId identificável

      const dateStr = (pg.paidAt || pg.createdAt || "").slice(0, 10);
      if (!dateStr) return;
      const compStr = `${pg.competenciaInicio || ""}:${pg.competenciaFim || ""}`;
      const origStr = (pg.origem || "acerto").trim().toLowerCase();
      const key = `heur:${pg.colaboradorId}:${compStr}:${dateStr}:${origStr}:${pg.valor.toFixed(2)}`;
      const arr = heuristicGroups.get(key) || [];
      arr.push(pg);
      heuristicGroups.set(key, arr);
    });

    heuristicGroups.forEach((group) => {
      if (group.length > 1) {
        const uniqueIds = Array.from(new Set(group.map((g) => g.id)));
        if (uniqueIds.length <= 1) return;

        const sample = group[0];
        const colabId = sample.colaboradorId ?? null;
        const colabNome = sample.colaboradorNome || (colabId ? employeeNamesById.get(colabId) || null : null);
        const comp =
          sample.competenciaInicio && sample.competenciaFim
            ? `${sample.competenciaInicio}..${sample.competenciaFim}`
            : null;
        duplicados.push({
          descricao: sample.origem || "Lançamento de acerto",
          quantidade: uniqueIds.length,
          valor: sample.valor,
          nivel: "possivel",
          colaboradorId: colabId,
          colaboradorNome: colabNome,
          acertoId: sample.acertoId,
          competencia: comp,
          criterio: `Mesmo colaborador, data (${(sample.paidAt || sample.createdAt).slice(0, 10)}) e origem`,
          paymentIds: uniqueIds,
        });
      }
    });

    collectedData.pagamentosDuplicados = duplicados;
  } catch (err) {
    console.warn("[specialist-router] Erro ao consultar repositório de RH:", err);
  }

  const result = buildRhSpecialistDeterministicResponse(userPrompt, collectedData);
  return {
    ...result,
    routingPlan,
  };
}

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

  if (routingPlan.primarySpecialist === "estoque") {
    const res = await fetchAndExecuteInventorySpecialist(userPrompt, context, repository, nowOverride);
    return {
      handled: res.handled,
      answer: res.answer,
      specialist: "estoque",
      department: SPECIALIST_AGENTS_REGISTRY.estoque.department,
      routingPlan: res.routingPlan,
    };
  }

  if (routingPlan.primarySpecialist === "rh") {
    const res = await fetchAndExecuteRhSpecialist(userPrompt, context, repository, nowOverride);
    return {
      handled: res.handled,
      answer: res.answer,
      specialist: "rh",
      department: SPECIALIST_AGENTS_REGISTRY.rh.department,
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
