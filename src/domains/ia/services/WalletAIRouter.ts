/**
 * WalletAIRouter — Etapa 1 da Wallet IA Unificada
 *
 * Responsabilidade: Rotear uma mensagem do usuário para o motor interno correto,
 * de forma totalmente transparente para a interface.
 *
 * Rotas disponíveis:
 *  - FAST_QUERY   : Consulta determinística local (antigo Consulta Rápida)
 *  - AGENT_V2     : Agente financeiro avançado com ferramentas (antigo Agent V2)
 *  - DOCUMENT     : Pipeline de documentos (imagem/PDF)
 *  - CONVERSATIONAL: Resposta genérica via modelo de linguagem
 *
 * O usuário vê apenas "Wallet IA". O backend decide internamente.
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
// Heurísticas determinísticas para classificação (sem LLM)
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Padrões que indicam consulta rápida determinística (sem análise profunda) */
const FAST_QUERY_PATTERNS: RegExp[] = [
  /quanto (vendi|vendeu|faturei|faturou)/,
  /quanto (gastei|gastou|despesa)/,
  /saldo (atual|agora|hoje|em conta)/,
  /quanto tenho (em conta|disponivel|na conta)/,
  /(caixa|saldo) (agora|hoje|atual)/,
  /vendas (hoje|ontem|essa semana|este mes|deste mes)/,
  /receita (hoje|ontem|essa semana|este mes|deste mes)/,
  /despesa (hoje|ontem|essa semana|este mes|deste mes)/,
  /lucro (hoje|ontem|essa semana|este mes|deste mes)/,
  /posso (comprar|gastar|pagar)/,
  /qual meu (saldo|lucro|resultado)/,
  /quanto (tenho|sobrou|entrou)/,
  /resumo (rapido|financeiro)/,
];

/** Padrões que indicam análise complexa (Agent V2 com ferramentas) */
const AGENT_V2_PATTERNS: RegExp[] = [
  /compare|compara(r)?/,
  /(analise|analisa|analisa(r)?)/,
  /evolucao|historico|tendencia/,
  /(grafico|grafico|chart|visualiz)/,
  /fluxo de caixa/,
  /projecao|previsao|proximo mes/,
  /(maiores|principais) (despesas|receitas|gastos)/,
  /trimestre|semestre|anual/,
  /mais (detalhes|informacoes)/,
  /me mostr(e|a)/,
  /quero (ver|entender|saber mais)/,
  /por (metodo|forma de pagamento|categoria)/,
];

/** Padrões de ação (cadastrar, criar, atualizar dados) */
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

/**
 * Decide a rota com base em heurísticas determinísticas.
 * Evita chamar LLM para decisões que podem ser tomadas localmente.
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

  // 3. Análise complexa / comparação / gráfico → Agent V2
  if (AGENT_V2_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: "AGENT_V2",
      reason: "Consulta analítica complexa detectada → Agent V2 com ferramentas",
    };
  }

  // 4. Consulta simples e pontual → Fast Query (determinístico, sem token)
  if (FAST_QUERY_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: "FAST_QUERY",
      reason: "Consulta financeira pontual → Consulta Rápida determinística",
    };
  }

  // 5. Default → Agent V2 (mais seguro do que a IA legada para dados financeiros)
  return {
    route: "AGENT_V2",
    reason: "Fallback padrão → Agent V2 para máxima capacidade e segurança",
  };
}
