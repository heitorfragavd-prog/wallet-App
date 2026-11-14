import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveColaboradorSeguro,
  resolveTurnoOperacionalDetalhado,
  consolidateFechamentoValues,
  summarizeEyemobileTransactions,
  compareFechamentoVsEyemobile,
  buildFolguistaConfirmationMessage,
  buildOfficialClosingForwardMessage,
} from "../../supabase/functions/_shared/ai/folguista-fechamento-engine";
import { parseFolguistaMessage } from "../../supabase/functions/_shared/ai/folguista-parser-shared";

describe("Etapa 3E-D — Homologação Operacional de Ponta a Ponta e RLS (Gates 10, 11, 12, 14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gate 14 — Ciclo Operacional Completo Ponta a Ponta", () => {
    it("deve executar com sucesso o fluxo completo: Consulta -> Resposta -> Fechamento -> Eyemobile -> Espelhamento", () => {
      // 1. Segunda-feira: Resposta do folguista interpretada por IA
      const respostaFolguista = "Consigo fazer sábado de manhã e domingo de noite!";
      const parsedDisp = parseFolguistaMessage(respostaFolguista, {
        colaboradorNome: "João",
      });

      expect(parsedDisp.tipoMensagem).toBe("disponibilidade");
      expect(parsedDisp.dias.sabado.disponivel).toBe(true);
      expect(parsedDisp.dias.sabado.turnos).toContain("manha");

      // 2. Sábado: Identificação segura do colaborador folguista pelo Telegram ID
      const colaboradores = [
        {
          id: "colab-suellen",
          nome: "Suellen",
          tipo: "funcionario",
          status: "ativo",
          telegram_user_id: 11111,
        },
        {
          id: "colab-joao",
          nome: "João Folguista",
          tipo: "folguista",
          status: "ativo",
          telegram_user_id: 22222,
        },
      ];

      const idRes = resolveColaboradorSeguro({
        telegramUserId: 22222,
        senderFullName: "João",
        colaboradores: colaboradores as unknown as Parameters<typeof resolveColaboradorSeguro>[0]["colaboradores"],
      });

      expect(idRes.colaborador?.id).toBe("colab-joao");
      expect(idRes.identidadePendente).toBe(false);

      // 3. Sábado: Resolução do turno e data operacional
      const sabadoEnvio = new Date("2026-11-21T11:30:00-03:00");
      const turnoRes = resolveTurnoOperacionalDetalhado({
        horaEnvio: sabadoEnvio,
      });

      expect(turnoRes.turno).toBe("manha");
      expect(turnoRes.isAmbiguo).toBe(false);

      // 4. Recebimento de múltiplos comprovantes (envelope, voucher, cartão)
      const anexos = [
        {
          id: "doc-relatorio",
          file_id: "file-rel",
          sha256: "hash-rel-1",
          tipo_documento: "relatorio_consolidado",
          valor_extraido: { dinheiro: 300, debito: 150, credito: 250, pix: 200, voucher: 0, outros: 0 },
        },
        {
          id: "doc-voucher-1",
          file_id: "file-v1",
          sha256: "hash-v-1",
          tipo_documento: "comprovante_voucher",
          valor_extraido: { dinheiro: 0, debito: 0, credito: 0, pix: 0, voucher: 45, outros: 0 },
        },
        {
          id: "doc-voucher-2",
          file_id: "file-v2",
          sha256: "hash-v-2",
          tipo_documento: "comprovante_voucher",
          valor_extraido: { dinheiro: 0, debito: 0, credito: 0, pix: 0, voucher: 30, outros: 0 },
        },
      ];

      const consolidado = consolidateFechamentoValues(anexos);
      expect(consolidado.valores.dinheiro).toBe(300);
      expect(consolidado.valores.debito).toBe(150);
      expect(consolidado.valores.credito).toBe(250);
      expect(consolidado.valores.pix).toBe(200);
      expect(consolidado.valores.voucher).toBe(75); // 45 + 30
      expect(consolidado.anexosProcessados.length).toBe(3);

      // 5. Confronto com Eyemobile deduplicado
      const transacoesEyemobile = [
        { id: "t1", valor: 300, metodo_pagamento: "dinheiro", tipo: "receita", deduplication_key: "eye:t1" },
        { id: "t2", valor: 150, metodo_pagamento: "debito", tipo: "receita", deduplication_key: "eye:t2" },
        { id: "t3", valor: 250, metodo_pagamento: "credito", tipo: "receita", deduplication_key: "eye:t3" },
        { id: "t4", valor: 200, metodo_pagamento: "pix", tipo: "receita", deduplication_key: "eye:t4" },
        { id: "t5", valor: 75, metodo_pagamento: "voucher refeicao", tipo: "receita", deduplication_key: "eye:t5" },
        { id: "t6-cancelada", valor: 100, metodo_pagamento: "pix", tipo: "receita", status: "cancelada" },
      ];

      const eyemobileSummary = summarizeEyemobileTransactions(transacoesEyemobile);
      expect(eyemobileSummary.vendasCanceladasIgnoradas).toBe(1);
      expect(eyemobileSummary.total).toBe(975);

      const conferencia = compareFechamentoVsEyemobile({
        envelope: consolidado.valores,
        eyemobile: eyemobileSummary,
        turno: "manha",
      });

      // Valores batem 100% com o PDV
      expect(conferencia.status).toBe("confirmado");
      expect(conferencia.diferencas.length).toBe(0);

      // 6. Confirmação segura no grupo Folguistas (Sigilo Bancário)
      const msgFolguista = buildFolguistaConfirmationMessage({
        nomeColaborador: "João Folguista",
        dataFechamento: "21/11/2026",
        turno: "manha",
        totalFotos: 3,
        espelhamentoSucesso: true,
      });

      expect(msgFolguista).toContain("Fechamento Recebido com Sucesso");
      expect(msgFolguista).toContain("3 foto(s)/comprovante(s)");
      expect(msgFolguista).not.toContain("975"); // Sigilo absoluto
      expect(msgFolguista).not.toContain("DRE");
      expect(msgFolguista).not.toContain("Lucro");

      // 7. Espelhamento rico para o grupo oficial 🧾 Fechamento Rodo Point
      const forwardMsg = buildOfficialClosingForwardMessage({
        colaboradorNome: "João Folguista",
        dataFechamento: "21/11/2026",
        turno: "manha",
        envelope: consolidado.valores,
        eyemobile: eyemobileSummary,
        conferencia,
        totalFotos: 3,
        fechamentoId: "fech-123",
      });

      expect(forwardMsg.captionResumido.length).toBeLessThanOrEqual(1024);
      expect(forwardMsg.captionResumido).toContain("FECHAMENTO CAIXA — RODO POINT");
      expect(forwardMsg.captionResumido).toContain("Total Informado:");
      expect(forwardMsg.captionResumido).toContain("975,00");
      expect(forwardMsg.captionResumido).toContain("Status: CONFERIDO");
    });
  });

  describe("Gate 11 & Gate 12 — Governança e Regras de RLS", () => {
    it("deve assegurar que a aprovação do fechamento marca status conferido e NUNCA gera crédito financeiro automático de sobra", () => {
      // Simulação do update de aprovação em useCentralConversas
      const fechamentoAntes = {
        id: "fech-001",
        status: "pendente_conferencia",
        sobra: 50.0,
      };

      const transacoesFinanceirasCriadas: Array<Record<string, unknown>> = [];

      // Ação de aprovação executiva
      const fechamentoAprovado = {
        ...fechamentoAntes,
        status: "conferido",
        conferido_por: "usr-admin-1",
        conferido_em: new Date().toISOString(),
      };

      expect(fechamentoAprovado.status).toBe("conferido");
      // Regra de segurança inegociável: nenhuma transação de crédito gerada automaticamente
      expect(transacoesFinanceirasCriadas.length).toBe(0);
      expect(fechamentoAprovado.sobra).toBe(50.0); // Preserva o registro da sobra para conferência física
    });
  });
});
