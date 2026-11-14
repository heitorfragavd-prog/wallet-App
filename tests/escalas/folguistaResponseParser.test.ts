// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseFolguistaMessage } from "../../src/domains/escalas/services/folguistaResponseParser";

describe("Gate 3 & Gate 5: Motor NLP de Interpretação dos Folguistas", () => {
  describe("1. Consulta de Segunda-feira — Respostas em Linguagem Natural", () => {
    it("deve detectar ambiguidade em 'Posso sábado' e solicitar esclarecimento do turno", () => {
      const parsed = parseFolguistaMessage("Posso sábado.");

      expect(parsed.esclarecimentoNecessario).toBe(true);
      expect(parsed.perguntaEsclarecimento).toContain("sábado de manhã, à noite ou nos dois turnos");
      expect(parsed.dias.sabado.disponivel).toBe(true);
      expect(parsed.dias.sabado.ambigua).toBe(true);
    });

    it("deve interpretar 'Domingo eu posso de manhã' com precisão", () => {
      const parsed = parseFolguistaMessage("Domingo eu posso de manhã.");

      expect(parsed.esclarecimentoNecessario).toBe(false);
      expect(parsed.dias.domingo.disponivel).toBe(true);
      expect(parsed.dias.domingo.turnos).toContain("manha");
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("domingo");
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("manha");
    });

    it("deve interpretar 'Posso os dois dias' e perguntar preferência de turno", () => {
      const parsed = parseFolguistaMessage("Posso os dois dias.");

      expect(parsed.esclarecimentoNecessario).toBe(true);
      expect(parsed.perguntaEsclarecimento).toContain("Tem preferência por algum turno");
      expect(parsed.dias.sabado.disponivel).toBe(true);
      expect(parsed.dias.domingo.disponivel).toBe(true);
    });

    it("deve interpretar 'Esse fim de semana não consigo' como indisponibilidade", () => {
      const parsed = parseFolguistaMessage("Esse fim de semana não consigo.");

      expect(parsed.disponibilidadeGeral).toBe("indisponivel");
      expect(parsed.dias.sabado.disponivel).toBe(false);
      expect(parsed.dias.domingo.disponivel).toBe(false);
      expect(parsed.esclarecimentoNecessario).toBe(false);
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("Registrei sua indisponibilidade");
    });

    it("deve interpretar turnos específicos em dias diferentes: 'Sábado noite e domingo manhã'", () => {
      const parsed = parseFolguistaMessage("Posso sábado à noite e domingo de manhã.");

      expect(parsed.dias.sabado.disponivel).toBe(true);
      expect(parsed.dias.sabado.turnos).toContain("noite");
      expect(parsed.dias.domingo.disponivel).toBe(true);
      expect(parsed.dias.domingo.turnos).toContain("manha");
      expect(parsed.esclarecimentoNecessario).toBe(false);
    });
  });

  describe("2. Confirmação de Sexta-feira — Confirmações e Desistências", () => {
    it("deve reconhecer confirmação positiva na sexta-feira", () => {
      const confirmacoes = [
        "Confirmado",
        "Confirmadíssimo!",
        "Vou sim, pode contar comigo!",
        "Tudo certo, estarei lá",
        "Sim, confirmado",
      ];

      for (const msg of confirmacoes) {
        const parsed = parseFolguistaMessage(msg, { isFridayConfirmationContext: true });
        expect(parsed.tipoMensagem).toBe("confirmacao_presenca");
        expect(parsed.disponibilidadeGeral).toBe("disponivel");
        expect(parsed.respostaConfirmacaoAgradecimento).toContain("confirmada");
      }
    });

    it("deve reconhecer desistência com necessidade de substituição imediata", () => {
      const desistencias = [
        "Não vou conseguir ir",
        "Tive um imprevisto de última hora",
        "Não posso mais ir amanhã",
        "Infelizmente não vou poder trabalhar esse fim de semana",
      ];

      for (const msg of desistencias) {
        const parsed = parseFolguistaMessage(msg, { isFridayConfirmationContext: true });
        expect(parsed.tipoMensagem).toBe("desistencia");
        expect(parsed.disponibilidadeGeral).toBe("indisponivel");
        expect(parsed.respostaConfirmacaoAgradecimento).toContain("desistência");
      }
    });
  });
});
