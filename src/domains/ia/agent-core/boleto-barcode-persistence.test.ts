/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateLinhaDigitavel,
  validateCodigoBarras,
  reconcileBoleto,
  cleanDigits,
} from "../../../../supabase/functions/_shared/ai/boleto-validator.ts";
import {
  processDocumentPipeline,
  type ProcessDocumentPipelineInput,
} from "../../../../supabase/functions/_shared/ai/document-pipeline.ts";
import {
  ActionExecutorRegistry,
  registerBoletoActionHandlers,
} from "../../../../supabase/functions/_shared/ai/action-executor-registry.ts";
import { ActionGatewayError } from "../../../../supabase/functions/_shared/ai/action-gateway.ts";

describe("Persistência e Reconciliação Canônica do Código de Barras (44 dígitos)", () => {
  const TEST_WORKSPACE = "ws-barcode-test";
  const TEST_USER = "user-barcode-test";

  // Vetores de teste canônicos
  // 1. Xodó Foods: Itaú (341), Fator 1615 (2026-10-30), Valor 658.14
  const LINHA_XODO_47 = "34191.09008 20945.855607 59884.260007 2 16150000065814";
  const CODIGO_XODO_OCR_48 = "341916091000209458556075988426000216150000065814";
  const CODIGO_XODO_CANONICO_44 = "34192161500000658141090020945855605988426000";

  // 2. SPAL: Itaú (341), Fator 1552, Valor 1562.61
  const LINHA_SPAL_47 = "34191.09115 01746.492931 83045.790009 8 15520000156261";
  const CODIGO_SPAL_CANONICO_44 = "34198155200001562611091101746492938304579000";

  // 3. Arrecadação (Prefeitura / IPTU - começa com 8): 48 dígitos na linha, 44 no código
  // Bloco 1: 81680000001 (DV 9)
  // Bloco 2: 24502598202 (DV 7)
  // Bloco 3: 40118314112 (DV 6)
  // Bloco 4: 00100000000 (DV 8)
  const LINHA_ARRECADACAO_48 = "816800000019245025982027401183141126001000000008";
  const CODIGO_ARRECADACAO_44 = "81680000001245025982024011831411200100000000";

  let insertedRows: any[] = [];
  let mockClient: any;
  let registry: ActionExecutorRegistry;

  beforeEach(() => {
    insertedRows = [];
    mockClient = {
      from: vi.fn((table: string) => ({
        insert: vi.fn((rows: any[]) => {
          if (table === "dividas") {
            insertedRows.push(...rows);
          }
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "divida-uuid-generated-123" },
                error: null,
              })),
            })),
          };
        }),
      })),
    };

    registry = new ActionExecutorRegistry();
    registerBoletoActionHandlers(registry);
  });

  it("1. Caso Real Xodó Foods: OCR de 48 dígitos é reconciliado para o código canônico de 44 dígitos na persistência", async () => {
    const handler = registry.get("cadastrar_divida_boleto")!;
    expect(handler).toBeDefined();

    const payload = {
      beneficiario: "XODO FOODS E DISTRIBUICAO LTDA",
      valor_total: 658.14,
      data_vencimento: "2026-10-30",
      linha_digitavel: LINHA_XODO_47,
      codigo_barras: CODIGO_XODO_OCR_48, // 48 caracteres do OCR
    };

    const res = await handler(
      payload,
      { workspaceId: TEST_WORKSPACE, userId: TEST_USER, role: "authenticated" },
      mockClient
    );

    expect(res.recordId).toBe("divida-uuid-generated-123");
    expect(insertedRows.length).toBe(1);

    const row = insertedRows[0];
    expect(row.credor).toBe("XODO FOODS E DISTRIBUICAO LTDA");
    expect(row.valor_total).toBe(658.14);
    expect(row.data_vencimento).toBe("2026-10-30");
    expect(row.status).toBe("pendente");
    expect(row.valor_pago).toBe(0);

    // Linha e código de barras:
    expect(cleanDigits(row.linha_digitavel).length).toBe(47);
    expect(row.codigo_barras).toBe(CODIGO_XODO_CANONICO_44);
    expect(row.codigo_barras.length).toBe(44);

    // Validação matemática do código de barras salvo
    const valCb = validateCodigoBarras(row.codigo_barras);
    expect(valCb.valido).toBe(true);
    expect(valCb.bancoCodigo).toBe("341");
    expect(valCb.valorDerivado).toBe(658.14);
    expect(valCb.dataVencimentoDerivada).toBe("2026-10-30");
  });

  it("2. Caso SPAL: Linha válida de 47 dígitos normaliza código canônico derivado de 44 dígitos", async () => {
    const handler = registry.get("cadastrar_divida_boleto")!;

    const payload = {
      beneficiario: "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS",
      valor_total: 1562.61,
      data_vencimento: "2026-08-28",
      linha_digitavel: LINHA_SPAL_47,
      codigo_barras: "341981552000015626110911017464929383045790009999", // 48 chars com lixo no final
    };

    await handler(
      payload,
      { workspaceId: TEST_WORKSPACE, userId: TEST_USER, role: "authenticated" },
      mockClient
    );

    const row = insertedRows[0];
    expect(row.codigo_barras).toBe(CODIGO_SPAL_CANONICO_44);
    expect(row.codigo_barras.length).toBe(44);
    expect(validateCodigoBarras(row.codigo_barras).valido).toBe(true);
  });

  it("3. Código com separadores: remove formatação (espaços, pontos, traços) e persiste 44 dígitos puros", async () => {
    const handler = registry.get("cadastrar_divida_boleto")!;

    const payload = {
      beneficiario: "Fornecedor XYZ",
      valor_total: 658.14,
      data_vencimento: "2026-10-30",
      linha_digitavel: LINHA_XODO_47,
      codigo_barras: "34192.16150-0000065814 10900.20945-85560.5988426000",
    };

    await handler(
      payload,
      { workspaceId: TEST_WORKSPACE, userId: TEST_USER, role: "authenticated" },
      mockClient
    );

    const row = insertedRows[0];
    expect(row.codigo_barras).toBe(CODIGO_XODO_CANONICO_44);
    expect(row.codigo_barras).not.toMatch(/[\s.-]/);
  });

  it("4. Código de barras com 48 dígitos incorretos e linha válida: substitui pelo canônico derivado com aviso", () => {
    const rec = reconcileBoleto({
      valor: 658.14,
      data_vencimento: "30/10/2026",
      linha_digitavel: LINHA_XODO_47,
      codigo_barras: CODIGO_XODO_OCR_48,
    });

    expect(rec.valido).toBe(true);
    expect(rec.codigoBarrasFinal).toBe(CODIGO_XODO_CANONICO_44);
    expect(rec.codigoBarrasFinal?.length).toBe(44);
    expect(rec.warnings.some((w) => w.includes("divergencia_codigo_barras_ocr"))).toBe(true);
    expect(rec.evidence?.codigo_barras_canonico_derivado).toBe(true);
    expect(rec.evidence?.codigo_barras_divergente_ocr).toBe(true);
  });

  it("5. Código de barras já válido de 44 dígitos: preservado integralmente", () => {
    const rec = reconcileBoleto({
      valor: 658.14,
      data_vencimento: "30/10/2026",
      linha_digitavel: LINHA_XODO_47,
      codigo_barras: CODIGO_XODO_CANONICO_44,
    });

    expect(rec.valido).toBe(true);
    expect(rec.codigoBarrasFinal).toBe(CODIGO_XODO_CANONICO_44);
    expect(rec.warnings.some((w) => w.includes("divergencia_codigo_barras_ocr"))).toBe(false);
    expect(rec.evidence?.codigo_barras_divergente_ocr).toBe(false);
  });

  it("6. Código contraditório: linha válida de Xodó Foods mas código de barras válido de SPAL -> bloqueia por inconsistência", async () => {
    // Linha aponta para Xodó Foods e código aponta para SPAL (ambos são 44 dígitos válidos mas divergentes)
    const rec = reconcileBoleto({
      valor: 658.14,
      data_vencimento: "30/10/2026",
      linha_digitavel: LINHA_XODO_47,
      codigo_barras: CODIGO_SPAL_CANONICO_44, // Código válido de outro boleto
    });

    expect(rec.valido).toBe(false);
    expect(rec.status).toBe("requer_revisao");
    expect(rec.divergencias.some((d) => d.includes("contraditórios") || d.includes("diferentes"))).toBe(true);

    // E no executor de ação também lança exceção fail-closed
    const handler = registry.get("cadastrar_divida_boleto")!;
    await expect(
      handler(
        {
          beneficiario: "Empresa",
          valor_total: 658.14,
          data_vencimento: "2026-10-30",
          linha_digitavel: LINHA_XODO_47,
          codigo_barras: CODIGO_SPAL_CANONICO_44,
        },
        { workspaceId: TEST_WORKSPACE, userId: TEST_USER, role: "authenticated" },
        mockClient
      )
    ).rejects.toThrow(ActionGatewayError);
  });

  it("7. Linha digitável inválida e código de barras inválido: rejeição fail-closed", async () => {
    const handler = registry.get("cadastrar_divida_boleto")!;
    await expect(
      handler(
        {
          beneficiario: "Empresa",
          valor_total: 100,
          data_vencimento: "2026-10-30",
          linha_digitavel: "11111.11111 22222.222222 33333.333333 4 55555555555555", // DVs matematicamente inválidos
          codigo_barras: "12345", // Código truncado
        },
        { workspaceId: TEST_WORKSPACE, userId: TEST_USER, role: "authenticated" },
        mockClient
      )
    ).rejects.toThrow(ActionGatewayError);
  });

  it("8. Documento de arrecadação (concessionária / 48 dígitos): deriva código de 44 dígitos segundo regras de arrecadação", async () => {
    const valLinha = validateLinhaDigitavel(LINHA_ARRECADACAO_48);
    expect(valLinha.tipo).toBe("arrecadacao");
    expect(valLinha.valido).toBe(true);
    expect(valLinha.codigoBarrasDerivado).toBe(CODIGO_ARRECADACAO_44);
    expect(valLinha.codigoBarrasDerivado?.length).toBe(44);

    const handler = registry.get("cadastrar_divida_boleto")!;
    await handler(
      {
        beneficiario: "Prefeitura Municipal",
        valor_total: 124.50,
        data_vencimento: "2026-11-10",
        linha_digitavel: LINHA_ARRECADACAO_48,
        codigo_barras: "816800000012450259820240118314112001000000009999", // com ruído
      },
      { workspaceId: TEST_WORKSPACE, userId: TEST_USER, role: "authenticated" },
      mockClient
    );

    const row = insertedRows[0];
    expect(row.codigo_barras).toBe(CODIGO_ARRECADACAO_44);
    expect(row.codigo_barras.length).toBe(44);
  });

  it("9. Pipeline de documento com imagem: gera ActionProposal canônica com código de barras derivado de 44 dígitos", async () => {
    let savedProposal: any = null;
    const input: ProcessDocumentPipelineInput = {
      base64: "dGVzdC1ib2xldG8taW1hZ2U=",
      mimeType: "application/pdf",
      fileName: "boleto_bancario_xodo.pdf",
      documentTypeHint: "BOLETO",
      openaiApiKey: "sk-mock-key",
      visualClassifierFn: async () => "BOLETO",
      workspaceId: TEST_WORKSPACE,
      userId: TEST_USER,
      saveProposalFn: async (prop) => {
        savedProposal = prop;
      },
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  doc_type: "BOLETO",
                  confidence: 95,
                  banco: "Itaú Unibanco (341)",
                  beneficiario: "XODO FOODS E DISTRIBUICAO LTDA",
                  valor: 658.14,
                  data_vencimento: "30/10/2026",
                  linha_digitavel: LINHA_XODO_47,
                  codigo_barras: CODIGO_XODO_OCR_48, // 48 chars no OCR
                }),
              },
            },
          ],
        }),
      } as any),
    };

    const res = await processDocumentPipeline(input);
    if (!res.success) {
      console.error("Test 9 failure reason:", res.error, res.validation?.errors);
    }

    expect(res.success).toBe(true);
    expect(res.documentType).toBe("BOLETO");
    expect(res.actionProposal).toBeDefined();

    const payload = res.actionProposal!.payload;
    expect(payload.beneficiario).toBe("XODO FOODS E DISTRIBUICAO LTDA");
    expect(payload.valor_total).toBe(658.14);
    expect(payload.data_vencimento).toBe("2026-10-30");
    // Código de barras no payload da proposta tem exatamente 44 dígitos canônicos:
    expect(payload.codigo_barras).toBe(CODIGO_XODO_CANONICO_44);
    expect((payload.codigo_barras as string).length).toBe(44);

    expect(savedProposal).toBeDefined();
    expect(savedProposal.payload.codigo_barras).toBe(CODIGO_XODO_CANONICO_44);
  });
});
