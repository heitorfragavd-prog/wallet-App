export interface AuthenticatedUser {
  id: string;
}

export interface OwnedWorkspace {
  id: string;
}

export interface AuthorizationDependencies {
  getUser(accessToken: string): Promise<AuthenticatedUser | null>;
  findOwnedWorkspace(workspaceId: string, userId: string): Promise<OwnedWorkspace | null>;
  verifyConversationOwnership?(conversationId: string, workspaceId: string, userId: string): Promise<boolean>;
  getUserRole?(workspaceId: string, userId: string): Promise<string>;
}

export interface AiExecutionContext {
  readonly userId: string;
  readonly workspaceId: string;
  readonly accessToken: string;
  readonly conversationId?: string;
  readonly correlationId?: string;
  readonly role?: string;
}

/**
 * Validação de autorização RBAC para dados e ferramentas financeiras.
 * Papéis estritamente operacionais (delivery_staff, operacional, cozinha, etc.)
 * NÃO possuem autorização para consultar dados financeiros (faturamento, despesas,
 * saldos, lucros, margens, CMV, DRE e receitas).
 */
export function canRoleAccessFinancialData(role?: string): boolean {
  if (!role) return true;
  const normalized = role.toLowerCase().trim();
  if (
    normalized === "delivery_staff" ||
    normalized === "operacional" ||
    normalized === "cozinha" ||
    normalized === "atendimento" ||
    normalized === "motoboy" ||
    normalized === "entregador"
  ) {
    return false;
  }
  return true;
}

export type AiAuthorizationErrorCode =
  | "missing_authorization"
  | "invalid_authorization"
  | "invalid_workspace"
  | "invalid_token"
  | "workspace_forbidden"
  | "WALLET_AI_AUTH_ERROR"
  | "WALLET_AI_FORBIDDEN"
  | "WALLET_AI_INVALID_WORKSPACE"
  | "WALLET_AI_INVALID_CONVERSATION";

export class AiAuthorizationError extends Error {
  constructor(
    public readonly code: AiAuthorizationErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AiAuthorizationError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization")?.trim();
  if (!header) {
    throw new AiAuthorizationError("missing_authorization", 401, "Autenticação obrigatória.");
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match) {
    throw new AiAuthorizationError("invalid_authorization", 401, "Autorização inválida.");
  }

  return match[1];
}

export async function authorizeAiRequest(
  request: Request,
  workspaceId: string,
  dependencies: AuthorizationDependencies,
  conversationId?: string,
  correlationId?: string,
): Promise<AiExecutionContext> {
  if (!UUID_PATTERN.test(workspaceId)) {
    throw new AiAuthorizationError("invalid_workspace", 400, "Workspace inválido.");
  }

  const accessToken = extractBearerToken(request);
  const user = await dependencies.getUser(accessToken);
  if (!user) {
    throw new AiAuthorizationError("invalid_token", 401, "Sessão inválida ou expirada.");
  }

  const workspace = await dependencies.findOwnedWorkspace(workspaceId, user.id);
  if (!workspace) {
    throw new AiAuthorizationError(
      "workspace_forbidden",
      403,
      "Usuário sem acesso ao workspace solicitado.",
    );
  }

  if (conversationId) {
    if (!UUID_PATTERN.test(conversationId)) {
      throw new AiAuthorizationError(
        "WALLET_AI_INVALID_CONVERSATION",
        400,
        "ID de conversa inválido.",
      );
    }
    if (dependencies.verifyConversationOwnership) {
      const allowed = await dependencies.verifyConversationOwnership(conversationId, workspace.id, user.id);
      if (!allowed) {
        throw new AiAuthorizationError(
          "WALLET_AI_INVALID_CONVERSATION",
          403,
          "Conversa não pertence ao usuário ou workspace informado.",
        );
      }
    }
  }

  const result: Record<string, unknown> = {
    userId: user.id,
    workspaceId: workspace.id,
    accessToken,
  };
  if (conversationId) {
    result.conversationId = conversationId;
  }
  if (correlationId) {
    result.correlationId = correlationId;
  }
  if (dependencies.getUserRole) {
    result.role = await dependencies.getUserRole(workspace.id, user.id);
  }

  return Object.freeze(result as unknown as AiExecutionContext);
}
