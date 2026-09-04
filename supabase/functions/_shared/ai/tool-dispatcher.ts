import type { ActionProposal } from "./action-types.ts";
import { CANONICAL_ACTIONS } from "./action-types.ts";
import { prepareActionProposal } from "./action-gateway.ts";
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
  actionProposal?: ActionProposal;
  result?: QueryToolResult;
}

function generateProposalSummary(actionType: string, args: Record<string, unknown>): string {
  switch (actionType) {
    case "cadastrar_transacao": {
      const tipo = args.tipo === "receita" ? "receita" : "despesa";
      const val = typeof args.valor === "number" ? args.valor.toFixed(2) : String(args.valor ?? "0");
      const desc = args.descricao ? ` ("${args.descricao}")` : "";
      return `Cadastrar ${tipo} de R$ ${val}${desc}`;
    }
    case "atualizar_transacao":
      return `Atualizar transação ${args.transacao_id ?? ""}`;
    case "deletar_transacao":
      return `Excluir transação ${args.transacao_id ?? ""}`;
    case "cadastrar_divida": {
      const val = typeof args.valor_total === "number" ? args.valor_total.toFixed(2) : String(args.valor_total ?? "0");
      const credor = args.credor ? ` com ${args.credor}` : "";
      return `Cadastrar dívida de R$ ${val}${credor}`;
    }
    case "atualizar_divida":
      return `Atualizar status da dívida ${args.divida_id ?? ""}`;
    case "cadastrar_meta": {
      const val = typeof args.valor_alvo === "number" ? args.valor_alvo.toFixed(2) : String(args.valor_alvo ?? "0");
      return `Criar meta "${args.nome ?? ""}" com alvo de R$ ${val}`;
    }
    case "atualizar_meta":
      return `Atualizar progresso da meta ${args.meta_id ?? ""}`;
    case "criar_conta":
      return `Criar conta "${args.nome ?? ""}" (${args.tipo ?? "corrente"})`;
    case "atualizar_conta":
      return `Atualizar dados da conta ${args.conta_id ?? ""}`;
    default:
      return `Operação ${actionType}`;
  }
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

  // Se a tool for uma mutação WRITE (Action Proposal)
  if (toolName in CANONICAL_ACTIONS) {
    try {
      const proposal = prepareActionProposal({
        workspaceId: context.workspaceId,
        userId: context.userId,
        conversationId: context.conversationId,
        actionType: toolName,
        summary: generateProposalSummary(toolName, parsedArgs),
        payload: parsedArgs,
        correlationId: context.correlationId,
      });

      return {
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: JSON.stringify({
          status: "prepared",
          action_type: proposal.actionType,
          proposal_id: proposal.id,
          risk_level: proposal.riskLevel,
          summary: proposal.summary,
          requires_confirmation: true,
          message: `Proposta de ação gerada com sucesso (ID: ${proposal.id}, Risco: ${proposal.riskLevel}). Nenhuma alteração foi efetuada no banco. O usuário deve revisar e confirmar a ação explicitamente na interface.`,
        }),
        actionProposal: proposal,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "action_proposal_failed";
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: JSON.stringify({ error: errorMessage }),
      };
    }
  }

  // Caso seja ferramenta de consulta READ
  try {
    const result = await executeQueryTool(toolName, parsedArgs, context, catalog);
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolName,
      content: JSON.stringify(result),
      result,
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
