/**
 * WalletAIRouter — Roteador Semântico e Heurístico da Wallet IA
 *
 * Responsabilidade: Determinar com máxima precisão se a mensagem do usuário deve ir para:
 *   - FAST_QUERY: Consulta rápida determinística (Vendas Eyemobile, Receitas Wallet, Saldo)
 *   - AGENT_V2: Consulta complexa / analítica / mutação / ActionProposal
 *   - DOCUMENT: Documento anexado detectado
 *   - CONVERSATIONAL: Conversa casual
 */

export type WalletAIRoute = "FAST_QUERY" | "AGENT_V2" | "DOCUMENT" | "CONVERSATIONAL";

export interface RouterInput {
  message: string;
  attachments?: unknown[];
}

export interface RouterDecision {
  route: WalletAIRoute;
  reason: string;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]+$/g, "")
    .trim();

// ─────────────────────────────────────────────────────────────────────────────
// 1. INTENÇÕES DE AÇÃO / MUTAÇÃO → obrigatoriamente Agent V2
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_PATTERNS: RegExp[] = [
  /cadastr(a|e|ar)/,
  /registr(a|e|ar)/,
  /lanc(a|e|ar|amento)/,
  /criar? (despesa|receita|divida|conta)/,
  /add(icion(a|e|ar))?/,
  /atuali(z|za(r)?)/,
  /delete|delet(a|e|ar)|remov(a|e|er)|exclu(i|ir)/,
  /pag(a|e|ar|amento)/,
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. ANÁLISE COMPLEXA — avaliada ANTES de FAST_QUERY
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_V2_PATTERNS: RegExp[] = [
  /compare|compara(r)?|comparativo|versus|vs\./,
  /(analise|analisa|analisar)/,
  /(explique|explica|explicar)/,
  /mais (detalhes|informacoes|informacao)/,
  /detalha(r|ndo)?|detalhe/,
  /por que|porque|motivo|causa|razao/,
  /por (categoria|metodo|forma de pagamento|fornecedor|cliente|produto|tipo)/,
  /quebr(a|e|ar) por|agrupar? por|separa(r|r por)/,
  /evolucao|historico|tendencia|tendencias|crescimento|queda/,
  /projecao|previsao|proximo mes|proximos meses|forecast/,
  /(grafico|chart|visualiz|mostre (em|como)|plote)/,
  /trimestre|semestre|anual|ano todo|12 meses/,
  /(maiores|menores|principais|top [0-9]+) (despesas|receitas|gastos|categorias)/,
  /mais (gasto|vendido|pago|caro)/,
  /fluxo de caixa/,
  /me (conta|explica|diz|fale sobre|ajuda)/,
  /quero (ver|entender|saber mais|uma analise)/,
  /qual (a diferenca|o impacto|o motivo)/,
  /vend.*receit|receit.*vend/,
  /fatur.*receit|receit.*fatur/,
  /(diferenca|diferença).*(vend|fatur|receit)/,
  /(vend|fatur|receit).*(diferenca|diferença)/,
  /porque.*(receit|vend|fatur)/,
  /menor.*que.*(vend|fatur)|maior.*que.*(receit)/,
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONSULTA RÁPIDA — apenas consultas pontuais e simples respondidas localmente
// ─────────────────────────────────────────────────────────────────────────────

/** Intenção VENDAS — consulta de faturamento bruto do PDV Eyemobile. */
const FAST_QUERY_VENDAS_PATTERNS: RegExp[] = [
  /^quanto (vendi|vendeu|faturei|faturou)( (hoje|ontem|essa semana|este mes|deste mes))?$/,
  /^vendas (hoje|ontem|essa semana|este mes|deste mes)$/,
  /^faturamento (hoje|ontem|esse mes|deste mes|do dia|da semana)?$/,
  /^quanto (a loja|a empresa) vendeu( (hoje|ontem|este mes))?$/,
  /como estao as vendas$/,
];

/** Intenção RECEITAS — consulta de entradas financeiras da Wallet (líquido). */
const FAST_QUERY_RECEITAS_PATTERNS: RegExp[] = [
  /^quanto (tive de receita|recebi|entrou)( (hoje|ontem|essa semana|este mes|deste mes))?$/,
  /^receita (hoje|ontem|essa semana|este mes|deste mes)$/,
  /^quanto entrou( (hoje|ontem|esta semana|este mes))?$/,
  /^entradas (hoje|ontem|essa semana|este mes)$/,
  /^quanto recebi (no cartao|no pix|em dinheiro)?( (hoje|ontem|esse mes))?$/,
];

/** Consultas que não são nem vendas nem receitas mas são pontuais. */
const FAST_QUERY_OUTROS_PATTERNS: RegExp[] = [
  /^quanto (gastei|gastou|despesa)( (hoje|ontem|esse mes))?$/,
  /saldo (atual|agora|hoje|em conta)/,
  /quanto tenho (em conta|disponivel|na conta)/,
  /(caixa|saldo) (agora|hoje|atual)/,
  /^despesa (hoje|ontem|essa semana|este mes|deste mes)$/,
  /^lucro (hoje|ontem|essa semana|este mes|deste mes)$/,
  /posso (comprar|gastar|pagar) (r\$|ate|isso)?/,
  /qual meu (saldo|lucro|resultado) (hoje|agora|atual)/,
  /^quanto (tenho|sobrou)( agora| hoje)?$/,
  /^resumo (rapido|financeiro|de hoje|do dia)$/,
];

/**
 * Decide a rota com base em heurísticas determinísticas.
 */
export function routeMessage(input: RouterInput): RouterDecision {
  const { message, attachments } = input;

  // 1. Documento anexado → pipeline de documentos
  if (attachments && attachments.length > 0) {
    return {
      route: "DOCUMENT",
      reason: "Arquivo anexado detectado → pipeline de documentos",
    };
  }

  const normalized = norm(message);

  // 2. Ação explícita → Agent V2 (que produz ActionProposal)
  if (ACTION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: "AGENT_V2",
      reason: "Intenção de ação/mutação detectada → Agent V2 com ActionProposal",
    };
  }

  // 3. Análise complexa ou cross-métrica → Agent V2 (PRIORIDADE SOBRE FAST_QUERY)
  if (AGENT_V2_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: "AGENT_V2",
      reason: "Consulta analítica complexa, cross-métrica ou modificador → Agent V2 com ferramentas",
    };
  }

  // 4a. Consulta pontual de VENDAS (PDV Eyemobile) → FAST_QUERY
  if (FAST_QUERY_VENDAS_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: "FAST_QUERY",
      reason: "Consulta de VENDAS (PDV Eyemobile) → Consulta Rápida determinística [intenção: vendas]",
    };
  }

  // 4b. Consulta pontual de RECEITAS (Wallet) → FAST_QUERY
  if (FAST_QUERY_RECEITAS_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: "FAST_QUERY",
      reason: "Consulta de RECEITAS (Wallet) → Consulta Rápida determinística [intenção: receitas]",
    };
  }

  // 4c. Outras consultas pontuais → FAST_QUERY
  if (FAST_QUERY_OUTROS_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: "FAST_QUERY",
      reason: "Consulta financeira pontual e simples → Consulta Rápida determinística",
    };
  }

  // 5. Default → Agent V2 (mais seguro do que a IA legada para dados financeiros)
  return {
    route: "AGENT_V2",
    reason: "Fallback padrão → Agent V2 para máxima capacidade e segurança",
  };
}
