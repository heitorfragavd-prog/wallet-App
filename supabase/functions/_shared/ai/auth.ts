export interface AuthenticatedUser {
  id: string;
}

export interface OwnedWorkspace {
  id: string;
}

export interface AuthorizationDependencies {
  getUser(accessToken: string): Promise<AuthenticatedUser | null>;
  findOwnedWorkspace(workspaceId: string, userId: string): Promise<OwnedWorkspace | null>;
}

export interface AiExecutionContext {
  readonly userId: string;
  readonly workspaceId: string;
  readonly accessToken: string;
}

export type AiAuthorizationErrorCode =
  | "missing_authorization"
  | "invalid_authorization"
  | "invalid_workspace"
  | "invalid_token"
  | "workspace_forbidden";

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

  return Object.freeze({
    userId: user.id,
    workspaceId: workspace.id,
    accessToken,
  });
}
