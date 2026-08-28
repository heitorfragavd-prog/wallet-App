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

describe("WalletDocumentService — Etapa 1.2 Classificação Automática no Backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── REPRODUÇÃO DO BUG REAL: "Analise este arquivo." ─────────────────────────
  it("Garante que texto genérico 'Analise este arquivo.' chama action: process_document e NÃO adivinha DANFE no frontend", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        tipo: "BOLETO",
        status: "validado",
        dados: {
          banco_nome: "Itaú",
          banco_codigo: "341",
          beneficiario: "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A",
          valor_total: 1562.61,
          data_vencimento: "2026-08-28",
          linha_digitavel: "34191.09008 00000.123456 78901.234567 8 90123456789012",
        },
        validacao: { valido: true },
        mensagemFormatada: "📄 **Boleto Validado**\n• Beneficiário: SPAL\n• Valor: R$ 1.562,61\n• Vencimento: 28/08/2026",
      },
      error: null,
    });

    const res = await processWalletDocument({
      fileName: "image.jpg",
      mimeType: "image/jpeg",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Analise este arquivo.",
    });

    // CRÍTICO: Deve chamar process_document e NÃO process_danfe
    expect(supabase.functions.invoke).toHaveBeenCalledWith("wallet-ai-orchestrator", {
      body: {
        action: "process_document",
        base64: "dGVzdGU=",
        mime_type: "image/jpeg",
        workspace_id: "ws-123",
        conversation_id: "conv-1",
      },
    });

    expect(res.tipo).toBe("BOLETO");
    expect(res.status).toBe("validado");
    expect(res.boletoDados?.valor_total).toBe(1562.61);
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.actionType).toBe("create_debt");
  });

  // ── A. BOLETO SPAL / ITAÚ COM TEXTO GENÉRICO ──────────────────────────────
  it("A: Boleto SPAL/Itaú -> R$ 1.562,61, 28/08/2026 com 'Analise este arquivo.' retorna Boleto validado", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        tipo: "BOLETO",
        status: "validado",
        dados: {
          banco_nome: "Itaú",
          banco_codigo: "341",
          beneficiario: "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A",
          valor_total: 1562.61,
          data_vencimento: "2026-08-28",
          linha_digitavel: "34191091150174649293183045790009815520000156261",
          codigo_barras: "34198155200001562611091101746492931830457900",
        },
        validacao: { valido: true },
        mensagemFormatada: "📄 **Boleto Validado**\n• Beneficiário: SPAL\n• Valor: R$ 1.562,61\n• Vencimento: 28/08/2026",
      },
      error: null,
    });

    const res = await processWalletDocument({
      fileName: "photo_scan.png",
      mimeType: "image/png",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Analise este arquivo.",
    });

    expect(res.tipo).toBe("BOLETO");
    expect(res.status).toBe("validado");
    expect(res.boletoDados?.valor_total).toBe(1562.61);
    expect(res.boletoDados?.data_vencimento).toBe("2026-08-28");
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.payload.valor).toBe(1562.61);
  });

  // ── B. BOLETO SELLPACK / BRADESCO ──────────────────────────────────────────
  it("B: Boleto SELLPACK/Bradesco -> R$ 602,47, 03/09/2026, linha real validada pelo FEBRABAN de produção", async () => {
    const linhaSellpack = "23793420059000002880454002481106115580000060247";
    const febrabanCheck = validateLinhaDigitavel(linhaSellpack);
    expect(febrabanCheck.valido).toBe(true);
    expect(febrabanCheck.valorDerivado).toBe(602.47);
    expect(febrabanCheck.dataVencimentoDerivada).toBe("2026-09-03");

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        tipo: "BOLETO",
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
      fileName: "upload_camera.jpg",
      mimeType: "image/jpeg",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Analise este arquivo.",
    });

    expect(res.tipo).toBe("BOLETO");
    expect(res.status).toBe("validado_com_alerta");
    expect(res.boletoDados?.valor_total).toBe(602.47);
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.payload.valor).toBe(602.47);
  });

  // ── C. DANFE VÁLIDO ──────────────────────────────────────────────────────────
  it("C: DANFE válido -> retornado pelo backend como DANFE com ActionProposal", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        tipo: "DANFE",
        status: "sucesso",
        cabecalho: {
          numero_nota: "83208",
          emitente_razao_social: "FORNECEDOR TESTE LTDA",
          chave_acesso: "31260831908617000133550010008320821035268195",
        },
        valores_totais: {
          valor_total_nota: 1105.25,
        },
        itens: [{ descricao: "Item 1", valor_total: 1105.25 }],
        mensagemFormatada: "🧾 **Nota Fiscal Validada com Sucesso**\n• NF: 83208\n• Total: R$ 1.105,25",
      },
      error: null,
    });

    const res = await processWalletDocument({
      fileName: "documento_fiscal.pdf",
      mimeType: "application/pdf",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Analise este arquivo.",
    });

    expect(res.tipo).toBe("DANFE");
    expect(res.status).toBe("sucesso");
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.actionType).toBe("import_invoice");
    expect(res.actionProposal?.payload.numero_nota).toBe("83208");
  });

  // ── D. DOCUMENTO OUTRO / DESCONHECIDO (FAIL-CLOSED) ───────────────────────
  it("D: Documento outro/desconhecido -> fail-closed, sem action proposal", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        tipo: "DESCONHECIDO",
        status: "desconhecido",
        mensagemFormatada: "📎 **Documento Não Reconhecido**\n• Não identifiquei este arquivo como NF ou Boleto.",
      },
      error: null,
    });

    const res = await processWalletDocument({
      fileName: "foto_paisagem.jpg",
      mimeType: "image/jpeg",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Analise este arquivo.",
    });

    expect(res.tipo).toBe("DESCONHECIDO");
    expect(res.actionProposal).toBeUndefined();
    expect(res.content).toContain("Documento Não Reconhecido");
  });

  // ── E. ERRO DO PROVIDER / FAIL-CLOSED ─────────────────────────────────────
  it("E: Erro do provider / edge function -> fail-closed, sem criação financeira", async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error("Network error / 500"));

    const res = await processWalletDocument({
      fileName: "arquivo.pdf",
      mimeType: "application/pdf",
      base64: "dGVzdGU=",
      workspaceId: "ws-123",
      conversationId: "conv-1",
      textContext: "Analise este arquivo.",
    });

    expect(res.tipo).toBe("DESCONHECIDO");
    expect(res.actionProposal).toBeUndefined();
    expect(res.content).toContain("Não identifiquei este arquivo");
  });
});