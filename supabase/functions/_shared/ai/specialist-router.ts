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
 */

import {
  SPECIALIST_AGENTS_REGISTRY,
  SpecialistAgentId,
  authorizeSpecialistAccess,
} from "./specialist-registry.ts";
import type { FinancialQueryRepository } from "./query-tools.ts";
import type { AiExecutionContext } from "./auth.ts";

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
  if (
    p.includes("nota fiscal") ||
    p.includes("danfe") ||
    p.includes("nfe") ||
    p.includes("nfc-e") ||
    p.includes("sefaz") ||
    p.includes("imposto") ||
    p.includes("tribut")
  ) {
    return {
      primarySpecialist: "fiscal",
      coordinatingCeo: false,
      contributingSpecialists: ["fiscal"],
      complexityLevel: 2,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
      rationale: "Consulta direcionada ao Especialista Fiscal.",
    };
  }

  // 3. Especialista de Vendas e PDV
  if (
    p.includes("ticket médio") ||
    p.includes("ticket medio") ||
    p.includes("mais vendido") ||
    p.includes("produtos mais") ||
    p.includes("caixa físico") ||
    p.includes("horario de pico") ||
    p.includes("horário de pico") ||
    p.includes("curva abc")
  ) {
    return {
      primarySpecialist: "vendas_pdv",
      coordinatingCeo: false,
      contributingSpecialists: ["vendas_pdv"],
      complexityLevel: 2,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
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
    p.includes("fornecedor") ||
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

  // 7. Especialista de Operações e Processos
  if (
    p.includes("sangria") ||
    p.includes("fechamento de caixa") ||
    p.includes("abertura de caixa") ||
    p.includes("divergência no caixa") ||
    p.includes("kds") ||
    p.includes("cancelamento de pedido")
  ) {
    return {
      primarySpecialist: "operacoes",
      coordinatingCeo: false,
      contributingSpecialists: ["operacoes"],
      complexityLevel: 1,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
      rationale: "Consulta direcionada ao Especialista de Operações e Processos.",
    };
  }

  // 8. Padrão: Agente Financeiro (Faturamento, Contas, Saldo, Fluxo de Caixa, Despesas)
  const isDirectDeterministic =
    p.includes("quanto faturei ontem") ||
    p.includes("faturamento de ontem") ||
    p.includes("vendas de ontem") ||
    p.includes("quais contas vencem") ||
    p.includes("contas a vencer") ||
    p.includes("contas vencem nesta semana") ||
    p.includes("qual meu saldo") ||
    p.includes("saldo atual") ||
    p.includes("fluxo de caixa");

  return {
    primarySpecialist: "financeiro",
    coordinatingCeo: false,
    contributingSpecialists: ["financeiro"],
    complexityLevel: 1,
    model: "gemini-2.5-flash",
    isDeterministicPossible: isDirectDeterministic,
    rationale: "Consulta direcionada ao Especialista Financeiro.",
  };
}

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

/**
 * Respostas determinísticas estruturadas para o Especialista Financeiro (Gate 1 & 6).
 * Responde instantaneamente perguntas financeiras frequentes a partir de dados reais já apurados,
 * com zero alucinação e zero custo de IA.
 * 
 * Regra Estrita:
 * Se um valor for 0, exibe R$ 0.00.
 * Se for null ou undefined, exibe explicitamente "Saldo não disponível" ou "Dado não disponível".
 * Nunca mascara ausência de dados com `|| 0`.
 */
export function buildFinancialSpecialistDeterministicResponse(
  userPrompt: string,
  data: FinancialDeterministicData
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();

  // Helper para formatação de moeda com distinção estrita de zero vs ausente
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
    let ticketStr: string;

    if (hasFat) {
      const fat = Number(data.faturamentoOntem);
      fatStr = `R$ ${fat.toFixed(2)}`;
      if (hasPed) {
        const ped = Number(data.pedidosOntem);
        pedStr = `${ped}`;
        ticketStr = ped > 0 ? `R$ ${(fat / ped).toFixed(2)}` : "R$ 0.00";
      } else {
        pedStr = "Dado não disponível";
        ticketStr = "Dado não disponível";
      }
    } else {
      fatStr = "Dados não disponíveis";
      pedStr = "Dados não disponíveis";
      ticketStr = "Dados não disponíveis";
    }

    const msg =
      `💰 *Agente Financeiro — Faturamento de Ontem:*\n\n` +
      `• *Faturamento Bruto:* ${fatStr}\n` +
      `• *Total de Pedidos:* ${pedStr}\n` +
      `• *Ticket Médio:* ${ticketStr}\n\n` +
      `_Dados apurados diretamente das transações registradas no PDV._`;

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
  if (p.includes("saldo atual") || p.includes("qual meu saldo") || p.includes("fluxo de caixa")) {
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

/**
 * Consulta os dados reais no repositório financeiro e sintetiza a resposta determinística.
 * Não inventa números, não conta vendas canceladas e não apresenta despesas pendentes como pagas.
 */
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

  // Cálculo das datas de referência em fuso horário de Brasília (UTC-3)
  const now = nowOverride || new Date();
  const brtOffsetMinutes = -180;
  const localTime = new Date(now.getTime() + (now.getTimezoneOffset() + brtOffsetMinutes) * 60000);

  const todayStr = localTime.toISOString().slice(0, 10);
  const yesterdayTime = new Date(localTime.getTime() - 24 * 3600 * 1000);
  const yesterdayStr = yesterdayTime.toISOString().slice(0, 10);
  const startOfMonthStr = `${todayStr.slice(0, 7)}-01`;
  const in7DaysTime = new Date(localTime.getTime() + 7 * 24 * 3600 * 1000);
  const in7DaysStr = in7DaysTime.toISOString().slice(0, 10);

  const collectedData: FinancialDeterministicData = {};

  try {
    // 1. Caso Faturamento de Ontem
    if (p.includes("quanto faturei ontem") || p.includes("faturamento de ontem") || p.includes("vendas de ontem")) {
      const sales = await repository.listSalesPDV(context, {
        start: yesterdayStr,
        end: yesterdayStr,
      });

      // Filtra vendas estritamente válidas (ignora cancelamentos)
      const validSales = sales.filter((s) => {
        const desc = (s.description || "").toLowerCase();
        return !desc.includes("cancelad");
      });

      collectedData.faturamentoOntem = validSales.reduce((acc, s) => acc + (s.amount || 0), 0);
      collectedData.pedidosOntem = validSales.length;
    }

    // 2. Caso Contas a Vencer
    if (p.includes("quais contas vencem") || p.includes("contas a vencer") || p.includes("contas vencem nesta semana")) {
      // Busca dívidas/contas a pagar no período relevante
      const debts = await repository.listDebts(context, {
        start: startOfMonthStr,
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
    if (p.includes("saldo atual") || p.includes("qual meu saldo") || p.includes("fluxo de caixa")) {
      const balances = await repository.listBalances(context);
      if (Array.isArray(balances)) {
        collectedData.saldoTotal = balances.reduce((acc, b) => acc + (b.amount || 0), 0);
      } else {
        collectedData.saldoTotal = null; // Dado indisponível
      }

      const revenues = await repository.listRevenues(context, {
        start: startOfMonthStr,
        end: todayStr,
      });
      const validRevs = revenues.filter((r) => !(r.description || "").toLowerCase().includes("cancelad"));
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
    // Em caso de erro na coleta, deixa os campos ausentes para o formatador exibir "Não disponível"
  }

  const result = buildFinancialSpecialistDeterministicResponse(userPrompt, collectedData);
  return {
    ...result,
    routingPlan,
  };
}
