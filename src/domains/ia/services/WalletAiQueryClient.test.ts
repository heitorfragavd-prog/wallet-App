import { describe, expect, it, vi } from "vitest";
import { createWalletAiQueryClient } from "./WalletAiQueryClient";

describe("WalletAiQueryClient", () => {
  it("fails before invoking the server when no workspace is active", async () => {
    const invoke = vi.fn();
    const client = createWalletAiQueryClient(invoke);
    await expect(client.query(null, "consultar_saldos", {})).rejects.toThrow("active_workspace_required");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sends only workspace, tool and arguments to the secure Edge Function", async () => {
    const invoke = vi.fn(async () => ({ data: { data: { availableBalance: 100 } }, error: null }));
    const client = createWalletAiQueryClient(invoke);
    await expect(client.query("workspace-1", "consultar_saldos", {})).resolves.toEqual({
      availableBalance: 100,
    });
    expect(invoke).toHaveBeenCalledWith("wallet-ai-query", {
      body: { workspace_id: "workspace-1", tool: "consultar_saldos", arguments: {} },
    });
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain("user_id");
  });

  it("surfaces a stable error when the Edge Function rejects the request", async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { message: "FunctionsHttpError" } }));
    const client = createWalletAiQueryClient(invoke);
    await expect(client.query("workspace-1", "consultar_saldos", {})).rejects.toThrow(
      "wallet_ai_query_failed",
    );
  });
});
