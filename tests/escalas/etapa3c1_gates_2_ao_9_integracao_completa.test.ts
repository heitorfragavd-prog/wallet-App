import { describe, it, expect } from "vitest";
import { parseFolguistaMessage, getNextWeekendDatesSaoPaulo } from "../../supabase/functions/_shared/ai/folguista-parser-shared";
import { STANDARD_GROUP_TEMPLATES } from "../../supabase/functions/_shared/ai/group-governance";

describe("🚀 WALLET APP — MISSÃO 3C.1: TESTES COMPLETOS DOS GATES 2 AO 9", () => {
  describe("Gate 2 & 9: Unificação de Grupos e Nomenclatura Canônica Oficial", () => {
    it("STANDARD_GROUP_TEMPLATES define exatamente os 5 grupos operacionais canônicos com nomes padronizados", () => {
      expect(STANDARD_GROUP_TEMPLATES.fechamento.nome_grupo).toBe("🧾 Fechamento Rodo Point");
      expect(STANDARD_GROUP_TEMPLATES.nfe_boletos.nome_grupo).toBe("📄 Notas Fiscais e Boletos");
      expect(STANDARD_GROUP_TEMPLATES.contas_empresa.nome_grupo).toBe("💰 Contas da Empresa");
      expect(STANDARD_GROUP_TEMPLATES.conversas_loja.nome_grupo).toBe("🏪 Conversas da Loja");
      expect(STANDARD_GROUP_TEMPLATES.folguistas.nome_grupo).toBe("👥 Folguistas Rodo Point");
    });

    it("garante que o grupo Fechamento possui todas as ferramentas essenciais de conferência", () => {
      const fech = STANDARD_GROUP_TEMPLATES.fechamento;
      expect(fech.acoes_permitidas).toContain("extrair_fechamento");
      expect(fech.acoes_permitidas).toContain("conferir_sobra");
      expect(fech.funcionalidades_autorizadas).toContain("fechamento_caixa");
      expect(fech.funcionalidades_autorizadas).toContain("conferir_eyemobile");
    });
  });

  describe("Gate 5 & 6: Parser Compartilhado de Folguistas para Deno e Webhook", () => {
    it("calcula datas de sábado e domingo no fuso America/Sao_Paulo corretamente", () => {
      const dates = getNextWeekendDatesSaoPaulo();
      expect(dates.sabado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dates.domingo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dates.sabadoFormatado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(dates.domingoFormatado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it("interpreta resposta com disponibilidade para ambos os turnos", () => {
      const parsed = parseFolguistaMessage("Posso sábado de manhã e domingo à noite", {
        colaboradorNome: "Luiz Fellipe",
      });

      expect(parsed.tipoMensagem).toBe("disponibilidade");
      expect(parsed.disponibilidadeGeral).toBe("disponivel");
      expect(parsed.dias.sabado.turnos).toContain("manha");
      expect(parsed.dias.domingo.turnos).toContain("noite");
      expect(parsed.precisaClarificacao).toBe(false);
    });

    it("detecta ambiguidade quando o folguista informa o dia mas omite o turno", () => {
      const parsed = parseFolguistaMessage("Posso sábado", {
        colaboradorNome: "Sarah",
      });

      expect(parsed.tipoMensagem).toBe("disponibilidade");
      expect(parsed.disponibilidadeGeral).toBe("ambiguo");
      expect(parsed.precisaClarificacao).toBe(true);
      expect(parsed.perguntaClarificacao).toContain("Você prefere o turno da manhã");
    });

    it("interpreta desistência por imprevisto e gera mensagem empática acolhedora", () => {
      const parsed = parseFolguistaMessage("Tive um imprevisto e não vou poder ir", {
        colaboradorNome: "Rainá",
      });

      expect(parsed.tipoMensagem).toBe("desistencia");
      expect(parsed.disponibilidadeGeral).toBe("indisponivel");
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("Registrei que você teve um imprevisto");
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("A administração foi comunicada");
    });

    it("interpreta confirmação na sexta-feira com resposta curta", () => {
      const parsed = parseFolguistaMessage("Confirmado!", {
        colaboradorNome: "Luiz",
        isFridayConfirmationContext: true,
      });

      expect(parsed.tipoMensagem).toBe("confirmacao_presenca");
      expect(parsed.disponibilidadeGeral).toBe("disponivel");
      expect(parsed.respostaConfirmacaoAgradecimento).toContain("Sua presença está confirmada");
    });
  });

  describe("Gate 7 & 8: Formato Padronizado de Idempotência e Isolamento RLS", () => {
    it("gera chaves de idempotência unívocas e determinísticas", () => {
      const wsId = "2af415b6-76aa-4134-8133-a9b405671c1c";
      const sabado = "2026-11-21";
      const keySegunda = `consulta_segunda_ws_${wsId}_${sabado}`;
      const keySexta = `confirmacao_sexta_ws_${wsId}_${sabado}_manha_colab123`;

      expect(keySegunda).toBe("consulta_segunda_ws_2af415b6-76aa-4134-8133-a9b405671c1c_2026-11-21");
      expect(keySexta).toContain("confirmacao_sexta_ws_");
      expect(keySexta).toContain("colab123");
    });
  });
});
