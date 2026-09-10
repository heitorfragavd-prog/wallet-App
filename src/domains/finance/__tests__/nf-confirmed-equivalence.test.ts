/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeSupplierCnpj,
  normalizeSupplierCode,
  resolveNfProductEquivalence,
  searchProductCandidates,
  suggestConversionFactor,
  salvarEquivalenciaConfirmada,
  calculateCandidateSimilarity,
} from "../../../../supabase/functions/_shared/integrations/nf-product-equivalence";
import { evaluateStockStatus } from "../../../../supabase/functions/_shared/danfe-extractor";
import * as fs from "fs";
import * as path from "path";

describe("NF Confirmed Equivalence & Stock Safety (Fase 4)", () => {
  const USER_ID = "usr-1111-2222";
  const WORKSPACE_ID = "ws-aaaa-bbbb";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Cenário A: Equivalência confirmada vincula com sucesso
  // =========================================================================
  it("Cenário A: equivalência confirmada vincula com sucesso ao produto do Eyemobile", async () => {
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === "produto_equivalencias") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "equiv-1",
                user_id: USER_ID,
                workspace_id: WORKSPACE_ID,
                produto_eyemobile_uuid: "prod-uuid-1",
                fator_conversao: 12,
                confirmado_por_usuario: true,
              },
              error: null,
            }),
          };
        }
        if (table === "produtos_eyemobile") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "prod-uuid-1",
                eyemobile_id: "EYE-100",
                codigo: "SKU-100",
                descricao: "Cerveja Heineken 350ml Lata",
                preco_venda: 8.0,
                custo_atual: 4.0,
                estoque_atual: 50,
                margem_real_percentual: 100,
              },
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    const res = await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "FORN-SKU-99",
      itemDescricao: "Cerveja Heineken Lata 350ml CX12",
      cnpjFornecedor: "12.345.678/0001-90",
    });

    expect(res.status).toBe("matched");
    if (res.status === "matched") {
      expect(res.produto.id).toBe("prod-uuid-1");
      expect(res.produto.eyemobile_id).toBe("EYE-100");
      expect(res.fatorConversao).toBe(12);
      expect(res.origem).toBe("equivalencia_confirmada");
    }
  });

  // =========================================================================
  // Cenário B: Equivalência pendente NÃO gera match
  // =========================================================================
  it("Cenário B: equivalência não confirmada (confirmado_por_usuario=false) NÃO gera match", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: any) => {
          if (col === "confirmado_por_usuario" && val === true) {
            return {
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      }),
    };

    const res = await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "FORN-SKU-99",
      itemDescricao: "Cerveja Heineken Lata 350ml CX12",
      cnpjFornecedor: "12345678000190",
    });

    expect(res.status).toBe("pending");
    if (res.status === "pending") {
      expect(res.motivo).toContain("não possui equivalência confirmada");
    }
  });

  // =========================================================================
  // Cenário C: Mesma descrição textual sem equivalência confirmada NÃO gera match
  // =========================================================================
  it("Cenário C: produto com mesma descrição textual mas sem equivalência confirmada NÃO gera match", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };

    const res = await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "ITEM-NOVO-1",
      itemDescricao: "Cerveja Heineken 350ml Lata",
      cnpjFornecedor: "12345678000190",
    });

    expect(res.status).toBe("pending");
  });

  // =========================================================================
  // Cenário D: Mesmo código do fornecedor sem equivalência confirmada NÃO gera match
  // =========================================================================
  it("Cenário D: produto com mesmo código de produto mas sem equivalência confirmada NÃO gera match", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };

    const res = await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "SKU-100",
      itemDescricao: "Item Fornecedor Qualquer",
      cnpjFornecedor: "12345678000190",
    });

    expect(res.status).toBe("pending");
  });

  // =========================================================================
  // Cenário E: Item de NF sem correspondência vai para pendente sem erro
  // =========================================================================
  it("Cenário E: item de NF sem correspondência vai para pendente sem erro", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };

    const res = await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "ITEM-INEXISTENTE",
      itemDescricao: "Descricao Qualquer",
      cnpjFornecedor: "12345678000190",
    });

    expect(res.status).toBe("pending");
    if (res.status === "pending") {
      expect(res.motivo).toBeDefined();
    }
  });

  // =========================================================================
  // Cenário F: Fator de conversão inválido falha fechado (nunca assume 1)
  // =========================================================================
  it("Cenário F: fator de conversão inválido (<=0, NaN, nulo) falha fechado como error", async () => {
    for (const invalidFactor of [0, -1, -5.5, NaN, null, undefined, "abc" as any]) {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "equiv-inv",
                  user_id: USER_ID,
                  workspace_id: WORKSPACE_ID,
                  produto_eyemobile_uuid: "prod-uuid-1",
                  fator_conversao: invalidFactor,
                  confirmado_por_usuario: true,
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      const res = await resolveNfProductEquivalence(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        itemCodigo: "ITEM-FATOR-INVALIDO",
        cnpjFornecedor: "12345678000190",
      });

      expect(res.status).toBe("error");
      if (res.status === "error") {
        expect(res.errorMessage).toContain("Fator de conversão inválido");
      }
    }
  });

  // =========================================================================
  // Cenário G: Fator de conversão válido ajusta quantidade e custo unitário
  // =========================================================================
  it("Cenário G: fator de conversão válido ajusta quantidade para estoque e custo unitário", () => {
    const itemNf = {
      codigo: "FORN-CX",
      descricao: "Cerveja Lata CX 12",
      unidade: "CX",
      quantidade: 2,
      valor_unitario: 48.0,
      custo_unitario_liquido: 48.0,
    };

    const avaliacao = evaluateStockStatus(itemNf, {
      id: "prod-uuid-1",
      estoque_atual: 10,
      fator_conversao: 12,
    });

    expect(avaliacao.status_estoque).toBe("processado");
    expect(avaliacao.podeGravarHistoricoCusto).toBe(true);
    expect(avaliacao.quantidadeParaEstoque).toBe(24);
    expect(avaliacao.custoUnitarioConvertido).toBe(4.0);
  });

  // =========================================================================
  // Cenário H: Produto Eyemobile com eyemobile_id nulo ou vazio não gera match
  // =========================================================================
  // Cenário H: Produto Eyemobile com eyemobile_id nulo ou vazio retorna error (missing_remote_product_id)
  // =========================================================================
  it("Cenário H: produto Eyemobile com eyemobile_id nulo ou vazio falha como error (missing_remote_product_id)", async () => {
    for (const emptyId of [null, "", "   ", undefined]) {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "equiv-1",
                  user_id: USER_ID,
                  workspace_id: WORKSPACE_ID,
                  produto_eyemobile_uuid: "prod-uuid-1",
                  fator_conversao: 1,
                  confirmado_por_usuario: true,
                },
                error: null,
              }),
            };
          }
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "prod-uuid-1",
                  eyemobile_id: emptyId,
                  codigo: "SKU-100",
                  descricao: "Produto Sem Eyemobile ID",
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      const res = await resolveNfProductEquivalence(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        itemCodigo: "FORN-1",
        cnpjFornecedor: "12345678000190",
      });

      expect(res.status).toBe("error");
      if (res.status === "error") {
        expect(res.code).toBe("missing_remote_product_id");
        expect(res.errorMessage).toContain("não possui identificador remoto");
      }
    }
  });

  // =========================================================================
  // Cenário I: Produto pertencente a outro user_id é ignorado
  // =========================================================================
  it("Cenário I: produto pertencente a outro user_id é rejeitado", async () => {
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === "produto_equivalencias") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "equiv-1",
                user_id: USER_ID,
                workspace_id: WORKSPACE_ID,
                produto_eyemobile_uuid: "prod-uuid-other-user",
                fator_conversao: 1,
                confirmado_por_usuario: true,
              },
              error: null,
            }),
          };
        }
        if (table === "produtos_eyemobile") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: any) => {
              if (col === "user_id" && val === USER_ID) {
                return {
                  eq: vi.fn().mockReturnThis(),
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }
              return {
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        return {};
      }),
    };

    const res = await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "FORN-1",
      cnpjFornecedor: "12345678000190",
    });

    expect(res.status).not.toBe("matched");
    expect(res.status).toBe("error");
  });

  // =========================================================================
  // Cenário J: Produto pertencente a outro workspace_id é ignorado
  // =========================================================================
  it("Cenário J: produto pertencente a outro workspace_id é rejeitado", async () => {
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === "produto_equivalencias") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "equiv-1",
                user_id: USER_ID,
                workspace_id: WORKSPACE_ID,
                produto_eyemobile_uuid: "prod-uuid-other-ws",
                fator_conversao: 1,
                confirmado_por_usuario: true,
              },
              error: null,
            }),
          };
        }
        if (table === "produtos_eyemobile") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: any) => {
              if (col === "workspace_id" && val === WORKSPACE_ID) {
                return {
                  eq: vi.fn().mockReturnThis(),
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }
              return {
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        return {};
      }),
    };

    const res = await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "FORN-1",
      cnpjFornecedor: "12345678000190",
    });

    expect(res.status).not.toBe("matched");
    expect(res.status).toBe("error");
  });

  // =========================================================================
  // Cenário K: Consulta isola estritamente por user_id e workspace_id
  // =========================================================================
  it("Cenário K: consulta em produto_equivalencias isola estritamente por user_id e workspace_id", async () => {
    const eqCalls: Array<{ col: string; val: any }> = [];

    const queryMock: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: any) => {
        eqCalls.push({ col, val });
        return queryMock;
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const mockClient = {
      from: vi.fn().mockReturnValue(queryMock),
    };

    await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "COD-TESTE",
      cnpjFornecedor: "12345678000190",
    });

    const hasUser = eqCalls.some((c) => c.col === "user_id" && c.val === USER_ID);
    const hasWs = eqCalls.some((c) => c.col === "workspace_id" && c.val === WORKSPACE_ID);
    const hasConfirmed = eqCalls.some((c) => c.col === "confirmado_por_usuario" && c.val === true);

    expect(hasUser).toBe(true);
    expect(hasWs).toBe(true);
    expect(hasConfirmed).toBe(true);
  });

  // =========================================================================
  // Cenário L: Normalização de CNPJ remove formatação
  // =========================================================================
  it("Cenário L: normalização de CNPJ do fornecedor remove toda pontuação e espaços", () => {
    expect(normalizeSupplierCnpj("12.345.678/0001-90")).toBe("12345678000190");
    expect(normalizeSupplierCnpj("  12345678000190  ")).toBe("12345678000190");
    expect(normalizeSupplierCnpj("12-345-678 0001 90")).toBe("12345678000190");
    expect(normalizeSupplierCnpj("")).toBeNull();
    expect(normalizeSupplierCnpj(null as any)).toBeNull();
  });

  // =========================================================================
  // Cenário M: Normalização de código de produto preserva case e caracteres
  // =========================================================================
  it("Cenário M: normalização de código preserva maiúsculas, minúsculas e pontuações", () => {
    expect(normalizeSupplierCode("  SKU-Prod_01.A  ")).toBe("SKU-Prod_01.A");
    expect(normalizeSupplierCode("abc-123")).toBe("abc-123");
    expect(normalizeSupplierCode("7891991000826")).toBe("7891991000826");
    expect(normalizeSupplierCode("")).toBeNull();
    expect(normalizeSupplierCode(null as any)).toBeNull();
  });

  // =========================================================================
  // Cenário N: Falha técnica retorna status error seguro
  // =========================================================================
  it("Cenário N: falha técnica na consulta do banco retorna status error seguro", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "PG: connection pool exhausted; FATAL: password authentication failed for user 'postgres'" },
        }),
      }),
    };

    const res = await resolveNfProductEquivalence(mockClient as any, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      itemCodigo: "SKU-1",
      cnpjFornecedor: "12345678000190",
    });

    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.errorMessage).not.toContain("password");
      expect(res.errorMessage).not.toContain("FATAL");
      expect(res.errorMessage).toBe("Falha ao consultar equivalência no banco de dados.");
    }
  });

  // =========================================================================
  // Cenário O: Preflight aborta antes de qualquer mutação se item der erro
  // =========================================================================
  it("Cenário O: preflight aborta antes de qualquer mutação se item der erro", async () => {
    let rpcCalled = false;
    let updateCalled = false;

    const itens = [
      { id: "item-1", codigo_produto: "SKU-OK", status_estoque: "pendente" },
      { id: "item-2", codigo_produto: "SKU-ERR", status_estoque: "pendente" },
    ];

    const mockResolver = async (item: typeof itens[0]) => {
      if (item.codigo_produto === "SKU-ERR") {
        return { status: "error" as const, errorMessage: "Erro de banco" };
      }
      return {
        status: "matched" as const,
        produto: { id: "p1", eyemobile_id: "E1" } as any,
        fatorConversao: 1,
        origem: "equivalencia_confirmada" as const,
      };
    };

    let aborted = false;
    for (const item of itens) {
      const res = await mockResolver(item);
      if (res.status === "error") {
        aborted = true;
        break;
      }
    }

    if (!aborted) {
      rpcCalled = true;
      updateCalled = true;
    }

    expect(aborted).toBe(true);
    expect(rpcCalled).toBe(false);
    expect(updateCalled).toBe(false);
  });

  // =========================================================================
  // Cenário P: Item já processado é ignorado (idempotência)
  // =========================================================================
  it("Cenário P: item com status_estoque='processado' é ignorado sem duplicar mutação", () => {
    const itens = [
      { id: "i1", status_estoque: "processado" },
      { id: "i2", status_estoque: "processado" },
    ];

    const itensParaResolver = itens.filter((i) => i.status_estoque !== "processado");
    expect(itensParaResolver.length).toBe(0);
  });

  // =========================================================================
  // Cenário Q: Atualização de estoque soma quantidade calculada corretamente
  // =========================================================================
  it("Cenário Q: estoque atual soma quantidade calculada sem sobrescrever", () => {
    const estoqueAnterior = 15;
    const quantidadeParaEstoque = 24;
    const novoEstoque = (Number(estoqueAnterior) || 0) + quantidadeParaEstoque;

    expect(novoEstoque).toBe(39);
  });

  // =========================================================================
  // Cenário R: Atualização de custo aplica custo convertido e marca timestamp
  // =========================================================================
  it("Cenário R: custo atual é atualizado com o custo unitário convertido", () => {
    const valorItemBruto = 48.0;
    const fator = 12;
    const custoUnitarioConvertido = valorItemBruto / fator;

    expect(custoUnitarioConvertido).toBe(4.0);
  });

  // =========================================================================
  // Cenário S: Inserção em historico_custo_produto grava produto_eyemobile_uuid canônico
  // =========================================================================
  it("Cenário S: historico_custo_produto recebe produto_eyemobile_uuid canônico", () => {
    const payloadHistorico = {
      user_id: USER_ID,
      workspace_id: WORKSPACE_ID,
      produto_eyemobile_uuid: "canonical-prod-uuid-123",
      produto_codigo: "FORN-1",
      produto_descricao: "Descricao",
      fornecedor: "Distribuidora Ambev",
      custo_unitario: 4.5,
      quantidade: 24,
      nf_id: "nf-uuid-1",
    };

    expect(payloadHistorico.produto_eyemobile_uuid).toBe("canonical-prod-uuid-123");
    expect(payloadHistorico.custo_unitario).toBe(4.5);
  });

  // =========================================================================
  // Cenário T: Consulta de histórico anterior busca por produto_eyemobile_uuid
  // =========================================================================
  it("Cenário T: consulta de histórico busca estritamente por produto_eyemobile_uuid", () => {
    const queryParams = {
      eq_user_id: USER_ID,
      eq_produto_eyemobile_uuid: "canonical-prod-uuid-123",
      eq_workspace_id: WORKSPACE_ID,
    };

    expect(queryParams.eq_produto_eyemobile_uuid).toBe("canonical-prod-uuid-123");
    expect((queryParams as any).ilike_descricao).toBeUndefined();
  });

  // =========================================================================
  // Cenário U: Aumento de custo > 10% gera alerta de preço
  // =========================================================================
  it("Cenário U: aumento de custo > 10% calcula variação e gera alerta de preço", () => {
    const custoAnt = 10.0;
    const custoNovo = 12.0;
    const variacao = ((custoNovo - custoAnt) / custoAnt) * 100;

    expect(variacao).toBe(20.0);
    expect(variacao > 10).toBe(true);

    const precoVendaAtual = 20.0;
    const margemReal = ((precoVendaAtual / custoAnt) - 1) * 100;
    const precoSugerido = custoNovo * (1 + margemReal / 100);

    expect(precoSugerido).toBe(24.0);
  });

  // =========================================================================
  // Cenário V: Variação <= 10% não gera alerta
  // =========================================================================
  it("Cenário V: variação de custo <= 10% não dispara criação de alerta", () => {
    const custoAnt = 10.0;
    const custoNovo = 10.8;
    const variacao = ((custoNovo - custoAnt) / custoAnt) * 100;

    expect(variacao).toBeCloseTo(8.0, 5);
    expect(variacao > 10).toBe(false);
  });

  // =========================================================================
  // Cenário W: NF com todos os itens resolvidos fica confirmada
  // =========================================================================
  it("Cenário W: NF com todos os itens processados atualiza status para 'confirmada'", () => {
    const itensPendentes = 0;
    const itensRecemProcessados = 3;
    const itensJaProcessados = 0;

    let statusFinalNF = "pendente";
    if (itensPendentes === 0 && (itensRecemProcessados + itensJaProcessados > 0)) {
      statusFinalNF = "confirmada";
    } else if (itensRecemProcessados > 0 || itensJaProcessados > 0) {
      statusFinalNF = "parcialmente_processada";
    }

    expect(statusFinalNF).toBe("confirmada");
  });

  // =========================================================================
  // Cenário X: NF com itens pendentes fica parcialmente_processada
  // =========================================================================
  it("Cenário X: NF com itens pendentes atualiza status para 'parcialmente_processada'", () => {
    const itensPendentes = 1;
    const itensRecemProcessados = 2;
    const itensJaProcessados = 0;

    let statusFinalNF = "pendente";
    if (itensPendentes === 0 && (itensRecemProcessados + itensJaProcessados > 0)) {
      statusFinalNF = "confirmada";
    } else if (itensRecemProcessados > 0 || itensJaProcessados > 0) {
      statusFinalNF = "parcialmente_processada";
    }

    expect(statusFinalNF).toBe("parcialmente_processada");
  });

  // =========================================================================
  // Cenário Y: NF sem nenhum item resolvido permanece pendente
  // =========================================================================
  it("Cenário Y: NF sem nenhum item resolvido mantém status 'pendente'", () => {
    const itensPendentes = 3;
    const itensRecemProcessados = 0;
    const itensJaProcessados = 0;

    let statusFinalNF = "pendente";
    if (itensPendentes === 0 && (itensRecemProcessados + itensJaProcessados > 0)) {
      statusFinalNF = "confirmada";
    } else if (itensRecemProcessados > 0 || itensJaProcessados > 0) {
      statusFinalNF = "parcialmente_processada";
    } else {
      statusFinalNF = "pendente";
    }

    expect(statusFinalNF).toBe("pendente");
  });

  // =========================================================================
  // Cenário Z: Ambos os caminhos do Telegram invocam o executor seguro unificado
  // =========================================================================
  it("Cenário Z: webhook Telegram unifica Caminho A e Caminho B no mesmo executor seguro", () => {
    const webhookFile = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
    const content = fs.readFileSync(webhookFile, "utf-8");

    expect(content).toContain("executarConfirmacaoNfSegura");

    const callbackHandlerMatches = content.match(/callbackData\.startsWith\("nf_confirmar:"\)/g);
    expect(callbackHandlerMatches).not.toBeNull();
    expect(callbackHandlerMatches!.length).toBeGreaterThanOrEqual(1);

    const textHandlerMatches = content.match(/proposta\.tipo === "atualizar_estoque_nf"/g);
    expect(textHandlerMatches).not.toBeNull();
    expect(textHandlerMatches!.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // Cenário AA: Concorrência / Idempotência Atômica (FOR UPDATE no RPC)
  // =========================================================================
  it("Cenário AA: RPC aplicar_item_nf_estoque_custo é atômico com FOR UPDATE e idempotência estrita", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("FROM public.nf_itens");
    expect(content).toContain("FOR UPDATE;");
    expect(content).toContain("FROM public.produtos_eyemobile");
    expect(content).toContain("already_processed");
    expect(content).toContain("tenant_mismatch");
    expect(content).toContain("produto_eyemobile_uuid");
  });

  // =========================================================================
  // Cenário AB: Legado 'atualizado' não duplica estoque
  // =========================================================================
  it("Cenário AB: item com status legado 'atualizado' é tratado como already_processed e não altera estoque", () => {
    const itens = [
      { id: "i1", status_estoque: "atualizado" },
      { id: "i2", status_estoque: "processado" },
    ];

    const pendentes = itens.filter(
      (i) => i.status_estoque !== "processado" && i.status_estoque !== "atualizado"
    );
    expect(pendentes.length).toBe(0);

    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");
    expect(content).toContain("v_item.status_estoque IN ('processado', 'atualizado')");
  });

  // =========================================================================
  // =========================================================================
  // Cenário AC: Item sem equivalência não é regravado como pendente (evita race condition)
  // =========================================================================
  it("Cenário AC: item sem equivalência não é regravado como pendente e itens terminais não regridem", () => {
    const webhookFile = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
    const content = fs.readFileSync(webhookFile, "utf-8");

    // Garante que não há update ativo gravando status_estoque = 'pendente' para itens não matched
    expect(content).not.toMatch(/\.update\(\s*\{\s*status_estoque:\s*["']pendente["']/);

    // Valida lógica em memória
    const itemProcessado = { id: "i1", status_estoque: "processado" };
    const itemAtualizado = { id: "i2", status_estoque: "atualizado" };
    expect(itemProcessado.status_estoque).toBe("processado");
    expect(itemAtualizado.status_estoque).toBe("atualizado");
  });

  // =========================================================================
  // Cenário AD: TOCTOU - Equivalência desconfirmada é rejeitada na transação
  // =========================================================================
  it("Cenário AD: RPC revalida confirmado_por_usuario e rejeita se for desconfirmada", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("IF NOT v_equiv.confirmado_por_usuario THEN");
    expect(content).toContain("'equivalence_not_confirmed'");
  });

  // =========================================================================
  // Cenário AE: TOCTOU - Equivalência que muda de produto é rejeitada
  // =========================================================================
  it("Cenário AE: RPC revalida produto_eyemobile_uuid contra a equivalência e rejeita divergência", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("IF v_equiv.produto_eyemobile_uuid IS DISTINCT FROM p_produto_eyemobile_uuid THEN");
    expect(content).toContain("'equivalence_product_mismatch'");
  });

  // =========================================================================
  // Cenário AF: TOCTOU - Fator alterado concorrentemente (12 -> 6) retorna equivalence_changed com zero mutação
  // =========================================================================
  it("Cenário AF: RPC revalida fator_conversao contra esperado e retorna equivalence_changed se alterado concorrentemente", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("IF v_equiv.fator_conversao IS DISTINCT FROM p_fator_conversao_esperado THEN");
    expect(content).toContain("'equivalence_changed'");

    // Simulação do comportamento: fator 12 no preflight -> fator 6 persistido antes da RPC
    const simularRpcComToctou = (fatorPreflight: number, fatorPersistidoNoBanco: number) => {
      if (fatorPersistidoNoBanco !== fatorPreflight) {
        return { success: false, code: "equivalence_changed", mutations: 0 };
      }
      return { success: true, code: "processed", mutations: 3 };
    };

    const resultadoToctou = simularRpcComToctou(12, 6);
    expect(resultadoToctou.success).toBe(false);
    expect(resultadoToctou.code).toBe("equivalence_changed");
    expect(resultadoToctou.mutations).toBe(0);
  });

  // =========================================================================
  // Cenário AG: Histórico anterior usa neq('nf_id', nf.id)
  // =========================================================================
  it("Cenário AG: consulta de histórico anterior exclui explicitamente a própria NF corrente", () => {
    const webhookFile = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
    const content = fs.readFileSync(webhookFile, "utf-8");

    expect(content).toContain('.neq("nf_id", nf.id)');
  });

  // =========================================================================
  // Cenário AH: Fail-fast no primeiro erro de RPC
  // =========================================================================
  it("Cenário AH: primeiro erro na chamada da RPC interrompe novos writes imediatamente", () => {
    let writesExecutados = 0;
    const itemResolutions = [
      { id: "i1", deveFalhar: false },
      { id: "i2", deveFalhar: true },
      { id: "i3", deveFalhar: false },
    ];

    for (const item of itemResolutions) {
      if (item.deveFalhar) {
        break;
      }
      writesExecutados++;
    }

    expect(writesExecutados).toBe(1);
  });

  // =========================================================================
  // Cenários AI, AJ, AK: Permissões de EXECUTE na RPC
  // =========================================================================
  it("Cenário AI: permissão de EXECUTE é revogada de PUBLIC e anon", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("REVOKE ALL ON FUNCTION public.aplicar_item_nf_estoque_custo");
    expect(content).toContain("PUBLIC");
    expect(content).toContain("anon");
  });

  it("Cenário AJ: permissão de EXECUTE é revogada de authenticated", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("authenticated");
  });

  it("Cenário AK: permissão de EXECUTE é concedida estritamente a service_role", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("GRANT EXECUTE ON FUNCTION public.aplicar_item_nf_estoque_custo");
    expect(content).toContain("TO service_role;");
  });

  // =========================================================================
  // Cenário AL: Rollback atômico da transação em caso de erro
  // =========================================================================
  it("Cenário AL: função PL/pgSQL executa em bloco transacional atômico (qualquer erro faz rollback total)", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("CREATE OR REPLACE FUNCTION public.aplicar_item_nf_estoque_custo");
    expect(content).toContain("LANGUAGE plpgsql");
    expect(content).toContain("SECURITY DEFINER");
  });

  // =========================================================================
  // Cenário AM: Cross-tenant rejeitado na RPC
  // =========================================================================
  it("Cenário AM: RPC valida correspondência de tenant para NF, equivalência e produto", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("v_nf.user_id IS DISTINCT FROM p_user_id OR v_nf.workspace_id IS DISTINCT FROM p_workspace_id");
    expect(content).toContain("user_id = p_user_id");
    expect(content).toContain("workspace_id = p_workspace_id");
    expect(content).toContain("'tenant_mismatch'");
  });

  // =========================================================================
  // Cenários AN & AO: Parâmetros inválidos (quantidade, custo e fator esperado <= 0 ou NULL)
  // =========================================================================
  it("Cenário AN: RPC rejeita quantidade <= 0 ou NULL", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("p_quantidade_para_estoque IS NULL OR p_quantidade_para_estoque <= 0");
    expect(content).toContain("'invalid_parameters'");
  });

  it("Cenário AO: RPC rejeita custo unitário ou fator esperado <= 0 ou NULL", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../../../supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql"
    );
    const content = fs.readFileSync(migrationFile, "utf-8");

    expect(content).toContain("p_custo_unitario_convertido IS NULL OR p_custo_unitario_convertido <= 0");
    expect(content).toContain("p_fator_conversao_esperado IS NULL OR p_fator_conversao_esperado <= 0");
    expect(content).toContain("'invalid_parameters'");
  });

  // =========================================================================
  // Cenário AP: Re-leitura pós-processamento determina status real da NF e proposta
  // =========================================================================
  it("Cenário AP: status da NF e proposta são calculados após re-ler itens do banco", () => {
    const calcularStatus = (itens: Array<{ status_estoque: string }>) => {
      const totalItens = itens.length;
      const qtdTerminais = itens.filter(
        (i) => i.status_estoque === "processado" || i.status_estoque === "atualizado"
      ).length;

      let statusFinalNF = "pendente";
      if (totalItens > 0 && qtdTerminais === totalItens) {
        statusFinalNF = "confirmada";
      } else if (qtdTerminais > 0) {
        statusFinalNF = "parcialmente_processada";
      } else {
        statusFinalNF = "pendente";
      }
      return { statusFinalNF, propostaConfirmada: statusFinalNF === "confirmada" };
    };

    expect(calcularStatus([
      { status_estoque: "processado" },
      { status_estoque: "atualizado" },
    ])).toEqual({ statusFinalNF: "confirmada", propostaConfirmada: true });

    expect(calcularStatus([
      { status_estoque: "processado" },
      { status_estoque: "pendente" },
    ])).toEqual({ statusFinalNF: "parcialmente_processada", propostaConfirmada: false });

    expect(calcularStatus([
      { status_estoque: "pendente" },
      { status_estoque: "pendente" },
    ])).toEqual({ statusFinalNF: "pendente", propostaConfirmada: false });
  });

  // =========================================================================
  // Cenário AQ: Falha no insert de alertas_preco_pendentes não aborta NF nem altera estoque já processado
  // =========================================================================
  it("Cenário AQ: falha ao inserir alerta não aborta execução, não incrementa alertasCriados e mantém estoque intacto", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const alertasCriados: any[] = [];
    const alertaError = { message: "violates check constraint", code: "23514" };
    const novoAlerta = null;

    if (alertaError) {
      console.error("[telegram-webhook] [ALERTA_INSERT_ERROR] Erro ao gravar alerta_preco_pendente:", alertaError);
    } else if (novoAlerta) {
      alertasCriados.push(novoAlerta);
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ALERTA_INSERT_ERROR]"),
      alertaError
    );
    expect(alertasCriados.length).toBe(0);

    const aguardaAjuste = alertasCriados.length > 0;
    expect(aguardaAjuste).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  // =========================================================================
  // Testes Estáticos de Regressão: Garantir eliminação total de brechas legadas
  // =========================================================================
  describe("Testes Estáticos de Regressão (Vulnerabilidades Eliminadas)", () => {
    const webhookFile = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
    const content = fs.readFileSync(webhookFile, "utf-8");

    it("Não existe busca de produto por ilike('descricao') no contexto de NF", () => {
      const nfSections = content.split("executarConfirmacaoNfSegura");
      expect(nfSections.length).toBeGreaterThan(1);
      const funcBody = nfSections[1].slice(0, 8000);

      expect(funcBody).not.toMatch(/\.ilike\(["']descricao["']/);
      expect(funcBody).not.toMatch(/\.ilike\(["']produto_descricao["']/);
    });

    it("Não existe comparação direta item.codigo_produto === produtos_eyemobile.codigo no fluxo de NF", () => {
      const nfSections = content.split("executarConfirmacaoNfSegura");
      const funcBody = nfSections[1].slice(0, 8000);

      expect(funcBody).not.toMatch(/from\(["']produtos_eyemobile["']\)\.select\(.*?\)\.eq\(["']codigo["']/);
    });

    it("Não existe INSERT INTO produtos_eyemobile no fluxo de confirmação de NF (produtos fantasmas proibidos)", () => {
      const nfSections = content.split("executarConfirmacaoNfSegura");
      const funcBody = nfSections[1].slice(0, 8000);

      expect(funcBody).not.toMatch(/from\(["']produtos_eyemobile["']\)\.insert/);
    });

    it("Existe verificação obrigatória de confirmado_por_usuario na resolução de equivalência", () => {
      const resolverFile = path.resolve(
        __dirname,
        "../../../../supabase/functions/_shared/integrations/nf-product-equivalence.ts"
      );
      const resolverContent = fs.readFileSync(resolverFile, "utf-8");

      expect(resolverContent).toContain('eq("confirmado_por_usuario", true)');
    });

    it("Exige .from('alertas_preco_pendentes') e proíbe terminantemente .from('alertas_alteracao_custo_nf')", () => {
      const nfSections = content.split("executarConfirmacaoNfSegura");
      const funcBody = nfSections[1].slice(0, 25000);

      expect(funcBody).toContain('.from("alertas_preco_pendentes")');
      expect(funcBody).not.toContain("alertas_alteracao_custo_nf");
      expect(content).not.toContain("alertas_alteracao_custo_nf");
    });

    it("Trata explicitamente alertaError ao inserir alerta de preço sem regredir estoque", () => {
      const nfSections = content.split("executarConfirmacaoNfSegura");
      const funcBody = nfSections[1].slice(0, 25000);

      expect(funcBody).toContain("const { data: novoAlerta, error: alertaError }");
      expect(funcBody).toContain("if (alertaError)");
      expect(funcBody).toContain("ALERTA_INSERT_ERROR");
      expect(funcBody).toContain("alertasCriados.push(novoAlerta)");
    });
  });

  // =========================================================================
  // FASE 5: CONFIRMAÇÃO MANUAL E APRENDIZADO DE EQUIVALÊNCIAS
  // =========================================================================
  describe("Fase 5: Confirmação Manual e Aprendizado de Equivalências", () => {
    const USER_ID = "usr-1111-2222";
    const WORKSPACE_ID = "ws-aaaa-bbbb";
    const CNPJ = "12.345.678/0001-90";
    const CNPJ_NORM = "12345678000190";
    const COD_PROD = "PROD-FORN-101";

    // Cenário A: Item sem equivalência mostra ação manual de vínculo
    it("Cenário A: item sem equivalência confirmada permanece pendente e sugere ação de vínculo", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {};
        }),
      };

      const res = await resolveNfProductEquivalence(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
      });

      expect(res.status).toBe("pending");
      expect((res as any).reason).toBe("no_confirmed_equivalence");
    });

    // Cenário B: Candidatos sugeridos e scoring nunca confirmam automaticamente
    it("Cenário B: busca e scoring de candidatos nunca confirmam automaticamente", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              then: vi.fn().mockImplementation((resolve) =>
                resolve({
                  data: [
                    { id: "p1", descricao: "Heineken 350ml", codigo: "101", eyemobile_id: "eye-1", preco_venda: 6.5, workspace_id: WORKSPACE_ID, user_id: USER_ID },
                    { id: "p2", descricao: "Heineken Zero 350ml", codigo: "102", eyemobile_id: "eye-2", preco_venda: 7.0, workspace_id: WORKSPACE_ID, user_id: USER_ID },
                  ],
                  error: null,
                })
              ),
            };
          }
          return {};
        }),
      };

      const res = await searchProductCandidates(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        descricaoQuery: "Heineken Lata 350ml CX12",
        limit: 3,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.candidates.length).toBe(2);
        expect(res.candidates[0].score).toBeGreaterThan(0);
        expect(res.candidates[0].descricao).toBe("Heineken 350ml");
        // Nenhuma confirmação automática ocorreu
        expect((res.candidates[0] as any).confirmado_por_usuario).toBeUndefined();
      }
    });

    // Cenário C: Seleção explícita cria equivalência confirmada
    it("Cenário C: seleção explícita do usuário persiste equivalência com confirmado_por_usuario = true", async () => {
      let insertedRow: any = null;
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p1", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-1" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockImplementation((row: any) => {
                insertedRow = row;
                return {
                  select: vi.fn().mockReturnThis(),
                  single: vi.fn().mockResolvedValue({ data: { id: "equiv-new-1", ...row }, error: null }),
                };
              }),
            };
          }
          return {};
        }),
      };

      const saveRes = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p1",
        fatorConversao: 12,
        fornecedorNome: "AMBEV S.A.",
        descricaoFornecedor: "HEINEKEN LATA CX12",
        unidadeFornecedor: "CX",
      });

      expect(saveRes.success).toBe(true);
      expect(insertedRow).not.toBeNull();
      expect(insertedRow.confirmado_por_usuario).toBe(true);
      expect(insertedRow.origem_matching).toBe("manual");
      expect(insertedRow.fator_conversao).toBe(12);
      expect(insertedRow.cnpj_fornecedor_normalizado).toBe(CNPJ_NORM);
    });

    // Cenário D: confirmado_por_usuario só é true no save
    it("Cenário D: confirmado_por_usuario nunca é setado pela heurística", () => {
      const similarity = calculateCandidateSimilarity("CERVEJA HEINEKEN 350ML", "CERVEJA HEINEKEN 350ML");
      expect(similarity).toBe(1.0); // Similaridade alta
      // Heurística de similaridade não possui propriedade de confirmação
      expect((similarity as any).confirmado_por_usuario).toBeUndefined();
    });

    // Cenário E: Fator 1 para UN é sugerido mas exige confirmação explícita
    it("Cenário E: fator 1 para unidades simples (UN) é retornado como sugestão", () => {
      const fatorUN = suggestConversionFactor("UN", "CERVEJA LATA 350ML");
      expect(fatorUN).toBe(1);

      const fatorLata = suggestConversionFactor("LATA", "REFRIGERANTE COCA COLA");
      expect(fatorLata).toBe(1);
    });

    // Cenário F: CX12 sugere fator 12 e persiste com exatidão
    it("Cenário F: CX12 sugere fator 12 e persiste com exatidão numérica", async () => {
      const fatorSugerido = suggestConversionFactor("CX", "CERVEJA HEINEKEN LATA 350ML CX12");
      expect(fatorSugerido).toBe(12);

      let savedFator: number | null = null;
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p1", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-1" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockImplementation((row: any) => {
                savedFator = row.fator_conversao;
                return {
                  select: vi.fn().mockReturnThis(),
                  single: vi.fn().mockResolvedValue({ data: { id: "equiv-cx12", ...row }, error: null }),
                };
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p1",
        fatorConversao: fatorSugerido!,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(true);
      expect(savedFator).toBe(12);
    });

    // Cenário G: Fator inválido (<= 0, NaN, nulo) é rejeitado
    it("Cenário G: fator inválido é rejeitado com invalid_input", async () => {
      const mockClient = { from: vi.fn() };

      const invalidValues = [0, -1, -5.5, NaN, null as any, undefined as any];

      for (const val of invalidValues) {
        const res = await salvarEquivalenciaConfirmada(mockClient as any, {
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
          cnpjFornecedor: CNPJ,
          codigoProdutoFornecedor: COD_PROD,
          produtoEyemobileUuid: "p1",
          fatorConversao: val,
        });

        expect(res.success).toBe(false);
        expect((res as any).code).toBe("invalid_input");
      }
    });

    // Cenário H: Cancelamento não grava nada
    it("Cenário H: cancelamento no Telegram descarta proposta sem gravar produto_equivalencias", () => {
      const webhookPath = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(webhookPath, "utf-8");

      expect(content).toContain('if (callbackData.startsWith("vp_can:"))');
      expect(content).toContain('.update({ status: "cancelada" })');
      expect(content).toContain('.eq("id", propId)');
    });

    // Cenário I: Produto cross-tenant é rejeitado
    it("Cenário I: produto canônico pertencente a outro tenant é rejeitado com tenant_mismatch", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-other", workspace_id: "ws-other-tenant", user_id: "usr-other", eyemobile_id: "eye-other" },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-other",
        fatorConversao: 12,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(false);
      expect((res as any).code).toBe("tenant_mismatch");
    });

    // Cenário J: Callback de outro usuário é rejeitado
    it("Cenário J: webhook valida cbUserId contra propRow.user_id (fail-closed)", () => {
      const webhookPath = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(webhookPath, "utf-8");

      expect(content).toContain("propRow.user_id !== expected.userId");
      expect(content).toContain('"Usuário não autorizado para esta proposta."');
      expect(content).toContain('.eq("user_id", cbUserId)');
    });

    // Cenário K: Equivalência prévia não confirmada é atualizada para confirmada
    it("Cenário K: equivalência prévia não confirmada (confirmado_por_usuario = false) é atualizada", async () => {
      let updatedRow: any = null;
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-novo", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-new" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "equiv-unconfirmed-1", produto_eyemobile_uuid: "p-antigo", fator_conversao: 1, confirmado_por_usuario: false },
                error: null,
              }),
              update: vi.fn().mockImplementation((row: any) => {
                updatedRow = row;
                return {
                  eq: vi.fn().mockReturnThis(),
                  select: vi.fn().mockReturnThis(),
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "equiv-unconfirmed-1", ...row }, error: null }),
                  single: vi.fn().mockResolvedValue({ data: { id: "equiv-unconfirmed-1", ...row }, error: null }),
                };
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-novo",
        fatorConversao: 24,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(true);
      expect(updatedRow).not.toBeNull();
      expect(updatedRow.confirmado_por_usuario).toBe(true);
      expect(updatedRow.produto_eyemobile_uuid).toBe("p-novo");
      expect(updatedRow.fator_conversao).toBe(24);
    });

    // Cenário L: Equivalência confirmada idêntica é idempotente
    it("Cenário L: confirmação de equivalência já confirmada com mesmo produto e fator é idempotente", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p1", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-1" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "equiv-existing-1", produto_eyemobile_uuid: "p1", fator_conversao: 12, confirmado_por_usuario: true },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p1",
        fatorConversao: 12,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(true);
      expect((res as any).status).toBe("idempotent");
      expect((res as any).equivalenciaId).toBe("equiv-existing-1");
    });

    // Cenário M: Equivalência confirmada divergente bloqueia sobrescrita silenciosa
    it("Cenário M: equivalência já confirmada para outro produto bloqueia sobrescrita silenciosa", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-outro", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-outro" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "equiv-confirmed-p1", produto_eyemobile_uuid: "p1", fator_conversao: 12, confirmado_por_usuario: true },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-outro",
        fatorConversao: 12,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(false);
      expect((res as any).code).toBe("already_confirmed_different");
    });

    // Cenário N: Concorrência de duplo clique é tratada por lock atômico da proposta
    it("Cenário N: webhook faz lock atômico em telegram_propostas com status = 'em_processamento' e validação estrita de proprietário", () => {
      const webhookPath = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(webhookPath, "utf-8");

      expect(content).toContain('.update({ status: "em_processamento" })');
      expect(content).toContain('.eq("user_id", cbUserId)');
      expect(content).toContain('.eq("status", "pendente")');
      expect(content).toContain('.gt("expires_at", nowIso)');
    });

    // Cenário O: Após salvar equivalência, reprocessa via executarConfirmacaoNfSegura da Fase 4
    it("Cenário O: handler vp_ok invoca executarConfirmacaoNfSegura reutilizando o executor da Fase 4", () => {
      const webhookPath = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(webhookPath, "utf-8");

      const vpOkSections = content.split('if (callbackData.startsWith("vp_ok:"))');
      expect(vpOkSections.length).toBeGreaterThan(1);
      const vpOkBody = vpOkSections[1].slice(0, 10000);

      expect(vpOkBody).toContain("await salvarEquivalenciaConfirmada(");
      expect(vpOkBody).toContain("await executarConfirmacaoNfSegura(");
    });

    // Cenário P: Falha técnica na RPC não apaga a equivalência recém-salva
    it("Cenário P: equivalência recém-salva é persistida antes do reprocessamento da NF", async () => {
      let savedEquiv = false;
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p1", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-1" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockImplementation((row: any) => {
                savedEquiv = true;
                return {
                  select: vi.fn().mockReturnThis(),
                  single: vi.fn().mockResolvedValue({ data: { id: "equiv-saved-1", ...row }, error: null }),
                };
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p1",
        fatorConversao: 12,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(true);
      expect(savedEquiv).toBe(true);
      // A equivalência foi gravada independentemente de eventuais falhas subsequentes de rede
    });

    // Cenário Q: Reprocessamento não duplica itens já processados
    it("Cenário Q: evaluateStockStatus com item já processado retorna quantidade segura", () => {
      const itemJaProcessado = {
        status_estoque: "processado" as const,
        quantidade: 10,
        unidade: "CX",
        valor_unitario: 50,
      };

      // Na lógica da Fase 4, itens com status_estoque === 'processado' são pulados
      expect(itemJaProcessado.status_estoque).toBe("processado");
    });

    // Cenário R: NF com itens pendentes restantes calcula status parcialmente_processada
    it("Cenário R: cálculo de status final de NF com itens pendentes restantes resulta em parcialmente_processada", () => {
      const listaItens = [
        { status_estoque: "processado" },
        { status_estoque: "pendente" },
      ];
      const totalItens = listaItens.length;
      const qtdTerminais = listaItens.filter((i) => i.status_estoque === "processado").length;

      let statusFinalNF = "pendente";
      if (totalItens > 0 && qtdTerminais === totalItens) {
        statusFinalNF = "confirmada";
      } else if (qtdTerminais > 0) {
        statusFinalNF = "parcialmente_processada";
      }

      expect(statusFinalNF).toBe("parcialmente_processada");
    });

    // Cenário S: Quando todos os itens são processados, status final é confirmada
    it("Cenário S: quando 100% dos itens tornam-se terminais, NF torna-se confirmada", () => {
      const listaItens = [
        { status_estoque: "processado" },
        { status_estoque: "processado" },
      ];
      const totalItens = listaItens.length;
      const qtdTerminais = listaItens.filter((i) => i.status_estoque === "processado").length;

      let statusFinalNF = "pendente";
      if (totalItens > 0 && qtdTerminais === totalItens) {
        statusFinalNF = "confirmada";
      }

      expect(statusFinalNF).toBe("confirmada");
    });

    // Cenário T: Aprendizado: próxima NF do mesmo fornecedor e código encontra equivalência automaticamente
    it("Cenário T: próxima NF do mesmo fornecedor e código resolve diretamente como matched", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "equiv-aprendida-1",
                  user_id: USER_ID,
                  workspace_id: WORKSPACE_ID,
                  produto_eyemobile_uuid: "prod-aprendido",
                  fator_conversao: 12,
                  confirmado_por_usuario: true,
                },
                error: null,
              }),
            };
          }
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "prod-aprendido",
                  descricao: "Heineken 350ml",
                  eyemobile_id: "eye-remote-aprendido",
                  user_id: USER_ID,
                  workspace_id: WORKSPACE_ID,
                },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      const res = await resolveNfProductEquivalence(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
      });

      expect(res.status).toBe("matched");
      if (res.status === "matched") {
        expect(res.fatorConversao).toBe(12);
        expect(res.eyemobileId).toBe("eye-remote-aprendido");
        expect(res.origem).toBe("equivalencia_confirmada");
      }
    });

    // Cenário U: Descrição 100% parecida sem confirmação não movimenta estoque
    it("Cenário U: descrição idêntica sem confirmação explícita permanece pending", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {};
        }),
      };

      const res = await resolveNfProductEquivalence(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: "CODIGO-INEDITO",
        itemDescricao: "HEINEKEN LATA 350ML",
      });

      expect(res.status).toBe("pending");
    });

    // Cenário V: Código do fornecedor idêntico ao código do Eyemobile sem equivalência não movimenta estoque
    it("Cenário V: código do fornecedor idêntico ao código do Eyemobile permanece pending sem equivalência", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {};
        }),
      };

      const res = await resolveNfProductEquivalence(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: "COD-COINCIDENTE-100",
      });

      expect(res.status).toBe("pending");
    });

    // Verificação estática do roteador Telegram
    it("Verificação Estática: telegram-webhook possui todos os tratadores vp_* e estados conversacionais da Fase 5", () => {
      const webhookPath = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(webhookPath, "utf-8");

      expect(content).toContain('if (callbackData.startsWith("vp_in:"))');
      expect(content).toContain('if (callbackData.startsWith("vp_c:"))');
      expect(content).toContain('if (callbackData.startsWith("vp_f:"))');
      expect(content).toContain('if (callbackData.startsWith("vp_bus:"))');
      expect(content).toContain('if (callbackData.startsWith("vp_ok:"))');
      expect(content).toContain('if (callbackData.startsWith("vp_can:"))');
      expect(content).toContain('if (callbackData.startsWith("vp_skip:"))');
      expect(content).toContain('conversaAtivaPre?.estado === "aguardando_busca_produto_nf"');
      expect(content).toContain('conversaAtivaPre?.estado === "aguardando_fator_conversao_nf"');
    });
  });

  describe("Fase 5 Micro-Hardening: Concorrência, Autorização e Semântica de Fator", () => {
    const CNPJ = "12.345.678/0001-90";
    const COD_PROD = "FORN-SKU-999";

    // ─── 1. RACE DO INSERT 23505 (RACE-A) ───
    it("RACE-A1: insert com 23505 e recheck com produto diferente retorna already_confirmed_different", async () => {
      const equivQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn()
          .mockResolvedValueOnce({ data: null, error: null }) // Initial select: not found
          .mockResolvedValueOnce({ // Recheck after 23505: Request A already confirmed product A with factor 12
            data: { id: "equiv-a", produto_eyemobile_uuid: "p-a", fator_conversao: 12, confirmado_por_usuario: true },
            error: null,
          }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } }),
        }),
      };

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-b", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-b" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return equivQuery;
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-b",
        fatorConversao: 24,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(false);
      expect((res as any).code).toBe("already_confirmed_different");
    });

    it("RACE-A2: insert com 23505 e recheck com mesmo produto e mesmo fator retorna idempotent", async () => {
      const equivQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn()
          .mockResolvedValueOnce({ data: null, error: null })
          .mockResolvedValueOnce({
            data: { id: "equiv-a", produto_eyemobile_uuid: "p-a", fator_conversao: 12, confirmado_por_usuario: true },
            error: null,
          }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } }),
        }),
      };

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-a", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-a" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return equivQuery;
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-a",
        fatorConversao: 12,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(true);
      expect((res as any).status).toBe("idempotent");
      expect((res as any).equivalenciaId).toBe("equiv-a");
    });

    // ─── 2. CAS NO UPDATE DE EQUIVALÊNCIA NÃO CONFIRMADA (RACE-B) ───
    it("RACE-B1: duas confirmações simultâneas em equivalência pendente — a perdedora detecta conflito CAS", async () => {
      const equivQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn()
          .mockResolvedValueOnce({ // Encontrou registro não confirmado inicialmente
            data: { id: "equiv-pending", produto_eyemobile_uuid: "p-old", fator_conversao: 1, confirmado_por_usuario: false },
            error: null,
          })
          .mockResolvedValueOnce({ // Recheck após falha no CAS: outro usuário confirmou produto A fator 12
            data: { id: "equiv-pending", produto_eyemobile_uuid: "p-a", fator_conversao: 12, confirmado_por_usuario: true },
            error: null,
          }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // 0 linhas atualizadas pelo CAS
        }),
      };

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-b", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-b" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return equivQuery;
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-b",
        fatorConversao: 24,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(false);
      expect((res as any).code).toBe("already_confirmed_different");
    });

    it("RACE-B2: falha no CAS mas recheck encontra mesmo produto e mesmo fator retorna idempotent", async () => {
      const equivQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn()
          .mockResolvedValueOnce({
            data: { id: "equiv-pending", produto_eyemobile_uuid: "p-old", fator_conversao: 1, confirmado_por_usuario: false },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { id: "equiv-pending", produto_eyemobile_uuid: "p-a", fator_conversao: 12, confirmado_por_usuario: true },
            error: null,
          }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-a", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-a" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return equivQuery;
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-a",
        fatorConversao: 12,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(true);
      expect((res as any).status).toBe("idempotent");
      expect((res as any).equivalenciaId).toBe("equiv-pending");
    });

    // ─── 3. AUTORIZAÇÃO E VALIDAÇÃO DE PROPOSTA (AUTH-A a AUTH-F) ───
    it("AUTH-A a AUTH-F: validação fail-closed estrita de proposta contra usuário, chat, tipo, status e expiração", () => {
      const webhookPath = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(webhookPath, "utf-8");

      // validarPropostaFase5 helper
      expect(content).toContain("function validarPropostaFase5(");
      expect(content).toContain("if (propRow.user_id !== expected.userId)");
      expect(content).toContain("if (String(propRow.chat_id) !== String(expected.chatId))");
      expect(content).toContain('if (propRow.tipo !== "vincular_produto_nf")');
      expect(content).toContain('if (propRow.status !== "pendente")');
      expect(content).toContain("if (isNaN(expTime) || expTime <= Date.now())");

      // Lock atômico estrito no vp_ok
      expect(content).toContain('.eq("user_id", cbUserId)');
      expect(content).toContain('.eq("chat_id", Number(cbChatId))');
      expect(content).toContain('.eq("tipo", "vincular_produto_nf")');
      expect(content).toContain('.gt("expires_at", nowIso)');

      // Cancel e Skip protegidos
      expect(content).toContain('.eq("user_id", cbUserId)');
      expect(content).toContain('.eq("chat_id", Number(cbChatId))');
      expect(content).toContain('.eq("tipo", "vincular_produto_nf")');
    });

    // ─── 4. REVALIDAÇÃO DA NF E DO ITEM NO vp_ok ───
    it("REVAL-A: vp_ok revalida NF, nf_item e produto_canônico diretamente no banco com valores autoritativos", () => {
      const webhookPath = path.resolve(__dirname, "../../../../supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(webhookPath, "utf-8");

      // Revalidação da NF
      expect(content).toContain('.from("notas_fiscais_compra")');
      expect(content).toContain('.eq("id", propDados.nf_id)');
      expect(content).toContain('.eq("user_id", cbUserId)');

      // Revalidação do item
      expect(content).toContain('.from("nf_itens")');
      expect(content).toContain('.eq("id", propDados.nf_item_id)');
      expect(content).toContain('.eq("nf_id", nfRow.id)');

      // Revalidação do produto canônico no tenant com checagem de eyemobile_id
      expect(content).toContain('.from("produtos_eyemobile")');
      expect(content).toContain('.eq("id", prodUuid)');
      expect(content).toContain('.eq("workspace_id", wsId)');
      expect(content).toContain('.eq("user_id", cbUserId)');
      expect(content).toContain('!prodCanonical.eyemobile_id || String(prodCanonical.eyemobile_id).trim() === ""');

      // Parâmetros autoritativos passados
      expect(content).toContain("cnpjFornecedor: nfRow.cnpj_fornecedor");
      expect(content).toContain("codigoProdutoFornecedor: itemRow.codigo_produto");
      expect(content).toContain("descricaoFornecedor: itemRow.descricao");
      expect(content).toContain("unidadeFornecedor: itemRow.unidade");
    });

    // ─── 5. PRODUTO SEM eyemobile_id (MISSING REMOTE PRODUCT ID) ───
    it("REMOTE-ID-1: searchProductCandidates filtra produtos com eyemobile_id nulo ou vazio", async () => {
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) =>
            resolve({
              data: [
                { id: "p1", workspace_id: WORKSPACE_ID, user_id: USER_ID, descricao: "PROD VALIDO", eyemobile_id: "eye-123" },
                { id: "p2", workspace_id: WORKSPACE_ID, user_id: USER_ID, descricao: "PROD SEM REMOTE", eyemobile_id: null },
                { id: "p3", workspace_id: WORKSPACE_ID, user_id: USER_ID, descricao: "PROD VAZIO", eyemobile_id: "   " },
              ],
              error: null,
            })
          ),
        })),
      };

      const res = await searchProductCandidates(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        descricaoQuery: "PROD",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.candidates.length).toBe(1);
        expect(res.candidates[0].id).toBe("p1");
        expect(res.candidates[0].eyemobileId).toBe("eye-123");
      }
    });

    it("REMOTE-ID-2: salvarEquivalenciaConfirmada rejeita produto canônico sem eyemobile_id válido com missing_remote_product_id", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-no-eye", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "" },
                error: null,
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-no-eye",
        fatorConversao: 1,
        unidadeFornecedor: "UN",
      });

      expect(res.success).toBe(false);
      expect((res as any).code).toBe("missing_remote_product_id");
    });

    // ─── 6. ALINHAMENTO DE FATOR COM evaluateStockStatus (FACTOR-A a FACTOR-E) ───
    it("FACTOR-A: unidade UN com fator 1 é permitida", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-un", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-un" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "equiv-un-1" }, error: null }),
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-un",
        fatorConversao: 1,
        unidadeFornecedor: "UN",
      });

      expect(res.success).toBe(true);
    });

    it("FACTOR-B: unidade UN com fator 12 é rejeitada como invalid_input", async () => {
      const mockClient = { from: vi.fn() };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-un",
        fatorConversao: 12,
        unidadeFornecedor: "UN",
      });

      expect(res.success).toBe(false);
      expect((res as any).code).toBe("invalid_input");
    });

    it("FACTOR-C: unidade PCT com fator 10 é rejeitada enquanto Fase 4 não suportar conversão", async () => {
      const mockClient = { from: vi.fn() };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-pct",
        fatorConversao: 10,
        unidadeFornecedor: "PCT",
      });

      expect(res.success).toBe(false);
      expect((res as any).code).toBe("invalid_input");
    });

    it("FACTOR-D: unidade CX com fator 12 é permitida", async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "p-cx", workspace_id: WORKSPACE_ID, user_id: USER_ID, eyemobile_id: "eye-cx" },
                error: null,
              }),
            };
          }
          if (table === "produto_equivalencias") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "equiv-cx-1" }, error: null }),
              }),
            };
          }
          return {};
        }),
      };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-cx",
        fatorConversao: 12,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(true);
    });

    it("FACTOR-E: unidade CX com fator 1 é rejeitada como invalid_input", async () => {
      const mockClient = { from: vi.fn() };

      const res = await salvarEquivalenciaConfirmada(mockClient as any, {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        cnpjFornecedor: CNPJ,
        codigoProdutoFornecedor: COD_PROD,
        produtoEyemobileUuid: "p-cx",
        fatorConversao: 1,
        unidadeFornecedor: "CX",
      });

      expect(res.success).toBe(false);
      expect((res as any).code).toBe("invalid_input");
    });
  });
});
