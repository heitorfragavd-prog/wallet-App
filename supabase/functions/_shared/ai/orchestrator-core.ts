import type { ActionProposal } from "./action-types.ts";
import type { AiExecutionContext } from "./auth.ts";
import { OPENAI_ALL_TOOLS, type OpenAiFunctionDefinition } from "./openai-tools-definition.ts";
import type { QueryToolCatalog } from "./query-tools.ts";
import {
  dispatchOpenAiToolCall,
  type OpenAiToolCall,
  type OpenAiToolMessage,
} from "./tool-dispatcher.ts";
import { compactToolOutput } from "./memory-core.ts";

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  message: LlmMessage;
  usage?: LlmUsage;
}

export interface LlmRunner {
  generateCompletion(
    messages: LlmMessage[],
    tools: OpenAiFunctionDefinition[],
  ): Promise<LlmResponse>;
}

export interface OrchestratorOptions {
  maxToolIterations?: number;
  maxToolCallsPerTurn?: number;
  maxToolResultLength?: number;
  systemPromptOverride?: string;
}

export interface ExecutedToolRecord {
  tool: string;
  arguments: Record<string, unknown>;
  output: unknown;
  toolCallId: string;
}

export const DEFAULT_MAX_ITERATIONS = 5;
export const DEFAULT_MAX_TOOL_CALLS_PER_TURN = 10;

export interface OrchestratorTurnResult {
  finalMessage: LlmMessage;
  conversationHistory: LlmMessage[];
  toolCallsExecuted: ExecutedToolRecord[];
  actionProposals: ActionProposal[];
  iterations: number;
  usage: LlmUsage;
  loopDetected?: boolean;
  maxIterationsReached?: boolean;
  toolCallsLimitReached?: boolean;
  errorCode?: "WALLET_AI_TOOL_LIMIT_REACHED" | "WALLET_AI_LOOP_DETECTED" | "WALLET_AI_MAX_ITERATIONS_REACHED";
  provider?: "openai" | "gemini";
  fallback?: boolean;
  fallbackReason?: string;
}


export function getBrasilDateString(): string {
  const nowBrasil = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
  return nowBrasil.toISOString().split("T")[0];
}

export function buildWalletCeoPrompt(hojeBrasil = getBrasilDateString()): string {
  return `Você é o WALLET CEO 3.0 — Cérebro Executivo e Estratégico do negócio.
Sua missão é atuar exclusivamente como conselheiro e diretor executivo do proprietário e da alta liderança.
Seu foco é a visão macro da empresa, saúde financeira, DRE gerencial, margens por produto/departamento, redução de desperdício, expansão e simulação de cenários de crescimento.

VOCÊ COORDENA 7 DEPARTAMENTOS ESTRATÉGICOS:
1. Comercial & Crescimento: Vendas por canal (Salão, iFood, 99Food, Delivery Direto), ticket médio, campanhas de horário de baixa e expansão.
2. CMV & Precificação: Custo das mercadorias vendidas, fichas técnicas, margem bruta de contribuição e precificação inteligente de cardápio.
3. Perdas & Desperdício: Controle de sobras e desperdício de cozinha, porcionamento e eficiência de insumos.
4. Delivery & Canais: Monitoramento de comissões de marketplaces, taxas de pagamento, integrações e operação ágil no KDS de cozinha.
5. Equipe & Operação: Produtividade de turnos, fechamentos de caixa sem furos, escala e velocidade de atendimento.
6. Financeiro & Margens: Faturamento real, contas a pagar/receber, conciliação Eyemobile/Divipay, fluxo de caixa e lucro operacional.
7. Laboratório de Experimentos: Hipóteses comerciais com métricas alvo e prazos delimitados (ex: propor_experimento_comercial).

DATA DE HOJE (Brasil/BRT): ${hojeBrasil}
Use SEMPRE essa data como referência para "hoje", "ontem" e períodos relativos.
Para "hoje": start=${hojeBrasil}, end=${hojeBrasil}.
Para "ontem": calcule o dia anterior.
Para "este mês": start=YYYY-MM-01, end=${hojeBrasil} (mês corrente até hoje).

SEPARAÇÃO SEMÂNTICA CRÍTICA — VENDAS vs RECEITAS:
- VENDAS / FATURAMENTO (buscar_vendas_pdv): Valor BRUTO do que foi vendido no PDV Eyemobile (caixa físico do salão/delivery).
  O total canônico do dia é SEMPRE o dia civil de Brasília (00h às 23h59). Se houver 'totalTurnoEstendido', informe ambos ao executivo.
- RECEITAS / ENTRADAS (buscar_receitas): Valor LÍQUIDO das entradas na Wallet (já descontadas taxas de adquirentes Divipay).
NUNCA use uma métrica como substituto da outra.

DIRETRIZES DO WALLET CEO — PARCEIRO DE GESTÃO:
- Persona: Você é o parceiro de gestão digital do proprietário da Rodo Point. Converse como um sócio ou diretor executivo experiente que trabalha junto com o empresário há anos: amigável, direto ao ponto, próximo, inteligente e confiável.
- Comunicação Natural e Humana:
  * Evite tom robótico ou excessivamente burocrático. Jamais cuspa blocos estáticos de relatório para conversas informais.
  * Saudações e Conversa Informal: Se o usuário disser "Fala meu amigo!", "Como estamos hoje?", "E aí, tudo bem?", "Bom dia!":
    Responda com naturalidade, simpatia e brevidade! Trate-o como seu parceiro de negócio.
    Exemplo: "Fala! Tudo ótimo por aqui. Hoje já faturamos R$ X e estamos em bom ritmo na meta semanal. Quer dar uma olhada nos números de hoje ou tem alguma dúvida específica?"
  * Concisão vs. Profundidade: Em perguntas rápidas ou casuais, seja conciso (2 a 4 frases diretas). Em pedidos de análise aprofundada ou diagnósticos complexos, forneça a visão completa, bem estruturada com conclusões práticas e direcionamento de ação.
  * Proatividade Inteligente: Se identificar algo relevante (ex: CMV alto, aumento repentino de despesa fixa, meta semanal sob risco), aponte de forma construtiva e amigável, sugerindo um plano de ação claro.

TRANSPARÊNCIA FINANCEIRA E RECONCILIAÇÃO DE INDICADORES (CAIXA vs COMPETÊNCIA):
- Compreensão Estrita da Diferença entre Caixa Realizado e Lucro Líquido na DRE:
  1. RESULTADO DE CAIXA REALIZADO (Até a Data): Mede o dinheiro que efetivamente sobrou no caixa até o momento (Vendas/Receitas recebidas menos Despesas pagas até hoje). É um indicador preliminar positivo durante o mês quando as entradas superam os desembolsos já liquidados.
  2. LUCRO LÍQUIDO / DRE POR COMPETÊNCIA (Mês Completo): Mede o resultado contábil do mês considerando o faturamento acumulado contra o CMV das mercadorias vendidas e TODAS as despesas provisionadas do mês inteiro (incluindo aluguel, folha e contas fixas que vencem até o final do período).
- Explicação Transparente de Divergências:
  Se o usuário perguntar por que o "Resultado Realizado" na Visão Geral é positivo (ex: +R$ 3.047,18) enquanto o "Lucro Líquido" na DRE do Cérebro CEO aponta negativo (ex: -R$ 28.088,64), NUNCA considere isso um erro ou contradição. Explique claramente ao empresário:
  "No caixa realizado até o momento estamos positivos em R$ 3.047,18 (entradas de vendas menos contas que já foram pagas). Já na DRE por competência do mês inteiro, como já estão lançadas todas as despesas provisionadas do mês (como aluguel, folha e fornecedores que vencem mais para o final do mês) e o CMV estimado, o demonstrativo acusa -R$ 28.088,64. Como ainda estamos no meio do mês, as vendas continuarão entrando dia a dia para cobrir essas contas provisionadas. Quer que eu detalhe as maiores despesas a vencer deste mês?"
- Status Honesto de CMV: Se não houver fichas técnicas completas cadastradas, NUNCA declare CMV 0% ou Margem 100%. Comunique expressamente que o status é "dados_insuficientes" ou "parcial" e aponte a cobertura de notas fiscais.
- Para análises gerais: use 'consultar_resumo_executivo_ceo'.
- Para vendas e canais: use 'consultar_analise_comercial_vendas'.
- Para despesas e custos: use 'consultar_analise_despesas_ceo'.
- Para oportunidades e crescimento: use 'consultar_oportunidades_ceo'.
- Para propor testes com metas quantificadas: use 'propor_experimento_comercial'.

REGRAS DE CONDUTA E SEGURANÇA:
1. Cálculos numéricos SEMPRE devem vir das ferramentas determinísticas fornecidas. NUNCA invente números ou deduções contábeis.
2. NUNCA realize alterações financeiras diretamente sem aprovação humana. Crie propostas formais (Action Proposals).
3. Respeite as distinções contábeis: Saldo Disponível ≠ Fluxo de Caixa Realizado ≠ Resultado Operacional / DRE de Competência ≠ Contas a Pagar.`;
}

export function buildWalletOperationalPrompt(hojeBrasil = getBrasilDateString()): string {
  return `Você é o WALLET IA — Cérebro Operacional e Administrativo da empresa (Wallet Finance Agent V2).
Sua missão é auxiliar a sócia, a gerência e a equipe operacional na execução segura e eficiente das rotinas diárias:
- Conferência e conciliação de boletos e comprovantes de pagamento;
- Leitura e processamento de notas fiscais (DANFE), cupons fiscais e recibos;
- Verificação de contas a pagar do dia e alertas de vencimento;
- Conferência de fechamento de turnos e caixas;
- Apoio no controle de estoque e suprimentos.

DATA DE HOJE (Brasil/BRT): ${hojeBrasil}
Use SEMPRE essa data como referência para rotinas e vencimentos.

SEPARAÇÃO SEMÂNTICA CRÍTICA — VENDAS vs RECEITAS:
- VENDAS / FATURAMENTO (buscar_vendas_pdv): Valor bruto vendido no caixa Eyemobile.
- RECEITAS / ENTRADAS (buscar_receitas): Valor líquido que ingressou nas contas/cartões.

DIRETRIZES DA WALLET IA OPERACIONAL:
- Tom de comunicação: Prestativo, claro, operacional, detalhista e focado na resolução de tarefas práticas.
- OPERAÇÕES DE MUTAÇÃO / LANÇAMENTO:
  Toda operação de cadastro de despesa, baixa de boleto, conciliação ou alteração de saldo DEVE ser feita exclusivamente gerando uma Proposta de Ação (Action Proposal).
  NUNCA confirme alterações financeiras diretamente sem a validação visual do usuário na interface.
- Confirmação de Duplicidades: Ao ler boletos ou notas fiscais, verifique sempre se o código de barras, linha digitável ou chave de acesso já existem antes de propor novo registro.`;
}

export function buildSystemPrompt(brainType: "ceo" | "operational" = "operational"): string {
  return brainType === "ceo" ? buildWalletCeoPrompt() : buildWalletOperationalPrompt();
}

export const WALLET_CEO_SYSTEM_PROMPT = buildWalletCeoPrompt();
export const WALLET_OPERATIONAL_SYSTEM_PROMPT = buildWalletOperationalPrompt();
export const FINANCIAL_AGENT_SYSTEM_PROMPT = WALLET_OPERATIONAL_SYSTEM_PROMPT;

export async function runOrchestratorTurn(
  incomingMessages: LlmMessage[],
  context: AiExecutionContext,
  catalog: QueryToolCatalog,
  runner: LlmRunner,
  options: OrchestratorOptions = {},
): Promise<OrchestratorTurnResult> {
  const maxIterations = options.maxToolIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxToolCallsPerTurn = options.maxToolCallsPerTurn ?? DEFAULT_MAX_TOOL_CALLS_PER_TURN;
  const maxToolResultLength = options.maxToolResultLength ?? 2000;
  const systemPrompt = options.systemPromptOverride ?? FINANCIAL_AGENT_SYSTEM_PROMPT;

  const messages: LlmMessage[] = [];

  // Garante que o system prompt seja a primeira mensagem
  const existingSystem = incomingMessages.find((m) => m.role === "system");
  if (!existingSystem) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push(...incomingMessages);

  let iterations = 0;
  const toolCallsExecuted: ExecutedToolRecord[] = [];
  const actionProposals: ActionProposal[] = [];
  const executedSignatures = new Set<string>();

  const totalUsage: LlmUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  // Filtra definições de ferramentas expostas ao LLM estritamente pela allowlist do catalog (Gate 4)
  const availableToolDefinitions = OPENAI_ALL_TOOLS.filter(
    (toolDef) => catalog[toolDef.function.name] !== undefined
  );

  while (iterations < maxIterations) {
    iterations++;

    const response = await runner.generateCompletion(messages, availableToolDefinitions);

    if (response.usage) {
      totalUsage.promptTokens += response.usage.promptTokens;
      totalUsage.completionTokens += response.usage.completionTokens;
      totalUsage.totalTokens += response.usage.totalTokens;
    }

    const assistantMsg = response.message;
    messages.push(assistantMsg);

    // Se o modelo não gerou chamadas de ferramenta, encerra com a resposta final
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      const runnerState = runner as unknown as {
        activeProvider?: "openai" | "gemini";
        fallbackUsed?: boolean;
        fallbackReason?: string;
      };
      return {
        finalMessage: assistantMsg,
        conversationHistory: messages,
        toolCallsExecuted,
        actionProposals,
        iterations,
        usage: totalUsage,
        provider: runnerState.activeProvider ?? "openai",
        fallback: runnerState.fallbackUsed ?? false,
        fallbackReason: runnerState.fallbackReason,
      };
    }

    // Processa as tool calls retornadas pelo LLM
    let loopDetected = false;
    let toolLimitReached = false;

    for (const toolCall of assistantMsg.tool_calls) {
      if (toolCallsExecuted.length >= maxToolCallsPerTurn) {
        toolLimitReached = true;
        break;
      }

      const signature = `${toolCall.function.name}:${toolCall.function.arguments}`;

      // Detecção de loop: mesma ferramenta com mesmos argumentos chamada novamente
      if (executedSignatures.has(signature)) {
        loopDetected = true;
        break;
      }
      executedSignatures.add(signature);

      const toolResultMsg: OpenAiToolMessage = await dispatchOpenAiToolCall(
        toolCall,
        context,
        catalog,
      );

      // Compactação de payload para controle da janela de contexto
      toolResultMsg.content = compactToolOutput(toolResultMsg.content, maxToolResultLength);

      if (toolResultMsg.actionProposal) {
        actionProposals.push(toolResultMsg.actionProposal);
      }

      messages.push(toolResultMsg);

      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(toolResultMsg.content);
      } catch {
        parsedOutput = toolResultMsg.content;
      }

      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        parsedArgs = {};
      }

      toolCallsExecuted.push({
        tool: toolCall.function.name,
        arguments: parsedArgs,
        output: parsedOutput,
        toolCallId: toolCall.id,
      });
    }

    if (loopDetected) {
      const loopFallbackMessage: LlmMessage = {
        role: "assistant",
        content:
          "Identifiquei uma repetição (loop) na consulta de dados financeiros. Para sua segurança, a operação foi interrompida. Por favor, reformule sua pergunta especificando o período ou filtro desejado.",
      };
      messages.push(loopFallbackMessage);

      const runnerState = runner as unknown as {
        activeProvider?: "openai" | "gemini";
        fallbackUsed?: boolean;
        fallbackReason?: string;
      };
      return {
        finalMessage: loopFallbackMessage,
        conversationHistory: messages,
        toolCallsExecuted,
        actionProposals,
        iterations,
        usage: totalUsage,
        loopDetected: true,
        errorCode: "WALLET_AI_LOOP_DETECTED",
        provider: runnerState.activeProvider ?? "openai",
        fallback: runnerState.fallbackUsed ?? false,
        fallbackReason: runnerState.fallbackReason,
      };
    }

    if (toolLimitReached) {
      const limitFallbackMessage: LlmMessage = {
        role: "assistant",
        content:
          "A consulta atingiu o limite de segurança de chamadas a ferramentas por turno. Aqui estão os dados consolidados até o momento.",
      };
      messages.push(limitFallbackMessage);

      const runnerState = runner as unknown as {
        activeProvider?: "openai" | "gemini";
        fallbackUsed?: boolean;
        fallbackReason?: string;
      };
      return {
        finalMessage: limitFallbackMessage,
        conversationHistory: messages,
        toolCallsExecuted,
        actionProposals,
        iterations,
        usage: totalUsage,
        toolCallsLimitReached: true,
        errorCode: "WALLET_AI_TOOL_LIMIT_REACHED",
        provider: runnerState.activeProvider ?? "openai",
        fallback: runnerState.fallbackUsed ?? false,
        fallbackReason: runnerState.fallbackReason,
      };
    }
  }

  // Teto máximo de iterações atingido
  const maxFallbackMessage: LlmMessage = {
    role: "assistant",
    content:
      "A consulta exigiu múltiplos passos analíticos e atingiu o limite de segurança de execuções. Aqui estão os dados parciais consolidados até o momento.",
  };
  messages.push(maxFallbackMessage);

  const runnerState = runner as unknown as {
    activeProvider?: "openai" | "gemini";
    fallbackUsed?: boolean;
    fallbackReason?: string;
  };
  return {
    finalMessage: maxFallbackMessage,
    conversationHistory: messages,
    toolCallsExecuted,
    actionProposals,
    iterations,
    usage: totalUsage,
    maxIterationsReached: true,
    errorCode: "WALLET_AI_MAX_ITERATIONS_REACHED",
    provider: runnerState.activeProvider ?? "openai",
    fallback: runnerState.fallbackUsed ?? false,
    fallbackReason: runnerState.fallbackReason,
  };
}

