import type { AiExecutionContext } from "./auth.ts";
import { OPENAI_FINANCIAL_TOOLS } from "./openai-tools-definition.ts";
import type {
  LlmMessage,
  LlmRunner,
  LlmUsage,
  OrchestratorOptions,
  OrchestratorTurnResult,
} from "./orchestrator-core.ts";
import { FINANCIAL_AGENT_SYSTEM_PROMPT } from "./orchestrator-core.ts";
import type { QueryToolCatalog } from "./query-tools.ts";
import { dispatchOpenAiToolCall, type OpenAiToolMessage } from "./tool-dispatcher.ts";
import type { SseEventType } from "./streaming-protocol.ts";

export interface SseEventEmitter {
  emit(event: SseEventType, data: unknown): void | Promise<void>;
}

export async function runStreamingOrchestratorTurn(
  incomingMessages: LlmMessage[],
  context: AiExecutionContext,
  catalog: QueryToolCatalog,
  runner: LlmRunner,
  emitter: SseEventEmitter,
  options: OrchestratorOptions = {},
): Promise<OrchestratorTurnResult> {
  const maxIterations = options.maxToolIterations ?? 5;
  const systemPrompt = options.systemPromptOverride ?? FINANCIAL_AGENT_SYSTEM_PROMPT;

  await emitter.emit("response.started", {
    model: (runner as { model?: string }).model ?? "gpt-4o-mini",
  });

  const messages: LlmMessage[] = [];
  const existingSystem = incomingMessages.find((m) => m.role === "system");
  if (!existingSystem) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push(...incomingMessages);

  let iterations = 0;
  const toolCallsExecuted: OrchestratorTurnResult["toolCallsExecuted"] = [];
  const executedSignatures = new Set<string>();

  const totalUsage: LlmUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  while (iterations < maxIterations) {
    iterations++;

    await emitter.emit("agent.status", {
      status: "thinking",
      message: iterations === 1 ? "Analisando sua pergunta..." : "Processando dados...",
    });

    const response = await runner.generateCompletion(messages, OPENAI_FINANCIAL_TOOLS);

    if (response.usage) {
      totalUsage.promptTokens += response.usage.promptTokens;
      totalUsage.completionTokens += response.usage.completionTokens;
      totalUsage.totalTokens += response.usage.totalTokens;
    }

    const assistantMsg = response.message;
    messages.push(assistantMsg);

    // Se o modelo não chamou ferramentas, emite o texto final em streaming e encerra
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      const fullText = assistantMsg.content ?? "";

      // Emit text.delta em chunks para animação suave
      const chunkSize = 15;
      for (let i = 0; i < fullText.length; i += chunkSize) {
        await emitter.emit("text.delta", {
          delta: fullText.slice(i, i + chunkSize),
        });
      }

      await emitter.emit("response.completed", {
        message: assistantMsg,
        usage: totalUsage,
        estimatedCostUsd: 0,
      });

      return {
        finalMessage: assistantMsg,
        conversationHistory: messages,
        toolCallsExecuted,
        iterations,
        usage: totalUsage,
      };
    }

    // Processa chamadas de ferramenta
    let loopDetected = false;

    for (const toolCall of assistantMsg.tool_calls) {
      const signature = `${toolCall.function.name}:${toolCall.function.arguments}`;

      if (executedSignatures.has(signature)) {
        loopDetected = true;
        break;
      }
      executedSignatures.add(signature);

      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        parsedArgs = {};
      }

      await emitter.emit("tool.started", {
        tool: toolCall.function.name,
        arguments: parsedArgs,
        toolCallId: toolCall.id,
      });

      await emitter.emit("agent.status", {
        status: "executing_tool",
        message: `Executando consulta segura: ${toolCall.function.name}...`,
      });

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

      await emitter.emit("tool.completed", {
        tool: toolCall.function.name,
        output: parsedOutput,
        toolCallId: toolCall.id,
      });

      toolCallsExecuted.push({
        tool: toolCall.function.name,
        arguments: parsedArgs,
        output: parsedOutput,
        toolCallId: toolCall.id,
      });
    }

    if (loopDetected) {
      const loopMsg: LlmMessage = {
        role: "assistant",
        content:
          "Identifiquei repetição na consulta dos dados. Interrompendo para sua segurança.",
      };
      messages.push(loopMsg);

      await emitter.emit("text.delta", { delta: loopMsg.content ?? "" });
      await emitter.emit("response.completed", {
        message: loopMsg,
        usage: totalUsage,
        estimatedCostUsd: 0,
      });

      return {
        finalMessage: loopMsg,
        conversationHistory: messages,
        toolCallsExecuted,
        iterations,
        usage: totalUsage,
        loopDetected: true,
      };
    }
  }

  const limitMsg: LlmMessage = {
    role: "assistant",
    content: "Limite de etapas atingido.",
  };
  messages.push(limitMsg);

  await emitter.emit("text.delta", { delta: limitMsg.content ?? "" });
  await emitter.emit("response.completed", {
    message: limitMsg,
    usage: totalUsage,
    estimatedCostUsd: 0,
  });

  return {
    finalMessage: limitMsg,
    conversationHistory: messages,
    toolCallsExecuted,
    iterations,
    usage: totalUsage,
    maxIterationsReached: true,
  };
}
