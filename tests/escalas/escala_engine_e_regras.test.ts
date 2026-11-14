// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  calculateRestHours,
  validateInterjornada,
  validateFridayToSaturdayMorning,
  validateSuellenSundayNight,
  generateWeekendSchedule,
} from "../../src/domains/escalas/services/escalaEngine";
import type {
  ColaboradorFolguista,
  DisponibilidadeFolguista,
  EscalasConfig,
} from "../../src/domains/escalas/types";

describe("Etapa 3B — Motor de Escalas e Regras de Negócio", () => {
  it("calcula com exatidão as horas de descanso entre o término e início de turnos", () => {
    // Sexta 23h30 até Sábado 05h00 -> 5.5 horas
    const restFridayToSaturday = calculateRestHours(
      "2026-11-13",
      "23:30",
      "2026-11-14",
      "05:00",
    );
    expect(restFridayToSaturday).toBe(5.5);

    // Sábado 13h30 até Domingo 05h00 -> 15.5 horas
    const restSatToSunMorning = calculateRestHours(
      "2026-11-14",
      "13:30",
      "2026-11-15",
      "05:00",
    );
    expect(restSatToSunMorning).toBe(15.5);

    // Validação interjornada
    const checkBad = validateInterjornada("2026-11-13", "23:30", "2026-11-14", "05:00", 11);
    expect(checkBad.valid).toBe(false);
    expect(checkBad.diffHours).toBe(5.5);

    const checkGood = validateInterjornada("2026-11-14", "13:30", "2026-11-15", "05:00", 11);
    expect(checkGood.valid).toBe(true);
    expect(checkGood.diffHours).toBe(15.5);
  });

  it("REGRA 1: impede terminantemente alocação no sábado de manhã de quem fechou na sexta-feira à noite", () => {
    const issue = validateFridayToSaturdayMorning(
      "sarah-id",
      "sarah-id",
      "Sarah Rodrigues Neves",
    );
    expect(issue).not.toBeNull();
    expect(issue?.tipo).toBe("violacao_descanso");
    expect(issue?.severidade).toBe("erro");
    expect(issue?.mensagem).toContain("fecha na sexta (23h30) e não pode abrir no sábado (05h00)");

    // Diferentes pessoas -> sem infração
    const issueDiff = validateFridayToSaturdayMorning(
      "sarah-id",
      "suellen-id",
      "Suellen",
    );
    expect(issueDiff).toBeNull();
  });

  it("REGRA 2: impede que Suellen assuma o turno da noite no domingo para proteger sua abertura na segunda-feira", () => {
    const issue = validateSuellenSundayNight(
      "suellen-id",
      "suellen-id",
      "Suellen",
    );
    expect(issue).not.toBeNull();
    expect(issue?.tipo).toBe("violacao_descanso");
    expect(issue?.mensagem).toContain("não pode realizar o turno da noite no domingo");

    // Outra pessoa no domingo à noite -> permitido
    const issueOther = validateSuellenSundayNight(
      "raina-id",
      "suellen-id",
      "Suellen",
    );
    expect(issueOther).toBeNull();
  });

  it("REGRA 4 & 5: gera escala para o fim de semana respeitando disponibilidades e evitando sobrecargas", () => {
    const mockColaboradores: ColaboradorFolguista[] = [
      {
        id: "folguista-1",
        workspace_id: "ws-1",
        nome: "Rainá Rodrigues",
        tipo: "folguista",
        status: "ativo",
        valor_diaria: 100,
        turnos_preferidos: ["manha", "intermediario"],
        dias_disponiveis: ["sabado", "domingo"],
        avaliacao_nota: 5.0,
      },
      {
        id: "folguista-2",
        workspace_id: "ws-1",
        nome: "Luiz Fellipe",
        tipo: "folguista",
        status: "ativo",
        valor_diaria: 100,
        turnos_preferidos: ["intermediario", "noite"],
        dias_disponiveis: ["sabado", "domingo"],
        avaliacao_nota: 4.8,
      },
      {
        id: "folguista-3",
        workspace_id: "ws-1",
        nome: "Sarah Neves",
        tipo: "folguista",
        status: "ativo",
        valor_diaria: 100,
        turnos_preferidos: ["noite"],
        dias_disponiveis: ["sabado", "domingo"],
        avaliacao_nota: 4.9,
      },
      {
        id: "folguista-4",
        workspace_id: "ws-1",
        nome: "Folguista Apoio",
        tipo: "folguista",
        status: "ativo",
        valor_diaria: 100,
        turnos_preferidos: ["manha"],
        dias_disponiveis: ["sabado", "domingo"],
        avaliacao_nota: 4.5,
      },
    ];

    const mockDisponibilidades: DisponibilidadeFolguista[] = [
      // Luiz Fellipe indisponível sábado de manhã
      {
        id: "disp-1",
        workspace_id: "ws-1",
        colaborador_id: "folguista-2",
        data_referencia: "2026-11-14",
        turno: "manha",
        disponivel: false,
        confirmado: true,
        origem: "telegram",
      },
    ];

    const mockConfig: EscalasConfig = {
      workspace_id: "ws-1",
      min_horas_descanso: 11,
      valor_diaria_padrao: 100,
      valor_meta_padrao: 20,
      horarios_turnos: {
        manha: { inicio: "05:00", fim: "13:30" },
        intermediario: { inicio: "12:00", fim: "20:30" },
        noite: { inicio: "15:00", fim: "23:30" },
      },
      dias_semana_turnos: {
        sabado: ["manha", "intermediario", "noite"],
        domingo: ["manha", "intermediario", "noite"],
      },
      notificacao_segunda_horario: "09:00",
      notificacao_sexta_horario: "14:00",
      simulacao_modo: false,
    };

    // Sarah fechou sexta à noite
    const result = generateWeekendSchedule({
      targetWeekendDates: { sabado: "2026-11-14", domingo: "2026-11-15" },
      colaboradores: mockColaboradores,
      disponibilidades: mockDisponibilidades,
      config: mockConfig,
      fridayNightColaboradorId: "folguista-3", // Sarah
    });

    expect(result.slots.length).toBe(6); // 3 no sábado + 3 no domingo

    // Sarah NÃO pode estar alocada no sábado de manhã
    const sabadoManha = result.slots.find(
      (s) => s.data === "2026-11-14" && s.turno === "manha",
    );
    expect(sabadoManha?.colaboradorId).not.toBe("folguista-3");

    // Luiz Fellipe NÃO pode estar no sábado de manhã porque estava indisponível
    expect(sabadoManha?.colaboradorId).not.toBe("folguista-2");

    // Nenhum colaborador pode ter 2 turnos no mesmo dia
    const colabsSabado = result.slots
      .filter((s) => s.data === "2026-11-14" && s.colaboradorId)
      .map((s) => s.colaboradorId);
    const uniqueSabado = new Set(colabsSabado);
    expect(colabsSabado.length).toBe(uniqueSabado.size);

    // Valida que não há infrações críticas de descanso
    const restViolations = result.violacoes.filter((v) => v.tipo === "violacao_descanso");
    expect(restViolations.length).toBe(0);
  });

  it("detecta turno descoberto quando a demanda excede os folguistas disponíveis", () => {
    const poucosColaboradores: ColaboradorFolguista[] = [
      {
        id: "folguista-solo",
        workspace_id: "ws-1",
        nome: "Único Folguista",
        tipo: "folguista",
        status: "ativo",
        valor_diaria: 100,
        turnos_preferidos: ["manha"],
        dias_disponiveis: ["sabado"],
        avaliacao_nota: 5.0,
      },
    ];

    const mockConfig: EscalasConfig = {
      workspace_id: "ws-1",
      min_horas_descanso: 11,
      valor_diaria_padrao: 100,
      valor_meta_padrao: 20,
      horarios_turnos: {
        manha: { inicio: "05:00", fim: "13:30" },
        intermediario: { inicio: "12:00", fim: "20:30" },
        noite: { inicio: "15:00", fim: "23:30" },
      },
      dias_semana_turnos: {
        sabado: ["manha", "intermediario", "noite"],
        domingo: ["manha", "intermediario", "noite"],
      },
      notificacao_segunda_horario: "09:00",
      notificacao_sexta_horario: "14:00",
      simulacao_modo: false,
    };

    const result = generateWeekendSchedule({
      targetWeekendDates: { sabado: "2026-11-14", domingo: "2026-11-15" },
      colaboradores: poucosColaboradores,
      disponibilidades: [],
      config: mockConfig,
    });

    // 2 turnos atendidos (sábado manhã e domingo manhã com 15h30 de descanso), 4 turnos descobertos
    expect(result.turnosDescobertosCount).toBe(4);
    const descobertos = result.violacoes.filter((v) => v.tipo === "turno_descoberto");
    expect(descobertos.length).toBe(4);
  });
});
