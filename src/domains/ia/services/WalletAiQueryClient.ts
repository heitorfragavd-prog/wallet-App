type InvokeResult = Promise<{ data: unknown; error: { message?: string } | null }>;
export type SupabaseFunctionInvoker = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => InvokeResult;

export interface WalletAiQueryClient {
  query<T>(
    workspaceId: string | null | undefined,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<T>;
}

export function createWalletAiQueryClient(invoke: SupabaseFunctionInvoker): WalletAiQueryClient {
  return {
    async query<T>(workspaceId, tool, args): Promise<T> {
      if (!workspaceId) throw new Error("active_workspace_required");
      const { data, error } = await invoke("wallet-ai-query", {
        body: { workspace_id: workspaceId, tool, arguments: args },
      });
      if (error || !data || typeof data !== "object" || !("data" in data)) {
        throw new Error("wallet_ai_query_failed");
      }
      return (data as { data: T }).data;
    },
  };
}
