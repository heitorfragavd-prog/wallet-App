import { describe, it, expect, vi } from "vitest";
import {
  resolveWhatsAppIdentity,
  extractLinhaDigitavelCandidate,
  processBoletoLine,
  handleSpecialistInquiry,
  processWhatsAppIncomingMessage,
  type WhatsAppIncomingMessage,
  type WhatsAppAdapterDependencies,
  type ResolvedWhatsAppUser,
} from "../../supabase/functions/_shared/ai/whatsapp-channel-adapter.ts";
import { validateLinhaDigitavel } from "../../supabase/functions/_shared/ai/boleto-validator.ts";

describe("Wallet CEO 3.0 — Etapa 13: Gates 4, 5, 6 e 7 (WhatsApp AI, Documentos e Áudio)", () => {
  const mockWorkspaceId = "11111111-1111-1111-1111-111111111111";
  const mockUserId = "22222222-2222-2222-2222-222222222222";

  // ─── GATE 4: IDENTIDADE, GOVERNANÇA & ISOLAMENTO FAIL-CLOSED ───────────────

  it("deve rejeitar com fail-closed usuários não pareados ou telefones inválidos", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    };

    const identity = await resolveWhatsAppIdentity(mockSupabase, "5511999990000");
    expect(identity.authorized).toBe(false);
    expect(identity.error).toContain("não cadastrado ou inativo");
  });

  it("deve resolver colaborador pareado e conceder perfil operacional sem dados financeiros", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "p1",
                  workspace_id: mockWorkspaceId,
                  user_id: mockUserId,
                  phone_number: "5511988887777",
                  nome_contato: "Carlos Operador",
                  role_no_workspace: "member",
                  ativo: true,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const identity = await resolveWhatsAppIdentity(mockSupabase, "5511988887777");
    expect(identity.authorized).toBe(true);
    expect(identity.userName).toBe("Carlos Operador");
    expect(identity.roleNoWorkspace).toBe("member");
    expect(identity.permissaoFinanceira).toBe(false);
    expect(identity.tipoGrupoPadrao).toBe("conversas_loja");
  });

  it("deve bloquear acesso a saldos bancários ou DRE para colaborador sem permissão financeira", () => {
    const colaboradorUser: ResolvedWhatsAppUser = {
      authorized: true,
      userName: "Carlos Operador",
      roleNoWorkspace: "member",
      tipoGrupoPadrao: "conversas_loja",
      permissaoFinanceira: false,
      ativo: true,
    };

    const result = handleSpecialistInquiry(colaboradorUser, "Qual o saldo da conta no banco hoje?");
    expect(result.specialist).toBe("governance_block");
    expect(result.replyText).toContain("Acesso Restrito — Governança Corporativa");
    expect(result.replyText).toContain("relatórios estratégicos são confidenciais");
  });

  // ─── GATE 5: DOCUMENTOS, BOLETOS & PROPOSTAS PREPARED ──────────────────────

  it("deve detectar e extrair linha digitável de boleto bancário de 47 dígitos", () => {
    // Linha válida de teste matematicamente verificada FEBRABAN (Banco Bradesco 237)
    const rawText = "Segue o boleto para pagamento: 23793.38128 60083.013528 56000.633042 9 84340000019150";
    const candidate = extractLinhaDigitavelCandidate(rawText);
    expect(candidate).toBe("23793381286008301352856000633042984340000019150");

    const validated = validateLinhaDigitavel(candidate!);
    expect(validated.valido).toBe(true);
    expect(validated.tipo).toBe("bancario");
    expect(validated.valorDerivado).toBe(191.5);
  });

  it("deve criar proposta estritamente PREPARED e nunca auto-liquidar o boleto", async () => {
    let capturedProposal: Record<string, unknown> | null = null;
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "wallet_ai_action_proposals") {
          return {
            insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
              capturedProposal = payload;
              return {
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "prop-123" }, error: null }),
                }),
              };
            }),
          };
        }
        return {};
      }),
    };

    const validated = validateLinhaDigitavel("23793381286008301352856000633042984340000019150");
    const result = await processBoletoLine(
      mockSupabase,
      mockWorkspaceId,
      mockUserId,
      validated,
      "5511988887777",
    );

    expect(result.proposalId).toBe("prop-123");
    expect(capturedProposal).not.toBeNull();
    expect(capturedProposal.status).toBe("prepared"); // Fail-Safe obrigatório
    expect(capturedProposal.action_type).toBe("cadastrar_divida");
    expect(capturedProposal.payload.valor_total).toBe(191.5);
    expect(result.replyText).toContain("Proposta de conta a pagar *PREPARADA*");
    expect(result.replyText).toContain("exigem aprovação humana");
  });

  // ─── GATE 6: WALLET IA & ESPECIALISTAS ──────────────────────────────────────

  it("deve rotear dúvidas de estoque para o Especialista em Estoque e Compras", () => {
    const adminUser: ResolvedWhatsAppUser = {
      authorized: true,
      userName: "Gestor",
      roleNoWorkspace: "admin",
      tipoGrupoPadrao: "contas_empresa",
      permissaoFinanceira: true,
      ativo: true,
    };

    const result = handleSpecialistInquiry(adminUser, "Chegou mercadoria de café e insumos");
    expect(result.specialist).toBe("estoque_compras");
    expect(result.replyText).toContain("Especialista em Estoque e Compras");
  });

  it("deve responder a comando /fechamento com orientações do Especialista em Vendas", () => {
    const operadorUser: ResolvedWhatsAppUser = {
      authorized: true,
      userName: "Operador de Caixa",
      roleNoWorkspace: "member",
      tipoGrupoPadrao: "conversas_loja",
      permissaoFinanceira: false,
      ativo: true,
    };

    const result = handleSpecialistInquiry(operadorUser, "/fechamento");
    expect(result.specialist).toBe("vendas_fechamento");
    expect(result.replyText).toContain("Especialista em Vendas e Fechamento de Caixa");
    expect(result.replyText).toContain("Eyemobile PDV");
  });

  // ─── GATE 7: CONVERSAS POR ÁUDIO (WHISPER) ──────────────────────────────────

  it("deve transcrever áudio recebido e processar a solicitação com prefixo informativo", async () => {
    const sentMessages: Array<{ to: string; text: string }> = [];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "whatsapp_usuarios_pareados") {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "p1",
                      workspace_id: mockWorkspaceId,
                      user_id: mockUserId,
                      phone_number: "5511999998888",
                      nome_contato: "Heitor",
                      role_no_workspace: "owner",
                      ativo: true,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "wallet_ai_action_proposals") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "prop-audio-1" }, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const deps: WhatsAppAdapterDependencies = {
      supabaseClient: mockSupabase,
      sendMessage: async (to, text) => {
        sentMessages.push({ to, text });
        return { success: true, messageId: "msg_out_1" };
      },
      transcribeAudio: vi.fn().mockResolvedValue(
        "Por favor cadastra esse boleto 23793.38128 60083.013528 56000.633042 9 84340000019150 da distribuidora",
      ),
    };

    const incomingAudio: WhatsAppIncomingMessage = {
      id: "wamid_audio_test",
      from: "5511999998888",
      timestamp: "1731610000",
      type: "audio",
      audio: {
        id: "media_id_audio_123",
        mime_type: "audio/ogg",
      },
    };

    const result = await processWhatsAppIncomingMessage(deps, incomingAudio);

    expect(result.status).toBe("success");
    expect(result.audioTranscribed).toBe(true);
    expect(result.actionProposalCreated).toBe(true);
    expect(deps.transcribeAudio).toHaveBeenCalledWith("media_id_audio_123", "audio/ogg");
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain("🎙️ *Áudio transcrito:*");
    expect(sentMessages[0].text).toContain("Boleto Validado com Sucesso!");
    expect(sentMessages[0].text).toContain("R$ 191,50");
  });

  it("deve retornar aviso amigável se a transcrição do áudio falhar", async () => {
    const sentMessages: Array<{ to: string; text: string }> = [];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "p1",
                  workspace_id: mockWorkspaceId,
                  user_id: mockUserId,
                  phone_number: "5511999998888",
                  nome_contato: "Heitor",
                  role_no_workspace: "owner",
                  ativo: true,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const deps: WhatsAppAdapterDependencies = {
      supabaseClient: mockSupabase,
      sendMessage: async (to, text) => {
        sentMessages.push({ to, text });
        return { success: true };
      },
      transcribeAudio: vi.fn().mockResolvedValue(null), // Falha na transcrição
    };

    const incomingAudio: WhatsAppIncomingMessage = {
      id: "wamid_audio_fail",
      from: "5511999998888",
      timestamp: "1731610000",
      type: "audio",
      audio: {
        id: "media_id_bad",
      },
    };

    const result = await processWhatsAppIncomingMessage(deps, incomingAudio);
    expect(result.audioTranscribed).toBe(false);
    expect(sentMessages[0].text).toContain("Não foi possível transcrever seu áudio com nitidez");
  });
});
