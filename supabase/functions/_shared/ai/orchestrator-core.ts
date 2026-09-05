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
}

export const FINANCIAL_AGENT_SYSTEM_PROMPT = `Você é o Wallet Finance Agent V2, um assistente e consultor financeiro corporativo inteligente, determinístico, auditável e altamente confiável.

REGRAS DE CONDUTA E SEGURANÇA:
1. Cálculos e dados numéricos devem vir SEMPRE das ferramentas determinísticas fornecidas. NUNCA invente números, deduções ou métricas.
2. OPERAÇÕES FINANCEIRAS DE ESCRITA (MUTAÇÃO):
   - NUNCA realize alterações, cadastros ou exclusões financeiras diretamente sem aprovação humana.
   - Quando o usuário solicitar registrar receita, despesa, dívida, meta ou conta, use a ferramenta de proposta correspondente.
   - As ferramentas de escrita geram uma Proposta de Ação (Action Proposal) que exigirá confirmação humana explícita do usuário na interface.
   - Jamais tente burlar, usar service role, forçar execução direta ou alterar IDs de workspace e usuário.
3. Distinção conceitual estrita:
   - Saldo Disponível: Total de liquidez em contas bancárias e carteiras no momento.
   - Fluxo de Caixa: Entradas menos saídas realizadas em um período específico.
   - Lucro / Resultado: Receitas operacionais menos despesas operacionais (excluindo transferências internas).
   - Dívidas / Contas a Pagar: Obrigações futuras ou pendentes com credores.
4. Ao responder sobre métricas financeiras, informe explicitamente:
   - O período exato consultado (ex: 01/08/2026 a 31/08/2026).
   - Os filtros e fontes aplicados (ex: Receitas e Despesas confirmadas).
   - A fórmula utilizada quando houver consolidação ou cálculo derivado.
5. Formate todos os valores monetários em formato Real Brasileiro: R$ 1.234,56.
6. Nunca solicite nem exiba senhas, tokens ou dados sigilosos.`;

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

  while (iterations < maxIterations) {
    iterations++;

    const response = await runner.generateCompletion(messages, OPENAI_ALL_TOOLS);

    if (response.usage) {
      totalUsage.promptTokens += response.usage.promptTokens;
      totalUsage.completionTokens += response.usage.completionTokens;
      totalUsage.totalTokens += response.usage.totalTokens;
    }

    const assistantMsg = response.message;
    messages.push(assistantMsg);

    // Se o modelo não gerou chamadas de ferramenta, encerra com a resposta final
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return {
        finalMessage: assistantMsg,
        conversationHistory: messages,
        toolCallsExecuted,
        actionProposals,
        iterations,
        usage: totalUsage,
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

      return {
        finalMessage: loopFallbackMessage,
        conversationHistory: messages,
        toolCallsExecuted,
        actionProposals,
        iterations,
        usage: totalUsage,
        loopDetected: true,
        errorCode: "WALLET_AI_LOOP_DETECTED",
      };
    }

    if (toolLimitReached) {
      const limitFallbackMessage: LlmMessage = {
        role: "assistant",
        content:
          "A consulta atingiu o limite de segurança de chamadas a ferramentas por turno. Aqui estão os dados consolidados até o momento.",
      };
      messages.push(limitFallbackMessage);

      return {
        finalMessage: limitFallbackMessage,
        conversationHistory: messages,
        toolCallsExecuted,
        actionProposals,
        iterations,
        usage: totalUsage,
        toolCallsLimitReached: true,
        errorCode: "WALLET_AI_TOOL_LIMIT_REACHED",
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

  return {
    finalMessage: maxFallbackMessage,
    conversationHistory: messages,
    toolCallsExecuted,
    actionProposals,
    iterations,
    usage: totalUsage,
    maxIterationsReached: true,
    errorCode: "WALLET_AI_MAX_ITERATIONS_REACHED",
  };
}
