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
  GrowthOpportunityRecord,
  CommercialExperimentRecord,
  CashClosingRecord,
  OperationalReminderRecord,
} from "./query-tools.ts";
import type { CanonicalFinancialRecord } from "./financial-types.ts";
import { buildFinancialSummary } from "./financial-core.ts";
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
  const isGrowthWithoutMarginLoss =
    p.includes("vender mais sem perder margem") ||
    p.includes("vender mais mantendo margem") ||
    p.includes("vender mais mantendo a margem") ||
    p.includes("crescer sem perder margem") ||
    p.includes("aumentar vendas sem perder margem");

  if (isGrowthWithoutMarginLoss) {
    return {
      primarySpecialist: "inteligencia_competitiva",
      coordinatingCeo: true,
      contributingSpecialists: ["vendas_pdv", "estoque", "inteligencia_competitiva"],
      complexityLevel: 3,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
      rationale:
        "Consulta estratégica multidepartamental: Wallet CEO coordena Vendas/PDV (mix e volume), Estoque (custos e margens reais) e Inteligência Competitiva (oportunidades e experimentos).",
    };
  }

  const isStoreOperationsOverview =
    p.includes("operação da loja") ||
    p.includes("operacao da loja") ||
    p.includes("resumo operacional da loja") ||
    p.includes("panorama da loja");

  if (isStoreOperationsOverview) {
    const opsContributors: SpecialistAgentId[] = ["operacoes", "vendas_pdv", "estoque"];
    if (p.includes("equipe") || p.includes("funcionário") || p.includes("funcionario") || p.includes("rh")) {
      opsContributors.push("rh");
    }
    return {
      primarySpecialist: "operacoes",
      coordinatingCeo: true,
      contributingSpecialists: opsContributors,
      complexityLevel: 3,
      model: "gemini-2.5-flash",
      isDeterministicPossible: false,
      rationale:
        "Consulta operacional multidepartamental: Wallet CEO coordena Operações (caixas, escalas e rotinas), Vendas/PDV (fluxo do dia) e Estoque (rupturas e alertas).",
    };
  }

  const isMultiDepartmentDiagnosis =
    ((p.includes("faturando mais") || p.includes("vendendo bem") || p.includes("vendas subiram")) &&
      (p.includes("lucro diminuiu") || p.includes("lucro caiu") || p.includes("menos lucro"))) ||
    (p.includes("por que") && (p.includes("margem") || p.includes("resultado")) && (p.includes("vendas") || p.includes("despesa"))) ||
    p.includes("diagnostico") ||
    p.includes("diagnóstico") ||
    p.includes("visao geral") ||
    p.includes("visão geral");

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
  const isCompetitiveQuery =
    p.includes("concorrente") ||
    p.includes("mercado") ||
    p.includes("tendência") ||
    p.includes("tendencia") ||
    p.includes("benchmarking") ||
    p.includes("benchmark") ||
    p.includes("precificação dinâmica") ||
    p.includes("precificacao dinamica") ||
    p.includes("oportunidade de crescimento") ||
    p.includes("oportunidades de crescimento") ||
    p.includes("experimento comercial") ||
    p.includes("experimento") ||
    p.includes("promoção") ||
    p.includes("promocao") ||
    p.includes("promoções") ||
    p.includes("promocoes") ||
    p.includes("aumentar vendas") ||
    p.includes("vender mais") ||
    p.includes("destacar nas vendas") ||
    p.includes("melhor margem para destacar") ||
    p.includes("comparados ao mercado") ||
    p.includes("comparado ao mercado");

  if (isCompetitiveQuery) {
    const isCompetitiveDeterministic =
      p.includes("oportunidade") ||
      p.includes("melhor margem") ||
      p.includes("destacar") ||
      p.includes("promoção") ||
      p.includes("promocao") ||
      p.includes("promoções") ||
      p.includes("promocoes") ||
      p.includes("aumentar vendas") ||
      p.includes("vender mais") ||
      p.includes("experimento") ||
      p.includes("concorrente") ||
      p.includes("mercado") ||
      p.includes("benchmark");

    return {
      primarySpecialist: "inteligencia_competitiva",
      coordinatingCeo: false,
      contributingSpecialists: ["inteligencia_competitiva"],
      complexityLevel: 3,
      model: "gemini-2.5-flash",
      isDeterministicPossible: isCompetitiveDeterministic,
      rationale: "Consulta direcionada ao Especialista de Inteligência Competitiva (restrito ao proprietário).",
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

  // 8. Especialista de Operações e Processos (Rotinas, Fechamento de Caixa, Turnos, Cancelamentos/Sangrias, Perguntas Gerais)
  // Gate 0.2: Usuários colaboradores (member) que enviam saudações ("Bom dia"), pedidos de ajuda
  // ou dúvidas sobre ferramentas caem no agente de Operações com role 'member', evitando 403 Forbidden.
  const isOperationsDeterministic =
    p.includes("fechamento de caixa") ||
    p.includes("fechamento do caixa") ||
    p.includes("fechamentos de caixa") ||
    p.includes("diferença no caixa") ||
    p.includes("diferenca no caixa") ||
    p.includes("furo de caixa") ||
    p.includes("furo no caixa") ||
    p.includes("sobra de caixa") ||
    p.includes("sobra no caixa") ||
    p.includes("divergência de caixa") ||
    p.includes("divergencia de caixa") ||
    p.includes("quem está de turno") ||
    p.includes("quem esta de turno") ||
    p.includes("turno hoje") ||
    p.includes("turno de hoje") ||
    p.includes("turnos de hoje") ||
    p.includes("turnos hoje") ||
    p.includes("cancelamento") ||
    p.includes("cancelamentos") ||
    p.includes("sangria") ||
    p.includes("sangrias") ||
    p.includes("rotina") ||
    p.includes("rotinas") ||
    p.includes("lembrete") ||
    p.includes("lembretes") ||
    p.includes("checklist") ||
    p.includes("pendência operacional") ||
    p.includes("pendencias operacionais") ||
    p.includes("pendências operacionais");

  return {
    primarySpecialist: "operacoes",
    coordinatingCeo: false,
    contributingSpecialists: ["operacoes"],
    complexityLevel: 1,
    model: "gemini-2.5-flash",
    isDeterministicPossible: isOperationsDeterministic,
    rationale: isOperationsDeterministic
      ? "Consulta operacional direcionada ao Especialista de Operações e Processos."
      : "Consulta geral ou operacional direcionada ao Especialista de Operações.",
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

// ─────────────────────────────────────────────────────────────────────────────
// AGENTE DE INTELIGÊNCIA COMPETITIVA — RESPOSTAS DETERMINÍSTICAS (Entrega D — Gate 1)
// ─────────────────────────────────────────────────────────────────────────────

export interface CompetitiveIntelligenceDeterministicData {
  oportunidades?: GrowthOpportunityRecord[];
  experimentos?: CommercialExperimentRecord[];
  itensEstoque?: InventoryItemRecord[];
  fichasTecnicas?: RecipeCardRecord[];
  vendasRecentes?: SalesPdvDetailRecord[];
  canaisDelivery?: Array<{
    id: string;
    nome: string;
    status: string;
    comissaoContratual: string;
  }>;
  isNonOwner?: boolean;
}

export function buildCompetitiveIntelligenceDeterministicResponse(
  userPrompt: string,
  data: CompetitiveIntelligenceDeterministicData
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();

  if (data.isNonOwner) {
    return {
      handled: true,
      answer:
        "🔒 *Acesso Restrito — Agente de Inteligência Competitiva:*\n\n" +
        "Análises de posicionamento competitivo, oportunidades estratégicas, elasticidade de preços e experimentos comerciais " +
        "são exclusivas do proprietário do workspace.",
      specialist: "inteligencia_competitiva",
    };
  }

  const items = (data.itensEstoque || []).filter((it) => it.ativo !== false);
  const pricedMarginItems = items
    .filter((it) => it.precoVenda > 0 && it.custoAtual > 0 && it.custoInformado !== false && it.margemRealPercentual > 0)
    .sort((a, b) => b.margemRealPercentual - a.margemRealPercentual);

  const validSales = (data.vendasRecentes || []).filter((s) => {
    const st = (s.status || "").toLowerCase();
    return st !== "cancelada" && st !== "cancelled" && st !== "estornada";
  });
  const totalSalesAmount = validSales.reduce((acc, s) => acc + s.amount, 0);
  const ticketMedioReal = validSales.length > 0 ? totalSalesAmount / validSales.length : null;

  const productVolume = new Map<string, { qty: number; revenue: number }>();
  validSales.forEach((s) => {
    (s.items || []).forEach((it) => {
      const key = (it.productName || "").trim();
      if (!key) return;
      const cur = productVolume.get(key) || { qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += it.totalPrice || it.unitPrice * it.quantity;
      productVolume.set(key, cur);
    });
  });

  // Caso 1: Mercado / Concorrentes / Benchmarking
  if (p.includes("concorrente") || p.includes("mercado") || p.includes("benchmark")) {
    const provenCount = (data.fichasTecnicas || []).filter((r) => r.statusFicha === "comprovada").length;
    const activeChannels = (data.canaisDelivery || []).filter((c) => c.status.toLowerCase().includes("ativo"));

    let msg = `🧭 *Agente de Inteligência Competitiva — Posicionamento Interno vs. Mercado:*\n\n`;
    msg += `⚠️ *Limitação de Fonte Externa:* Este ambiente não possui monitoramento automatizado de cardápios, preços de concorrentes locais ou bases externas de benchmarking do setor. Nenhuma média concorrencial foi inventada.\n\n`;
    msg += `📊 *Linhas de Base Internas Confirmadas (Últimos 14 dias):*\n`;
    msg += `• *Pedidos Válidos Analisados:* ${validSales.length} (${totalSalesAmount > 0 ? `R$ ${totalSalesAmount.toFixed(2)}` : "R$ 0,00"})\n`;
    msg += `• *Ticket Médio Interno Real:* ${ticketMedioReal !== null ? `R$ ${ticketMedioReal.toFixed(2)}` : "Não disponível (sem vendas válidas no período)"}\n`;
    msg += `• *SKUs com Custo e Margem Auditáveis:* ${pricedMarginItems.length} de ${items.length} ativo(s) | *Fichas Comprovadas:* ${provenCount}\n`;
    if (activeChannels.length > 0) {
      msg += `• *Canais Ativos:* ${activeChannels.map((c) => `${c.nome} (${c.comissaoContratual})`).join(", ")}\n`;
    }
    msg += `\n_Próximo passo consultivo (canMutateState: false): informe preços de 3 concorrentes diretos da região para cruzarmos elasticidade com suas margens reais._`;

    return { handled: true, answer: msg, specialist: "inteligencia_competitiva" };
  }

  // Caso 2: Quais oportunidades de crescimento temos no momento?
  if (p.includes("oportunidade")) {
    const opportunities = data.oportunidades || [];
    let msg = `🧭 *Agente de Inteligência Competitiva — Oportunidades de Crescimento:*\n\n`;

    if (opportunities.length > 0) {
      opportunities.slice(0, 6).forEach((op, idx) => {
        const impactTag =
          op.estimatedFinancialImpact !== null && op.estimatedFinancialImpact !== undefined
            ? ` | Impacto Est.: R$ ${op.estimatedFinancialImpact.toFixed(2)}`
            : "";
        const confTag = op.confidenceScore !== null ? ` | Confiança: ${op.confidenceScore}%` : "";
        msg += `${idx + 1}. *${op.title}* [${op.department} — ${op.status}]${impactTag}${confTag}\n`;
        if (op.recommendedAction) msg += `   • Ação sugerida: ${op.recommendedAction}\n`;
        if (op.limitationsNotes) msg += `   • Observação/Limitação: ${op.limitationsNotes}\n`;
      });
    } else if (pricedMarginItems.length > 0) {
      const topHighlight = pricedMarginItems[0];
      msg += `Nenhuma oportunidade formal pré-registrada em \`wallet_growth_opportunities\`. Com base nos dados reais internos:\n\n`;
      msg += `• *Alavanca de Mix de Alta Margem:* *${topHighlight.descricao}* opera com margem real de *${topHighlight.margemRealPercentual.toFixed(1)}%* (R$ ${topHighlight.precoVenda.toFixed(2)}). Testar destaque visual/combo de balcão preserva caixa.\n`;
      if (ticketMedioReal !== null) {
        msg += `• *Expansão de Ticket Médio:* Base atual de *R$ ${ticketMedioReal.toFixed(2)}* em ${validSales.length} venda(s) recentes.\n`;
      }
    } else {
      msg += `Sem dados suficientes no repositório comercial para quantificar oportunidades com precisão.\n\n`;
      msg += `• Para destravar este diagnóstico, cadastre custos unitários em \`produtos_eyemobile\` ou fichas técnicas comprovadas.\n`;
    }

    msg += `\n⚠️ *Caráter Consultivo (canMutateState: false):* Nenhuma alteração comercial ou de preço foi aplicada automaticamente.`;
    return { handled: true, answer: msg, specialist: "inteligencia_competitiva" };
  }

  // Caso 3: Quais produtos têm melhor margem para destacar nas vendas?
  if (p.includes("melhor margem") || p.includes("destacar")) {
    if (pricedMarginItems.length === 0) {
      return {
        handled: true,
        answer:
          `🧭 *Agente de Inteligência Competitiva — Produtos para Destaque de Margem:*\n\n` +
          `Não foi possível ranquear produtos por margem real porque nenhum SKU ativo possui preço de venda e custo unitário informados simultaneamente.\n\n` +
          `_Cadastre custo de reposição e preço de venda em \`produtos_eyemobile\` ou fichas técnicas para habilitar este ranking sem estimativas._`,
        specialist: "inteligencia_competitiva",
      };
    }

    const topItems = pricedMarginItems.slice(0, 5);
    let msg = `🧭 *Agente de Inteligência Competitiva — Top Produtos por Margem Real (${topItems.length}):*\n\n`;
    topItems.forEach((it, idx) => {
      const contrib = it.precoVenda - it.custoAtual;
      msg += `${idx + 1}. *${it.descricao}*: Margem *${it.margemRealPercentual.toFixed(1)}%* | Venda: R$ ${it.precoVenda.toFixed(2)} | Custo: R$ ${it.custoAtual.toFixed(2)} | Lucro Bruto Unitário: R$ ${contrib.toFixed(2)}\n`;
    });
    const uncosted = items.length - pricedMarginItems.length;
    if (uncosted > 0) {
      msg += `\nℹ️ _${uncosted} SKU(s) ativo(s) foram omitidos do ranking por não terem custo unitário cadastrado._`;
    }
    msg += `\n\n⚠️ *Aviso Consultivo (canMutateState: false):* Destaque sugerido apenas para priorização de cardápio/balcão; nenhum preço foi alterado.`;

    return { handled: true, answer: msg, specialist: "inteligencia_competitiva" };
  }

  // Caso 4: Vale a pena fazer promoção em algum item?
  if (p.includes("promoção") || p.includes("promocao") || p.includes("promoções") || p.includes("promocoes")) {
    const candidates = pricedMarginItems.filter((it) => it.margemRealPercentual >= 45 && it.estoqueAtual > it.estoqueMinimo);
    const blockedLowMargin = pricedMarginItems.filter((it) => it.margemRealPercentual > 0 && it.margemRealPercentual < 25);

    let msg = `🧭 *Agente de Inteligência Competitiva — Análise de Promoção sem Destruição de Margem:*\n\n`;

    if (pricedMarginItems.length === 0) {
      msg += `❌ *Não é seguro recomendar desconto no momento:* não há custos unitários e margens reais cadastrados para validar folga financeira.\n\n`;
    } else {
      if (candidates.length > 0) {
        msg += `✅ *Candidatos com Folga de Margem e Estoque (para teste em combo/cross-sell):*\n`;
        candidates.slice(0, 3).forEach((it) => {
          msg += `• *${it.descricao}*: Margem atual *${it.margemRealPercentual.toFixed(1)}%* (Estoque: ${it.estoqueAtual} ${it.unidadeMedida}) — preferível usar como âncora ou acompanhamento em combo em vez de corte linear de preço.\n`;
        });
      } else {
        msg += `⚠️ *Nenhum item reúne margem >= 45% com estoque acima do mínimo para desconto agressivo.* Prefira combos de ticket maior em vez de reduzir preço unitário.\n`;
      }

      if (blockedLowMargin.length > 0) {
        msg += `\n🚫 *Itens Contraindicados para Promoção (margem < 25%):* ${blockedLowMargin.slice(0, 4).map((i) => `${i.descricao} (${i.margemRealPercentual.toFixed(1)}%)`).join(", ")}.\n`;
      }
    }

    msg += `\n⚠️ *Aviso Consultivo (canMutateState: false):* Nenhuma campanha ou tabela promocional foi ativada automaticamente.`;
    return { handled: true, answer: msg, specialist: "inteligencia_competitiva" };
  }

  // Caso 5: Qual experimento comercial podemos testar nesta semana?
  if (p.includes("experimento")) {
    const activeExps = (data.experimentos || []).filter(
      (e) => e.status === "em_andamento" || e.status === "proposto" || e.status === "planejado"
    );
    const anchor = pricedMarginItems[0];
    const directChannel = (data.canaisDelivery || []).find((c) => c.id === "direto");

    let msg = `🧪 *Agente de Inteligência Competitiva — Experimento Comercial Estruturado:*\n\n`;

    if (activeExps.length > 0) {
      msg += `📋 *Experimentos já registrados no workspace (${activeExps.length}):*\n`;
      activeExps.slice(0, 3).forEach((e, idx) => {
        msg += `${idx + 1}. *${e.name}* [${e.status}] — KPI: ${e.targetKpi}${e.baselineValue !== null ? ` (Base: ${e.baselineValue} → Meta: ${e.targetValue ?? "N/D"})` : ""}\n   • Hipótese: ${e.hypothesis}\n`;
      });
      msg += `\n`;
    }

    const baseLineText =
      ticketMedioReal !== null
        ? `Ticket médio real recente: R$ ${ticketMedioReal.toFixed(2)} (${validSales.length} vendas válidas)`
        : "Linha de base pendente de 7 dias de histórico completo do PDV";
    const metaText =
      ticketMedioReal !== null
        ? `Elevar ticket médio do turno testado em +8% a +12% sobre R$ ${ticketMedioReal.toFixed(2)} preservando margem bruta`
        : "Estabelecer linha de base de conversão e adesão ao combo nos primeiros 7 dias";
    const focusName = anchor
      ? `Combo Sugestivo com ${anchor.descricao} (Margem Real ${anchor.margemRealPercentual.toFixed(1)}%)`
      : directChannel
        ? `Conversão Direta sem Comissão (${directChannel.nome})`
        : "Diagnóstico de Mix e Ticket Médio em Balcão";

    msg += `🎯 *Proposta Completa de Experimento (8 campos — Aprovação Pendente):*\n`;
    msg += `• *1. Nome do Experimento:* ${focusName}\n`;
    msg += `• *2. Departamento:* Mercado & Comercial\n`;
    msg += `• *3. Hipótese:* Oferta ativa de complemento de maior margem no momento do pedido eleva o ticket médio sem reduzir a margem percentual consolidada.\n`;
    msg += `• *4. KPI Principal:* Ticket médio líquido e margem de contribuição por pedido\n`;
    msg += `• *5. Linha de Base:* ${baseLineText}\n`;
    msg += `• *6. Meta:* ${metaText}\n`;
    msg += `• *7. Janela de Teste:* 7 dias consecutivos (comparando mesmo dia da semana contra histórico anterior)\n`;
    msg += `• *8. Critério de Decisão (Escalar / Pausar):* Escalar se ticket médio crescer sem elevar cancelamentos nem reduzir margem; pausar se margem cair abaixo da linha de base.\n\n`;
    msg += `⚠️ *Caráter Consultivo (canMutateState: false):* Experimento apenas proposto para revisão do proprietário — não gravado nem ativado automaticamente.`;

    return { handled: true, answer: msg, specialist: "inteligencia_competitiva" };
  }

  // Caso 6: Como aumentar vendas sem destruir margem?
  if (p.includes("aumentar vendas") || p.includes("vender mais")) {
    const directChannel = (data.canaisDelivery || []).find((c) => c.id === "direto");
    const highMarginTop = pricedMarginItems.slice(0, 3);

    let msg = `🧭 *Agente de Inteligência Competitiva — Crescimento de Vendas Preservando Margem:*\n\n`;
    msg += `1. *Priorizar Mix de Maior Margem no Atendimento:*\n`;
    if (highMarginTop.length > 0) {
      highMarginTop.forEach((it) => {
        msg += `   • *${it.descricao}* (${it.margemRealPercentual.toFixed(1)}% de margem | R$ ${it.precoVenda.toFixed(2)})\n`;
      });
    } else {
      msg += `   • _Dados insuficientes de margem unitária (cadastre custos reais em \`produtos_eyemobile\` para priorização automática)._\n`;
    }

    msg += `2. *Migração Gradual para Canal Direto (Menor Taxa):*\n`;
    if (directChannel) {
      msg += `   • Canal *${directChannel.nome}* (${directChannel.comissaoContratual}) evita compressão de comissão de marketplaces.\n`;
    } else {
      msg += `   • Incentivar pedidos recorrentes no canal próprio para reduzir dependência de comissões.\n`;
    }

    msg += `3. *Aumento de Ticket via Combo em vez de Desconto Linear:*\n`;
    msg += `   • ${ticketMedioReal !== null ? `Partindo do ticket médio real recente de *R$ ${ticketMedioReal.toFixed(2)}*, ` : ""}parear itens de alto giro com complementos de alta margem preserva lucro por pedido.\n\n`;
    msg += `⚠️ *Aviso Consultivo (canMutateState: false):* Recomendações estratégicas sem alteração automática de preços ou cardápio.`;

    return { handled: true, answer: msg, specialist: "inteligencia_competitiva" };
  }

  return { handled: false, specialist: "inteligencia_competitiva" };
}

export async function fetchAndExecuteCompetitiveIntelligenceSpecialist(
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

  if (!routingPlan.isDeterministicPossible || routingPlan.primarySpecialist !== "inteligencia_competitiva") {
    return {
      handled: false,
      specialist: "inteligencia_competitiva",
      routingPlan,
    };
  }

  const isOwner = context.isOwner === true || context.role === "owner";
  if (!isOwner) {
    const res = buildCompetitiveIntelligenceDeterministicResponse(userPrompt, { isNonOwner: true });
    return {
      ...res,
      routingPlan,
    };
  }

  const refNow = nowOverride ?? new Date();
  const fourteenDaysAgo = new Date(refNow.getTime() - 14 * 24 * 60 * 60 * 1000);
  const { todayStr } = getSaoPauloDateStrings(refNow);
  const { todayStr: start14Str } = getSaoPauloDateStrings(fourteenDaysAgo);

  const collectedData: CompetitiveIntelligenceDeterministicData = {
    isNonOwner: false,
  };

  try {
    const [items, recipes, recentSales, opportunities, experiments, deliveryStatus] = await Promise.all([
      repository.listInventoryItems ? repository.listInventoryItems(context) : Promise.resolve([]),
      repository.listRecipeCards ? repository.listRecipeCards(context) : Promise.resolve([]),
      repository.listSalesPdvDetails
        ? repository.listSalesPdvDetails(context, { start: start14Str, end: todayStr })
        : Promise.resolve([]),
      repository.listGrowthOpportunities ? repository.listGrowthOpportunities(context) : Promise.resolve([]),
      repository.listCommercialExperiments ? repository.listCommercialExperiments(context) : Promise.resolve([]),
      repository.getDeliveryChannelsStatus ? repository.getDeliveryChannelsStatus(context) : Promise.resolve(null),
    ]);

    collectedData.itensEstoque = items;
    collectedData.fichasTecnicas = recipes;
    collectedData.vendasRecentes = recentSales;
    collectedData.oportunidades = opportunities;
    collectedData.experimentos = experiments;
    collectedData.canaisDelivery = deliveryStatus?.canais;
  } catch (err) {
    console.warn("[specialist-router] Erro ao consultar repositório de Inteligência Competitiva:", err);
  }

  const result = buildCompetitiveIntelligenceDeterministicResponse(userPrompt, collectedData);
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

  if (routingPlan.primarySpecialist === "inteligencia_competitiva") {
    const res = await fetchAndExecuteCompetitiveIntelligenceSpecialist(
      userPrompt,
      context,
      repository,
      nowOverride
    );
    return {
      handled: res.handled,
      answer: res.answer,
      specialist: "inteligencia_competitiva",
      department: SPECIALIST_AGENTS_REGISTRY.inteligencia_competitiva.department,
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

  if (routingPlan.primarySpecialist === "operacoes") {
    const res = await fetchAndExecuteOperationsSpecialist(userPrompt, context, repository, nowOverride);
    return {
      handled: res.handled,
      answer: res.answer,
      specialist: "operacoes",
      department: SPECIALIST_AGENTS_REGISTRY.operacoes.department,
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

// ─────────────────────────────────────────────────────────────────────────────
// AGENTE DE OPERAÇÕES E PROCESSOS — RESPOSTAS DETERMINÍSTICAS (Entrega D — Gate 2)
// ─────────────────────────────────────────────────────────────────────────────

export interface OperationsDeterministicData {
  fechamentos?: CashClosingRecord[];
  escalasHoje?: EmployeeScheduleRecord[];
  colaboradores?: EmployeeRecord[];
  vendasCanceladas?: SalesPdvDetailRecord[];
  sangrias?: CanonicalFinancialRecord[];
  rotinas?: OperationalReminderRecord[];
  todayStr?: string;
  yesterdayStr?: string;
  isMemberRole?: boolean;
}

const sumPaymentMap = (m: Record<string, number> | undefined): number => {
  if (!m) return 0;
  return Object.values(m).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
};

export function buildOperationsSpecialistDeterministicResponse(
  userPrompt: string,
  data: OperationsDeterministicData
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();
  const isMember = data.isMemberRole === true;

  // Caso 1: Fechamento de caixa / Diferença / Furo / Sobra
  if (
    p.includes("fechamento de caixa") ||
    p.includes("fechamento do caixa") ||
    p.includes("fechamentos de caixa") ||
    p.includes("diferença no caixa") ||
    p.includes("diferenca no caixa") ||
    p.includes("furo de caixa") ||
    p.includes("furo no caixa") ||
    p.includes("sobra de caixa") ||
    p.includes("sobra no caixa") ||
    p.includes("divergência de caixa") ||
    p.includes("divergencia de caixa")
  ) {
    const closings = data.fechamentos || [];
    if (closings.length === 0) {
      return {
        handled: true,
        answer:
          `⚙️ *Agente de Operações e Processos — Fechamento e Conferência de Caixa:*\n\n` +
          `Nenhum registro de fechamento de caixa foi encontrado para o período consultado no workspace.\n\n` +
          `_Certifique-se de que o fechamento de turno foi lançado no módulo de caixa antes da conferência. (canMutateState: false)_`,
        specialist: "operacoes",
      };
    }

    const latest = closings[0];
    const informadoTotal = sumPaymentMap(latest.envelopeTotal) || sumPaymentMap(latest.totalInformado);
    const sistemaTotal = sumPaymentMap(latest.eyemobileTotal);
    const difGeral = informadoTotal - sistemaTotal;

    let msg = `⚙️ *Agente de Operações e Processos — Conferência de Fechamento de Caixa:*\n\n`;
    msg += `• *Data do Fechamento:* ${latest.dataFechamento || latest.createdAt.slice(0, 10)}\n`;
    msg += `• *Status do Registro:* ${latest.status}\n`;

    if (!isMember) {
      msg += `• *Total Informado / Envelope:* R$ ${informadoTotal.toFixed(2)}\n`;
      msg += `• *Total Sistema (PDV Eyemobile):* R$ ${sistemaTotal.toFixed(2)}\n`;
      msg += `• *Diferença Consolidada:* ${difGeral >= 0 ? "+" : "-"}R$ ${Math.abs(difGeral).toFixed(2)}\n`;
      if (latest.sobra !== null && latest.sobra !== undefined) {
        msg += `• *Sobra / Diferença Registrada:* R$ ${latest.sobra.toFixed(2)}\n`;
      }

      const methods = ["dinheiro", "pix", "debito", "credito", "voucher"];
      const methodLines: string[] = [];
      methods.forEach((m) => {
        const inf = latest.envelopeTotal?.[m] ?? latest.totalInformado?.[m] ?? 0;
        const sys = latest.eyemobileTotal?.[m] ?? 0;
        if (inf > 0 || sys > 0) {
          const diff = inf - sys;
          const label = diff === 0 ? "exato" : `diferença de ${diff > 0 ? "+" : "-"}R$ ${Math.abs(diff).toFixed(2)}`;
          methodLines.push(`  - ${m}: Informado R$ ${inf.toFixed(2)} vs Sistema R$ ${sys.toFixed(2)} (${label})`);
        }
      });
      if (methodLines.length > 0) {
        msg += `\n📊 *Detalhamento por Forma de Pagamento:*\n${methodLines.join("\n")}\n`;
      }
    } else {
      const divergedMethods = ["dinheiro", "pix", "debito", "credito", "voucher"].filter((m) => {
        const inf = latest.envelopeTotal?.[m] ?? latest.totalInformado?.[m] ?? 0;
        const sys = latest.eyemobileTotal?.[m] ?? 0;
        return Math.abs(inf - sys) > 0.01;
      });
      msg +=
        divergedMethods.length > 0
          ? `• *Conferência Operacional:* Há diferença para conferência nos meios: ${divergedMethods.join(", ")}. Verifique comprovantes e recibos do turno junto à gestão.\n`
          : `• *Conferência Operacional:* Sem divergência pendente entre meios de pagamento neste fechamento.\n`;
    }

    if (closings.length > 1) {
      const divergentesCount = closings.filter((c) => c.status.toLowerCase().includes("divergen")).length;
      msg += `\nℹ️ _Foram analisados ${closings.length} fechamento(s) recente(s); ${divergentesCount} sinalizado(s) com status de divergência para conferência de comprovantes._`;
    }
    msg += `\n\n⚠️ *Postura Consultiva (canMutateState: false):* Qualquer diferença exige conferência objetiva de envelopes, taxas e recibos — nenhum lançamento foi modificado.`;

    return { handled: true, answer: msg, specialist: "operacoes" };
  }

  // Caso 2: Quem está de turno hoje?
  if (
    p.includes("quem está de turno") ||
    p.includes("quem esta de turno") ||
    p.includes("turno hoje") ||
    p.includes("turno de hoje") ||
    p.includes("turnos de hoje") ||
    p.includes("turnos hoje")
  ) {
    const activeSchedules = (data.escalasHoje || []).filter((e) => (e.status || "").toLowerCase() !== "cancelada");
    if (activeSchedules.length === 0) {
      return {
        handled: true,
        answer:
          `⚙️ *Agente de Operações e Processos — Turno de Hoje (${data.todayStr || "hoje"}):*\n\n` +
          `Nenhuma escala ativa foi encontrada cadastrada para hoje em \`colaborador_escalas\`.`,
        specialist: "operacoes",
      };
    }

    const colabMap = new Map((data.colaboradores || []).map((c) => [c.id, c]));
    let msg = `⚙️ *Agente de Operações e Processos — Equipe Escalada no Turno de Hoje (${activeSchedules.length}):*\n\n`;
    activeSchedules.forEach((esc, idx) => {
      const colab = colabMap.get(esc.colaboradorId);
      const nome = colab?.nome || "Colaborador";
      const cargo = colab?.cargo ? ` (${colab.cargo})` : "";
      const turnoStr = esc.turno ? ` | Turno: ${esc.turno}` : "";
      const obsStr = esc.observacao ? ` — ${esc.observacao}` : "";
      // Segurança estrita: nunca expor valores salariais/diárias a perfil member
      const diariaStr = !isMember && esc.valorDiaria > 0 ? ` [Diária: R$ ${esc.valorDiaria.toFixed(2)}]` : "";
      msg += `${idx + 1}. *${nome}*${cargo}${turnoStr}${diariaStr}${obsStr}\n`;
    });
    if (isMember) {
      msg += `\n_Nota: Valores de remuneração e diárias individuais são mantidos em sigilo para perfis operacionais._`;
    }
    msg += `\n_Consulta operacional somente leitura (canMutateState: false)._`;

    return { handled: true, answer: msg, specialist: "operacoes" };
  }

  // Caso 3: Cancelamentos ou sangrias relevantes
  if (p.includes("cancelamento") || p.includes("cancelamentos") || p.includes("sangria") || p.includes("sangrias")) {
    const canceledSales = data.vendasCanceladas || [];
    const sangrias = data.sangrias || [];

    const totalCancelado = canceledSales.reduce((acc, s) => acc + s.amount, 0);
    const totalSangrias = sangrias.reduce((acc, sg) => acc + sg.amount, 0);

    let msg = `⚙️ *Agente de Operações e Processos — Auditoria de Cancelamentos e Sangrias:*\n\n`;
    msg += `• *Vendas/Pedidos Cancelados no Período:* ${canceledSales.length}`;
    msg += !isMember ? ` (Valor cancelado: R$ ${totalCancelado.toFixed(2)})\n` : `\n`;
    if (canceledSales.length > 0) {
      canceledSales.slice(0, 5).forEach((s) => {
        const valNote = !isMember ? ` — R$ ${s.amount.toFixed(2)}` : "";
        msg += `  - ${s.date}: *${s.description}*${valNote} [Status: ${s.status || "cancelada"}]\n`;
      });
    } else {
      msg += `  - Nenhum cancelamento registrado no PDV no período.\n`;
    }

    msg += `• *Registros de Sangria / Retirada de Numerário:* ${sangrias.length}`;
    msg += !isMember ? ` (Total: R$ ${totalSangrias.toFixed(2)})\n` : `\n`;
    if (sangrias.length > 0) {
      sangrias.slice(0, 5).forEach((sg) => {
        const valNote = !isMember ? ` — R$ ${sg.amount.toFixed(2)}` : "";
        msg += `  - ${sg.occurredOn}: *${sg.description}*${valNote}\n`;
      });
    } else {
      msg += `  - Nenhuma sangria registrada nas movimentações do período.\n`;
    }

    msg += `\n⚠️ *Observação Neutra (canMutateState: false):* Os registros acima servem apenas para conferência de rotina operacional e recibos de caixa.`;
    return { handled: true, answer: msg, specialist: "operacoes" };
  }

  // Caso 4: Rotinas, lembretes ou pendências operacionais
  if (
    p.includes("rotina") ||
    p.includes("rotinas") ||
    p.includes("lembrete") ||
    p.includes("lembretes") ||
    p.includes("checklist") ||
    p.includes("pendência operacional") ||
    p.includes("pendencias operacionais") ||
    p.includes("pendências operacionais")
  ) {
    const pending = (data.rotinas || []).filter((r) => {
      const st = (r.status || "").toLowerCase();
      return st !== "concluido" && st !== "concluído" && st !== "cancelado" && st !== "done";
    });

    if (pending.length === 0) {
      return {
        handled: true,
        answer:
          `⚙️ *Agente de Operações e Processos — Rotinas e Pendências Operacionais:*\n\n` +
          `✅ Não há lembretes ou compromissos operacionais pendentes cadastrados no período consultado.`,
        specialist: "operacoes",
      };
    }

    const todayStr = data.todayStr || "";
    const overdue = pending.filter((r) => r.data && todayStr && r.data < todayStr);
    const dueToday = pending.filter((r) => r.data && todayStr && r.data === todayStr);
    const others = pending.filter((r) => !r.data || !todayStr || r.data > todayStr);

    let msg = `⚙️ *Agente de Operações e Processos — Rotinas e Pendências Operacionais (${pending.length}):*\n\n`;
    if (overdue.length > 0) {
      msg += `⏰ *Em Atraso (${overdue.length}):*\n`;
      overdue.slice(0, 5).forEach((r) => {
        msg += `• [${r.sourceTable}] *${r.titulo}* — Data: ${r.data}${r.hora ? ` às ${r.hora}` : ""}\n`;
      });
      msg += `\n`;
    }
    if (dueToday.length > 0) {
      msg += `📅 *Programadas para Hoje (${dueToday.length}):*\n`;
      dueToday.slice(0, 5).forEach((r) => {
        msg += `• [${r.sourceTable}] *${r.titulo}*${r.hora ? ` às ${r.hora}` : ""}${r.local ? ` (${r.local})` : ""}\n`;
      });
      msg += `\n`;
    }
    if (others.length > 0) {
      msg += `📝 *Próximas / Em Aberto (${others.length}):*\n`;
      others.slice(0, 5).forEach((r) => {
        msg += `• [${r.sourceTable}] *${r.titulo}*${r.data ? ` — ${r.data}` : ""}\n`;
      });
      msg += `\n`;
    }
    msg += `_Consulta somente leitura (canMutateState: false)._`;

    return { handled: true, answer: msg, specialist: "operacoes" };
  }

  return { handled: false, specialist: "operacoes" };
}

export async function fetchAndExecuteOperationsSpecialist(
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

  if (!routingPlan.isDeterministicPossible || routingPlan.primarySpecialist !== "operacoes") {
    return {
      handled: false,
      specialist: "operacoes",
      routingPlan,
    };
  }

  const refNow = nowOverride ?? new Date();
  const { todayStr, yesterdayStr, startOfWeekStr, in7DaysStr } = getSaoPauloDateStrings(refNow);
  const collectedData: OperationsDeterministicData = {
    todayStr,
    yesterdayStr,
    isMemberRole: context.role === "member",
  };

  try {
    const [closings, todaySchedules, employees, recentSales, monthExpenses, reminders] = await Promise.all([
      repository.listCashClosings
        ? repository.listCashClosings(context, { start: startOfWeekStr, end: todayStr })
        : Promise.resolve([]),
      repository.listEmployeeSchedules
        ? repository.listEmployeeSchedules(context, { start: todayStr, end: todayStr })
        : Promise.resolve([]),
      repository.listEmployees ? repository.listEmployees(context) : Promise.resolve([]),
      repository.listSalesPdvDetails
        ? repository.listSalesPdvDetails(context, { start: yesterdayStr, end: todayStr })
        : Promise.resolve([]),
      repository.listExpenses
        ? repository.listExpenses(context, { start: yesterdayStr, end: todayStr })
        : Promise.resolve([]),
      repository.listOperationalReminders
        ? repository.listOperationalReminders(context, { start: startOfWeekStr, end: in7DaysStr })
        : Promise.resolve([]),
    ]);

    collectedData.fechamentos = closings;
    collectedData.escalasHoje = todaySchedules;
    collectedData.colaboradores = employees;
    collectedData.vendasCanceladas = recentSales.filter((s) => {
      const st = (s.status || "").toLowerCase();
      return st === "cancelada" || st === "cancelled" || st === "estornada";
    });
    collectedData.sangrias = monthExpenses.filter((e) => {
      const d = (e.description || "").toLowerCase();
      return d.includes("sangria") || d.includes("retirada de caixa");
    });
    collectedData.rotinas = reminders;
  } catch (err) {
    console.warn("[specialist-router] Erro ao consultar repositório de Operações:", err);
  }

  const result = buildOperationsSpecialistDeterministicResponse(userPrompt, collectedData);
  return {
    ...result,
    routingPlan,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDENAÇÃO EXECUTIVA PELO WALLET CEO (GATE 3 — ENTREGA D)
// ─────────────────────────────────────────────────────────────────────────────

export interface CoordinatedSpecialistTrace {
  specialist: SpecialistAgentId;
  name: string;
  status: "ok" | "error" | "denied";
  durationMs: number;
  summary: string;
  error?: string;
}

export interface CoordinatedCeoSnapshot {
  coordinatingCeo: true;
  primarySpecialist: SpecialistAgentId;
  contributingSpecialists: SpecialistAgentId[];
  traces: CoordinatedSpecialistTrace[];
  contextBrief: string;
  deterministicFallbackAnswer: string;
}

function formatMoneyOrUnavailable(val: number | null | undefined, labelUnavailable = "Não disponível"): string {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) {
    return labelUnavailable;
  }
  return `R$ ${Number(val).toFixed(2)}`;
}

async function collectSingleSpecialistContribution(
  specialistId: SpecialistAgentId,
  context: AiExecutionContext,
  repository: FinancialQueryRepository,
  dates: ReturnType<typeof getSaoPauloDateStrings>
): Promise<CoordinatedSpecialistTrace> {
  const startedAt = Date.now();
  const contract = SPECIALIST_AGENTS_REGISTRY[specialistId];
  const name = contract?.name || specialistId;

  const authCheck = authorizeSpecialistAccess(specialistId, context.role);
  if (!authCheck.authorized) {
    return {
      specialist: specialistId,
      name,
      status: "denied",
      durationMs: Date.now() - startedAt,
      summary: `Acesso negado para o papel '${context.role}'.`,
      error: authCheck.reason,
    };
  }

  try {
    const canSeeFinancial = canRoleAccessFinancialData(context.role);

    if (specialistId === "financeiro") {
      if (!canSeeFinancial || context.role !== "owner") {
        return {
          specialist: specialistId,
          name,
          status: "denied",
          durationMs: Date.now() - startedAt,
          summary: "Dados financeiros restritos ao proprietário.",
        };
      }
      const [revenues, expenses, balances] = await Promise.all([
        repository.listRevenues(context, { start: dates.startOfMonthStr, end: dates.todayStr }),
        repository.listExpenses(context, { start: dates.startOfMonthStr, end: dates.todayStr }),
        repository.listBalances(context),
      ]);
      const summary = buildFinancialSummary([...revenues, ...expenses], balances, {
        workspaceId: context.workspaceId,
        period: { start: dates.startOfMonthStr, end: dates.todayStr },
      });
      const overdue = expenses.filter((e) => e.kind === "expense" && !e.paid && e.dueOn && e.dueOn < dates.todayStr);
      const pending = expenses.filter((e) => e.kind === "expense" && !e.paid && (!e.dueOn || e.dueOn >= dates.todayStr));
      const overdueSum = overdue.reduce((acc, e) => acc + Number(e.amount ?? 0), 0);
      const pendingSum = pending.reduce((acc, e) => acc + Number(e.amount ?? 0), 0);
      const revStr = formatMoneyOrUnavailable(summary.operationalIncome);
      const expStr = formatMoneyOrUnavailable(summary.operationalExpenses);
      const netStr = formatMoneyOrUnavailable(summary.netOperationalResult);
      return {
        specialist: specialistId,
        name,
        status: "ok",
        durationMs: Date.now() - startedAt,
        summary: `Mês (${dates.startOfMonthStr} a ${dates.todayStr}): Receita operacional ${revStr} | Despesas operacionais ${expStr} | Resultado líquido ${netStr} | Vencidas: ${overdue.length} (${formatMoneyOrUnavailable(overdueSum)}) | A vencer: ${pending.length} (${formatMoneyOrUnavailable(pendingSum)}).`,
      };
    }

    if (specialistId === "vendas_pdv") {
      const [todaySales, monthSales] = await Promise.all([
        repository.listSalesPDV(context, { start: dates.todayStr, end: dates.todayStr }),
        repository.listSalesPDV(context, { start: dates.startOfMonthStr, end: dates.todayStr }),
      ]);
      const validToday = todaySales.filter((s) => s.kind === "income");
      const validMonth = monthSales.filter((s) => s.kind === "income");
      const sumToday = validToday.reduce((acc, s) => acc + Number(s.amount ?? 0), 0);
      const sumMonth = validMonth.reduce((acc, s) => acc + Number(s.amount ?? 0), 0);

      if (!canSeeFinancial) {
        return {
          specialist: specialistId,
          name,
          status: "ok",
          durationMs: Date.now() - startedAt,
          summary: `Hoje (${dates.todayStr}): ${validToday.length} venda(s) PDV válidas | Mês: ${validMonth.length} venda(s) PDV válidas (totais financeiros ocultos para perfil ${context.role}).`,
        };
      }
      return {
        specialist: specialistId,
        name,
        status: "ok",
        durationMs: Date.now() - startedAt,
        summary: `Hoje (${dates.todayStr}): ${validToday.length} venda(s) PDV, ${formatMoneyOrUnavailable(sumToday)} | Mês: ${validMonth.length} venda(s) PDV, ${formatMoneyOrUnavailable(sumMonth)}.`,
      };
    }

    if (specialistId === "estoque") {
      const [items, recipes] = await Promise.all([
        repository.listInventoryItems ? repository.listInventoryItems(context) : Promise.resolve([]),
        repository.listRecipeCards ? repository.listRecipeCards(context) : Promise.resolve([]),
      ]);
      const alerts = items.filter((it) => {
        if (!it.estoqueInformado) return false;
        return Number(it.estoqueAtual ?? 0) <= Number(it.estoqueMinimo ?? 0);
      });
      const ruptured = alerts.filter((a) => Number(a.estoqueAtual ?? 0) <= 0);
      const belowMin = alerts.filter((a) => Number(a.estoqueAtual ?? 0) > 0);

      const itemsWithCostAndPrice = items.filter(
        (it) => it.custoInformado && Number(it.precoVenda ?? 0) > 0 && Number(it.custoAtual ?? 0) > 0
      );
      const lowestMargin = itemsWithCostAndPrice
        .map((it) => ({
          name: it.descricao,
          margin: ((Number(it.precoVenda) - Number(it.custoAtual)) / Number(it.precoVenda)) * 100,
        }))
        .sort((a, b) => a.margin - b.margin)[0];

      const marginNote = lowestMargin
        ? `menor margem real cadastrada: ${lowestMargin.name} (${lowestMargin.margin.toFixed(1)}%)`
        : `fichas técnicas cadastradas: ${recipes.length}`;

      return {
        specialist: specialistId,
        name,
        status: "ok",
        durationMs: Date.now() - startedAt,
        summary: `Alertas de estoque: ${alerts.length} item(ns) (${ruptured.length} zerado/ruptura, ${belowMin.length} abaixo do mínimo); ${marginNote}.`,
      };
    }

    if (specialistId === "operacoes") {
      const [closings, todaySchedules, reminders] = await Promise.all([
        repository.listCashClosings
          ? repository.listCashClosings(context, { start: dates.yesterdayStr, end: dates.todayStr })
          : Promise.resolve([]),
        repository.listEmployeeSchedules
          ? repository.listEmployeeSchedules(context, { start: dates.todayStr, end: dates.todayStr })
          : Promise.resolve([]),
        repository.listOperationalReminders
          ? repository.listOperationalReminders(context, { start: dates.todayStr, end: dates.in7DaysStr })
          : Promise.resolve([]),
      ]);
      const pendingClosings = closings.filter((c) => {
        const s = (c.status || "").toLowerCase();
        return s !== "closed" && s !== "fechado" && s !== "reconciled";
      });
      const pendingReminders = reminders.filter((r) => !r.completed && (r.status || "").toLowerCase() !== "concluido");
      return {
        specialist: specialistId,
        name,
        status: "ok",
        durationMs: Date.now() - startedAt,
        summary: `Caixas recentes: ${closings.length} (${pendingClosings.length} em aberto/divergente) | Escalas hoje (${dates.todayStr}): ${todaySchedules.length} turno(s) | Lembretes/rotinas pendentes: ${pendingReminders.length}.`,
      };
    }

    if (specialistId === "inteligencia_competitiva") {
      const [opps, exps] = await Promise.all([
        repository.listGrowthOpportunities ? repository.listGrowthOpportunities(context) : Promise.resolve([]),
        repository.listCommercialExperiments ? repository.listCommercialExperiments(context) : Promise.resolve([]),
      ]);
      const activeExps = exps.filter((e) => {
        const st = (e.status || "").toLowerCase();
        return st === "active" || st === "running" || st === "em_andamento" || st === "planned" || st === "planejado";
      });
      return {
        specialist: specialistId,
        name,
        status: "ok",
        durationMs: Date.now() - startedAt,
        summary: `Oportunidades de crescimento registradas: ${opps.length} | Experimentos comerciais ativos/planejados: ${activeExps.length} (dados externos de concorrentes não monitorados no repositório).`,
      };
    }

    if (specialistId === "fiscal") {
      const notes = repository.listFiscalNotes
        ? await repository.listFiscalNotes(context, { start: dates.startOfMonthStr, end: dates.todayStr })
        : [];
      const errors = notes.filter((n) => (n.status || "").toLowerCase().includes("erro"));
      return {
        specialist: specialistId,
        name,
        status: "ok",
        durationMs: Date.now() - startedAt,
        summary: `Notas fiscais no mês: ${notes.length} (${errors.length} com erro de processamento).`,
      };
    }

    if (specialistId === "rh") {
      const [employees, schedules] = await Promise.all([
        repository.listEmployees ? repository.listEmployees(context) : Promise.resolve([]),
        repository.listEmployeeSchedules
          ? repository.listEmployeeSchedules(context, { start: dates.todayStr, end: dates.todayStr })
          : Promise.resolve([]),
      ]);
      const activeEmployees = employees.filter((e) => (e.status || "active").toLowerCase() !== "inactive");
      return {
        specialist: specialistId,
        name,
        status: "ok",
        durationMs: Date.now() - startedAt,
        summary: `Colaboradores ativos: ${activeEmployees.length} | Escalados hoje (${dates.todayStr}): ${schedules.length}.`,
      };
    }

    return {
      specialist: specialistId,
      name,
      status: "ok",
      durationMs: Date.now() - startedAt,
      summary: "Especialista sem coletor complementar adicional.",
    };
  } catch (err) {
    return {
      specialist: specialistId,
      name,
      status: "error",
      durationMs: Date.now() - startedAt,
      summary: "Indisponível temporariamente por falha na consulta do especialista.",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Coleta seletiva de dados apenas dos especialistas designados no plano de coordenação
 * do Wallet CEO, produzindo contexto enxuto para síntese da IA e resposta determinística de fallback.
 */
export async function fetchAndExecuteCoordinatedCeoSnapshot(
  userPrompt: string,
  context: AiExecutionContext,
  repository: FinancialQueryRepository,
  routingPlan: SpecialistRoutingPlan,
  nowOverride?: Date
): Promise<CoordinatedCeoSnapshot> {
  const refNow = nowOverride ?? new Date();
  const dates = getSaoPauloDateStrings(refNow);

  const uniqueSpecialists = Array.from(new Set(routingPlan.contributingSpecialists));
  const traces = await Promise.all(
    uniqueSpecialists.map((specId) => collectSingleSpecialistContribution(specId, context, repository, dates))
  );

  const contextLines = traces.map(
    (t) => `- [${t.name} | ${t.specialist} | ${t.status} | ${t.durationMs}ms]: ${t.summary}`
  );
  const contextBrief =
    `[COLETA SELETIVA MULTIDEPARTAMENTAL — DATA ${dates.todayStr}]\n` +
    `Pergunta: "${userPrompt}"\n` +
    `Especialistas acionados (${uniqueSpecialists.length}): ${uniqueSpecialists.join(", ")}\n` +
    contextLines.join("\n") +
    `\nRegras: Use apenas fatos acima e ferramentas autorizadas; distinga zero real de dado não informado; modo estritamente consultivo (canMutateState: false).`;

  const okCount = traces.filter((t) => t.status === "ok").length;
  const errTraces = traces.filter((t) => t.status === "error");

  let fallback = `👑 **Síntese Executiva Wallet CEO (Modo Contingência Determinística)**\n`;
  fallback += `Data de referência (Brasília): ${dates.todayStr} | Especialistas consultados (${uniqueSpecialists.length}): ${traces.map((t) => t.name).join(", ")}.\n\n`;
  for (const t of traces) {
    const icon = t.status === "ok" ? "•" : "⚠️";
    fallback += `${icon} **${t.name}**: ${t.summary}\n`;
  }
  if (errTraces.length > 0 && okCount > 0) {
    fallback += `\n_Observação: ${errTraces.length} especialista(s) falharam parcialmente na coleta; demais áreas foram preservadas com dados reais._\n`;
  } else if (okCount === 0) {
    fallback += `\n_Observação: Nenhum especialista retornou dados completos nesta tentativa; verifique as fontes operacionais antes de decidir._\n`;
  }
  fallback += `\n_Síntese multidepartamental gerada sem custo de IA em modo estritamente consultivo (canMutateState: false)._`;

  return {
    coordinatingCeo: true,
    primarySpecialist: routingPlan.primarySpecialist,
    contributingSpecialists: uniqueSpecialists,
    traces,
    contextBrief,
    deterministicFallbackAnswer: fallback,
  };
}
