import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
vi.mock("@/core/logging/LoggerService", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../services/WalletAiOrchestratorClient", async (_imp) => {
  class WalletAiOrchestratorError extends Error { constructor(m: string) { super(m); this.name = "WalletAiOrchestratorError"; } }
  class WalletAiOrchestratorClient { sendMessage = mocks.sendMessage; constructor(_o: unknown) {} }
  return { WalletAiOrchestratorClient, WalletAiOrchestratorError };
});
import { useWalletIA } from "./useWalletIA";
const mockFast = vi.fn().mockReturnValue("R$ 15.000 em receitas.");
const dados = { receitas: [{ valor: 15000, data: "2026-08-01", descricao: "V" }], despesas: [{ valor: 5000, data: "2026-08-01", descricao: "C" }], contas: [{ nome: "Conta", saldo_atual: 10000, tipo: "corrente" }] };
const opts = { workspaceId: "ws-123", conversaId: "conv-123", dadosFinanceiros: dados, fastQueryFn: mockFast };
const ok = (c = "OK") => ({ success: true, message: { role: "assistant", content: c }, toolCalls: [], iterations: 1, usage: {}, estimatedCostUsd: 0, loopDetected: false, maxIterationsReached: false });
describe("useWalletIA", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.sendMessage.mockResolvedValue(ok()); mockFast.mockReturnValue("R$ 15.000 em receitas."); });
  describe("Roteamento", () => {
    it("FAST_QUERY: usa fastQueryFn, nao orchestrator", async () => {
      const { result } = renderHook(() => useWalletIA(opts));
      await act(async () => { await result.current.sendMessage("Quanto vendi hoje?"); });
      expect(mockFast).toHaveBeenCalledWith("Quanto vendi hoje?");
      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(result.current.messages.at(-1)?.routeUsed).toBe("FAST_QUERY");
    });
    it("AGENT_V2: 'Compare agosto com julho' vai para orchestrator", async () => {
      const { result } = renderHook(() => useWalletIA(opts));
      await act(async () => { await result.current.sendMessage("Compare agosto com julho"); });
      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      expect(mockFast).not.toHaveBeenCalled();
      expect(result.current.messages.at(-1)?.routeUsed).toBe("AGENT_V2");
    });
    it("AGENT_V2: 'por que caiu' nao e FAST_QUERY", async () => {
      const { result } = renderHook(() => useWalletIA(opts));
      await act(async () => { await result.current.sendMessage("Quanto vendi e por que caiu?"); });
      expect(mocks.sendMessage).toHaveBeenCalledOnce(); expect(mockFast).not.toHaveBeenCalled();
    });
    it("sem fastQueryFn: cai para orchestrator", async () => {
      const { result } = renderHook(() => useWalletIA({ ...opts, fastQueryFn: undefined }));
      await act(async () => { await result.current.sendMessage("saldo atual"); });
      expect(mocks.sendMessage).toHaveBeenCalledOnce();
    });
  });
  describe("Multi-turn", () => {
    it("segunda mensagem inclui historico da primeira", async () => {
      mocks.sendMessage.mockResolvedValueOnce(ok("Ago")).mockResolvedValueOnce(ok("Jul"));
      const { result } = renderHook(() => useWalletIA({ ...opts, fastQueryFn: undefined }));
      await act(async () => { await result.current.sendMessage("Agosto?"); });
      await act(async () => { await result.current.sendMessage("E julho?"); });
      const msgs = mocks.sendMessage.mock.calls[1][0].messages;
      expect(msgs.length).toBeGreaterThanOrEqual(3);
      expect(msgs.map((m: { content: string }) => m.content)).toContain("Agosto?");
    });
    it("FAST + AGENT_V2 mantem 4 mensagens", async () => {
      const { result } = renderHook(() => useWalletIA(opts));
      await act(async () => { await result.current.sendMessage("saldo atual"); });
      await act(async () => { await result.current.sendMessage("Explique fluxo de caixa detalhado"); });
      expect(result.current.messages).toHaveLength(4);
      expect(result.current.messages[1].routeUsed).toBe("FAST_QUERY");
      expect(result.current.messages[3].routeUsed).toBe("AGENT_V2");
    });
  });
  describe("Workspace isolation", () => {
    it("workspaceId passado ao orchestrator", async () => {
      const { result } = renderHook(() => useWalletIA({ ...opts, fastQueryFn: undefined }));
      await act(async () => { await result.current.sendMessage("Quanto vendi?"); });
      expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-123" }));
    });
    it("sem workspaceId: erro sem inventar dados", async () => {
      const { result } = renderHook(() => useWalletIA({ ...opts, workspaceId: undefined, fastQueryFn: undefined }));
      await act(async () => { await result.current.sendMessage("Saldo?"); });
      const e = result.current.messages.at(-1);
      expect(e?.isError).toBe(true); expect(e?.content).toMatch(/workspace/i);
      expect(e?.content).not.toMatch(/R\$\s*\d/); expect(mocks.sendMessage).not.toHaveBeenCalled();
    });
  });
  describe("Fallback seguro", () => {
    it("orchestrator falha: nao inventa valor", async () => {
      mocks.sendMessage.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useWalletIA({ ...opts, fastQueryFn: undefined }));
      await act(async () => { await result.current.sendMessage("Saldo agora?"); });
      const e = result.current.messages.at(-1);
      expect(e?.isError).toBe(true); expect(e?.content).not.toMatch(/R\$\s*\d/); expect(e?.correlationId).toBeDefined();
    });
    it("orchestrator falha: mensagem com correlationId", async () => {
      mocks.sendMessage.mockRejectedValueOnce(new Error("timeout"));
      const { result } = renderHook(() => useWalletIA({ ...opts, fastQueryFn: undefined }));
      await act(async () => { await result.current.sendMessage("Fluxo?"); });
      const e = result.current.messages.at(-1);
      expect(e?.isError).toBe(true); expect(e?.content).toMatch(/erro|nao consegui|codigo/i);
    });
  });
  describe("Historico e sidebar", () => {
    it("clearChat limpa mensagens", async () => {
      const { result } = renderHook(() => useWalletIA(opts));
      await act(async () => { await result.current.sendMessage("saldo atual"); });
      expect(result.current.messages.length).toBeGreaterThan(0);
      act(() => { result.current.clearChat(); });
      expect(result.current.messages).toHaveLength(0);
    });
    it("loadHistory substitui mensagens", () => {
      const { result } = renderHook(() => useWalletIA(opts));
      act(() => { result.current.loadHistory([{ id: "1", role: "user" as const, content: "Ola", createdAt: new Date() }, { id: "2", role: "assistant" as const, content: "Oi", createdAt: new Date() }]); });
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].content).toBe("Ola");
    });
    it("nova conversa pos-clear: apenas 2 msgs", async () => {
      const { result } = renderHook(() => useWalletIA(opts));
      await act(async () => { await result.current.sendMessage("saldo atual"); });
      act(() => { result.current.clearChat(); });
      await act(async () => { await result.current.sendMessage("receitas hoje?"); });
      expect(result.current.messages).toHaveLength(2);
    });
    it("onMessagePersist chamado com conversaId", async () => {
      const persist = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useWalletIA({ ...opts, onMessagePersist: persist }));
      await act(async () => { await result.current.sendMessage("saldo atual"); });
      expect(persist).toHaveBeenCalledWith(expect.objectContaining({ role: "user" }), "conv-123");
    });
  });
});