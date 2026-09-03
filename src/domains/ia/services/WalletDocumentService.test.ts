import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { processWalletDocument } from "./WalletDocumentService";
import { classifyDocument } from "../types/document";

describe("WalletDocumentService & Document Classifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("classifyDocument (Determinístico)", () => {
    it("deve classificar boleto bancário corretamente", () => {
      const res = classifyDocument("boleto_itau_agosto.pdf", "application/pdf");
      expect(res.tipo).toBe("BOLETO");
      expect(res.confianca).toBeGreaterThanOrEqual(0.85);
    });

    it("deve classificar DANFE/NFe corretamente", () => {
      const res = classifyDocument("danfe_83208.pdf", "application/pdf");
      expect(res.tipo).toBe("DANFE");
      expect(res.confianca).toBeGreaterThanOrEqual(0.85);
    });

    it("deve classificar comprovante de pagamento corretamente", () => {
      const res = classifyDocument("comprovante_pix_aluguel.jpg", "image/jpeg");
      expect(res.tipo).toBe("COMPROVANTE");
    });

    it("deve marcar arquivo sem pista textual como DESCONHECIDO para análise visual", () => {
      const res = classifyDocument("foto_camera_123.jpg", "image/jpeg");
      expect(res.tipo).toBe("DESCONHECIDO");
    });
  });

  describe("processWalletDocument", () => {
    it("deve processar boleto retornado pela Edge Function com ActionProposal", async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          tipo: "BOLETO",
          status: "validado",
          dados: {
            banco_nome: "Itaú",
            beneficiario: "FORNECEDOR BEBIDAS S/A",
            valor_total: 1562.61,
            data_vencimento: "2026-08-28",
            linha_digitavel: "34191.09008 00000.123456 78901.234567 8 90123456789012",
          },
          validacao: { valido: true },
          mensagemFormatada: "📄 **Boleto Validado**\n• Beneficiário: FORNECEDOR\n• Valor: R$ 1.562,61",
        },
        error: null,
      });

      const res = await processWalletDocument({
        fileName: "boleto.pdf",
        mimeType: "application/pdf",
        base64: "dGVzdGU=",
        workspaceId: "ws-123",
        conversationId: "conv-1",
        textContext: "Analise este boleto",
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith("wallet-ai-orchestrator", {
        body: {
          action: "process_document",
          base64: "dGVzdGU=",
          mime_type: "application/pdf",
          workspace_id: "ws-123",
          conversation_id: "conv-1",
        },
      });

      expect(res.tipo).toBe("BOLETO");
      expect(res.status).toBe("validado");
      expect(res.actionProposal).toBeDefined();
      expect(res.actionProposal?.actionType).toBe("create_debt");
      expect(res.boletoDados?.valor_total).toBe(1562.61);
    });

    it("deve processar DANFE retornado pela Edge Function com ActionProposal", async () => {
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
          mensagemFormatada: "🧾 **Nota Fiscal Validada**",
        },
        error: null,
      });

      const res = await processWalletDocument({
        fileName: "danfe.pdf",
        mimeType: "application/pdf",
        base64: "dGVzdGU=",
        workspaceId: "ws-123",
      });

      expect(res.tipo).toBe("DANFE");
      expect(res.status).toBe("sucesso");
      expect(res.actionProposal).toBeDefined();
      expect(res.actionProposal?.actionType).toBe("import_invoice");
    });

    it("deve retornar fail-closed quando Edge Function falhar", async () => {
      vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error("Timeout / 504"));

      const res = await processWalletDocument({
        fileName: "documento_qualquer.pdf",
        mimeType: "application/pdf",
        base64: "dGVzdGU=",
        workspaceId: "ws-123",
      });

      expect(res.tipo).toBe("DESCONHECIDO");
      expect(res.actionProposal).toBeUndefined();
      expect(res.content).toContain("Não identifiquei este arquivo");
    });
  });
});
