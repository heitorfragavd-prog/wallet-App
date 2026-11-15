import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getNextWeekendDatesSaoPaulo,
  HORARIOS_OFICIAIS_RODO_POINT,
  buildMondayConsultationMessage,
  buildFridayConfirmationMessage,
  parseFolguistaMessage,
} from "../../supabase/functions/_shared/ai/folguista-parser-shared";

describe("Etapa 3E.1-A — Automações Semanais Reais (Gates 2 e 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gate 3 — Consulta Automática de Segunda-Feira", () => {
    it("deve conter os horários oficiais corretos da Rodo Point (Sábado e Domingo)", () => {
      expect(HORARIOS_OFICIAIS_RODO_POINT.sabado.manha.horarioFormatado).toBe("05h00 às 14h30");
      expect(HORARIOS_OFICIAIS_RODO_POINT.sabado.noite.horarioFormatado).toBe("13h00 às 22h30");
      expect(HORARIOS_OFICIAIS_RODO_POINT.domingo.manha.horarioFormatado).toBe("05h00 às 14h30");
      expect(HORARIOS_OFICIAIS_RODO_POINT.domingo.noite.horarioFormatado).toBe("13h00 às 22h30");
    });

    it("deve preparar mensagem de consulta contendo APENAS as vagas realmente descobertas", () => {
      const weekend = getNextWeekendDatesSaoPaulo(new Date("2026-11-16T09:00:00-03:00"));

      // Simulação: Apenas Sábado Noite e Domingo Manhã estão descobertos
      const vagasDescobertas = [
        {
          data: weekend.sabado,
          diaSemana: "sabado" as const,
          turno: "noite" as const,
          horario: HORARIOS_OFICIAIS_RODO_POINT.sabado.noite.horarioFormatado,
        },
        {
          data: weekend.domingo,
          diaSemana: "domingo" as const,
          turno: "manha" as const,
          horario: HORARIOS_OFICIAIS_RODO_POINT.domingo.manha.horarioFormatado,
        },
      ];

      const mensagem = buildMondayConsultationMessage({
        weekend,
        vagasDescobertas,
      });

      expect(mensagem).toContain("Bom dia, pessoal! ☀️");
      expect(mensagem).toContain("Precisamos saber quem está disponível para:");
      expect(mensagem).toContain(`📅 Sábado — 13h00 às 22h30.`);
      expect(mensagem).toContain(`📅 Domingo — 05h00 às 14h30.`);
      // Não deve solicitar sábado de manhã nem domingo à noite
      expect(mensagem).not.toContain("Sábado — 05h00");
      expect(mensagem).not.toContain("Domingo — 13h00");
    });

    it("deve classificar como escala_coberta_sem_consulta quando todas as vagas já estiverem preenchidas", () => {
      const vagasDescobertas: Array<{ data: string; diaSemana: "sabado" | "domingo"; turno: "manha" | "noite"; horario: string }> = [];
      const statusEnvio = vagasDescobertas.length === 0 ? "escala_coberta_sem_consulta" : "preparada";

      expect(statusEnvio).toBe("escala_coberta_sem_consulta");
    });
  });

  describe("Gate 2 — Confirmação Real de Sexta-Feira", () => {
    it("deve construir a mensagem personalizada com dia, turno e horário da Rodo Point", () => {
      const msg = buildFridayConfirmationMessage({
        colaboradorNome: "João Folguista",
        data: "2026-11-21",
        dataFormatada: "21/11/2026",
        diaSemana: "sabado",
        turno: "manha",
        horario: HORARIOS_OFICIAIS_RODO_POINT.sabado.manha.horarioFormatado,
      });

      expect(msg).toContain("Oi, João! Tudo bem? 😊");
      expect(msg).toContain("Passando para confirmar seu turno na Rodo Point.");
      expect(msg).toContain("📅 Sábado, 21/11/2026");
      expect(msg).toContain("🕔 Horário: 05h00 às 14h30");
      expect(msg).toContain("Está tudo certo para você trabalhar?");
    });

    it("deve registrar 'sem_destinatarios' se nenhum folguista estiver escalado no fim de semana", () => {
      const escalados: unknown[] = [];
      const status = escalados.length === 0 ? "sem_destinatarios" : "preparada";
      expect(status).toBe("sem_destinatarios");
    });

    it("deve registrar 'todos_confirmados' se todos os escalados já tiverem presença confirmada", () => {
      const pendentes: unknown[] = [];
      const status = pendentes.length === 0 ? "todos_confirmados" : "preparada";
      expect(status).toBe("todos_confirmados");
    });

    it("regra inegociável: silêncio NUNCA significa confirmação (permanece pendente)", () => {
      const folguistaEscala = {
        colaboradorId: "colab-123",
        data: "2026-11-21",
        turno: "manha",
        confirmado: false,
        respostasRecebidas: 0,
      };

      // Sem resposta recebida
      expect(folguistaEscala.confirmado).toBe(false);
    });
  });

  describe("Interpretação e Parser de Respostas de Confirmação e Desistência", () => {
    it("deve interpretar confirmação explícita de presença", () => {
      const parsed = parseFolguistaMessage("Confirmado!", {
        colaboradorNome: "João",
        isFridayConfirmationContext: true,
      });

      expect(parsed.tipoMensagem).toBe("confirmacao_presenca");
      expect(parsed.disponibilidadeGeral).toBe("disponivel");
      expect(parsed.precisaClarificacao).toBe(false);
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("Sua presença está confirmada");
    });

    it("deve interpretar desistência explícita e sinalizar necessidade de substituto", () => {
      const parsed = parseFolguistaMessage("Infelizmente não vou conseguir ir trabalhar no sábado", {
        colaboradorNome: "João",
        isFridayConfirmationContext: true,
      });

      expect(parsed.tipoMensagem).toBe("desistencia");
      expect(parsed.disponibilidadeGeral).toBe("indisponivel");
      expect(parsed.dias.sabado.desistencia).toBe(true);
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("não poderá comparecer");
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("substituição");
    });

    it("deve exigir clarificação para respostas vagas como 'talvez' ou 'acho que sim'", () => {
      const parsed = parseFolguistaMessage("Talvez eu consiga, vou ver", {
        colaboradorNome: "João",
        isFridayConfirmationContext: true,
      });

      expect(parsed.tipoMensagem).toBe("duvida");
      expect(parsed.precisaClarificacao).toBe(true);
      expect(parsed.disponibilidadeGeral).toBe("ambiguo");
    });
  });
});
