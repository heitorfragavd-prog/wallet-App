import { describe, expect, it, vi } from "vitest";
import {
  AiAuthorizationError,
  authorizeAiRequest,
  type AuthorizationDependencies,
} from "../../../../supabase/functions/_shared/ai/auth";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

function dependencies(overrides: Partial<AuthorizationDependencies> = {}): AuthorizationDependencies {
  return {
    getUser: vi.fn(async () => ({ id: USER_ID })),
    findOwnedWorkspace: vi.fn(async () => ({ id: WORKSPACE_ID })),
    ...overrides,
  };
}

function request(authorization?: string): Request {
  return new Request("https://wallet.test/functions/v1/wallet-ai-query", {
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

describe("authorizeAiRequest", () => {
  it("rejects a request without bearer token", async () => {
    await expect(authorizeAiRequest(request(), WORKSPACE_ID, dependencies())).rejects.toMatchObject({
      code: "missing_authorization",
      status: 401,
    } satisfies Partial<AiAuthorizationError>);
  });

  it("rejects a malformed bearer token", async () => {
    await expect(
      authorizeAiRequest(request("Basic abc"), WORKSPACE_ID, dependencies()),
    ).rejects.toMatchObject({ code: "invalid_authorization", status: 401 });
  });

  it("rejects an invalid workspace identifier before querying", async () => {
    const deps = dependencies();
    await expect(authorizeAiRequest(request("Bearer token"), "not-a-uuid", deps)).rejects.toMatchObject({
      code: "invalid_workspace",
      status: 400,
    });
    expect(deps.getUser).not.toHaveBeenCalled();
  });

  it("rejects a token that Supabase Auth cannot validate", async () => {
    const deps = dependencies({ getUser: vi.fn(async () => null) });
    await expect(authorizeAiRequest(request("Bearer invalid"), WORKSPACE_ID, deps)).rejects.toMatchObject({
      code: "invalid_token",
      status: 401,
    });
  });

  it("rejects a workspace not owned by the authenticated user", async () => {
    const deps = dependencies({ findOwnedWorkspace: vi.fn(async () => null) });
    await expect(authorizeAiRequest(request("Bearer valid"), WORKSPACE_ID, deps)).rejects.toMatchObject({
      code: "workspace_forbidden",
      status: 403,
    });
    expect(deps.findOwnedWorkspace).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
  });

  it("returns an immutable server-derived execution context", async () => {
    const context = await authorizeAiRequest(request("Bearer valid"), WORKSPACE_ID, dependencies());

    expect(context).toEqual({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      accessToken: "valid",
    });
    expect(Object.isFrozen(context)).toBe(true);
  });
});
