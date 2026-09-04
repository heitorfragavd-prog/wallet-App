/**
 * WalletAIRouter — Etapa 1.1 / Etapa 1.4 (semântica financeira)
 *
 * CORREÇÃO ETAPA 1.1:
 *   Padrões de análise complexa avaliados ANTES de FAST_QUERY.
 *
 * CORREÇÃO ETAPA 1.4 — SEPARAÇÃO SEMÂNTICA:
 *   VENDAS = valor bruto do PDV Eyemobile (o que foi vendido).
 *   RECEITAS = entradas financeiras registradas na Wallet (líquido de taxas).
 *   São métricas DIFERENTES e não devem ser intercambiadas.
 *
 *   - "quanto vendi?" / "faturamento?" → FAST_QUERY (intenção: VENDAS)
 *   - "quanto recebi?" / "entrou?" → FAST_QUERY (intenção: RECEITAS)
 *   - "por que receita < vendas?" → AGENT_V2 (cross-métrica)
 *
 * REGRA FUNDAMENTAL:
 *   FAST_QUERY é uma OTIMIZAÇÃO, nunca uma REDUÇÃO de inteligência.
 *   Em caso de dúvida, AGENT_V2.
 */

export type WalletAIRoute =
  | "FAST_QUERY"
  | "AGENT_V2"
  | "DOCUMENT"
  | "CONVERSATIONAL";

export interface RouterInput {
  message: string;
  attachments?: Array<{ type: "image" | "pdf"; mimeType: string }>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  workspaceId?: string;
}

export interface RouterDecision {
  route: WalletAIRoute;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalização
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]+$/g, "") // remove pontuacao terminal
    .trim();

// ─────────────────────────────────────────────────────────────────────────────
// 1. AÇÕES — mutações de dados (Agent V2 com ActionProposal)
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
//    Inclui:
//    - Modificadores analíticos (por que, compare, detalhe...)
//    - CROSS-MÉTRICA: perguntas que envolvem VENDAS e RECEITAS juntas
//      (precisam consultar Eyemobile + Wallet ao mesmo tempo → Agent V2)
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_V2_PATTERNS: RegExp[] = [
  // Comparativos
  /compare|compara(r)?|comparativo|versus|vs\./,
  // Análise e detalhamento
  /(analise|analisa|analisar|analise)/,
  /(explique|explica|explicar|explica(r)?)/,
  /mais (detalhes|informacoes|informacao)/,
  /detalha(r|ndo)?|detalhe/,
  // Motivos / causas — CRÍTICO: captura "quanto vendi e por que caiu?"
  /por que|porque|motivo|causa|razao/,
  // Categorização e agrupamento — CRÍTICO: captura "por categoria", "por forma"
  /por (categoria|metodo|forma de pagamento|fornecedor|cliente|produto|tipo)/,
  /quebr(a|e|ar) por|agrupar? por|separa(r|r por)/,
  // Tendências e projeções
  /evolucao|historico|tendencia|tendencias|crescimento|queda/,
  /projecao|previsao|proximo mes|proximos meses|forecast/,
  // Gráficos e visualizações
  /(grafico|chart|visualiz|mostre (em|como)|plote)/,
  // Multi-período — análise temporal
  /trimestre|semestre|anual|ano todo|12 meses/,
  // Rankings
  /(maiores|menores|principais|top [0-9]+) (despesas|receitas|gastos|categorias)/,
  /mais (gasto|vendido|pago|caro)/,
  // Fluxo de caixa
  /fluxo de caixa/,
  // Pedidos de explicação e resumo elaborado
  /me (conta|explica|diz|fale sobre|ajuda)/,
  /quero (ver|entender|saber mais|uma analise)/,
  /qual (a diferenca|o impacto|o motivo)/,
  // CROSS-MÉTRICA (Etapa 1.4): pergunta envolve VENDAS e RECEITAS ao mesmo tempo.
  // Estas perguntas precisam cruzar Eyemobile + Wallet → obrigatoriamente Agent V2.
  // Ex: "por que minha receita é menor que minhas vendas?"
  //     "diferença entre receita e faturamento"
  //     "receita vs vendas"
  /vend.*receit|receit.*vend/,
  /fatur.*receit|receit.*fatur/,
  /(diferenca|diferença).*(vend|fatur|receit)/,
  /(vend|fatur|receit).*(diferenca|diferença)/,
  /porque.*(receit|vend|fatur)/,
  /menor.*que.*(vend|fatur)|maior.*que.*(receit)/,
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONSULTA RÁPIDA — só após confirmar ausência de análise complexa
//    Apenas consultas pontuais e simples respondidas localmente.
//
//    SEPARAÇÃO SEMÂNTICA (Etapa 1.4):
//    VENDAS_PDV: intenção "vendi/faturei/faturamento/vendas" → fonte Eyemobile
//    RECEITAS:   intenção "recebi/entrou/receita/entrada"   → fonte Wallet
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
 *
 * Ordem de prioridade (da maior para a menor):
 *   1. Documento anexado → DOCUMENT
 *   2. Intenção de ação/mutação → AGENT_V2
 *   3. Análise complexa / cross-métrica → AGENT_V2 (avaliada ANTES de FAST_QUERY)
 *   4a. Consulta pontual de VENDAS → FAST_QUERY (intenção: vendas PDV)
 *   4b. Consulta pontual de RECEITAS → FAST_QUERY (intenção: receitas Wallet)
 *   4c. Consulta pontual outros → FAST_QUERY
 *   5. Default → AGENT_V2 (fallback seguro)
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
  //    Captura modificadores como "por que", "por categoria", "compare",
  //    e perguntas que cruzam Vendas + Receitas ao mesmo tempo.
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
