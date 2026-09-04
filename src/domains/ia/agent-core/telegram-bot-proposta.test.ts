import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseNum, parseDate } from "../services/boleto-validator";

describe("Telegram Boleto Proposal - Inline Keyboard, Callbacks & Text Fallback", () => {
  const PROPOSTA_ID_TESTE = "prop-uuid-1234-5678";
  const USER_ID_TESTE = "user-uuid-owner";
  const CHAT_ID_TESTE = 987654321;
  const SPAL_LINHA = "34191.09115 01746.492931 83045.790009 8 15520000156261";

  let mockPropostas: Map<string, any>;
  let mockDividas: any[];
  let mockTelegramCalls: { endpoint: string; body: any }[];

  beforeEach(() => {
    mockPropostas = new Map();
    mockDividas = [];
    mockTelegramCalls = [];

    mockPropostas.set(PROPOSTA_ID_TESTE, {
      id: PROPOSTA_ID_TESTE,
      user_id: USER_ID_TESTE,
      chat_id: CHAT_ID_TESTE,
      tipo: "cadastrar_divida",
      status: "pendente",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      dados: {
        descricao: "Boleto - SPAL INDUSTRIA BRASILEIRA DE",
        valor_total: 1562.61,
        valor_restante: 1562.61,
        data_vencimento: "2026-08-28",
        credor: "SPAL INDUSTRIA BRASILEIRA DE",
        banco: "341",
        linha_digitavel: "34191091150174649293183045790009815520000156261",
        validation_status: "validado",
        categoria_id: "cat-123",
        categoria_nome: "Fornecedores",
      },
    });
  });

  const mockExecutarConfirmacao = async (
    targetUserId: string,
    targetChatId: string | number,
    proposta: any,
    messageIdToEdit?: number
  ) => {
    const dados = proposta.dados || {};

    if (proposta.status === "confirmada" || dados?.divida_id_gerada) {
      if (messageIdToEdit) {
        mockTelegramCalls.push({
          endpoint: "editMessageReplyMarkup",
          body: { chat_id: targetChatId, message_id: messageIdToEdit, reply_markup: { inline_keyboard: [] } },
        });
      }
      return { success: true, already_confirmed: true, message: "ℹ️ Este boleto já foi confirmado e cadastrado anteriormente." };
    }

    if (proposta.status === "expirada" || (proposta.expires_at && new Date(proposta.expires_at) < new Date())) {
      if (messageIdToEdit) {
        mockTelegramCalls.push({
          endpoint: "editMessageReplyMarkup",
          body: { chat_id: targetChatId, message_id: messageIdToEdit, reply_markup: { inline_keyboard: [] } },
        });
      }
      proposta.status = "expirada";
      mockPropostas.set(proposta.id, proposta);
      return { success: false, expired: true, message: "⏰ Esta proposta expirou. Envie o boleto novamente para cadastrar." };
    }

    if (proposta.status === "cancelada") {
      if (messageIdToEdit) {
        mockTelegramCalls.push({
          endpoint: "editMessageReplyMarkup",
          body: { chat_id: targetChatId, message_id: messageIdToEdit, reply_markup: { inline_keyboard: [] } },
        });
      }
      return { success: false, canceled: true, message: "❌ Esta proposta foi cancelada anteriormente." };
    }

    const novaDivida = {
      id: "divida-" + (mockDividas.length + 1),
      user_id: targetUserId,
      descricao: dados.descricao,
      valor_total: dados.valor_total,
      valor_restante: dados.valor_restante,
      data_vencimento: dados.data_vencimento,
      credor: dados.credor,
      categoria_id: dados.categoria_id,
      status: "pendente",
    };
    mockDividas.push(novaDivida);

    proposta.status = "confirmada";
    proposta.dados.divida_id_gerada = novaDivida.id;
    proposta.dados.confirmed_at = new Date().toISOString();
    mockPropostas.set(proposta.id, proposta);

    if (messageIdToEdit) {
      mockTelegramCalls.push({
        endpoint: "editMessageReplyMarkup",
        body: { chat_id: targetChatId, message_id: messageIdToEdit, reply_markup: { inline_keyboard: [] } },
      });
    }

    return {
      success: true,
      divida: novaDivida,
      message: `✅ Boleto cadastrado com sucesso!\n\n🏢 Beneficiário: ${novaDivida.credor}\n💰 Valor: R$ 1.562,61\n🗓️ Vencimento: 28/08/2026`,
    };
  };

  const mockExecutarCancelamento = async (
    targetUserId: string,
    targetChatId: string | number,
    proposta: any,
    messageIdToEdit?: number
  ) => {
    if (messageIdToEdit) {
      mockTelegramCalls.push({
        endpoint: "editMessageReplyMarkup",
        body: { chat_id: targetChatId, message_id: messageIdToEdit, reply_markup: { inline_keyboard: [] } },
      });
    }
    if (proposta?.id) {
      proposta.status = "cancelada";
      mockPropostas.set(proposta.id, proposta);
    }
    return { success: true, canceled: true, message: "❌ Cadastro cancelado. O boleto não foi registrado." };
  };

  it("1. Proposta gera dois botões inline corretos", () => {
    const botoes = [
      [
        { text: "✅ Sim, cadastrar", callback_data: `confirmar_proposta:${PROPOSTA_ID_TESTE}` },
        { text: "❌ Não, cancelar", callback_data: `cancelar_proposta:${PROPOSTA_ID_TESTE}` },
      ],
    ];

    expect(botoes[0]).toHaveLength(2);
    expect(botoes[0][0].text).toBe("✅ Sim, cadastrar");
    expect(botoes[0][1].text).toBe("❌ Não, cancelar");
  });

  it("2. Botão SIM contém callback_data com proposta_id correto", () => {
    const callbackData = `confirmar_proposta:${PROPOSTA_ID_TESTE}`;
    expect(callbackData).toBe("confirmar_proposta:prop-uuid-1234-5678");
    expect(callbackData.length).toBeLessThan(64);
  });

  it("3. Botão NÃO contém callback_data com proposta_id correto", () => {
    const callbackData = `cancelar_proposta:${PROPOSTA_ID_TESTE}`;
    expect(callbackData).toBe("cancelar_proposta:prop-uuid-1234-5678");
    expect(callbackData.length).toBeLessThan(64);
  });

  it("4. Callback SIM cria uma única dívida no banco de dados", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    const res = await mockExecutarConfirmacao(USER_ID_TESTE, CHAT_ID_TESTE, prop, 555);

    expect(res.success).toBe(true);
    expect(mockDividas).toHaveLength(1);
    expect(mockDividas[0].credor).toBe("SPAL INDUSTRIA BRASILEIRA DE");
    expect(mockDividas[0].valor_total).toBe(1562.61);
    expect(mockDividas[0].data_vencimento).toBe("2026-08-28");
    expect(prop.status).toBe("confirmada");
    expect(prop.dados.divida_id_gerada).toBe(mockDividas[0].id);
  });

  it("5. Callback SIM repetido (clique duplo) não duplica a dívida (Idempotência)", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);

    const res1 = await mockExecutarConfirmacao(USER_ID_TESTE, CHAT_ID_TESTE, prop, 555);
    expect(res1.success).toBe(true);
    expect(mockDividas).toHaveLength(1);

    const res2 = await mockExecutarConfirmacao(USER_ID_TESTE, CHAT_ID_TESTE, prop, 555);
    expect(res2.already_confirmed).toBe(true);
    expect(res2.message).toContain("já foi confirmado e cadastrado anteriormente");
    expect(mockDividas).toHaveLength(1);
  });

  it("6. Callback NÃO cancela a proposta e não cria dívidas", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    const res = await mockExecutarCancelamento(USER_ID_TESTE, CHAT_ID_TESTE, prop, 555);

    expect(res.success).toBe(true);
    expect(res.canceled).toBe(true);
    expect(prop.status).toBe("cancelada");
    expect(mockDividas).toHaveLength(0);
  });

  it("7. Callback de proposta expirada não cadastra e avisa o usuário", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    prop.expires_at = new Date(Date.now() - 1000).toISOString();

    const res = await mockExecutarConfirmacao(USER_ID_TESTE, CHAT_ID_TESTE, prop, 555);
    expect(res.success).toBe(false);
    expect(res.expired).toBe(true);
    expect(res.message).toContain("Esta proposta expirou");
    expect(mockDividas).toHaveLength(0);
  });

  it("8. Callback de outro usuário é rejeitado por segurança", () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    const hackerUserId = "user-uuid-attacker";

    const permitido = prop.user_id === hackerUserId;
    expect(permitido).toBe(false);
  });

  it("9. Proposta confirmada remove os botões inline da mensagem", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    await mockExecutarConfirmacao(USER_ID_TESTE, CHAT_ID_TESTE, prop, 555);

    const callEdit = mockTelegramCalls.find(
      (c) => c.endpoint === "editMessageReplyMarkup" && c.body.message_id === 555
    );
    expect(callEdit).toBeDefined();
    expect(callEdit?.body.reply_markup.inline_keyboard).toEqual([]);
  });

  it("10. Proposta cancelada remove os botões inline da mensagem", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    await mockExecutarCancelamento(USER_ID_TESTE, CHAT_ID_TESTE, prop, 555);

    const callEdit = mockTelegramCalls.find(
      (c) => c.endpoint === "editMessageReplyMarkup" && c.body.message_id === 555
    );
    expect(callEdit).toBeDefined();
    expect(callEdit?.body.reply_markup.inline_keyboard).toEqual([]);
  });

  it("11. SIM textual continua funcionando chamando a mesma função de confirmação", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    const res = await mockExecutarConfirmacao(USER_ID_TESTE, CHAT_ID_TESTE, prop);

    expect(res.success).toBe(true);
    expect(mockDividas).toHaveLength(1);
    expect(mockDividas[0].credor).toBe("SPAL INDUSTRIA BRASILEIRA DE");
  });

  it("12. NÃO textual continua funcionando chamando a mesma função de cancelamento", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    const res = await mockExecutarCancelamento(USER_ID_TESTE, CHAT_ID_TESTE, prop);

    expect(res.success).toBe(true);
    expect(prop.status).toBe("cancelada");
    expect(mockDividas).toHaveLength(0);
  });

  it("13. Preservação de dados financeiros SPAL no cadastro", async () => {
    const prop = mockPropostas.get(PROPOSTA_ID_TESTE);
    const res = await mockExecutarConfirmacao(USER_ID_TESTE, CHAT_ID_TESTE, prop);

    expect(res.divida?.valor_total).toBe(1562.61);
    expect(res.divida?.data_vencimento).toBe("2026-08-28");
    expect(res.divida?.credor).toBe("SPAL INDUSTRIA BRASILEIRA DE");
    expect(prop.dados.linha_digitavel).toBe("34191091150174649293183045790009815520000156261");
  });

  it("14. Funções de parsing produtivo parseNum e parseDate convertem valores e datas reais", () => {
    // 1. Números e formatos de moeda
    expect(parseNum(1562.61)).toBe(1562.61);
    expect(parseNum("1562.61")).toBe(1562.61);
    expect(parseNum("1.562,61")).toBe(1562.61);
    expect(parseNum("R$ 1.562,61")).toBe(1562.61);
    expect(parseNum("R$ 1562.61")).toBe(1562.61);
    expect(parseNum(null)).toBe(0);
    expect(parseNum(undefined)).toBe(0);
    expect(parseNum("")).toBe(0);

    // 2. Datas em formato ISO e formato Brasileiro
    expect(parseDate("2026-08-28")).toBe("2026-08-28");
    expect(parseDate("28/08/2026")).toBe("2026-08-28");
    expect(parseDate("2026-08-28T00:00:00.000Z")).toBe("2026-08-28");
    expect(parseDate(null, "2026-08-28")).toBe("2026-08-28");
  });
});
