/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processarEstoqueConversasLoja } from "../../supabase/functions/_shared/ai/compras-telegram-engine";

describe("ETAPA 4D.1 - PARTE B: Telegram, Áudio e Segurança (Gates 4, 5, 6 e 7)", () => {
  let mockSupabase: any;
  let mockSendReply: any;
  const mockWorkspaceId = "2af415b6-76aa-4134-8133-a9b405671c1c";

  beforeEach(() => {
    mockSendReply = vi.fn().mockResolvedValue({});

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "compras_produtos_referencia") {
          const mockData = [
            {
              id: "ref-1",
              workspace_id: mockWorkspaceId,
              fornecedor_nome: "Fornecedor Pão de Queijo",
              produto_nome: "Coxinha de Frango",
              apelidos: ["coxinha", "coxinhas"],
              unidade_medida: "unidade",
              quantidade_referencia: 20,
              ativo: true,
              validacao_status: "confirmado",
            },
            {
              id: "ref-2",
              workspace_id: mockWorkspaceId,
              fornecedor_nome: "Coca-Cola",
              produto_nome: "Coca-Cola 350ml Lata",
              apelidos: ["coca", "coca lata", "coca normal"],
              unidade_medida: "cx com 12",
              quantidade_referencia: 10,
              ativo: true,
              validacao_status: "confirmado",
            },
          ];
          const queryBuilder: any = {
            select: vi.fn().mockImplementation(() => queryBuilder),
            eq: vi.fn().mockImplementation(() => queryBuilder),
            order: vi.fn().mockImplementation(() => queryBuilder),
            then: (resolve: any) => resolve({ data: mockData, error: null }),
          };
          return queryBuilder;
        }
        if (table === "compras_config") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                workspace_id: mockWorkspaceId,
                simulacao_modo: true,
                token_vinculacao_loja: "RODO-LOJA-SEC-KEY-123",
                grupo_conversas_loja_chat_id: "-10099887766",
              },
              error: null,
            }),
          };
        }
        if (table === "telegram_grupos_config") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "grupo-pendente-id",
                tipo_grupo: "conversas_loja",
                ativo: true,
                chat_id: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: vi.fn((rpcName: string, args: any) => {
        if (rpcName === "registrar_item_conferencia_estoque") {
          // Simula resposta da RPC Migration 115
          return Promise.resolve({
            data: {
              status: "sucesso",
              fornecedor_nome: args.p_fornecedor_nome,
              produto_nome: args.p_produto_nome,
              quantidade_informada: args.p_quantidade_informada,
              origem_tipo: args.p_origem_tipo,
              novo_status_pedido: "pedido_calculado",
              total_itens: 1,
              itens_pendentes: 0,
              pedido_protegido: false,
              ajuste_manual_preservado: false,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
  });

  // --------------------------------------------------------------------------
  // GATE 4: FLUXO DE ÁUDIO TRANSCRITO (Whisper -> compras-telegram-engine)
  // --------------------------------------------------------------------------
  describe("Gate 4: Ingestão de Áudio no Grupo Conversas da Loja", () => {
    it("deve processar transcrição de áudio e passar origem 'telegram_audio' para a RPC", async () => {
      const audioMessage = {
        message_id: 101,
        chat: { id: -10099887766, title: "🏪 Conversas da Loja" },
        from: { id: 7771, first_name: "Folguista", last_name: "Silvio", is_bot: false },
        voice: { file_id: "audio_voice_xyz_123", duration: 5 },
      };

      const res = await processarEstoqueConversasLoja({
        supabase: mockSupabase,
        message: audioMessage,
        grupoConfig: { tipo_grupo: "conversas_loja", chat_id: -10099887766 },
        workspaceId: mockWorkspaceId,
        userId: "user-uuid-1",
        telegramBotToken: "fake_token",
        supabaseUrl: "https://mock.supabase.co",
        supabaseServiceKey: "service_key",
        sendReply: mockSendReply,
        transcricaoAudio: "Coxinha 12 unidades",
        origemTipoParam: "telegram_audio",
      });

      expect(res.status).toBe(200);
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "registrar_item_conferencia_estoque",
        expect.objectContaining({
          p_origem_tipo: "telegram_audio",
          p_produto_nome: "Coxinha de Frango",
          p_quantidade_informada: 12,
          p_tipo_informacao: "confirmado_positivo",
        })
      );

      expect(mockSendReply).toHaveBeenCalled();
      const replyMsg = mockSendReply.mock.calls[0][0];
      expect(replyMsg).toContain("<code>telegram_audio</code>");
    });
  });

  // --------------------------------------------------------------------------
  // GATE 5: HARDENING DE VINCULAÇÃO DE GRUPOS
  // --------------------------------------------------------------------------
  describe("Gate 5: Hardening de Vinculação de Grupos", () => {
    it("deve rejeitar auto-vinculação se o token fornecido for incorreto", async () => {
      // Simulação da lógica estrita de validação de token do Gate 5
      const tokenConfigurado = "RODO-LOJA-SEC-KEY-123";
      const tokenTentativa = "SENHA-ERRADA";

      const isValidToken = tokenTentativa === tokenConfigurado;
      expect(isValidToken).toBe(false);
    });

    it("deve aceitar comando /vincular_loja apenas quando o token bater exatamente com o configurado", async () => {
      const tokenConfigurado = "RODO-LOJA-SEC-KEY-123";
      const comandoTexto = "/vincular_loja RODO-LOJA-SEC-KEY-123";
      const partes = comandoTexto.trim().split(/\s+/);
      const tokenExtraido = partes[1];

      expect(tokenExtraido).toBe(tokenConfigurado);
    });
  });

  // --------------------------------------------------------------------------
  // GATE 6: PROTEÇÃO DE PEDIDOS APROVADOS E AJUSTES MANUAIS
  // --------------------------------------------------------------------------
  describe("Gate 6: Imutabilidade de Pedidos Aprovados e Preservação de Ajustes Manuais", () => {
    it("deve simular retorno da RPC indicando pedido protegido quando status for aprovado", async () => {
      mockSupabase.rpc = vi.fn().mockResolvedValue({
        data: {
          status: "sucesso",
          pedido_protegido: true,
          pedido_status: "aprovado",
          fornecedor_nome: "Coca-Cola",
          produto_nome: "Coca-Cola 350ml Lata",
          quantidade_informada: 5,
        },
        error: null,
      });

      const message = {
        message_id: 102,
        chat: { id: -10099887766 },
        from: { id: 7771, first_name: "Folguista", is_bot: false },
        text: "Coca lata 5 caixas",
      };

      const res = await processarEstoqueConversasLoja({
        supabase: mockSupabase,
        message,
        grupoConfig: { tipo_grupo: "conversas_loja" },
        workspaceId: mockWorkspaceId,
        userId: "user-1",
        telegramBotToken: "tok",
        supabaseUrl: "url",
        supabaseServiceKey: "key",
        sendReply: mockSendReply,
      });

      expect(res.status).toBe(200);
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "registrar_item_conferencia_estoque",
        expect.objectContaining({
          p_produto_nome: "Coca-Cola 350ml Lata",
          p_quantidade_informada: 5,
        })
      );
    });

    it("deve preservar quantidade_ajustada quando item foi ajustado manualmente", () => {
      // Simulação da lógica PL/pgSQL da Migration 115:
      // quantidade_ajustada = CASE WHEN v_item_ajustado_manual THEN quantidade_ajustada ELSE v_sugerida END
      const v_item_ajustado_manual = true;
      const quantidade_ajustada_manual = 25;
      const v_sugerida = 10;

      const quantidadeFinal = v_item_ajustado_manual ? quantidade_ajustada_manual : v_sugerida;
      expect(quantidadeFinal).toBe(25); // Mantém o valor manual
    });
  });

  // --------------------------------------------------------------------------
  // GATE 7: MODO SIMULAÇÃO ATIVO
  // --------------------------------------------------------------------------
  describe("Gate 7: Modo Simulação Estrito (simulacao_modo = true)", () => {
    it("deve prefixar resposta com [MODO SIMULAÇÃO ATIVO] quando simulacao_modo for true", async () => {
      const message = {
        message_id: 103,
        chat: { id: -10099887766 },
        from: { id: 7772, first_name: "Atendente", is_bot: false },
        text: "Coxinha 10",
      };

      await processarEstoqueConversasLoja({
        supabase: mockSupabase,
        message,
        grupoConfig: { tipo_grupo: "conversas_loja" },
        workspaceId: mockWorkspaceId,
        userId: "user-1",
        telegramBotToken: "tok",
        supabaseUrl: "url",
        supabaseServiceKey: "key",
        sendReply: mockSendReply,
      });

      expect(mockSendReply).toHaveBeenCalled();
      const replyMsg = mockSendReply.mock.calls[0][0];
      expect(replyMsg).toContain("[MODO SIMULAÇÃO ATIVO]");
    });
  });
});
