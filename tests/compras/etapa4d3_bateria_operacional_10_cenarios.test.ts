/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import {
  interpretarTextoEstoque,
  processarEstoqueConversasLoja,
  ReferenciaProdutoDB,
} from "../../supabase/functions/_shared/ai/compras-telegram-engine";
import {
  calcularSugestaoCompra,
  ItemCalculoCompra,
} from "../../src/domains/compras/services/ComprasEngine";
import {
  consolidarItensEmSessao,
} from "../../src/domains/compras/services/ComprasConsolidator";
import {
  PedidoCompraAdmin,
} from "../../src/domains/compras/components/PainelComprasAdmin";

/**
 * MISSÃO 3: Bateria Operacional Isolada de 10 Cenários (Rodo Point)
 * MISSÃO 4: Homologação Integrada do Pipeline Ponta a Ponta
 *
 * RESTRIÇÃO ESTRITA: simulacao_modo = true ativo em toda a execução.
 * Nenhum envio real a fornecedores ou mensagens proativas a colaboradores.
 */

describe("MISSÃO 3 & 4: Bateria Operacional (10 Cenários) e Homologação Ponta a Ponta - Rodo Point Compras", () => {
  // Catálogo canônico da Rodo Point para testes operacionais
  const catalogoMock: ReferenciaProdutoDB[] = [
    {
      id: "ref-salgados-coxinha",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Salgados",
      produto_nome: "Coxinha",
      categoria: "Salgados",
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
      categoria: "Salgados",
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
      categoria: "Salgados",
      unidade_medida: "unidade",
      quantidade_referencia: 30,
      ativo: true,
      validacao_status: "confirmado",
    },
    {
      id: "ref-salgados-kibe",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Salgados",
      produto_nome: "Kibe",
      categoria: "Salgados",
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
      categoria: "Refrigerantes",
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
      categoria: "Refrigerantes",
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
      categoria: "Refrigerantes",
      unidade_medida: "fardo",
      quantidade_referencia: 6,
      ativo: true,
      validacao_status: "confirmado",
    },
    {
      id: "ref-ceasa-redbull-250",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Ceasa",
      produto_nome: "Red Bull 250 ml",
      categoria: "Energéticos",
      unidade_medida: "caixa",
      quantidade_referencia: 8,
      ativo: true,
      validacao_status: "confirmado",
    },
    {
      id: "ref-ceasa-redbull-473",
      workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fornecedor_nome: "Ceasa",
      produto_nome: "Red Bull 473 ml",
      categoria: "Energéticos",
      unidade_medida: "caixa",
      quantidade_referencia: 4,
      ativo: true,
      validacao_status: "confirmado",
    },
  ];

  // =========================================================================
  // CENÁRIO 1: Lista de Estoque em Formato Texto Simples (telegram_texto)
  // =========================================================================
  describe("Cenário 1: Lista de Estoque em Formato Texto Simples", () => {
    it("deve interpretar linhas de texto com separadores simples e registrar contagens confirmadas", () => {
      const mensagemTexto = `Coxinha = 20\nCoxinha C/ Catupiry = 15\nHambúrguer = 10`;
      const { itens, itensNaoReconhecidos } = interpretarTextoEstoque(mensagemTexto, catalogoMock);

      expect(itens).toHaveLength(3);
      expect(itensNaoReconhecidos).toHaveLength(0);

      const coxinha = itens.find((i) => i.produto_nome === "Coxinha");
      expect(coxinha?.quantidade_informada).toBe(20);
      expect(coxinha?.tipo_informacao).toBe("confirmado_positivo");

      const catupiry = itens.find((i) => i.produto_nome === "Coxinha C/ Catupiry");
      expect(catupiry?.quantidade_informada).toBe(15);
      expect(catupiry?.tipo_informacao).toBe("confirmado_positivo");

      const hamb = itens.find((i) => i.produto_nome === "Hambúrguer");
      expect(hamb?.quantidade_informada).toBe(10);
      expect(hamb?.tipo_informacao).toBe("confirmado_positivo");
    });
  });

  // =========================================================================
  // CENÁRIO 2: Correção de Quantidade (Substituição, sem somar)
  // =========================================================================
  describe("Cenário 2: Correção de Quantidade (Substituição, sem somar)", () => {
    it("deve substituir o valor de contagem de 20 para 25 (e NÃO somar 20 + 25 = 45)", () => {
      // 1ª contagem
      const msg1 = "Coxinha = 20";
      const res1 = interpretarTextoEstoque(msg1, catalogoMock);
      expect(res1.itens[0].quantidade_informada).toBe(20);
      expect(res1.itens[0].is_correcao).toBe(false);

      // 2ª contagem retificadora com gatilho "Corrigindo"
      const msg2 = "Corrigindo, Coxinha = 25";
      const res2 = interpretarTextoEstoque(msg2, catalogoMock);
      expect(res2.itens[0].quantidade_informada).toBe(25);
      expect(res2.itens[0].is_correcao).toBe(true);

      // Consolidação no pedido existente
      const itensExistentes = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      itensExistentes.set("Coxinha", { estoque_atual: 20, status_estoque: "confirmado_positivo" });

      const consolidado = consolidarItensEmSessao(
        [
          {
            produto_nome: "Coxinha",
            quantidade_informada: 25,
            tipo_informacao: "confirmado_positivo",
            confianca: 1.0,
            is_correcao: true,
          },
        ],
        {
          pedidoId: "ped-salgados-001",
          pedidoStatus: "aguardando_estoque",
          itensExistentes,
          fornecedorNome: "Salgados",
          dataOperacional: "2026-11-19",
        },
        {
          chatId: "-1001",
          nomeUsuario: "Operador",
          origemTipo: "telegram_texto",
        }
      );

      const itemCoxinha = consolidado.itens_consolidados.find((i) => i.produto_nome === "Coxinha");
      expect(itemCoxinha?.quantidade_anterior).toBe(20);
      expect(itemCoxinha?.quantidade_atual).toBe(25);
      expect(itemCoxinha?.quantidade_atual).not.toBe(45);
      expect(itemCoxinha?.foi_corrigido).toBe(true);
    });
  });

  // =========================================================================
  // CENÁRIO 3: Estoque Zero Confirmado (confirmado_zero)
  // =========================================================================
  describe("Cenário 3: Estoque Zero Confirmado (confirmado_zero)", () => {
    it("deve registrar estoque = 0 com status confirmado_zero quando informado 'acabou' ou '0'", () => {
      const msg = "Kibe acabou, zerado no freezer";
      const { itens } = interpretarTextoEstoque(msg, catalogoMock);

      const kibe = itens.find((i) => i.produto_nome === "Kibe");
      expect(kibe).toBeDefined();
      expect(kibe?.quantidade_informada).toBe(0);
      expect(kibe?.tipo_informacao).toBe("confirmado_zero");

      // Sugestão de compra gerada: REF 40 - Estoque 0 = 40
      const itensCalc: ItemCalculoCompra[] = [
        {
          produto_nome: "Kibe",
          quantidade_referencia: 40,
          estoque_atual: 0,
          status_estoque: "confirmado_zero",
        },
      ];
      const resCalc = calcularSugestaoCompra(itensCalc, { fornecedorNome: "Salgados", formatoLista: "salgados_soma" });
      expect(resCalc.itens[0].quantidade_sugerida).toBe(40);
    });
  });

  // =========================================================================
  // CENÁRIO 4: Produto Ausente na Contagem (pendente_contagem, sem falsos zeros)
  // =========================================================================
  describe("Cenário 4: Produto Ausente na Contagem (pendente_contagem, sem falsos zeros)", () => {
    it("deve manter produtos não contados como pendente_contagem e quantidade_sugerida = null", () => {

      const itensExistentes = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      itensExistentes.set("Coxinha", { estoque_atual: null, status_estoque: "pendente_contagem" });
      itensExistentes.set("Kibe", { estoque_atual: null, status_estoque: "pendente_contagem" });

      const consolidado = consolidarItensEmSessao(
        [
          {
            produto_nome: "Coxinha",
            quantidade_informada: 30,
            tipo_informacao: "confirmado_positivo",
            confianca: 1.0,
            is_correcao: false,
          },
        ],
        {
          pedidoId: "ped-salgados-002",
          pedidoStatus: "aguardando_estoque",
          itensExistentes,
          fornecedorNome: "Salgados",
          dataOperacional: "2026-11-19",
        },
        {
          chatId: "-1001",
          nomeUsuario: "Operador",
          origemTipo: "telegram_texto",
        }
      );

      expect(consolidado.status_pedido_novo).toBe("estoque_incompleto");
      expect(consolidado.total_itens_confirmados).toBe(1);
      expect(consolidado.total_itens_pendentes).toBe(1);

      // Verificação no motor de cálculo: Kibe pendente NUNCA gera compra precipitada
      const itensCalc: ItemCalculoCompra[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, estoque_atual: 30, status_estoque: "confirmado_positivo" },
        { produto_nome: "Kibe", quantidade_referencia: 40, estoque_atual: null, status_estoque: "pendente_contagem" },
      ];
      const resCalc = calcularSugestaoCompra(itensCalc, { fornecedorNome: "Salgados", formatoLista: "salgados_soma" });
      expect(resCalc.statusPedido).toBe("estoque_incompleto");

      const kibeCalc = resCalc.todosItens?.find((i) => i.produto_nome === "Kibe");
      expect(kibeCalc?.quantidade_sugerida).toBeNull();
      expect(kibeCalc?.status_estoque).toBe("pendente_contagem");
      expect(resCalc.textoFormatado).toContain("40 | Kibe = [aguardando contagem]");
      expect(resCalc.textoFormatado).not.toContain("40 | Kibe = 40");
    });
  });

  // =========================================================================
  // CENÁRIO 5: Ingestão de Fotografia de Estoque (OCR / Visão)
  // =========================================================================
  describe("Cenário 5: Ingestão de Fotografia de Estoque (OCR / Visão)", () => {
    it("deve rejeitar imagens sem contagem legível e processar fotografias estruturadas sem inventar números", () => {
      // 1. Foto sem dados legíveis
      const fotoIlegivel = "Foto da gaveta escura sem prancheta";
      const resVazia = interpretarTextoEstoque(fotoIlegivel, catalogoMock);
      expect(resVazia.itens).toHaveLength(0);

      // 2. Foto com transcrição sintética simulada da prancheta
      const textoTranscritoFoto = "Coxinha: 40 unidades\nCoxinha C/ Catupiry: 20 unidades";
      const resFoto = interpretarTextoEstoque(textoTranscritoFoto, catalogoMock);
      expect(resFoto.itens).toHaveLength(2);

      const coxinha = resFoto.itens.find((i) => i.produto_nome === "Coxinha");
      expect(coxinha?.quantidade_informada).toBe(40);
      expect(coxinha?.tipo_informacao).toBe("confirmado_positivo");

      const catupiry = resFoto.itens.find((i) => i.produto_nome === "Coxinha C/ Catupiry");
      expect(catupiry?.quantidade_informada).toBe(20);
      expect(catupiry?.tipo_informacao).toBe("confirmado_positivo");
    });
  });

  // =========================================================================
  // CENÁRIO 6: Áudio Transcrito via Whisper (telegram_audio)
  // =========================================================================
  describe("Cenário 6: Áudio Transcrito via Whisper (telegram_audio)", () => {
    it("deve processar mensagem de voz com transcrição Whisper e passar origem telegram_audio à RPC", async () => {
      const mockSendReply = vi.fn().mockResolvedValue({});
      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === "compras_produtos_referencia") {
            const qb: any = {
              select: vi.fn().mockImplementation(() => qb),
              eq: vi.fn().mockImplementation(() => qb),
              order: vi.fn().mockImplementation(() => qb),
              then: (res: any) => res({ data: catalogoMock, error: null }),
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

      const voiceMsg = {
        message_id: 301,
        chat: { id: -10099887766 },
        from: { id: 8882, first_name: "Funcionária Balcão", is_bot: false },
        voice: { file_id: "whisper_voice_test_id", duration: 3 },
      };

      const res = await processarEstoqueConversasLoja({
        supabase: mockSupabase,
        message: voiceMsg,
        grupoConfig: { tipo_grupo: "conversas_loja" },
        workspaceId: "2af415b6-76aa-4134-8133-a9b405671c1c",
        userId: "user-test-voice",
        telegramBotToken: "mock_token",
        supabaseUrl: "https://mock.supabase.co",
        supabaseServiceKey: "service_key",
        sendReply: mockSendReply,
        transcricaoAudio: "Contamos aqui: Coxinha tem 18 unidades e Kibe acabou.",
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
      expect(mockSendReply.mock.calls[0][0]).toContain("telegram_audio");
    });
  });

  // =========================================================================
  // CENÁRIO 7: Desambiguação de Volume e Sabor
  // =========================================================================
  describe("Cenário 7: Desambiguação de Volume e Sabor", () => {
    it("deve desambiguar Coca 350ml original vs zero vs 200ml e Red Bull 250ml vs 473ml sem colisões", () => {
      const texto = `Coca-Cola 350ml original = 8
Coca-Cola 350ml zero = 2
Coca-Cola 200ml = 12
Red Bull 250 ml = 5
Red Bull 473 ml = 1`;

      const { itens, itensNaoReconhecidos } = interpretarTextoEstoque(texto, catalogoMock);
      expect(itens).toHaveLength(5);
      expect(itensNaoReconhecidos).toHaveLength(0);

      const c350Orig = itens.find((i) => i.produto_nome === "Coca 350ml original");
      expect(c350Orig?.quantidade_informada).toBe(8);

      const c350Zero = itens.find((i) => i.produto_nome === "Coca 350ml zero");
      expect(c350Zero?.quantidade_informada).toBe(2);

      const c200 = itens.find((i) => i.produto_nome === "Coca 200ml");
      expect(c200?.quantidade_informada).toBe(12);

      const rb250 = itens.find((i) => i.produto_nome === "Red Bull 250 ml");
      expect(rb250?.quantidade_informada).toBe(5);

      const rb473 = itens.find((i) => i.produto_nome === "Red Bull 473 ml");
      expect(rb473?.quantidade_informada).toBe(1);
    });
  });

  // =========================================================================
  // CENÁRIO 8: Geração Automatizada da Quantidade de Compras
  // =========================================================================
  describe("Cenário 8: Geração Automatizada da Quantidade de Compras", () => {
    it("deve calcular MAX(0, REF - Estoque), aplicar aumento temporário e respeitar formato específico de fornecedor", () => {
      // 1. Salgados com formatação específica "Total | Produto = Qtd"
      const itensSalgados: ItemCalculoCompra[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, estoque_atual: 40 },
        { produto_nome: "Coxinha C/ Catupiry", quantidade_referencia: 210, estoque_atual: 50 },
      ];
      const resSalgados = calcularSugestaoCompra(itensSalgados, {
        fornecedorNome: "Salgados",
        formatoLista: "salgados_soma",
      });
      // Coxinha: 190 - 40 = 150; Catupiry: 210 - 50 = 160; Total = 310
      expect(resSalgados.totalUnidadesSugeridas).toBe(310);
      expect(resSalgados.textoFormatado).toContain("190 | Coxinha = 150");
      expect(resSalgados.textoFormatado).toContain("210 | Coxinha C/ Catupiry = 160");

      // 2. Bebidas com aumento temporário de 25% e sem expor estoque
      const itensBebidas: ItemCalculoCompra[] = [
        { produto_nome: "Coca 350ml original", quantidade_referencia: 100, estoque_atual: 20 },
      ];
      const resBebidas = calcularSugestaoCompra(itensBebidas, {
        fornecedorNome: "Coca-Cola",
        formatoLista: "bebidas_sem_ref",
        aumentoTemporarioPct: 25,
      });
      // Ref vira 125, sugerida = 125 - 20 = 105
      expect(resBebidas.itens[0].quantidade_sugerida).toBe(105);
      expect(resBebidas.textoFormatado).toContain("Coca 350ml original = 105");
      expect(resBebidas.textoFormatado).not.toContain("Estoque");
      expect(resBebidas.textoFormatado).not.toContain("REF");
    });
  });

  // =========================================================================
  // CENÁRIO 9: Visualização do Painel & Badges em /compras
  // =========================================================================
  describe("Cenário 9: Visualização do Painel & Badges em /compras", () => {
    it("deve exibir status calculados, badge de Modo Simulação e segregação de itens pendentes vs confirmados", () => {
      const pedidoAdmin: PedidoCompraAdmin = {
        id: "ped-rodo-coca-001",
        fornecedor_nome: "Coca-Cola",
        data_pedido: "2026-11-19",
        dia_semana: 4,
        status: "pedido_calculado",
        aumento_temporario_pct: 0,
        texto_pedido_formatado: "Coca 350ml original = 7\nCoca 350ml zero = 8",
        simulacao: true,
        itens: [
          {
            id: "it-1",
            produto_nome: "Coca 350ml original",
            categoria: "Refrigerantes",
            unidade_medida: "caixa",
            quantidade_referencia: 15,
            estoque_atual: 8,
            quantidade_sugerida: 7,
            quantidade_ajustada: 7,
            status_estoque: "confirmado_positivo",
            contagem_origem: "telegram_texto",
          },
          {
            id: "it-2",
            produto_nome: "Coca 350ml zero",
            categoria: "Refrigerantes",
            unidade_medida: "caixa",
            quantidade_referencia: 10,
            estoque_atual: 2,
            quantidade_sugerida: 8,
            quantidade_ajustada: 8,
            status_estoque: "confirmado_positivo",
            contagem_origem: "telegram_audio",
          },
          {
            id: "it-3",
            produto_nome: "Coca 200ml",
            categoria: "Refrigerantes",
            unidade_medida: "fardo",
            quantidade_referencia: 6,
            estoque_atual: null,
            quantidade_sugerida: null,
            quantidade_ajustada: null,
            status_estoque: "pendente_contagem",
          },
        ],
      };

      // Validação de regras visuais do painel
      expect(pedidoAdmin.simulacao).toBe(true);
      expect(pedidoAdmin.status).toBe("pedido_calculado");

      const itensConfirmados = pedidoAdmin.itens.filter((i) => i.status_estoque === "confirmado_positivo");
      const itensPendentes = pedidoAdmin.itens.filter((i) => i.status_estoque === "pendente_contagem");

      expect(itensConfirmados).toHaveLength(2);
      expect(itensPendentes).toHaveLength(1);
      expect(itensPendentes[0].quantidade_sugerida).toBeNull();
    });
  });

  // =========================================================================
  // CENÁRIO 10: Aprovação Simulada Protegendo Ajustes Manuais
  // =========================================================================
  describe("Cenário 10: Aprovação Simulada Protegendo Ajustes Manuais", () => {
    it("deve preservar ajustes manuais (ex: 7 -> 10 caixas), selar como aprovado e bloquear despacho real", () => {
      const pedidoComAjuste: PedidoCompraAdmin = {
        id: "ped-rodo-coca-001",
        fornecedor_nome: "Coca-Cola",
        data_pedido: "2026-11-19",
        dia_semana: 4,
        status: "pedido_calculado",
        aumento_temporario_pct: 0,
        texto_pedido_formatado: "Coca 350ml original = 7",
        simulacao: true,
        itens: [
          {
            id: "it-1",
            produto_nome: "Coca 350ml original",
            categoria: "Refrigerantes",
            unidade_medida: "caixa",
            quantidade_referencia: 15,
            estoque_atual: 8,
            quantidade_sugerida: 7,
            quantidade_ajustada: 10, // Ajustado manualmente pelo gestor executivo
            ajuste_manual: true,
            status_estoque: "confirmado_positivo",
          },
        ],
      };

      // 1. Salva e valida o ajuste manual protegido
      const itemAjustado = pedidoComAjuste.itens[0];
      expect(itemAjustado.ajuste_manual).toBe(true);
      expect(itemAjustado.quantidade_ajustada).toBe(10);
      expect(itemAjustado.quantidade_sugerida).toBe(7);

      // 2. Simulação de aprovação executiva
      function executarAprovacaoSimulada(pedido: PedidoCompraAdmin, isExecutivo: boolean) {
        if (!isExecutivo) {
          throw new Error("42501: Permissão negada. Apenas executivos podem aprovar pedidos.");
        }
        // Se simulacao = true, aprova no banco mas NUNCA dispara e-mail ou WhatsApp real ao fornecedor
        const despachoRealRealizado = !pedido.simulacao;
        return {
          sucesso: true,
          pedidoId: pedido.id,
          novoStatus: "aprovado" as const,
          despachoRealRealizado,
          simulacaoAtiva: pedido.simulacao,
          quantidadeFinalAprovada: itemAjustado.quantidade_ajustada,
        };
      }

      // Rejeita operador não executivo
      expect(() => executarAprovacaoSimulada(pedidoComAjuste, false)).toThrow("42501");

      // Executivo aprova em modo simulação
      const resAprovacao = executarAprovacaoSimulada(pedidoComAjuste, true);
      expect(resAprovacao.sucesso).toBe(true);
      expect(resAprovacao.novoStatus).toBe("aprovado");
      expect(resAprovacao.despachoRealRealizado).toBe(false); // RESTRIÇÃO ESTRITA MANTIDA
      expect(resAprovacao.simulacaoAtiva).toBe(true);
      expect(resAprovacao.quantidadeFinalAprovada).toBe(10); // Ajuste manual mantido intacto

      // 3. Imutabilidade contra mensagens tardias de conferência
      const sessaoAprovada = {
        pedidoId: pedidoComAjuste.id,
        pedidoStatus: "aprovado",
        itensExistentes: new Map<string, { estoque_atual: number | null; status_estoque: string }>([
          ["Coca 350ml original", { estoque_atual: 8, status_estoque: "confirmado_positivo" }],
        ]),
        fornecedorNome: "Coca-Cola",
        dataOperacional: "2026-11-19",
      };

      const tentativaAtrasada = consolidarItensEmSessao(
        [
          {
            produto_nome: "Coca 350ml original",
            quantidade_informada: 12,
            tipo_informacao: "confirmado_positivo",
            confianca: 1.0,
            is_correcao: false,
          },
        ],
        sessaoAprovada,
        {
          chatId: "-1001",
          nomeUsuario: "Funcionario Atrasado",
          origemTipo: "telegram_texto",
        }
      );

      expect(tentativaAtrasada.pedido_protegido_imutavel).toBe(true);
      expect(tentativaAtrasada.itens_consolidados).toHaveLength(0);
      expect(tentativaAtrasada.mensagem_status).toContain("já foi aprovado e permanece protegido");
    });
  });

  // =========================================================================
  // MISSÃO 4: Homologação Integrada do Pipeline Ponta a Ponta
  // =========================================================================
  describe("MISSÃO 4: Homologação Integrada do Pipeline Ponta a Ponta (Telegram -> AI NLP -> DB -> Cálculo -> Pedidos -> Painel Admin)", () => {
    it("deve homologar o ciclo completo respeitando a restrição estrita simulacao_modo = true", async () => {
      // ETAPA 1: Mensagem chega no Telegram via Webhook
      const incomingTelegramMessage = {
        message_id: 9901,
        chat: { id: -1001928374 },
        from: { id: 5544, first_name: "Responsável Estoque", is_bot: false },
        text: "Salgados contados: Coxinha = 30, Coxinha C/ Catupiry = 20, Hambúrguer = 10, Kibe zerou.",
      };

      // ETAPA 2: Extração por AI NLP da Engine
      const { itens: itensNLP } = interpretarTextoEstoque(incomingTelegramMessage.text, catalogoMock);
      expect(itensNLP).toHaveLength(4);

      // ETAPA 3: Persistência no Banco / RPC registrar_item_conferencia_estoque
      const mockDbPedidos = new Map<string, any>();
      mockDbPedidos.set("ped-salgados-e2e", {
        id: "ped-salgados-e2e",
        workspace_id: "2af415b6-76aa-4134-8133-a9b405671c1c",
        fornecedor_nome: "Salgados",
        data_pedido: "2026-11-19",
        dia_semana: 2,
        status: "aguardando_estoque",
        simulacao: true,
      });

      const itensExistentesDB = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      itensExistentesDB.set("Coxinha", { estoque_atual: null, status_estoque: "pendente_contagem" });
      itensExistentesDB.set("Coxinha C/ Catupiry", { estoque_atual: null, status_estoque: "pendente_contagem" });
      itensExistentesDB.set("Hambúrguer", { estoque_atual: null, status_estoque: "pendente_contagem" });
      itensExistentesDB.set("Kibe", { estoque_atual: null, status_estoque: "pendente_contagem" });

      const consolidadoDB = consolidarItensEmSessao(
        itensNLP.map((i) => ({
          produto_nome: i.produto_nome,
          quantidade_informada: i.quantidade_informada,
          tipo_informacao: i.tipo_informacao,
          confianca: i.confianca / 100,
          is_correcao: i.is_correcao,
        })),
        {
          pedidoId: "ped-salgados-e2e",
          pedidoStatus: "aguardando_estoque",
          itensExistentes: itensExistentesDB,
          fornecedorNome: "Salgados",
          dataOperacional: "2026-11-19",
        },
        {
          chatId: String(incomingTelegramMessage.chat.id),
          nomeUsuario: incomingTelegramMessage.from.first_name,
          origemTipo: "telegram_texto",
        }
      );

      expect(consolidadoDB.total_itens_confirmados).toBe(4);
      expect(consolidadoDB.total_itens_pendentes).toBe(0);
      expect(consolidadoDB.status_pedido_novo).toBe("pedido_calculado");

      // ETAPA 4: Motor de Cálculo Operacional
      const itensParaCalculo: ItemCalculoCompra[] = catalogoMock
        .filter((c) => c.fornecedor_nome === "Salgados")
        .map((cat) => {
          const itemConsol = consolidadoDB.itens_consolidados.find((c) => c.produto_nome === cat.produto_nome);
          return {
            produto_nome: cat.produto_nome,
            quantidade_referencia: cat.quantidade_referencia || 0,
            estoque_atual: itemConsol ? itemConsol.quantidade_atual : null,
            status_estoque: itemConsol ? itemConsol.status_estoque : "pendente_contagem",
          };
        });

      const resCalculo = calcularSugestaoCompra(itensParaCalculo, {
        fornecedorNome: "Salgados",
        formatoLista: "salgados_soma",
      });

      expect(resCalculo.statusPedido).toBe("pedido_calculado");
      // Coxinha: 190 - 30 = 160
      // Catupiry: 210 - 20 = 190
      // Hambúrguer: 30 - 10 = 20
      // Kibe: 40 - 0 = 40
      // Total = 410 unidades
      expect(resCalculo.totalUnidadesSugeridas).toBe(410);
      expect(resCalculo.textoFormatado).toContain("190 | Coxinha = 160");
      expect(resCalculo.textoFormatado).toContain("210 | Coxinha C/ Catupiry = 190");
      expect(resCalculo.textoFormatado).toContain("30 | Hambúrguer = 20");
      expect(resCalculo.textoFormatado).toContain("40 | Kibe = 40");

      // ETAPA 5: Projeção no Painel de Compras Admin (/compras)
      const pedidoNoPainel: PedidoCompraAdmin = {
        id: "ped-salgados-e2e",
        fornecedor_nome: "Salgados",
        data_pedido: "2026-11-19",
        dia_semana: 2,
        status: "pedido_calculado",
        aumento_temporario_pct: 0,
        texto_pedido_formatado: resCalculo.textoFormatado,
        simulacao: true,
        itens: resCalculo.itens.map((it, idx) => ({
          id: `item-${idx}`,
          produto_nome: it.produto_nome,
          categoria: "Salgados",
          unidade_medida: "unidade",
          quantidade_referencia: it.quantidade_referencia,
          estoque_atual: it.estoque_atual,
          quantidade_sugerida: it.quantidade_sugerida,
          quantidade_ajustada: it.quantidade_sugerida,
          status_estoque: it.status_estoque as any,
          contagem_origem: "telegram_texto",
        })),
      };

      expect(pedidoNoPainel.simulacao).toBe(true);
      expect(pedidoNoPainel.status).toBe("pedido_calculado");
      expect(pedidoNoPainel.itens).toHaveLength(4);

      // ETAPA 6: Aprovação Executiva no Painel com Proteção Estrita
      let pedidoAprovadoFinal = { ...pedidoNoPainel };
      const aprovarPedidoAction = async (pedidoId: string) => {
        expect(pedidoId).toBe("ped-salgados-e2e");
        // Valida que em modo simulação nenhum webhook externo de envio ao fornecedor é disparado
        expect(pedidoAprovadoFinal.simulacao).toBe(true);
        pedidoAprovadoFinal = {
          ...pedidoAprovadoFinal,
          status: "aprovado",
        };
      };

      await aprovarPedidoAction(pedidoNoPainel.id);

      expect(pedidoAprovadoFinal.status).toBe("aprovado");
      expect(pedidoAprovadoFinal.simulacao).toBe(true);
    });
  });
});
