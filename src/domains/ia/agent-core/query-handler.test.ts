import { describe, expect, it, vi } from "vitest";
import { AiAuthorizationError } from "../../../../supabase/functions/_shared/ai/auth";
import {
  createWalletAiQueryHandler,
  type WalletAiQueryHandlerDependencies,
} from "../../../../supabase/functions/wallet-ai-query/handler";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

function dependencies(
  overrides: Partial<WalletAiQueryHandlerDependencies> = {},
): WalletAiQueryHandlerDependencies {
  return {
    authorize: vi.fn(async () =>
      Object.freeze({ userId: USER_ID, workspaceId: WORKSPACE_ID, accessToken: "secret" })
    ),
    executeTool: vi.fn(async (tool, args, context) => ({ tool, args, userId: context.userId })),
    writeAudit: vi.fn(async () => undefined),
    ...overrides,
  };
}

function request(body: unknown, method = "POST"): Request {
  return new Request("https://wallet.test/functions/v1/wallet-ai-query", {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer valid" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

describe("wallet-ai-query handler", () => {
  it("answers CORS preflight without authorizing", async () => {
    const deps = dependencies();
    const response = await createWalletAiQueryHandler(deps)(request(null, "OPTIONS"));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it("rejects methods other than POST", async () => {
    const response = await createWalletAiQueryHandler(dependencies())(request(null, "GET"));
    expect(response.status).toBe(405);
  });

  it("rejects client-controlled identity fields", async () => {
    const deps = dependencies();
    const response = await createWalletAiQueryHandler(deps)(request({
      workspace_id: WORKSPACE_ID,
      tool: "consultar_saldos",
      arguments: {},
      user_id: "attacker",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it("does not execute a tool when workspace authorization fails", async () => {
    const deps = dependencies({
      authorize: vi.fn(async () => {
        throw new AiAuthorizationError("workspace_forbidden", 403, "Sem acesso.");
      }),
    });
    const response = await createWalletAiQueryHandler(deps)(request({
      workspace_id: WORKSPACE_ID,
      tool: "consultar_saldos",
      arguments: {},
    }));
    expect(response.status).toBe(403);
    expect(deps.executeTool).not.toHaveBeenCalled();
  });

  it("executes an allowed read tool only after authorization", async () => {
    const callOrder: string[] = [];
    const deps = dependencies({
      authorize: vi.fn(async () => {
        callOrder.push("authorize");
        return Object.freeze({ userId: USER_ID, workspaceId: WORKSPACE_ID, accessToken: "secret" });
      }),
      executeTool: vi.fn(async () => {
        callOrder.push("tool");
        return { availableBalance: 500 };
      }),
    });
    const response = await createWalletAiQueryHandler(deps)(request({
      workspace_id: WORKSPACE_ID,
      tool: "consultar_saldos",
      arguments: {},
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { availableBalance: 500 } });
    expect(callOrder).toEqual(["authorize", "tool"]);
    expect(deps.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      tool: "consultar_saldos",
      status: "success",
    }));
  });

  it("returns a sanitized error without leaking internal messages", async () => {
    const deps = dependencies({
      executeTool: vi.fn(async () => {
        throw new Error("database password=secret");
      }),
    });
    const response = await createWalletAiQueryHandler(deps)(request({
      workspace_id: WORKSPACE_ID,
      tool: "consultar_saldos",
      arguments: {},
    }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("password");
  });

  it("returns a client error for a tool outside the read allowlist", async () => {
    const deps = dependencies({
      executeTool: vi.fn(async () => {
        throw new Error("tool_not_allowed");
      }),
    });
    const response = await createWalletAiQueryHandler(deps)(request({
      workspace_id: WORKSPACE_ID,
      tool: "executar_lancamento",
      arguments: {},
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "tool_not_allowed" } });
  });
});
