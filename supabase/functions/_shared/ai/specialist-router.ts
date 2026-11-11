/**
 * ROTEADOR E COORDENADOR DOS SETE ESPECIALISTAS DO WALLET CEO 3.0
 * 
 * Regras:
 * - Perguntas simples e diretas acionam APENAS o especialista pertinente (zero gasto desnecessário de IA).
 * - Perguntas de diagnóstico executivo complexo (ex: "faturamento subiu mas lucro caiu") coordenam
 *   múltiplos especialistas (Vendas + Estoque + Financeiro) de forma estruturada.
 * - Prioriza consultas determinísticas para respostas matemáticas exatas e economia de tokens.
 */

import {
  SPECIALIST_AGENTS_REGISTRY,
  SpecialistAgentId,
  authorizeSpecialistAccess,
} from "./specialist-registry.ts";

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
    p.includes("quais contas vencem") ||
    p.includes("contas a vencer") ||
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

/**
 * Respostas determinísticas estruturadas para o Especialista Financeiro (Gate 6).
 * Responde instantaneamente perguntas financeiras frequentes a partir de dados reais já apurados,
 * com zero alucinação e zero custo de IA.
 */
export function buildFinancialSpecialistDeterministicResponse(
  userPrompt: string,
  data: {
    faturamentoOntem?: number;
    pedidosOntem?: number;
    faturamentoMes?: number;
    contasVencer7Dias?: Array<{ descricao: string; valor: number; vencimento: string }>;
    contasVencidas?: Array<{ descricao: string; valor: number; vencimento: string }>;
    saldoTotal?: number;
    resultadoOperacionalMes?: number;
    despesasMes?: number;
  }
): { handled: boolean; answer?: string; specialist: string } {
  const p = userPrompt.toLowerCase().trim();

  // Caso A: "Quanto faturei ontem?"
  if (p.includes("quanto faturei ontem") || p.includes("faturamento de ontem") || p.includes("vendas de ontem")) {
    const fat = Number(data.faturamentoOntem || 0);
    const ped = data.pedidosOntem || 0;
    const ticket = ped > 0 ? (fat / ped).toFixed(2) : "0.00";

    const msg =
      `💰 *Agente Financeiro — Faturamento de Ontem:*\n\n` +
      `• *Faturamento Bruto:* R$ ${fat.toFixed(2)}\n` +
      `• *Total de Pedidos:* ${ped}\n` +
      `• *Ticket Médio:* R$ ${ticket}\n\n` +
      `_Dados apurados diretamente das transações registradas no PDV._`;

    return { handled: true, answer: msg, specialist: "financeiro" };
  }

  // Caso B: "Quais contas vencem nesta semana?"
  if (p.includes("quais contas vencem") || p.includes("contas a vencer") || p.includes("contas vencem nesta semana")) {
    const contas = data.contasVencer7Dias || [];
    const vencidas = data.contasVencidas || [];

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
    const saldo = Number(data.saldoTotal || 0);
    const fatMes = Number(data.faturamentoMes || 0);
    const despMes = Number(data.despesasMes || 0);
    const resOp = Number(data.resultadoOperacionalMes || fatMes - despMes);

    const msg =
      `📊 *Agente Financeiro — Posição de Caixa e Liquidez:*\n\n` +
      `• *Saldo Disponível em Contas:* R$ ${saldo.toFixed(2)}\n` +
      `• *Faturamento Acumulado no Mês:* R$ ${fatMes.toFixed(2)}\n` +
      `• *Despesas Acumuladas no Mês:* R$ ${despMes.toFixed(2)}\n` +
      `• *Resultado Operacional Preliminar:* R$ ${resOp.toFixed(2)}\n\n` +
      `_Posição consolidada das contas bancárias e conciliação em tempo real._`;

    return { handled: true, answer: msg, specialist: "financeiro" };
  }

  return { handled: false, specialist: "financeiro" };
}
