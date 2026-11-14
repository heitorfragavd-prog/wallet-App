// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  resolveTurnoOperacional,
  resolveColaboradorSeguro,
  summarizeEyemobileTransactions,
  compareFechamentoVsEyemobile,
  buildFolguistaConfirmationMessage,
  buildOfficialClosingForwardMessage,
  type ColaboradorInfo,
  type EscalaInfo,
} from "../../supabase/functions/_shared/ai/folguista-fechamento-engine";

describe("Etapa 3D — Fechamentos Integrados dos Folguistas (Gates 1 ao 13)", () => {
  const mockColaboradores: ColaboradorInfo[] = [
    {
      id: "colab-1",
      nome: "Sarah Rodrigues Neves",
      tipo: "folguista",
      status: "experiencia",
      telefone: "31992985255",
      telegram_user_id: 111222333,
      telegram_username: "sarah_rodrigues",
    },
    {
      id: "colab-2",
      nome: "Rainá Alice Sousa Rodrigues",
      tipo: "folguista",
      status: "experiencia",
      telefone: "33998296318",
      telegram_user_id: 444555666,
      telegram_username: "raina_alice",
    },
    {
      id: "colab-3",
      nome: "Luiz Fellipe Santos De Assis",
      tipo: "folguista",
      status: "experiencia",
      telefone: "31988857414",
      telegram_user_id: null,
      telegram_username: null,
    },
  ];

  const mockEscalasHoje: EscalaInfo[] = [
    {
      id: "esc-1",
      colaborador_id: "colab-1",
      data: "2026-11-14",
      turno: "manha",
      status: "programada",
    },
    {
      id: "esc-2",
      colaborador_id: "colab-2",
      data: "2026-11-14",
      turno: "noite",
      status: "programada",
    },
  ];

  describe("Gate 3: Identificação Segura do Folguista", () => {
    it("identifica o folguista com prioridade máxima pelo telegram_user_id imutável", () => {
      const res = resolveColaboradorSeguro({
        telegramUserId: 111222333,
        telegramUsername: "outro_username_qualquer",
        senderFullName: "Nome Diferente no Telegram",
        colaboradores: mockColaboradores,
        escalasHoje: mockEscalasHoje,
      });

      expect(res.colaborador).not.toBeNull();
      expect(res.colaborador?.id).toBe("colab-1");
      expect(res.colaborador?.nome).toBe("Sarah Rodrigues Neves");
      expect(res.modo).toBe("telegram_user_id");
      expect(res.escala?.id).toBe("esc-1");
      expect(res.escala?.turno).toBe("manha");
    });

    it("identifica pelo telegram_username quando telegram_user_id não confere", () => {
      const res = resolveColaboradorSeguro({
        telegramUserId: 999999999, // ID desconhecido
        telegramUsername: "@raina_alice",
        senderFullName: "Qualquer Coisa",
        colaboradores: mockColaboradores,
        escalasHoje: mockEscalasHoje,
      });

      expect(res.colaborador?.id).toBe("colab-2");
      expect(res.colaborador?.nome).toBe("Rainá Alice Sousa Rodrigues");
      expect(res.modo).toBe("telegram_username");
      expect(res.escala?.turno).toBe("noite");
    });

    it("mantém identidade pendente e sugere candidato quando remetente não tem Telegram previamente vinculado", () => {
      const res = resolveColaboradorSeguro({
        telegramUserId: null,
        telegramUsername: null,
        senderFullName: "Sarah Rodrigues",
        colaboradores: mockColaboradores,
        escalasHoje: mockEscalasHoje,
      });

      expect(res.colaborador).toBeNull();
      expect(res.identidadePendente).toBe(true);
      expect(res.modo).toBe("pendente");
      expect(res.candidatoSugerido?.id).toBe("colab-1");
      expect(res.escala).not.toBeNull();
    });

    it("REJEITA associação automática quando o colaborador tem nome compatível mas NÃO está na escala do dia", () => {
      const res = resolveColaboradorSeguro({
        telegramUserId: null,
        telegramUsername: null,
        senderFullName: "Luiz Fellipe",
        colaboradores: mockColaboradores,
        escalasHoje: mockEscalasHoje, // Luiz não está na escala hoje
      });

      expect(res.colaborador).toBeNull();
      expect(res.modo).toBe("pendente");
      expect(res.escala).toBeNull();
    });
  });

  describe("Gate 7: Resolução de Turnos e Regras Operacionais Rodo Point", () => {
    it("prioriza o turno registrado na escala ativa do colaborador", () => {
      const turno = resolveTurnoOperacional({
        escala: {
          id: "esc-1",
          colaborador_id: "colab-1",
          data: "2026-11-14",
          turno: "manha",
          status: "programada",
        },
        horaEnvio: new Date("2026-11-14T23:00:00Z"), // Mesmo enviado tarde, a escala manda
      });

      expect(turno).toBe("manha");
    });

    it("reconhece turno pela legenda da foto quando informado explicitamente", () => {
      const turno = resolveTurnoOperacional({
        escala: null,
        captionOuTexto: "Fechamento turno noite caixa 1",
      });

      expect(turno).toBe("noite");
    });

    it("em fins de semana sem escala, aplica o corte correto (manhã 05h00-14h30)", () => {
      // 14/11/2026 é um Sábado
      // 10:00 BRT = 13:00 UTC
      const sabadoManha = new Date("2026-11-14T13:00:00Z");
      const turnoManha = resolveTurnoOperacional({
        escala: null,
        horaEnvio: sabadoManha,
      });
      expect(turnoManha).toBe("manha");

      // 18:00 BRT = 21:00 UTC
      const sabadoNoite = new Date("2026-11-14T21:00:00Z");
      const turnoNoite = resolveTurnoOperacional({
        escala: null,
        horaEnvio: sabadoNoite,
      });
      expect(turnoNoite).toBe("noite");
    });
  });

  describe("Gate 8: Conferência com Eyemobile Deduplicado", () => {
    it("deduplica vendas com mesma chave eyemobile:<id> e exclui cancelamentos", () => {
      const rawTransactions = [
        {
          id: "tx-1",
          valor: 50.0,
          metodo_pagamento: "dinheiro",
          deduplication_key: "eyemobile:1001",
          descricao: "Venda Eyemobile #1001",
          status: "concluida",
        },
        // Linha duplicada da mesma venda #1001
        {
          id: "tx-2",
          valor: 50.0,
          metodo_pagamento: "dinheiro",
          deduplication_key: "eyemobile:1001",
          descricao: "Venda Eyemobile #1001",
          status: "concluida",
        },
        // Venda 1002 em cartão débito
        {
          id: "tx-3",
          valor: 80.0,
          metodo_pagamento: "debito",
          deduplication_key: "eyemobile:1002",
          descricao: "Venda Eyemobile #1002",
          status: "concluida",
        },
        // Venda 1003 cancelada (deve ser ignorada)
        {
          id: "tx-4",
          valor: 150.0,
          metodo_pagamento: "credito",
          deduplication_key: "eyemobile:1003",
          descricao: "Venda Eyemobile #1003",
          status: "cancelada",
        },
        // Venda 1004 em Pix
        {
          id: "tx-5",
          valor: 35.5,
          metodo_pagamento: "pix",
          deduplication_key: "eyemobile:1004",
          descricao: "Venda Eyemobile #1004",
          status: "concluida",
        },
        // Venda 1005 em Voucher Alelo
        {
          id: "tx-6",
          valor: 42.0,
          metodo_pagamento: "voucher_alelo",
          deduplication_key: "eyemobile:1005",
          descricao: "Venda Eyemobile #1005",
          status: "concluida",
        },
      ];

      const summary = summarizeEyemobileTransactions(rawTransactions);

      expect(summary.vendasContabilizadas).toBe(4); // 1001, 1002, 1004, 1005
      expect(summary.vendasDeduplicadasIgnoradas).toBe(1); // Duplicata da 1001
      expect(summary.vendasCanceladasIgnoradas).toBe(1); // 1003 cancelada
      expect(summary.dinheiro).toBe(50.0);
      expect(summary.debito).toBe(80.0);
      expect(summary.credito).toBe(0.0);
      expect(summary.pix).toBe(35.5);
      expect(summary.voucher).toBe(42.0);
      expect(summary.total).toBe(207.5);
    });

    it("identifica divergências financeiras acima da tolerância de R$ 0,50", () => {
      const envelope = {
        dinheiro: 50.0,
        debito: 85.0, // Divergente (Sistema tem 80.0)
        credito: 0.0,
        pix: 35.5,
        voucher: 42.0,
      };

      const eyemobile = {
        dinheiro: 50.0,
        debito: 80.0,
        credito: 0.0,
        pix: 35.5,
        voucher: 42.0,
        total: 207.5,
        vendasContabilizadas: 4,
        vendasDeduplicadasIgnoradas: 1,
        vendasCanceladasIgnoradas: 1,
      };

      const diffs = compareFechamentoVsEyemobile(envelope, eyemobile);
      expect(diffs.length).toBe(1);
      expect(diffs[0]).toContain("Cartão Débito");
      expect(diffs[0].replace(/\u00A0/g, " ")).toContain("+R$ 5,00");
    });
  });

  describe("Gate 9 & Gate 11: Governança de Mensagens e Sigilo Financeiro", () => {
    it("mensagem ao grupo Folguistas NUNCA expõe DRE, lucro ou saldos bancários", () => {
      const msg = buildFolguistaConfirmationMessage({
        nomeColaborador: "Sarah Rodrigues",
        dataFechamento: "14/11/2026",
        turno: "manha",
        totalFotos: 3,
      });

      expect(msg).toContain("Fechamento Recebido com Sucesso");
      expect(msg).toContain("Sarah Rodrigues");
      expect(msg).toContain("3 foto(s)");
      // Garantia de Sigilo Financeiro
      expect(msg.toLowerCase()).not.toContain("dre");
      expect(msg.toLowerCase()).not.toContain("lucro");
      expect(msg.toLowerCase()).not.toContain("saldo bancario");
      expect(msg.toLowerCase()).not.toContain("faturamento total");
    });

    it("mensagem ao grupo oficial contém relatório completo, fotos e aviso sobre sobra", () => {
      const msg = buildOfficialClosingForwardMessage({
        colaboradorNome: "Sarah Rodrigues Neves",
        dataFechamento: "14/11/2026",
        turno: "manha",
        envelope: {
          dinheiro: 350.0,
          debito: 200.0,
          credito: 150.0,
          pix: 100.0,
          voucher: 50.0,
        },
        eyemobile: {
          dinheiro: 350.0,
          debito: 200.0,
          credito: 150.0,
          pix: 100.0,
          voucher: 50.0,
          total: 850.0,
          vendasContabilizadas: 25,
          vendasDeduplicadasIgnoradas: 2,
          vendasCanceladasIgnoradas: 1,
        },
        diferencas: [],
        status: "pendente_conferencia",
        sobra: 35.0,
        totalFotos: 4,
        fechamentoId: "fech-1234",
      });

      const cleanMsg = msg.replace(/\u00A0/g, " ");
      expect(cleanMsg).toContain("FECHAMENTO DE CAIXA — FOLGUISTAS RODO POINT");
      expect(cleanMsg).toContain("Sarah Rodrigues Neves");
      expect(cleanMsg).toContain("R$ 850,00");
      expect(cleanMsg).toContain("Sobra Informada pelo Caixa");
      expect(cleanMsg).toContain("A sobra só será lançada no saldo após aprovação administrativa");
      expect(cleanMsg).toContain("4 fotografia(s)");
    });
  });
});
