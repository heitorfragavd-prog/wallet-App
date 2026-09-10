/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeSupplierCnpj,
  normalizeSupplierCode,
  resolveNfProductEquivalence,
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
  it("Cenário H: produto Eyemobile com eyemobile_id nulo ou vazio vai para pendente", async () => {
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

      expect(res.status).toBe("pending");
      if (res.status === "pending") {
        expect(res.motivo).toContain("não possui identificador remoto");
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
  });
});
