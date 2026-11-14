// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getOperationalDateBR,
  formatDateBR,
  resolveTurnoOperacional,
  resolveColaboradorSeguro,
  classifyDocumentType,
  consolidateFechamentoValues,
  summarizeEyemobileTransactions,
  compareFechamentoVsEyemobile,
  buildFolguistaConfirmationMessage,
  buildOfficialClosingForwardMessage,
  type ColaboradorInfo,
  type EscalaInfo,
  type FechamentoAnexoItem,
} from "../../supabase/functions/_shared/ai/folguista-fechamento-engine";

describe("Etapa 3D.1 — Correção de Integridade Financeira e Segurança dos Fechamentos (Gates 1 ao 10)", () => {
  const mockColaboradores: ColaboradorInfo[] = [
    {
      id: "colab-sarah",
      nome: "Sarah Rodrigues Neves",
      tipo: "folguista",
      status: "experiencia",
      telefone: "31992985255",
      telegram_user_id: 111222333,
      telegram_username: "sarah_rodrigues",
    },
    {
      id: "colab-sarah-outra",
      nome: "Sarah Rodrigues Pereira",
      tipo: "folguista",
      status: "experiencia",
      telefone: "31999998888",
      telegram_user_id: null,
      telegram_username: null,
    },
    {
      id: "colab-raina",
      nome: "Rainá Alice Sousa Rodrigues",
      tipo: "folguista",
      status: "experiencia",
      telefone: "33998296318",
      telegram_user_id: 444555666,
      telegram_username: "raina_alice",
    },
  ];

  const mockEscalas: EscalaInfo[] = [
    {
      id: "esc-1",
      colaborador_id: "colab-sarah",
      data: "2026-11-14",
      turno: "manha",
      status: "programada",
    },
    {
      id: "esc-2",
      colaborador_id: "colab-raina",
      data: "2026-11-14",
      turno: "noite",
      status: "programada",
    },
  ];

  // GATE 1: CONSOLIDAÇÃO DOS VALORES
  describe("Gate 1: Consolidação Matemática Precisa e Sem Duplicações", () => {
    it("soma corretamente dois comprovantes de débito complementares (sem Math.max)", () => {
      const anexos: FechamentoAnexoItem[] = [
        {
          id: "anexo-1",
          file_id: "file-deb-1",
          storage_path: "groups/ws/fech/deb1.jpg",
          mime_type: "image/jpeg",
          tipo_documento: "comprovante_individual",
          created_at: "2026-11-14T14:00:00Z",
          sha256: "hash-deb-1",
          valor_extraido: { debito: 50.0 },
        },
        {
          id: "anexo-2",
          file_id: "file-deb-2",
          storage_path: "groups/ws/fech/deb2.jpg",
          mime_type: "image/jpeg",
          tipo_documento: "comprovante_individual",
          created_at: "2026-11-14T14:02:00Z",
          sha256: "hash-deb-2",
          valor_extraido: { debito: 70.0 },
        },
      ];

      const res = consolidateFechamentoValues(anexos);
      expect(res.valores.debito).toBe(120.0); // 50 + 70, não Math.max(50, 70) = 70!
      expect(res.totalGeral).toBe(120.0);
    });

    it("soma múltiplos comprovantes de voucher complementares de mesmo valor", () => {
      const anexos: FechamentoAnexoItem[] = [
        {
          id: "anexo-v1",
          file_id: "file-v1",
          storage_path: "groups/ws/fech/v1.jpg",
          mime_type: "image/jpeg",
          tipo_documento: "comprovante_voucher",
          created_at: "2026-11-14T14:05:00Z",
          sha256: "hash-v1",
          valor_extraido: { voucher: 25.0 },
        },
        {
          id: "anexo-v2",
          file_id: "file-v2",
          storage_path: "groups/ws/fech/v2.jpg",
          mime_type: "image/jpeg",
          tipo_documento: "comprovante_voucher",
          created_at: "2026-11-14T14:06:00Z",
          sha256: "hash-v2",
          valor_extraido: { voucher: 25.0 }, // Mesmo valor não deve ser ignorado!
        },
      ];

      const res = consolidateFechamentoValues(anexos);
      expect(res.valores.voucher).toBe(50.0);
    });

    it("descarta comprovantes repetidos pelo hash sha256 ou file_id sem duplicar a soma", () => {
      const anexos: FechamentoAnexoItem[] = [
        {
          id: "anexo-orig",
          file_id: "file-pix-1",
          storage_path: "groups/ws/fech/pix1.jpg",
          mime_type: "image/jpeg",
          tipo_documento: "comprovante_individual",
          created_at: "2026-11-14T14:10:00Z",
          sha256: "hash-repetido-abc",
          valor_extraido: { pix: 45.0 },
        },
        // Foto retransmitida pelo Telegram (mesmo hash sha256)
        {
          id: "anexo-dup",
          file_id: "file-pix-repetido",
          storage_path: "groups/ws/fech/pix1_dup.jpg",
          mime_type: "image/jpeg",
          tipo_documento: "comprovante_individual",
          created_at: "2026-11-14T14:11:00Z",
          sha256: "hash-repetido-abc",
          valor_extraido: { pix: 45.0 },
        },
      ];

      const res = consolidateFechamentoValues(anexos);
      expect(res.valores.pix).toBe(45.0); // Não duplicou para 90.0!
      expect(res.anexosProcessados.find((a) => a.id === "anexo-dup")?.is_duplicata).toBe(true);
    });

    it("classifica corretamente tipos de documentos pelo caption e valores", () => {
      expect(
        classifyDocumentType({
          caption: "Fechamento de caixa totalizador do dia",
        })
      ).toBe("relatorio_consolidado");

      expect(
        classifyDocumentType({
          caption: "Foto do envelope sangria",
        })
      ).toBe("envelope");

      expect(
        classifyDocumentType({
          caption: "Comprovante Vale Refeição Alelo",
        })
      ).toBe("comprovante_voucher");

      expect(
        classifyDocumentType({
          caption: "Comprovante Cielo Débito",
          detectedValues: { debito: 45.0 },
        })
      ).toBe("comprovante_individual");
    });

    it("quando há relatório consolidado totalizador acompanhado de filipetas individuais, não soma duas vezes", () => {
      const anexos: FechamentoAnexoItem[] = [
        {
          id: "rel-totalizador",
          file_id: "file-rel-z",
          storage_path: "groups/ws/fech/rel_total.jpg",
          mime_type: "image/jpeg",
          tipo_documento: "relatorio_consolidado",
          created_at: "2026-11-14T14:20:00Z",
          sha256: "hash-rel-1",
          valor_extraido: {
            dinheiro: 200.0,
            debito: 350.0,
            credito: 250.0,
            pix: 150.0,
            voucher: 50.0,
          },
        },
        // Filipeta individual enviada junto com o relatório (auditoria da transação de 100 no débito)
        {
          id: "filipeta-deb",
          file_id: "file-filipeta-deb",
          storage_path: "groups/ws/fech/filipeta_deb.jpg",
          mime_type: "image/jpeg",
          tipo_documento: "comprovante_individual",
          created_at: "2026-11-14T14:21:00Z",
          sha256: "hash-filipeta-1",
          valor_extraido: { debito: 100.0 },
        },
      ];

      const res = consolidateFechamentoValues(anexos);
      // Os 100 do débito da filipeta NÃO são somados em cima do relatório totalizador de 350
      expect(res.valores.debito).toBe(350.0);
      expect(res.valores.dinheiro).toBe(200.0);
      expect(res.totalGeral).toBe(1000.0);
    });
  });

  // GATE 2: CONFERÊNCIA EYEMOBILE
  describe("Gate 2: Reconciliação Confiável com o Eyemobile", () => {
    it("preserva pagamentos divididos (splits de múltiplos métodos) na mesma venda", () => {
      const txs = [
        // Venda #2001 dividida: R$ 30 dinheiro + R$ 20 cartão
        {
          id: "tx-split-1",
          valor: 30.0,
          metodo_pagamento: "dinheiro",
          deduplication_key: "eyemobile:2001:dinheiro",
          descricao: "Venda Eyemobile #2001 - Split Dinheiro",
          status: "concluida",
          origem: "eyemobile",
        },
        {
          id: "tx-split-2",
          valor: 20.0,
          metodo_pagamento: "debito",
          deduplication_key: "eyemobile:2001:debito",
          descricao: "Venda Eyemobile #2001 - Split Débito",
          status: "concluida",
          origem: "eyemobile",
        },
      ];

      const summary = summarizeEyemobileTransactions(txs);
      expect(summary.dinheiro).toBe(30.0);
      expect(summary.debito).toBe(20.0);
      expect(summary.total).toBe(50.0);
      expect(summary.vendasContabilizadas).toBe(2);
    });

    it("método de pagamento desconhecido NÃO é convertido em dinheiro por fallback", () => {
      const txs = [
        {
          id: "tx-unk",
          valor: 85.0,
          metodo_pagamento: "metodo_customizado_xyz",
          deduplication_key: "eyemobile:3001",
          descricao: "Venda Eyemobile #3001",
          status: "concluida",
          origem: "eyemobile",
        },
      ];

      const summary = summarizeEyemobileTransactions(txs);
      expect(summary.dinheiro).toBe(0.0); // NÃO virou dinheiro!
      expect(summary.outros).toBe(85.0);
      expect(summary.total).toBe(85.0);
    });

    it("ignora vendas que não pertençam ao Eyemobile", () => {
      const txs = [
        {
          id: "tx-divipay",
          valor: 500.0,
          metodo_pagamento: "pix",
          origem: "divipay",
          descricao: "Transferência Divipay Fornecedor",
          status: "concluida",
        },
        {
          id: "tx-eye",
          valor: 50.0,
          metodo_pagamento: "dinheiro",
          origem: "eyemobile",
          deduplication_key: "eyemobile:4001",
          status: "concluida",
        },
      ];

      const summary = summarizeEyemobileTransactions(txs);
      expect(summary.total).toBe(50.0);
      expect(summary.vendasContabilizadas).toBe(1);
    });

    it("sinaliza conferência parcial quando o faturamento diário do Eyemobile for maior que o turno isolado", () => {
      const envelope = {
        dinheiro: 300.0,
        debito: 200.0,
        credito: 100.0,
        pix: 100.0,
        voucher: 0.0,
      };
      const eyemobile = {
        dinheiro: 700.0,
        debito: 500.0,
        credito: 400.0,
        pix: 200.0,
        voucher: 0.0,
        outros: 0.0,
        total: 1800.0, // Faturamento do dia todo
        vendasContabilizadas: 60,
        vendasDeduplicadasIgnoradas: 0,
        vendasCanceladasIgnoradas: 0,
      };

      const res = compareFechamentoVsEyemobile({
        envelope,
        eyemobile,
        turno: "manha",
      });

      expect(res.tipoConferencia).toBe("parcial");
      expect(res.status).toBe("pendente_conferencia");
      expect(res.observacaoPeriodo).toContain("Conferência Parcial do Turno");
    });
  });

  // GATE 3: IDENTIFICAÇÃO SEGURA DOS FUNCIONÁRIOS
  describe("Gate 3: Identificação Segura e Imutabilidade (Sem Auto-Vínculo por Nome)", () => {
    it("não vincula automaticamente Telegram de remetente desconhecido ao funcionário com mesmo nome", () => {
      const res = resolveColaboradorSeguro({
        telegramUserId: 999888777, // ID desconhecido
        telegramUsername: "novo_user",
        senderFullName: "Sarah Rodrigues", // Nome com mais de uma colaboradora (ambíguo)
        colaboradores: mockColaboradores,
        escalasHoje: mockEscalas,
      });

      expect(res.colaborador).toBeNull();
      expect(res.identidadePendente).toBe(true);
      expect(res.modo).toBe("pendente");
    });

    it("sugere candidato para auditoria humana quando há exatamente uma correspondência por nome sem vínculo", () => {
      const res = resolveColaboradorSeguro({
        telegramUserId: 999888777, // ID desconhecido
        telegramUsername: "novo_user",
        senderFullName: "Rainá Alice", // Uma única colaboradora
        colaboradores: mockColaboradores,
        escalasHoje: mockEscalas,
      });

      expect(res.colaborador).toBeNull();
      expect(res.identidadePendente).toBe(true);
      expect(res.modo).toBe("pendente");
      expect(res.candidatoSugerido?.nome).toContain("Rainá Alice");
    });

    it("quando o usuário possui telegram_user_id comprovado, confirma com segurança imediata", () => {
      const res = resolveColaboradorSeguro({
        telegramUserId: 111222333,
        colaboradores: mockColaboradores,
        escalasHoje: mockEscalas,
      });

      expect(res.colaborador?.id).toBe("colab-sarah");
      expect(res.identidadePendente).toBe(false);
      expect(res.modo).toBe("telegram_user_id");
    });
  });

  // GATE 8: DATAS E FUSO HORÁRIO BRASIL (America/Sao_Paulo)
  describe("Gate 8: Precisão Temporal e Datas Operacionais no Brasil", () => {
    it("retorna a data correta do Brasil mesmo após as 21h00 (quando UTC já virou o dia)", () => {
      // 14/11/2026 às 22h30 em São Paulo = 15/11/2026 às 01h30 UTC
      const noiteBrasil = new Date("2026-11-15T01:30:00Z");
      const dataOp = getOperationalDateBR(noiteBrasil);
      expect(dataOp).toBe("2026-11-14"); // Deve ser 14/11, e não 15/11!
      expect(formatDateBR(dataOp)).toBe("14/11/2026");
    });

    it("diferencia dois fechamentos em turnos distintos do mesmo dia", () => {
      const manha = resolveTurnoOperacional({
        horaEnvio: new Date("2026-11-14T13:00:00Z"), // 10h BRT
      });
      const noite = resolveTurnoOperacional({
        horaEnvio: new Date("2026-11-14T21:00:00Z"), // 18h BRT
      });

      expect(manha).toBe("manha");
      expect(noite).toBe("noite");
      expect(manha).not.toBe(noite);
    });
  });

  // GATE 7 & GATE 11: MENSAGENS E LIMITES TELEGRAM
  describe("Gate 7 & Gate 11: Governança de Espelhamento e Sigilo", () => {
    it("captionResumido nunca ultrapassa o limite de 1024 caracteres da API Telegram sendPhoto", () => {
      const longEyemobile = {
        dinheiro: 500.0,
        debito: 400.0,
        credito: 300.0,
        pix: 200.0,
        voucher: 100.0,
        outros: 50.0,
        total: 1550.0,
        vendasContabilizadas: 120,
        vendasDeduplicadasIgnoradas: 15,
        vendasCanceladasIgnoradas: 8,
      };

      const { captionResumido, relatorioCompleto } = buildOfficialClosingForwardMessage({
        colaboradorNome: "Sarah Rodrigues Neves (Folguista Responsável)",
        dataFechamento: "14/11/2026",
        turno: "manha",
        envelope: { dinheiro: 500, debito: 400, credito: 300, pix: 200, voucher: 100 },
        eyemobile: longEyemobile,
        conferencia: {
          tipoConferencia: "total",
          diferencas: [
            "• Dinheiro: Informado R$ 500 vs PDV R$ 550 (-R$ 50)",
            "• Débito: Informado R$ 400 vs PDV R$ 410 (-R$ 10)",
          ],
          status: "divergencia",
        },
        sobra: 25.0,
        totalFotos: 5,
        fotosDuplicadasIgnoradas: 2,
        fechamentoId: "fech-uuid-12345",
        identidadePendente: true,
      });

      expect(captionResumido.length).toBeLessThanOrEqual(1024);
      expect(relatorioCompleto.length).toBeLessThanOrEqual(4096);
      expect(captionResumido).toContain("IDENTIDADE PENDENTE");
    });

    it("se o espelhamento falhar, a mensagem no grupo Folguistas não mente que foi encaminhado", () => {
      const msg = buildFolguistaConfirmationMessage({
        nomeColaborador: "Sarah Rodrigues",
        dataFechamento: "14/11/2026",
        turno: "manha",
        totalFotos: 2,
        espelhamentoSucesso: false,
      });

      expect(msg).toContain("arquivados com segurança no sistema");
      expect(msg).not.toContain("encaminhados para a conferência administrativa no grupo oficial");
    });
  });
});
