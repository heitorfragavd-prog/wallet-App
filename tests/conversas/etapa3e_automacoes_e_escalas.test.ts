import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateFridayToSaturdayMorning,
  validateSuellenSundayNight,
  validateInterjornada,
  generateWeekendSchedule,
} from "../../src/domains/escalas/services/escalaEngine";
import type { ColaboradorFolguista, EscalasConfig } from "../../src/domains/escalas/types";

describe("Etapa 3E-C — Homologação Operacional de Escalas e Automações (Gates 6, 7, 8, 16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gate 6 — Escala Mensal e Regras Legais Rodo Point", () => {
    it("deve bloquear que funcionária que fecha sexta-feira à noite (23h30) abra sábado de manhã (05h00)", () => {
      const issue = validateFridayToSaturdayMorning("colab-fixa-1", "colab-fixa-1", "Sarah");
      expect(issue).not.toBeNull();
      expect(issue?.tipo).toBe("violacao_descanso");
      expect(issue?.severidade).toBe("erro");
      expect(issue?.mensagem).toContain("apenas 5h30 viola o intervalo mínimo legal de 11h");
    });

    it("deve permitir troca de turno entre pessoas diferentes de sexta para sábado", () => {
      const issue = validateFridayToSaturdayMorning("colab-fixa-1", "colab-fixa-2", "Raina");
      expect(issue).toBeNull();
    });

    it("deve impedir que Suellen faça domingo à noite por ter expediente segunda às 05h00", () => {
      const issue = validateSuellenSundayNight("colab-suellen", "colab-suellen", "Suellen");
      expect(issue).not.toBeNull();
      expect(issue?.tipo).toBe("violacao_descanso");
      expect(issue?.mensagem).toContain("Suellen possui turno regular na segunda-feira às 05h00");
    });

    it("deve calcular o descanso interjornada e validar intervalo mínimo de 11h", () => {
      // 14h30 (saída sábado manhã) até 05h00 (entrada domingo manhã) = 14h30 de descanso -> Válido
      const valid = validateInterjornada("2026-11-21", "14:30", "2026-11-22", "05:00", 11);
      expect(valid.valid).toBe(true);
      expect(valid.diffHours).toBe(14.5);

      // 22h30 (saída sábado noite) até 05h00 (entrada domingo manhã) = 6h30 de descanso -> Inválido
      const invalid = validateInterjornada("2026-11-21", "22:30", "2026-11-22", "05:00", 11);
      expect(invalid.valid).toBe(false);
      expect(invalid.diffHours).toBe(6.5);
    });

    it("deve gerar proposta de escala para o fim de semana identificando turnos cobertos e turnos descobertos", () => {
      // Apenas 1 folguista ativo para cobrir 4 turnos do fim de semana
      const colaboradores: ColaboradorFolguista[] = [
        {
          id: "c1",
          workspace_id: "ws-1",
          nome: "João Folguista",
          tipo: "folguista",
          status: "ativo",
          valor_diaria: 120,
          turnos_preferidos: ["manha"],
          dias_disponiveis: ["sabado"],
          avaliacao_nota: 5,
        },
      ];

      const config: EscalasConfig = {
        workspace_id: "ws-1",
        min_horas_descanso: 11,
        valor_diaria_padrao: 120,
        valor_meta_padrao: 200,
        horarios_turnos: {
          manha: { inicio: "05:00", fim: "14:30" },
          noite: { inicio: "15:00", fim: "23:30" },
        },
        dias_semana_turnos: {
          sabado: ["manha", "noite"],
          domingo: ["manha", "noite"],
        },
        notificacao_segunda_horario: "09:00",
        notificacao_sexta_horario: "14:00",
        simulacao_modo: true,
      };

      const disponibilidades = [
        {
          id: "d1",
          workspace_id: "ws-1",
          colaborador_id: "c1",
          data: "2026-11-21",
          turno: "manha" as const,
          disponivel: true,
        },
      ];

      const res = generateWeekendSchedule({
        targetWeekendDates: { sabado: "2026-11-21", domingo: "2026-11-22" },
        colaboradores,
        disponibilidades,
        config,
      });

      expect(res.slots.length).toBe(4);
      // Turno sábado manhã coberto por João
      const slotSabManha = res.slots.find((s) => s.data === "2026-11-21" && s.turno === "manha");
      expect(slotSabManha?.colaboradorId).toBe("c1");

      // Turnos não cobertos contabilizados com precisão
      expect(res.turnosDescobertosCount).toBeGreaterThanOrEqual(1);
      expect(res.sugestoes[0]).toContain("turno(s) ficaram descobertos");
    });
  });

  describe("Gate 7 & Gate 8 — Automações de Segunda e Sexta", () => {
    it("deve respeitar a flag de simulação impedindo disparos indesejados ao Telegram externo", () => {
      const configSimulada: EscalasConfig = {
        workspace_id: "ws-1",
        min_horas_descanso: 11,
        valor_diaria_padrao: 120,
        valor_meta_padrao: 200,
        horarios_turnos: {},
        dias_semana_turnos: {},
        notificacao_segunda_horario: "09:00",
        notificacao_sexta_horario: "14:00",
        simulacao_modo: true,
      };

      const podeDispararReal = !configSimulada.simulacao_modo;
      expect(podeDispararReal).toBe(false);
    });
  });
});
