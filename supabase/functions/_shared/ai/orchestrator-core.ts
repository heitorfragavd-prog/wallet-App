import type { AiExecutionContext } from "./auth.ts";
import { OPENAI_FINANCIAL_TOOLS, type OpenAiFunctionDefinition } from "./openai-tools-definition.ts";
import type { QueryToolCatalog } from "./query-tools.ts";
import { dispatchOpenAiToolCall, type OpenAiToolCall, type OpenAiToolMessage } from "./tool-dispatcher.ts";

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
  systemPromptOverride?: string;
}

export interface ExecutedToolRecord {
  tool: string;
  arguments: Record<string, unknown>;
  output: unknown;
  toolCallId: string;
}

export interface OrchestratorTurnResult {
  finalMessage: LlmMessage;
  conversationHistory: LlmMessage[];
  toolCallsExecuted: ExecutedToolRecord[];
  iterations: number;
  usage: LlmUsage;
  loopDetected?: boolean;
  maxIterationsReached?: boolean;
}

function buildSystemPrompt(): string {
  // Data de hoje no fuso do Brasil (America/Sao_Paulo = UTC-3)
  const nowBrasil = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
  const hojeBrasil = nowBrasil.toISOString().split("T")[0]; // YYYY-MM-DD

  return `Você é o Wallet Finance Agent V2, um assistente e consultor financeiro corporativo inteligente, determinístico, auditável e altamente confiável.

DATA DE HOJE (Brasil/BRT): ${hojeBrasil}
Use SEMPRE essa data como referência para "hoje", "ontem" e períodos relativos.
Para "hoje": start=${hojeBrasil}, end=${hojeBrasil}.
Para "ontem": calcule o dia anterior.
Para "este mês": start=YYYY-MM-01, end=${hojeBrasil} (mês corrente até hoje).

SEPARAÇÃO SEMÂNTICA CRÍTICA — VENDAS vs RECEITAS:
Estas são métricas DISTINTAS. NUNCA use uma como substituto da outra.

VENDAS / FATURAMENTO (use buscar_vendas_pdv):
- Valor BRUTO do que foi vendido no PDV Eyemobile (caixa físico).
- Fonte: transações com origem Eyemobile na tabela interna.
- Responde: "quanto vendi?", "qual meu faturamento?", "como estão as vendas?", "quanto vendeu a loja?"
- Se Eyemobile estiver offline/sem dados: NÃO usar Receitas como substituto.
  Diga: "Não consegui consultar as vendas do Eyemobile agora. Posso consultar suas receitas registradas, mas são uma métrica diferente."

RECEITAS / ENTRADAS FINANCEIRAS (use buscar_receitas):
- Valor LÍQUIDO das entradas financeiras registradas na Wallet.
- Inclui: Pix e Cartão (já descontadas as taxas Divipay) + Dinheiro PDV + manuais.
- Responde: "quanto recebi?", "qual minha receita?", "quanto entrou?", "quanto tive de entrada?"
- Se Receitas estiverem indisponíveis: NÃO usar Vendas como substituto.

DIVIPAY (use buscar_receitas para entradas, não há tool separada):
- Serve para: valores líquidos de Pix/Cartão, detalhe de taxas, conciliação.
- Já está incluído em buscar_receitas.

COMPARAÇÕES ENTRE MÉTRICAS:
- "Por que receita é menor que vendas?" → use AMBAS as tools e explique:
  Receita = Vendas brutas − Taxas Divipay (Pix/Cartão) − Devoluções
  (pode haver diferença de timing de conciliação também)

REGRAS DE CONDUTA E SEGURANÇA:
1. Cálculos e dados numéricos devem vir SEMPRE das ferramentas determinísticas fornecidas. NUNCA invente números.
2. Distinção conceitual estrita:
   - Saldo Disponível: Total de liquidez em contas bancárias e carteiras no momento.
   - Fluxo de Caixa: Entradas menos saídas realizadas em um período específico.
   - Lucro / Resultado: Receitas operacionais menos despesas operacionais (excluindo transferências).
   - Dívidas / Contas a Pagar: Obrigações futuras ou pendentes com credores.
3. Ao responder sobre métricas financeiras, informe explicitamente:
   - O período exato consultado (ex: 01/08/2026 a 31/08/2026).
   - Os filtros e fontes aplicados (ex: Vendas PDV Eyemobile, Receitas Wallet).
   - A fórmula utilizada quando houver consolidação ou cálculo derivado.
   - Avisos ou limitações se existirem dados pendentes.
4. Formate todos os valores monetários em formato Real Brasileiro: R$ 1.234,56.
5. Se a solicitação estiver ambígua, use o período padrão do mês corrente ou peça esclarecimento.
6. Nunca solicite nem exiba senhas, tokens ou dados sigilosos.`;
}

export const FINANCIAL_AGENT_SYSTEM_PROMPT = buildSystemPrompt();


export async function runOrchestratorTurn(
  incomingMessages: LlmMessage[],
  context: AiExecutionContext,
  catalog: QueryToolCatalog,
  runner: LlmRunner,
  options: OrchestratorOptions = {},
): Promise<OrchestratorTurnResult> {
  const maxIterations = options.maxToolIterations ?? 5;
  const systemPrompt = options.systemPromptOverride ?? buildSystemPrompt();

  const messages: LlmMessage[] = [];

  // Garante que o system prompt seja a primeira mensagem
  const existingSystem = incomingMessages.find((m) => m.role === "system");
  if (!existingSystem) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push(...incomingMessages);

  let iterations = 0;
  const toolCallsExecuted: ExecutedToolRecord[] = [];
  const executedSignatures = new Set<string>();

  const totalUsage: LlmUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  while (iterations < maxIterations) {
    iterations++;

    const response = await runner.generateCompletion(messages, OPENAI_FINANCIAL_TOOLS);

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
        iterations,
        usage: totalUsage,
      };
    }

    // Processa as tool calls retornadas pelo LLM
    let loopDetected = false;

    for (const toolCall of assistantMsg.tool_calls) {
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
        iterations,
        usage: totalUsage,
        loopDetected: true,
      };
    }
  }

  // Atingiu o limite de iterações sem resposta final textual
  const limitFallbackMessage: LlmMessage = {
    role: "assistant",
    content:
      "O limite máximo de etapas para esta consulta foi atingido. Aqui estão as informações parciais consolidadas disponíveis.",
  };
  messages.push(limitFallbackMessage);

  return {
    finalMessage: limitFallbackMessage,
    conversationHistory: messages,
    toolCallsExecuted,
    iterations,
    usage: totalUsage,
    maxIterationsReached: true,
  };
}
