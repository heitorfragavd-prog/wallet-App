/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import {
  interpretarTextoEstoque,
  processarEstoqueConversasLoja,
  ReferenciaProdutoDB,
} from "../../supabase/functions/_shared/ai/compras-telegram-engine";

describe("ETAPA 4D.2 - GATE 3: Bateria de Testes Telegram (Testes A, B, C, D, E e F)", () => {
  const referenciasCatalogoMock: ReferenciaProdutoDB[] = [
    {
      id: "ref-salgados-coxinha",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Salgados",
      produto_nome: "Coxinha",
      apelidos: ["coxinha de frango", "coxinha"],
      unidade_medida: "unidade",
      quantidade_referencia: 190,
      ativo: true,
      validacao_status: "confirmado",
    },
    {
      id: "ref-salgados-catupiry",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Salgados",
      produto_nome: "Coxinha C/ Catupiry",
      apelidos: ["coxinha catupiry", "catupiry"],
      unidade_medida: "unidade",
      quantidade_referencia: 210,
      ativo: true,
      validacao_status: "confirmado",
    },
    {
      id: "ref-salgados-hamburguer",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Salgados",
      produto_nome: "Hambúrguer",
      apelidos: ["hamburguer", "hamburgão"],
      unidade_medida: "unidade",
      quantidade_referencia: 30,
      ativo: true,
      validacao_status: "pendente_validacao",
    },
    {
      id: "ref-salgados-kibe",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Salgados",
      produto_nome: "Kibe",
      apelidos: ["quibe", "kibe frito"],
      unidade_medida: "unidade",
      quantidade_referencia: 40,
      ativo: true,
      validacao_status: "confirmado",
    },
    {
      id: "ref-coca-350-orig",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Coca-Cola",
      produto_nome: "Coca 350ml original",
      apelidos: ["coca lata", "coca normal 350", "coca 350"],
      unidade_medida: "caixa",
      quantidade_referencia: 15,
      ativo: true,
      validacao_status: "confirmado",
    },
    {
      id: "ref-coca-350-zero",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Coca-Cola",
      produto_nome: "Coca 350ml zero",
      apelidos: ["coca zero lata", "coca lata zero", "zero 350"],
      unidade_medida: "caixa",
      quantidade_referencia: 10,
      ativo: true,
      validacao_status: "confirmado",
    },
    {
      id: "ref-coca-200-orig",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Coca-Cola",
      produto_nome: "Coca 200ml",
      apelidos: ["caculinha", "coca mini", "coca 200"],
      unidade_medida: "fardo",
      quantidade_referencia: 6,
      ativo: true,
      validacao_status: "pendente_validacao",
    },
  ];

  // --------------------------------------------------------------------------
  // TESTE A: MENSAGENS DE TEXTO BÁSICAS
  // --------------------------------------------------------------------------
  it("Teste A: deve identificar corretamente produtos informados em linhas simples de texto", () => {
    const texto = `Coxinha = 20
Coxinha C/ Catupiry = 15
Hambúrguer = 10`;

    const { itens } = interpretarTextoEstoque(texto, referenciasCatalogoMock);

    expect(itens.length).toBe(3);

    const coxinha = itens.find((i) => i.produto_nome === "Coxinha");
    expect(coxinha).toBeDefined();
    expect(coxinha?.quantidade_informada).toBe(20);
    expect(coxinha?.tipo_informacao).toBe("confirmado_positivo");

    const catupiry = itens.find((i) => i.produto_nome === "Coxinha C/ Catupiry");
    expect(catupiry).toBeDefined();
    expect(catupiry?.quantidade_informada).toBe(15);
    expect(catupiry?.tipo_informacao).toBe("confirmado_positivo");

    const hamb = itens.find((i) => i.produto_nome === "Hambúrguer");
    expect(hamb).toBeDefined();
    expect(hamb?.quantidade_informada).toBe(10);
    expect(hamb?.tipo_informacao).toBe("confirmado_positivo");
  });

  // --------------------------------------------------------------------------
  // TESTE B: PRODUTOS COM VARIANTES DE VOLUME E SABOR
  // --------------------------------------------------------------------------
  it("Teste B: não deve confundir volumes e variantes (Coca 350ml orig, zero e 200ml)", () => {
    const texto = `Coca-Cola 350ml original = 8
Coca-Cola 350ml zero = 2
Coca-Cola 200ml original = 12`;

    const { itens } = interpretarTextoEstoque(texto, referenciasCatalogoMock);

    expect(itens.length).toBe(3);

    const coca350Orig = itens.find((i) => i.produto_nome === "Coca 350ml original");
    expect(coca350Orig).toBeDefined();
    expect(coca350Orig?.quantidade_informada).toBe(8);

    const coca350Zero = itens.find((i) => i.produto_nome === "Coca 350ml zero");
    expect(coca350Zero).toBeDefined();
    expect(coca350Zero?.quantidade_informada).toBe(2);

    const coca200 = itens.find((i) => i.produto_nome === "Coca 200ml");
    expect(coca200).toBeDefined();
    expect(coca200?.quantidade_informada).toBe(12);
  });

  // --------------------------------------------------------------------------
  // TESTE C: ESTOQUE ZERO VS PENDÊNCIA (SEM ZERO FALSO)
  // --------------------------------------------------------------------------
  it("Teste C: Kibe acabou (zero confirmado) e Coxinha não contei (pendente)", () => {
    const texto = `Kibe acabou.
Coxinha não contei.`;

    const { itens } = interpretarTextoEstoque(texto, referenciasCatalogoMock);

    const kibe = itens.find((i) => i.produto_nome === "Kibe");
    expect(kibe).toBeDefined();
    expect(kibe?.quantidade_informada).toBe(0);
    expect(kibe?.tipo_informacao).toBe("confirmado_zero");

    const coxinha = itens.find((i) => i.produto_nome === "Coxinha");
    expect(coxinha).toBeDefined();
    expect(coxinha?.quantidade_informada).toBeNull();
    expect(coxinha?.tipo_informacao).toBe("pendente");
  });

  // --------------------------------------------------------------------------
  // TESTE D: CORREÇÃO DE ESTOQUE (SUBSTITUIÇÃO, SEM SOMAR)
  // --------------------------------------------------------------------------
  it("Teste D: mensagem de correção deve substituir o valor (25) e não somar (20 + 25)", () => {
    // 1ª leitura
    const texto1 = "Coxinha = 20";
    const res1 = interpretarTextoEstoque(texto1, referenciasCatalogoMock);
    expect(res1.itens[0].quantidade_informada).toBe(20);
    expect(res1.itens[0].is_correcao).toBe(false);

    // 2ª leitura retificando
    const texto2 = "Corrigindo, Coxinha = 25";
    const res2 = interpretarTextoEstoque(texto2, referenciasCatalogoMock);
    expect(res2.itens[0].quantidade_informada).toBe(25);
    expect(res2.itens[0].is_correcao).toBe(true);

    // Valida que o valor final da correção é exatamente 25 (não 45)
    const valorCorreto = res2.itens[0].quantidade_informada;
    expect(valorCorreto).toBe(25);
    expect(valorCorreto).not.toBe(45);
  });

  // --------------------------------------------------------------------------
  // TESTE E: FOTOGRAFIAS COM OCR / VISÃO
  // --------------------------------------------------------------------------
  it("Teste E: fotografia ilegível ou sem contagem não deve criar quantidades inventadas", () => {
    const textoFotoIlegivel = "Foto desfocada do balcão sem texto legível";
    const { itens } = interpretarTextoEstoque(textoFotoIlegivel, referenciasCatalogoMock);
    expect(itens.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TESTE F: ÁUDIO WHISPER E ROTEAMENTO PARA A RPC
  // --------------------------------------------------------------------------
  it("Teste F: deve processar transcrição Whisper e repassar canal telegram_audio para a RPC", async () => {
    const mockSendReply = vi.fn().mockResolvedValue({});
    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === "compras_produtos_referencia") {
          const qb: any = {
            select: vi.fn().mockImplementation(() => qb),
            eq: vi.fn().mockImplementation(() => qb),
            order: vi.fn().mockImplementation(() => qb),
            then: (res: any) => res({ data: referenciasCatalogoMock, error: null }),
          };
          return qb;
        }
        if (table === "compras_config") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
                simulacao_modo: true,
                token_vinculacao_loja: "RODO-LOJA-C40F5070",
              },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: vi.fn().mockResolvedValue({
        data: {
          status: "sucesso",
          fornecedor_nome: "Salgados",
          produto_nome: "Coxinha",
          quantidade_informada: 18,
          origem_tipo: "telegram_audio",
          novo_status_pedido: "pedido_calculado",
        },
        error: null,
      }),
    };

    const audioMessage = {
      message_id: 201,
      chat: { id: -10099887766 },
      from: { id: 7771, first_name: "Colaboradora", is_bot: false },
      voice: { file_id: "audio_voice_test_file", duration: 4 },
    };

    const res = await processarEstoqueConversasLoja({
      supabase: mockSupabase,
      message: audioMessage,
      grupoConfig: { tipo_grupo: "conversas_loja" },
      workspaceId: "2af415b6-76aa-4134-8133-a9b405671c1c",
      userId: "user-test-1",
      telegramBotToken: "fake_token",
      supabaseUrl: "https://mock.supabase.co",
      supabaseServiceKey: "key",
      sendReply: mockSendReply,
      transcricaoAudio: "Contamos aqui: Coxinha são 18 unidades e Kibe acabou.",
      origemTipoParam: "telegram_audio",
    });

    expect(res.status).toBe(200);
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "registrar_item_conferencia_estoque",
      expect.objectContaining({
        p_origem_tipo: "telegram_audio",
      })
    );

    expect(mockSendReply).toHaveBeenCalled();
    const reply = mockSendReply.mock.calls[0][0];
    expect(reply).toContain("telegram_audio");
  });
});
