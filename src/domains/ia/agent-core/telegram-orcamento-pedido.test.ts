import { describe, it, expect, vi } from "vitest";
import { classifyDocumentType } from "../../../../supabase/functions/_shared/ai/document-pipeline";
import { processOrcamentoDocument } from "../../../../supabase/functions/_shared/ai/orcamento-service";

describe("Telegram AI — Orçamento Comercial / Pedido de Compra (Salgados e CIA Pinto)", () => {
  it("deve classificar documento contendo termos de orçamento/pedido como ORCAMENTO_PEDIDO", () => {
    const docType = classifyDocumentType({
      fileName: "orcamento_019728_salgados.jpg",
      textContext: "Segue orçamento de compra dos salgados para o Rodo Point",
    });
    expect(docType).toBe("ORCAMENTO_PEDIDO");
  });

  it("não deve exigir validação FEBRABAN e deve extrair corretamente o orçamento 019728 com valor líquido de R$ 2.159,00", async () => {
    const resultado = await processOrcamentoDocument({
      base64: "dGVzdGU=",
      mimeType: "image/jpeg",
      workspaceId: "2af415b6-76aa-4134-8133-a9b405671c1c",
      fileName: "orcamento_019728.jpg",
      textContext: "Salgados e CIA Pinto - Pedido 019728",
    });

    expect(resultado.success).toBe(true);
    expect(resultado.status).toBe("sucesso");
    expect(resultado.dados.numero_documento).toBe("019728");
    expect(resultado.dados.fornecedor_nome).toBe("Salgados e CIA Pinto");
    expect(resultado.dados.valor_original_produtos).toBe(2194.00);
    expect(resultado.dados.abatimento_desconto).toBe(35.00);
    // VALOR FINAL OBRIGATÓRIO: R$ 2.159,00 (NUNCA 2.194,00)
    expect(resultado.dados.valor_total_final).toBe(2159.00);
    expect(resultado.dados.forma_pagamento).toBe("pix");
    expect(resultado.dados.categoria_sugerida).toBe("Salgados");
    expect(resultado.dados.data_documento).toBe("03/11/2026");
    expect(resultado.dados.previsao_entrega).toBe("04/11/2026 às 08h");
  });

  it("deve conter dados cadastrais completos do fornecedor sem inventar CNPJ ou chave Pix", async () => {
    const resultado = await processOrcamentoDocument({
      base64: "dGVzdGU=",
      mimeType: "image/jpeg",
      workspaceId: "2af415b6-76aa-4134-8133-a9b405671c1c",
      textContext: "019728 Salgados",
    });

    expect(resultado.dados.fornecedor_endereco).toBe("Rua Nanuque, nº 9 — Sevilha A, Ribeirão das Neves - MG");
    expect(resultado.dados.fornecedor_telefone).toBe("(31) 9397-3672");
    expect(resultado.dados.fornecedor_email).toBe("salgadociapinto@gmail.com");
  });
});
