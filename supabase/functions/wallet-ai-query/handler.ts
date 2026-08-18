import {
  AiAuthorizationError,
  type AiExecutionContext,
} from "../_shared/ai/auth.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_FIELDS = new Set(["workspace_id", "tool", "arguments"]);

export interface AiQueryAuditEvent {
  userId: string;
  workspaceId: string;
  tool: string;
  status: "success" | "error";
  durationMs: number;
  errorCode?: string;
}

export interface WalletAiQueryHandlerDependencies {
  authorize(request: Request, workspaceId: string): Promise<AiExecutionContext>;
  executeTool(
    tool: string,
    args: Record<string, unknown>,
    context: AiExecutionContext,
  ): Promise<unknown>;
  writeAudit(event: AiQueryAuditEvent): Promise<void>;
}

class InvalidRequestError extends Error {}

interface QueryRequestBody {
  workspaceId: string;
  tool: string;
  args: Record<string, unknown>;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function parseBody(request: Request): Promise<QueryRequestBody> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new InvalidRequestError("invalid_json");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidRequestError("invalid_body");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_FIELDS.has(key))) {
    throw new InvalidRequestError("unexpected_field");
  }
  if (
    typeof record.workspace_id !== "string" ||
    typeof record.tool !== "string" ||
    !record.arguments ||
    typeof record.arguments !== "object" ||
    Array.isArray(record.arguments)
  ) {
    throw new InvalidRequestError("invalid_fields");
  }
  return {
    workspaceId: record.workspace_id,
    tool: record.tool,
    args: record.arguments as Record<string, unknown>,
  };
}

async function safeAudit(
  dependencies: WalletAiQueryHandlerDependencies,
  event: AiQueryAuditEvent,
): Promise<void> {
  try {
    await dependencies.writeAudit(event);
  } catch {
    // Auditoria não deve vazar detalhes nem substituir a resposta da consulta.
  }
}

export function createWalletAiQueryHandler(
  dependencies: WalletAiQueryHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ error: { code: "method_not_allowed", message: "Método não permitido." } }, 405);
    }

    const startedAt = Date.now();
    let context: AiExecutionContext | null = null;
    let tool = "unknown";
    try {
      const body = await parseBody(request);
      tool = body.tool;
      context = await dependencies.authorize(request, body.workspaceId);
      const data = await dependencies.executeTool(body.tool, body.args, context);
      await safeAudit(dependencies, {
        userId: context.userId,
        workspaceId: context.workspaceId,
        tool,
        status: "success",
        durationMs: Date.now() - startedAt,
      });
      return json({ data }, 200);
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        return json({ error: { code: "invalid_request", message: "Requisição inválida." } }, 400);
      }
      if (error instanceof AiAuthorizationError) {
        return json({ error: { code: error.code, message: error.message } }, error.status);
      }
      if (context) {
        await safeAudit(dependencies, {
          userId: context.userId,
          workspaceId: context.workspaceId,
          tool,
          status: "error",
          durationMs: Date.now() - startedAt,
          errorCode: error instanceof Error ? error.message.slice(0, 80) : "internal_error",
        });
      }
      if (error instanceof Error && ["tool_not_allowed", "invalid_period"].includes(error.message)) {
        return json(
          { error: { code: error.message, message: "Consulta não permitida ou inválida." } },
          400,
        );
      }
      return json(
        { error: { code: "internal_error", message: "Não foi possível concluir a consulta." } },
        500,
      );
    }
  };
}
