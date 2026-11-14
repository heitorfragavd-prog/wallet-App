// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getNextWeekendDates, isMondayInSaoPaulo, isFridayInSaoPaulo } from "../../src/domains/escalas/services/escalaDateUtils";
import { EscalaAutomacaoEngine } from "../../src/domains/escalas/services/escalaAutomacaoEngine";
import type { ColaboradorFolguista, EscalaSlot, EscalasConfig } from "../../src/domains/escalas/types";
import { buildGroupSystemPrompt } from "../../supabase/functions/_shared/ai/group-governance";

describe("🚀 WALLET APP — ETAPA 3C: Automações Semanais dos Folguistas", () => {
  describe("1. Cálculo de Datas e Fuso Horário de São Paulo", () => {
    it("deve calcular o próximo sábado e domingo a partir de uma segunda-feira", () => {
      // 2026-11-16 é segunda-feira
      const refMonday = new Date("2026-11-16T12:00:00Z");
      const weekend = getNextWeekendDates(refMonday);

      expect(weekend.sabado).toBe("2026-11-21");
      expect(weekend.domingo).toBe("2026-11-22");
      expect(weekend.sabadoFormatado).toBe("21/11");
      expect(weekend.domingoFormatado).toBe("22/11");
      expect(weekend.sabadoExtenso).toContain("21 de novembro");
      expect(weekend.domingoExtenso).toContain("22 de novembro");
    });

    it("deve identificar o fim de semana em andamento quando a referência for sábado", () => {
      // 2026-11-21 é sábado
      const refSaturday = new Date("2026-11-21T14:00:00Z");
      const weekend = getNextWeekendDates(refSaturday);

      expect(weekend.sabado).toBe("2026-11-21");
      expect(weekend.domingo).toBe("2026-11-22");
    });

    it("deve identificar corretamente se é segunda-feira ou sexta-feira no fuso de Brasília", () => {
      const monday = new Date("2026-11-16T12:00:00Z");
      const friday = new Date("2026-11-20T17:00:00Z");

      expect(isMondayInSaoPaulo(monday)).toBe(true);
      expect(isFridayInSaoPaulo(monday)).toBe(false);
      expect(isFridayInSaoPaulo(friday)).toBe(true);
      expect(isMondayInSaoPaulo(friday)).toBe(false);
    });
  });

  describe("2. Gate 2: Identificação de Vagas Abertas e Mensagem de Segunda-feira", () => {
    it("deve detectar vagas não preenchidas no sábado e domingo", () => {
      const escalas: EscalaSlot[] = [
        {
          data: "2026-11-21",
          diaSemana: "sabado",
          turno: "manha",
          horarioInicio: "05:00",
          horarioFim: "13:30",
          colaboradorId: "colab-1",
          colaboradorNome: "Maria",
          valorDiaria: 100,
          status: "confirmada",
        },
        // Sábado noite está vago
        // Domingo manhã está vago
        // Domingo noite está vago
      ];

      const vagas = EscalaAutomacaoEngine.identifyUncoveredWeekendSlots({
        sabadoDate: "2026-11-21",
        domingoDate: "2026-11-22",
        escalasExistentes: escalas,
      });

      expect(vagas.length).toBe(3);
      expect(vagas.some((v) => v.data === "2026-11-21" && v.turno === "noite")).toBe(true);
      expect(vagas.some((v) => v.data === "2026-11-22" && v.turno === "manha")).toBe(true);
      expect(vagas.some((v) => v.data === "2026-11-22" && v.turno === "noite")).toBe(true);
    });

    it("deve formatar a mensagem de consulta com as datas reais e turnos descobertos", () => {
      const vagas = [
        {
          data: "2026-11-21",
          diaSemana: "sabado" as const,
          turno: "noite" as const,
          horarioInicio: "15:00",
          horarioFim: "23:30",
          descricaoTurno: "Noite",
        },
      ];

      const msg = EscalaAutomacaoEngine.buildMondayConsultationMessage({
        sabadoDate: "2026-11-21",
        domingoDate: "2026-11-22",
        sabadoExtenso: "21 de novembro",
        domingoExtenso: "22 de novembro",
        vagas,
      });

      expect(msg).toContain("RODO POINT — DISPONIBILIDADE DO FIM DE SEMANA");
      expect(msg).toContain("21/11/2026");
      expect(msg).toContain("15:00 às 23:30");
      expect(msg).toContain("Escala de domingo já coberta!");
    });
  });

  describe("3. Gate 5: Reconfirmação de Sexta-feira", () => {
    it("deve gerar mensagem individualizada para o colaborador escalado", () => {
      const msg = EscalaAutomacaoEngine.buildFridayConfirmationMessage({
        colaboradorNome: "Luiz Fellipe Santos",
        data: "2026-11-21",
        diaSemanaExtenso: "Sábado",
        horarioInicio: "05:00",
        horarioFim: "14:30",
        descricaoTurno: "Manhã (Abertura)",
      });

      expect(msg).toContain("Bom dia, Luiz!");
      expect(msg).toContain("Sábado, 21/11/2026");
      expect(msg).toContain("05:00 às 14:30");
      expect(msg).toContain("Pode confirmar sua presença?");
    });
  });

  describe("4. Gate 4 & Gate 6: Busca de Substitutos e Regras Rígidas CLT", () => {
    const folguistasMock: ColaboradorFolguista[] = [
      {
        id: "f1",
        workspace_id: "ws-1",
        nome: "Luiz Fellipe",
        tipo: "folguista",
        status: "ativo",
        valor_diaria: 100,
        turnos_preferidos: ["manha"],
        dias_disponiveis: ["sabado"],
        avaliacao_nota: 5.0,
      },
      {
        id: "f2-suellen",
        workspace_id: "ws-1",
        nome: "Shuellen Pereira",
        tipo: "folguista",
        status: "ativo",
        valor_diaria: 100,
        turnos_preferidos: ["noite"],
        dias_disponiveis: ["domingo"],
        avaliacao_nota: 4.8,
      },
      {
        id: "f3-rainha",
        workspace_id: "ws-1",
        nome: "Rainá Alice",
        tipo: "folguista",
        status: "ativo",
        valor_diaria: 100,
        turnos_preferidos: ["manha", "noite"],
        dias_disponiveis: ["sabado", "domingo"],
        avaliacao_nota: 4.9,
      },
    ];

    it("NÃO deve recomendar colaborador para sábado manhã se ele fechou na sexta (23h30)", () => {
      const candidates = EscalaAutomacaoEngine.findSubstitutesForSlot({
        workspaceId: "ws-1",
        data: "2026-11-21",
        turno: "manha",
        fridayNightColaboradorId: "f1", // Luiz fechou na sexta
        folguistas: folguistasMock,
      });

      const candLuiz = candidates.find((c) => c.colaborador.id === "f1");
      expect(candLuiz?.atendeDescansoClt).toBe(false);
      expect(candLuiz?.restricoes[0]).toContain("Fechou na sexta às 23h30");
      expect(candLuiz?.recomendado).toBe(false);

      // Rainá não trabalhou na sexta e deve ser a recomendada
      const candRaina = candidates.find((c) => c.colaborador.id === "f3-rainha");
      expect(candRaina?.atendeDescansoClt).toBe(true);
      expect(candRaina?.recomendado).toBe(true);
    });

    it("NÃO deve recomendar Suellen para domingo à noite se ela abre segunda às 05h00", () => {
      const candidates = EscalaAutomacaoEngine.findSubstitutesForSlot({
        workspaceId: "ws-1",
        data: "2026-11-22",
        turno: "noite",
        mondayMorningColaboradorId: "f2-suellen", // Suellen abre na segunda
        folguistas: folguistasMock,
      });

      const candSuellen = candidates.find((c) => c.colaborador.id === "f2-suellen");
      expect(candSuellen?.atendeDescansoClt).toBe(false);
      expect(candSuellen?.restricoes[0]).toContain("Suellen escala segunda às 05h00");
      expect(candSuellen?.recomendado).toBe(false);
    });
  });

  describe("5. Gate 10: Segurança da IA e Sigilo do Grupo de Folguistas", () => {
    it("deve instruir expressamente a proibição de dados financeiros no grupo de folguistas", () => {
      const prompt = buildGroupSystemPrompt(
        "Base system prompt",
        "folguistas",
        "👥 Folguistas Rodo Point"
      );

      expect(prompt).toContain("FOLGUISTAS RODO POINT & ESCALAS");
      expect(prompt).toContain("SIGILO OBRIGATÓRIO");
      expect(prompt).toContain("TERMINANTEMENTE PROIBIDO expor dados financeiros");
      expect(prompt).toContain("lucro líquido, DRE, margens, faturamento global");
      expect(prompt).toContain("COMUNICAÇÃO NATURAL E HUMANA");
      expect(prompt).toContain("educado, claro, objetivo, simpático");
    });
  });
});
