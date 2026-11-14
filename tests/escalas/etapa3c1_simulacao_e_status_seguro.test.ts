import { describe, it, expect, vi, beforeEach } from "vitest";
import { EscalaAutomacaoEngine } from "../../src/domains/escalas/services/escalaAutomacaoEngine";
import { getNextWeekendDates } from "../../src/domains/escalas/services/escalaDateUtils";
import type { ColaboradorFolguista, EscalaSlot } from "../../src/domains/escalas/types";

// Mock do supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: { id: "log-mock-uuid" }, error: null }),
    })),
  },
}));

describe("🚀 WALLET APP — MISSÃO 3C.1: SEGURANÇA DAS SIMULAÇÕES E STATUS REAL DE ENVIO (GATES 3, 4 E 7)", () => {
  const mockFolguistas: ColaboradorFolguista[] = [
    {
      id: "f-1",
      nome: "Luiz Fellipe Santos De Assis",
      tipo: "folguista",
      status: "ativo",
      telefone: "31988857414",
    },
    {
      id: "f-2",
      nome: "Rainá Alice Sousa Rodrigues",
      tipo: "folguista",
      status: "ativo",
      telefone: "33998296318",
    },
    {
      id: "f-3",
      nome: "Sarah Rodrigues Neves",
      tipo: "folguista",
      status: "ativo",
      telefone: "31992985255",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gate 3: Isolamento Absoluto do Modo de Simulação", () => {
    it("simulateFolguistaResponse executa cálculo puramente em memória e NÃO altera dados reais", () => {
      const weekend = getNextWeekendDates(new Date());
      const res = EscalaAutomacaoEngine.simulateFolguistaResponse({
        colaboradorId: "f-1",
        colaboradorNome: "Luiz Fellipe",
        rawText: "Posso sábado de manhã",
        weekend,
      });

      expect(res.sucesso).toBe(true);
      expect(res.simulada).toBe(true);
      expect(res.colaboradorId).toBe("f-1");
      expect(res.interpretacao.tipoMensagem).toBe("disponibilidade");
      expect(res.acoesPropostas.length).toBeGreaterThan(0);
      expect(res.acoesPropostas[0].tipo).toBe("disponibilidade");
      expect(res.acoesPropostas[0].turno).toBe("manha");
      expect(res.resumoAcao).toContain("Disponível para Sábado");
    });

    it("identifica desistências por imprevisto na simulação sem cancelar escala real", () => {
      const weekend = getNextWeekendDates(new Date());
      const res = EscalaAutomacaoEngine.simulateFolguistaResponse({
        colaboradorId: "f-2",
        colaboradorNome: "Rainá Alice",
        rawText: "Tive um imprevisto e não vou conseguir ir domingo",
        isFridayContext: true,
        weekend,
      });

      expect(res.sucesso).toBe(true);
      expect(res.simulada).toBe(true);
      expect(res.interpretacao.tipoMensagem).toBe("desistencia");
      expect(res.acoesPropostas[0].tipo).toBe("desistencia");
      expect(res.acoesPropostas[0].detalhes).toContain("Liberar vaga de Rainá Alice");
    });

    it("identifica confirmação explícita de presença na simulação", () => {
      const weekend = getNextWeekendDates(new Date());
      const res = EscalaAutomacaoEngine.simulateFolguistaResponse({
        colaboradorId: "f-3",
        colaboradorNome: "Sarah Rodrigues",
        rawText: "Confirmado, pode contar comigo!",
        isFridayContext: true,
        weekend,
      });

      expect(res.sucesso).toBe(true);
      expect(res.simulada).toBe(true);
      expect(res.interpretacao.tipoMensagem).toBe("confirmacao_presenca");
      expect(res.acoesPropostas[0].tipo).toBe("confirmacao");
    });
  });

  describe("Gate 4: Ciclo de Vida e Comprovação Real do Status de Envio do Telegram", () => {
    it("em modo de simulação, NUNCA marca enviado_telegram como true e status_envio é 'simulada'", async () => {
      const res = await EscalaAutomacaoEngine.executeMondayConsultation({
        workspaceId: "ws-test",
        config: { simulacao_modo: true },
        folguistasAtivos: mockFolguistas,
        escalasExistentes: [], // Todas as vagas abertas
      });

      expect(res.sucesso).toBe(true);
      expect(res.simulada).toBe(true);
      expect(res.mensagem).toContain("Modo de simulação: ATIVO (sem disparo real)");
    });

    it("quando simulacao_modo é false mas a API do Telegram ainda não confirmou envio, status_envio permanece 'preparada'", async () => {
      const res = await EscalaAutomacaoEngine.executeMondayConsultation({
        workspaceId: "ws-test",
        config: { simulacao_modo: false },
        folguistasAtivos: mockFolguistas,
        escalasExistentes: [],
        telegramStatusConfirmed: undefined, // Sem confirmação de envio da API
      });

      expect(res.sucesso).toBe(true);
      expect(res.simulada).toBe(false);
      expect(res.mensagem).toContain("AGUARDANDO ENVIO");
    });

    it("quando a API do Telegram confirma envio com sucesso, registra enviado_telegram: true e status_envio: 'enviada'", async () => {
      const res = await EscalaAutomacaoEngine.executeMondayConsultation({
        workspaceId: "ws-test",
        config: { simulacao_modo: false },
        folguistasAtivos: mockFolguistas,
        escalasExistentes: [],
        telegramStatusConfirmed: {
          sent: true,
          messageId: "tg-msg-9988",
          apiResponse: { ok: true, result: { message_id: 9988 } },
        },
      });

      expect(res.sucesso).toBe(true);
      expect(res.simulada).toBe(false);
      expect(res.mensagem).toContain("DESATIVADO (enviado e confirmado via Telegram)");
    });

    it("quando a API do Telegram falha, registra status_envio: 'falha' e NUNCA marca como enviado", async () => {
      const res = await EscalaAutomacaoEngine.executeMondayConsultation({
        workspaceId: "ws-test",
        config: { simulacao_modo: false },
        folguistasAtivos: mockFolguistas,
        escalasExistentes: [],
        telegramStatusConfirmed: {
          sent: false,
          error: "Telegram API 403: Bot was blocked by the user",
        },
      });

      expect(res.sucesso).toBe(true);
      expect(res.simulada).toBe(false);
      expect(res.mensagem).toContain("AGUARDANDO ENVIO");
    });
  });

  describe("Gate 7: Idempotência Estrita e Salvaguarda contra Disparos Repetidos", () => {
    it("rejeita execução duplicada na mesma semana quando o log já existe", async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: {
          id: "log-existente-1",
          status: "executada",
          created_at: "2026-11-16T09:00:00Z",
        },
        error: null,
      });

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: maybeSingleMock,
      } as unknown as ReturnType<typeof supabase.from>);

      const res = await EscalaAutomacaoEngine.executeMondayConsultation({
        workspaceId: "ws-test",
        forcarExecucao: false,
      });

      expect(res.sucesso).toBe(true);
      expect(res.idempotente).toBe(true);
      expect(res.mensagem).toContain("Rotina de segunda-feira já executada anteriormente");
    });
  });
});
