/**
 * WalletAIRouter — Etapa 1.1 (auditoria e correção)
 *
 * CORREÇÃO CRÍTICA:
 *   Padrões de análise complexa agora são avaliados ANTES dos padrões
 *   de consulta rápida. Isso evita que "Quanto vendi hoje e por que caiu?"
 *   seja tratado como FAST_QUERY quando deveria ir para AGENT_V2.
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
    .replace(/[\u0300-\u036f]/g, "");

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
//    Inclui modificadores que tornam uma consulta simples em análise profunda
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
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONSULTA RÁPIDA — só após confirmar ausência de análise complexa
//    Apenas consultas pontuais e simples que podem ser respondidas localmente
// ─────────────────────────────────────────────────────────────────────────────

const FAST_QUERY_PATTERNS: RegExp[] = [
  /^quanto (vendi|vendeu|faturei|faturou)( (hoje|ontem|essa semana|este mes|deste mes|essa semana))?$/,
  /^quanto (gastei|gastou|despesa)( (hoje|ontem|esse mes))?$/,
  /saldo (atual|agora|hoje|em conta)/,
  /quanto tenho (em conta|disponivel|na conta)/,
  /(caixa|saldo) (agora|hoje|atual)/,
  /^vendas (hoje|ontem|essa semana|este mes|deste mes)$/,
  /^receita (hoje|ontem|essa semana|este mes|deste mes)$/,
  /^despesa (hoje|ontem|essa semana|este mes|deste mes)$/,
  /^lucro (hoje|ontem|essa semana|este mes|deste mes)$/,
  /posso (comprar|gastar|pagar) (r\$|ate|isso)?/,
  /qual meu (saldo|lucro|resultado) (hoje|agora|atual)/,
  /^quanto (tenho|sobrou|entrou)( agora| hoje)?$/,
  /^resumo (rapido|financeiro|de hoje|do dia)$/,
];

/**
 * Decide a rota com base em heurísticas determinísticas.
 *
 * Ordem de prioridade (da maior para a menor):
 *   1. Documento anexado → DOCUMENT
 *   2. Intenção de ação/mutação → AGENT_V2
 *   3. Análise complexa / modificadores → AGENT_V2 (avaliada ANTES de FAST_QUERY)
 *   4. Consulta pontual simples → FAST_QUERY
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

  // 3. Análise complexa → Agent V2 (PRIORIDADE SOBRE FAST_QUERY)
  //    Captura modificadores como "por que", "por categoria", "compare", "detalhe"
  //    mesmo quando a mensagem começa com padrão de consulta simples.
  if (AGENT_V2_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: "AGENT_V2",
      reason: "Consulta analítica complexa ou modificador detectado → Agent V2 com ferramentas",
    };
  }

  // 4. Consulta simples e pontual → Fast Query (determinístico, sem token)
  //    Somente atingida se nenhum modificador de análise foi detectado acima.
  if (FAST_QUERY_PATTERNS.some((p) => p.test(normalized))) {
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
