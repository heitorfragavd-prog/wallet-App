import { describe, it, expect, vi, beforeEach } from "vitest";
import { processWalletDocument } from "./WalletDocumentService";
import { supabase } from "@/integrations/supabase/client";
import { validateLinhaDigitavel } from "../../../../supabase/functions/_shared/ai/boleto-validator";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe("WalletDocumentService — Etapa 1.2 Pipeline Canônico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── A. DANFE VÁLIDO ──────────────────────────────────────────────────────────
  it("A: DANFE válido -> utiliza serviço compartilhado, retorna status sucesso e action proposal preparada", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        status: "sucesso",
        cabecalho: {
          numero_nota: "83208",
          emitente_razao_social: "FORNECEDOR TESTE LTDA",
          chave_acesso: "31260831908617000133550010008320821035268195",
        },
        valores_totais: {
          valor_total_nota: 1250.5,
        },
        itens: [{ descricao: "Item 1", valor_total: 1250.5 }],
        mensagemFormatada: "🧾 **Nota Fiscal Validada com Sucesso**\n• NF: 83208\n• Total: R$ 1.250,50",
      },
      error: null,
    });

    const res = await processWalletDocument({
      fileName: "danfe_83208.pdf",
      mimeType: "application/pdf",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Segue a nota fiscal",
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith("wallet-ai-orchestrator", {
      body: {
        action: "process_danfe",
        base64: "dGVzdGU=",
        mime_type: "application/pdf",
        workspace_id: "ws-123",
        conversation_id: "conv-1",
      },
    });

    expect(res.tipo).toBe("DANFE");
    expect(res.status).toBe("sucesso");
    expect(res.content).toContain("Nota Fiscal Validada");
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.actionType).toBe("import_invoice");
    expect(res.actionProposal?.status).toBe("prepared");
    expect(res.actionProposal?.payload.numero_nota).toBe("83208");
  });

  // ── B. BOLETO SPAL / ITAÚ ──────────────────────────────────────────────────
  it("B: Boleto SPAL/Itaú -> R$ 1.562,61, 28/08/2026, linha válida, status validado e action proposal", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        status: "validado",
        dados: {
          banco_nome: "Itaú",
          banco_codigo: "341",
          beneficiario: "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A",
          valor_total: 1562.61,
          data_vencimento: "2026-08-28",
          linha_digitavel: "34191.09008 00000.123456 78901.234567 8 90123456789012",
          codigo_barras: "34198901234567890120900000001234567890123456",
        },
        validacao: { valido: true },
        mensagemFormatada: "📄 **Boleto Validado**\n• Beneficiário: SPAL\n• Valor: R$ 1.562,61\n• Vencimento: 28/08/2026",
      },
      error: null,
    });

    const res = await processWalletDocument({
      fileName: "boleto_spal.pdf",
      mimeType: "application/pdf",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Boleto SPAL Itaú",
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith("wallet-ai-orchestrator", {
      body: {
        action: "process_boleto",
        base64: "dGVzdGU=",
        mime_type: "application/pdf",
        workspace_id: "ws-123",
        conversation_id: "conv-1",
      },
    });

    expect(res.tipo).toBe("BOLETO");
    expect(res.status).toBe("validado");
    expect(res.boletoDados?.valor_total).toBe(1562.61);
    expect(res.boletoDados?.data_vencimento).toBe("2026-08-28");
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.actionType).toBe("create_debt");
    expect(res.actionProposal?.status).toBe("prepared");
    expect(res.actionProposal?.payload.valor).toBe(1562.61);
  });

  // ── C. BOLETO SELLPACK / BRADESCO ──────────────────────────────────────────
  it("C: Boleto SELLPACK/Bradesco -> R$ 602,47, 03/09/2026, linha real 23793420059000002880454002481106115580000060247 validada pelo FEBRABAN de produção", async () => {
    const linhaSellpack = "23793420059000002880454002481106115580000060247";
    const febrabanCheck = validateLinhaDigitavel(linhaSellpack);
    expect(febrabanCheck.valido).toBe(true);
    expect(febrabanCheck.valorDerivado).toBe(602.47);
    expect(febrabanCheck.dataVencimentoDerivada).toBe("2026-09-03");

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        status: "validado_com_alerta",
        dados: {
          banco_nome: "Banco Bradesco S.A.",
          banco_codigo: "237",
          beneficiario: "SELLPACK DISTRIBUIDORA LTDA",
          valor_total: 602.47,
          data_vencimento: "2026-09-03",
          linha_digitavel: linhaSellpack,
          codigo_barras: "23791155800000602473420090000028805400248110",
        },
        validacao: { valido: true },
        mensagemFormatada: "📄 **Boleto Validado com Alerta**\n• Beneficiário: SELLPACK\n• Valor: R$ 602,47\n• Vencimento: 03/09/2026",
      },
      error: null,
    });

    const res = await processWalletDocument({
      fileName: "boleto_sellpack.jpg",
      mimeType: "image/jpeg",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Boleto SELLPACK Bradesco",
    });

    expect(res.tipo).toBe("BOLETO");
    expect(res.status).toBe("validado_com_alerta");
    expect(res.boletoDados?.valor_total).toBe(602.47);
    expect(res.boletoDados?.data_vencimento).toBe("2026-09-03");
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.actionType).toBe("create_debt");
    expect(res.actionProposal?.payload.valor).toBe(602.47);
  });

  // ── D. LINHA DE BOLETO INVÁLIDA ───────────────────────────────────────────
  it("D: Linha de boleto inválida -> status requer_revisao, SEM action proposal executável", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        status: "requer_revisao",
        dados: {
          linha_digitavel: "00000000000000000000000000000000000000000000000",
        },
        validacao: { valido: false, erros: ["Digito verificador invalido"] },
        mensagemFormatada: "⚠️ **Boleto Requer Revisão**\n• Não foi possível validar a linha digitável com segurança.",
      },
      error: null,
    });

    const res = await processWalletDocument({
      fileName: "boleto_borrado.jpg",
      mimeType: "image/jpeg",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Boleto",
    });

    expect(res.tipo).toBe("BOLETO");
    expect(res.status).toBe("requer_revisao");
    expect(res.actionProposal).toBeUndefined();
    expect(res.content).toContain("Boleto Requer Revisão");
  });

  // ── E. ERRO DO PROVIDER / FAIL-CLOSED ─────────────────────────────────────
  it("E: Erro do provider / edge function -> fail-closed, sem criação financeira silenciosa", async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error("Network error / 500"));

    const res = await processWalletDocument({
      fileName: "boleto_teste.pdf",
      mimeType: "application/pdf",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Pagar boleto",
    });

    expect(res.tipo).toBe("BOLETO");
    expect(res.status).toBe("pendente");
    expect(res.actionProposal).toBeUndefined();
    expect(res.content).toContain("Nenhum pagamento ou lançamento foi realizado");
  });
});