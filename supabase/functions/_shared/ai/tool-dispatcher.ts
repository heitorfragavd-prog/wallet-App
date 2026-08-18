import type { AiExecutionContext } from "./auth.ts";
import { executeQueryTool, type QueryToolCatalog, type QueryToolResult } from "./query-tools.ts";

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAiToolMessage {
  role: "tool";
  tool_call_id: string;
  name: string;
  content: string;
}

export interface DispatchedToolExecution {
  message: OpenAiToolMessage;
  result?: QueryToolResult;
  error?: string;
}

export async function dispatchOpenAiToolCall(
  toolCall: OpenAiToolCall,
  context: AiExecutionContext,
  catalog: QueryToolCatalog,
): Promise<OpenAiToolMessage> {
  const toolName = toolCall.function.name;
  let parsedArgs: Record<string, unknown> = {};

  try {
    parsedArgs = toolCall.function.arguments
      ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
      : {};
  } catch (_e) {
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolName,
      content: JSON.stringify({
        error: "invalid_tool_arguments",
        message: "Os argumentos fornecidos não são um JSON válido.",
      }),
    };
  }

  try {
    const result = await executeQueryTool(toolName, parsedArgs, context, catalog);
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolName,
      content: JSON.stringify(result),
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "tool_execution_failed";
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolName,
      content: JSON.stringify({
        error: errorMessage,
      }),
    };
  }
}
