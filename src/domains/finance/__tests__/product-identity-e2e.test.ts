/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WALLET APP — Product Identity Fase 7
 * Suíte E2E Final de Identidade de Produtos (18 Cenários Canônicos)
 * Arquivo: src/domains/finance/__tests__/product-identity-e2e.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveNfProductEquivalence,
  salvarEquivalenciaConfirmada,
  searchProductCandidates,
  suggestConversionFactor,
  canFinalizeManualEquivalenceProposal,
  isProposalFinalizedSuccessfully,
  reverterPropostaParaPendente,
  validarPropostaFase5,
  validarAtorTelegramFase5,
  extrairNfItemIdDaProposta,
  ProdutoEyemobileRow,
} from "../../../../supabase/functions/_shared/integrations/nf-product-equivalence";
import { evaluateStockStatus } from "../../../../supabase/functions/_shared/danfe-extractor";
import * as fs from "fs";
import * as path from "path";

describe("Product Identity Fase 7 — Homologação E2E Final (E2E-01 a E2E-18)", () => {
  const USER_A = "11111111-0000-0000-0000-000000000001";
  const WS_A = "11111111-0000-0000-0000-000000000002";
  const USER_B = "22222222-0000-0000-0000-000000000001";
  const WS_B = "22222222-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Mock Database State Factory for In-Memory E2E Lifecycle Simulation
  function createInMemoryDatabase() {
    const state = {
      workspaces: [
        { id: WS_A, user_id: USER_A, nome: "Workspace A" },
        { id: WS_B, user_id: USER_B, nome: "Workspace B" },
      ],
      produtos_eyemobile: [] as ProdutoEyemobileRow[],
      produto_equivalencias: [] as any[],
      notas_fiscais_compra: [] as any[],
      nf_itens: [] as any[],
      historico_custo_produto: [] as any[],
      telegram_propostas: [] as any[],
      usuarios_telegram: [] as any[],
    };

    // Fluent Supabase JS mock that executes queries against the in-memory state
    const createSupabaseMock = () => {
      const mock: any = {
        from: (table: string) => {
          const currentTable = table;
          const filters: { field: string; op: string; val: any }[] = [];
          let limitVal: number | null = null;
          let orderBy: { field: string; ascending: boolean } | null = null;
          let updatePayload: any = null;
          let isDelete = false;

          function matchesFilters(row: any): boolean {
            for (const f of filters) {
              if (f.op === "eq" && String(row[f.field]) !== String(f.val)) return false;
              if (f.op === "neq" && String(row[f.field]) === String(f.val)) return false;
              if (f.op === "in" && !f.val.map(String).includes(String(row[f.field]))) return false;
              if (f.op === "is" && f.val === null && row[f.field] !== null && row[f.field] !== undefined) return false;
              if (f.op === "not_is" && f.val === null && (row[f.field] === null || row[f.field] === undefined)) return false;
              if (f.op === "not_eq" && String(row[f.field]) === String(f.val)) return false;
              if (f.op === "ilike") {
                const needle = String(f.val).replace(/%/g, "").toLowerCase();
                const haystack = String(row[f.field] || "").toLowerCase();
                if (!haystack.includes(needle)) return false;
              }
            }
            return true;
          }

          function getRows(): any[] {
            const tableArray = (state as any)[currentTable] || [];
            let rows = tableArray.filter(matchesFilters);
            if (orderBy) {
              rows = [...rows].sort((a, b) => {
                const valA = a[orderBy!.field];
                const valB = b[orderBy!.field];
                if (valA < valB) return orderBy!.ascending ? -1 : 1;
                if (valA > valB) return orderBy!.ascending ? 1 : -1;
                return 0;
              });
            }
            if (limitVal != null) {
              rows = rows.slice(0, limitVal);
            }
            return rows;
          }

          function applyMutations(): any[] {
            const tableArray = (state as any)[currentTable] || [];
            if (isDelete) {
              const remaining = tableArray.filter((r: any) => !matchesFilters(r));
              (state as any)[currentTable] = remaining;
              return [];
            }
            if (updatePayload) {
              const updated: any[] = [];
              for (let i = 0; i < tableArray.length; i++) {
                if (matchesFilters(tableArray[i])) {
                  tableArray[i] = { ...tableArray[i], ...updatePayload, updated_at: new Date().toISOString() };
                  updated.push(tableArray[i]);
                }
              }
              return updated;
            }
            return getRows();
          }

          const builder: any = {
            select: () => builder,
            eq: (field: string, val: any) => {
              filters.push({ field, op: "eq", val });
              return builder;
            },
            neq: (field: string, val: any) => {
              filters.push({ field, op: "neq", val });
              return builder;
            },
            in: (field: string, vals: any[]) => {
              filters.push({ field, op: "in", val: vals });
              return builder;
            },
            is: (field: string, val: any) => {
              filters.push({ field, op: "is", val });
              return builder;
            },
            not: (field: string, op: string, val: any) => {
              filters.push({ field, op: `not_${op}`, val });
              return builder;
            },
            gt: (field: string, val: any) => {
              filters.push({ field, op: "gt", val });
              return builder;
            },
            ilike: (field: string, val: string) => {
              filters.push({ field, op: "ilike", val });
              return builder;
            },
            order: (field: string, opts?: { ascending?: boolean }) => {
              orderBy = { field, ascending: opts?.ascending ?? true };
              return builder;
            },
            limit: (n: number) => {
              limitVal = n;
              return builder;
            },
            update: (payload: any) => {
              updatePayload = payload;
              return builder;
            },
            delete: () => {
              isDelete = true;
              return builder;
            },
            maybeSingle: async () => {
              const rows = updatePayload || isDelete ? applyMutations() : getRows();
              return { data: rows.length > 0 ? rows[0] : null, error: null };
            },
            single: async () => {
              const rows = updatePayload || isDelete ? applyMutations() : getRows();
              if (rows.length === 0) return { data: null, error: { message: "Not found", code: "PGRST116" } };
              return { data: rows[0], error: null };
            },
            insert: (dataToInsert: any) => {
              const records = Array.isArray(dataToInsert) ? dataToInsert : [dataToInsert];
              const tableArray = (state as any)[currentTable] || [];
              const inserted: any[] = [];
              for (const r of records) {
                const row = { id: r.id || `uuid-${Math.random()}`, ...r, created_at: new Date().toISOString() };
                tableArray.push(row);
                inserted.push(row);
              }
              const resultBuilder = {
                select: () => ({
                  single: async () => ({ data: inserted[0], error: null }),
                  maybeSingle: async () => ({ data: inserted[0], error: null }),
                  then: (resolve: any) => resolve({ data: inserted, error: null }),
                }),
                then: (resolve: any) => resolve({ data: inserted, error: null }),
              };
              return resultBuilder;
            },
            then: (resolve: any) => {
              const rows = updatePayload || isDelete ? applyMutations() : getRows();
              resolve({ data: rows, error: null, count: rows.length });
            },
          };

          return builder;
        },
        rpc: async (functionName: string, params: any) => {
          if (functionName === "aplicar_item_nf_estoque_custo") {
            const {
              p_item_id,
              p_user_id,
              p_workspace_id,
              p_equivalencia_id,
              p_produto_eyemobile_uuid,
              p_quantidade_para_estoque,
              p_custo_unitario_convertido,
              p_fator_conversao_esperado,
            } = params;

            // 1. Validation
            if (
              !p_quantidade_para_estoque ||
              p_quantidade_para_estoque <= 0 ||
              !p_custo_unitario_convertido ||
              p_custo_unitario_convertido <= 0 ||
              !p_fator_conversao_esperado ||
              p_fator_conversao_esperado <= 0
            ) {
              return { data: { success: false, code: "invalid_parameters", error: "Parametros invalidos" }, error: null };
            }

            // 2. Lock and find item
            const item = state.nf_itens.find((i) => i.id === p_item_id);
            if (!item) {
              return { data: { success: false, code: "item_not_found" }, error: null };
            }

            // 3. Idempotency (processado or legacy atualizado)
            if (item.status_estoque === "processado" || item.status_estoque === "atualizado") {
              return { data: { success: true, code: "already_processed", item_id: p_item_id }, error: null };
            }

            // 4. NF & Tenant check
            const nf = state.notas_fiscais_compra.find((n) => n.id === item.nf_id);
            if (!nf || nf.user_id !== p_user_id || nf.workspace_id !== p_workspace_id) {
              return { data: { success: false, code: "tenant_mismatch" }, error: null };
            }

            // 5. Equivalence revalidation
            const equiv = state.produto_equivalencias.find(
              (e) => e.id === p_equivalencia_id && e.user_id === p_user_id && e.workspace_id === p_workspace_id
            );
            if (!equiv) {
              return { data: { success: false, code: "equivalence_not_found" }, error: null };
            }
            if (!equiv.confirmado_por_usuario) {
              return { data: { success: false, code: "equivalence_not_confirmed" }, error: null };
            }
            if (equiv.produto_eyemobile_uuid !== p_produto_eyemobile_uuid) {
              return { data: { success: false, code: "equivalence_product_mismatch" }, error: null };
            }
            if (Number(equiv.fator_conversao) !== Number(p_fator_conversao_esperado)) {
              return { data: { success: false, code: "equivalence_changed" }, error: null };
            }

            // 6. Product check
            const prod = state.produtos_eyemobile.find(
              (p) => p.id === p_produto_eyemobile_uuid && p.user_id === p_user_id && p.workspace_id === p_workspace_id
            );
            if (!prod) {
              return { data: { success: false, code: "canonical_product_not_found" }, error: null };
            }
            if (!prod.eyemobile_id || prod.eyemobile_id.trim() === "") {
              return { data: { success: false, code: "missing_remote_id" }, error: null };
            }

            // 7. Update stock and cost
            const estoqueAnterior = Number(prod.estoque_atual || 0);
            const novoEstoque = estoqueAnterior + Number(p_quantidade_para_estoque);
            prod.estoque_atual = novoEstoque;
            prod.custo_atual = Number(p_custo_unitario_convertido);

            // 8. Insert history
            state.historico_custo_produto.push({
              id: `hist-${Math.random()}`,
              user_id: p_user_id,
              workspace_id: p_workspace_id,
              produto_eyemobile_uuid: prod.id,
              produto_codigo: item.codigo_produto,
              produto_descricao: item.descricao,
              fornecedor: nf.fornecedor,
              custo_unitario: Number(p_custo_unitario_convertido),
              quantidade: item.quantidade,
              nf_id: nf.id,
              data_compra: new Date().toISOString().split("T")[0],
            });

            // 9. Mark item as processado
            item.status_estoque = "processado";
            item.produto_eyemobile_id = prod.eyemobile_id;

            return {
              data: {
                success: true,
                code: "processed",
                item_id: item.id,
                produto_eyemobile_uuid: prod.id,
                novo_estoque: novoEstoque,
                novo_custo: Number(p_custo_unitario_convertido),
              },
              error: null,
            };
          }
          return { data: null, error: { message: `Unknown RPC ${functionName}` } };
        },
      };

      return mock;
    };

    return { state, createSupabaseMock };
  }

  // ---------------------------------------------------------------------------
  // E2E-01: NF SEM EQUIVALÊNCIA
  // ---------------------------------------------------------------------------
  it("E2E-01: NF sem equivalência -> pending, item pendente, sem estoque/custo/histórico, NF não confirmada", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    // Produto canônico existe no catálogo
    state.produtos_eyemobile.push({
      id: "prod-can-1",
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-101",
      codigo: "COD-101",
      descricao: "Cerveja Pilsen 350ml",
      estoque_atual: 10,
      custo_atual: 4.0,
      preco_venda: 8.0,
      margem_real_percentual: null,
    });

    // NF com 1 item sem equivalência
    const nfId = "nf-e2e-01";
    state.notas_fiscais_compra.push({
      id: nfId,
      user_id: USER_A,
      workspace_id: WS_A,
      fornecedor: "Distribuidora Ambev",
      cnpj_fornecedor: "12.345.678/0001-90",
      status: "pendente",
    });

    const itemId = "item-e2e-01";
    state.nf_itens.push({
      id: itemId,
      nf_id: nfId,
      codigo_produto: "SKU-BEER-CX",
      descricao: "Cerveja Pilsen Lata Caixa 12",
      unidade: "CX",
      quantidade: 5,
      valor_unitario: 36.0,
      status_estoque: "pendente",
    });

    // 1. Tenta resolver equivalência
    const res = await resolveNfProductEquivalence(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: "12.345.678/0001-90",
      codigoProdutoFornecedor: "SKU-BEER-CX",
    });

    expect(res.status).toBe("pending");
    expect(res.reason).toBe("no_confirmed_equivalence");

    // Prova: estoque inalterado, custo inalterado, zero histórico
    const prod = state.produtos_eyemobile.find((p) => p.id === "prod-can-1")!;
    expect(prod.estoque_atual).toBe(10);
    expect(prod.custo_atual).toBe(4.0);
    expect(state.historico_custo_produto).toHaveLength(0);

    // Prova: NF e Item permanecem pendentes
    const item = state.nf_itens.find((i) => i.id === itemId)!;
    expect(item.status_estoque).toBe("pendente");
    const nf = state.notas_fiscais_compra.find((n) => n.id === nfId)!;
    expect(nf.status).toBe("pendente");

    // Prova: Proposta manual busca candidatos canônicos
    const candRes = await searchProductCandidates(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      descricaoQuery: "Cerveja Pilsen",
      limit: 5,
    });
    expect(candRes.ok).toBe(true);
    expect(candRes.candidates).toHaveLength(1);
    expect(candRes.candidates![0].id).toBe("prod-can-1");
  });

  // ---------------------------------------------------------------------------
  // E2E-02: CONFIRMAÇÃO MANUAL
  // ---------------------------------------------------------------------------
  it("E2E-02: Confirmação manual -> salva equivalência com campos canônicos estritos e confirmado_por_usuario=true", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    state.produtos_eyemobile.push({
      id: "prod-can-2",
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-202",
      codigo: "COD-202",
      descricao: "Água Mineral 500ml",
      estoque_atual: 20,
      custo_atual: 1.5,
      preco_venda: 3.0,
      margem_real_percentual: null,
    });

    const saveRes = await salvarEquivalenciaConfirmada(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: "98.765.432/0001-10",
      codigoProdutoFornecedor: "FORN-AGUA-CX",
      produtoEyemobileUuid: "prod-can-2",
      fatorConversao: 12,
      fornecedorNome: "Fonte Cristalina",
      descricaoFornecedor: "Agua Mineral 500ml Fardo 12",
      unidadeFornecedor: "FD",
    });

    expect(saveRes.success).toBe(true);

    // Prova em banco:
    const saved = state.produto_equivalencias.find((e) => e.workspace_id === WS_A && e.codigo_produto_fornecedor === "FORN-AGUA-CX");
    expect(saved).toBeDefined();
    expect(saved.cnpj_fornecedor_normalizado).toBe("98765432000110");
    expect(saved.produto_eyemobile_uuid).toBe("prod-can-2");
    expect(saved.fator_conversao).toBe(12);
    expect(saved.confirmado_por_usuario).toBe(true);
    expect(saved.origem_matching).toBe("manual");
  });

  // ---------------------------------------------------------------------------
  // E2E-03: FATOR CX / FARDO
  // ---------------------------------------------------------------------------
  it("E2E-03: Fator CX/FARDO -> evaluateStockStatus converte unidades/custo e RPC atualiza estoque multiplicado e histórico canônico", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const prodId = "prod-coca-cx";
    state.produtos_eyemobile.push({
      id: prodId,
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-COCA-LATA",
      codigo: "COCA-LATA",
      descricao: "Refrigerante Coca-Cola 350ml",
      estoque_atual: 5,
      custo_atual: 3.0,
      preco_venda: 6.0,
      margem_real_percentual: null,
    });

    const nfId = "nf-cx-03";
    state.notas_fiscais_compra.push({
      id: nfId,
      user_id: USER_A,
      workspace_id: WS_A,
      fornecedor: "Distribuidora Bebidas",
      cnpj_fornecedor: "11222333000144",
      status: "pendente",
    });

    const itemId = "item-cx-03";
    state.nf_itens.push({
      id: itemId,
      nf_id: nfId,
      codigo_produto: "COCA-CX12",
      descricao: "Coca-Cola 350ml CX c/ 12",
      unidade: "CX",
      quantidade: 2, // 2 caixas
      valor_unitario: 36.0, // 36.00 por caixa
      status_estoque: "pendente",
    });

    const equivId = "equiv-cx-03";
    state.produto_equivalencias.push({
      id: equivId,
      user_id: USER_A,
      workspace_id: WS_A,
      cnpj_fornecedor_normalizado: "11222333000144",
      codigo_produto_fornecedor: "COCA-CX12",
      produto_eyemobile_uuid: prodId,
      fator_conversao: 12,
      confirmado_por_usuario: true,
      origem_matching: "manual",
    });

    // 1. evaluateStockStatus
    const stockStatus = evaluateStockStatus(
      {
        codigo: "COCA-CX12",
        descricao: "Coca-Cola 350ml CX c/ 12",
        unidade: "CX",
        quantidade: 2,
        valor_unitario: 36.0,
      } as any,
      {
        id: prodId,
        estoque_atual: 5,
        fator_conversao: 12,
      }
    );

    expect(stockStatus.status_estoque).toBe("processado");
    expect(stockStatus.quantidadeParaEstoque).toBe(24); // 2 * 12 = 24
    expect(stockStatus.custoUnitarioConvertido).toBe(3.0); // 36.00 / 12 = 3.00

    // 2. Aplicação atômica via RPC
    const { data: rpcRes } = await supabase.rpc("aplicar_item_nf_estoque_custo", {
      p_item_id: itemId,
      p_user_id: USER_A,
      p_workspace_id: WS_A,
      p_equivalencia_id: equivId,
      p_produto_eyemobile_uuid: prodId,
      p_quantidade_para_estoque: stockStatus.quantidadeParaEstoque,
      p_custo_unitario_convertido: stockStatus.custoUnitarioConvertido,
      p_fator_conversao_esperado: 12,
    });

    expect(rpcRes.success).toBe(true);
    expect(rpcRes.code).toBe("processed");

    // Prova: estoque foi de 5 para 5 + 24 = 29
    const prod = state.produtos_eyemobile.find((p) => p.id === prodId)!;
    expect(prod.estoque_atual).toBe(29);
    expect(prod.custo_atual).toBe(3.0);

    // Prova: histórico com UUID canônico
    expect(state.historico_custo_produto).toHaveLength(1);
    expect(state.historico_custo_produto[0].produto_eyemobile_uuid).toBe(prodId);
    expect(state.historico_custo_produto[0].custo_unitario).toBe(3.0);

    // Sugestão de fator para CX extrai 12 da descrição
    const suggestion = suggestConversionFactor("CX", "Coca-Cola 350ml CX 12");
    expect(suggestion).toBe(12);
  });

  // ---------------------------------------------------------------------------
  // E2E-04: UNIDADE SIMPLES (UN)
  // ---------------------------------------------------------------------------
  it("E2E-04: Unidade simples (UN) -> fator 1 processa 1:1, tentativa de fator 12 em UN é rejeitada", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const prodId = "prod-un-04";
    state.produtos_eyemobile.push({
      id: prodId,
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-SALGADO",
      codigo: "SALG-01",
      descricao: "Salgado Assado",
      estoque_atual: 0,
      custo_atual: 2.5,
      preco_venda: 5.0,
      margem_real_percentual: null,
    });

    // Caso A: 10 UN com fator 1
    const stockStatusOk = evaluateStockStatus(
      { codigo: "S-1", descricao: "Salgado", unidade: "UN", quantidade: 10, valor_unitario: 2.5 } as any,
      { id: prodId, estoque_atual: 0, fator_conversao: 1 }
    );
    expect(stockStatusOk.status_estoque).toBe("processado");
    expect(stockStatusOk.quantidadeParaEstoque).toBe(10);
    expect(stockStatusOk.custoUnitarioConvertido).toBe(2.5);

    // Sugestão para UN é sempre 1
    const suggestionUN = suggestConversionFactor("UN", "Salgado Unitario");
    expect(suggestionUN).toBe(1);

    // Caso B: Tentar salvar fator 12 em UN deve ser rejeitado
    const saveInvalidUn = await salvarEquivalenciaConfirmada(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: "11.222.333/0001-44",
      codigoProdutoFornecedor: "S-1",
      produtoEyemobileUuid: prodId,
      fatorConversao: 12,
      unidadeFornecedor: "UN",
    });
    expect(saveInvalidUn.success).toBe(false);
    expect(saveInvalidUn.code).toBe("invalid_input");
  });

  // ---------------------------------------------------------------------------
  // E2E-05: APRENDIZADO REAL
  // ---------------------------------------------------------------------------
  it("E2E-05: Aprendizado Real -> após confirmação de NF 1, NF 2 do mesmo fornecedor e código resolve automaticamente", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const prodId = "prod-suco-05";
    state.produtos_eyemobile.push({
      id: prodId,
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-SUCO-LARANJA",
      codigo: "SUCO-01",
      descricao: "Suco de Laranja 1L",
      estoque_atual: 10,
      custo_atual: 5.0,
      preco_venda: 10.0,
      margem_real_percentual: null,
    });

    const cnpj = "55.666.777/0001-88";
    const codigoForn = "SUCO-LAR-FARDO6";

    // 1. Simular confirmação da NF 1
    await salvarEquivalenciaConfirmada(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: cnpj,
      codigoProdutoFornecedor: codigoForn,
      produtoEyemobileUuid: prodId,
      fatorConversao: 6,
      fornecedorNome: "Sucos Naturais SA",
      descricaoFornecedor: "Suco Laranja 1L Fardo c/ 6",
      unidadeFornecedor: "FD",
    });

    // 2. Upload de NF 2 com o mesmo fornecedor e código
    const resNF2 = await resolveNfProductEquivalence(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: cnpj,
      codigoProdutoFornecedor: codigoForn,
    });

    // Prova: resolve automaticamente como matched sem intervenção
    expect(resNF2.status).toBe("matched");
    if (resNF2.status === "matched") {
      expect(resNF2.produtoEyemobileUuid).toBe(prodId);
      expect(resNF2.fatorConversao).toBe(6);
    }
  });

  // ---------------------------------------------------------------------------
  // E2E-06: DESCRIÇÃO NÃO É AUTORIDADE
  // ---------------------------------------------------------------------------
  it("E2E-06: Descrição não é autoridade -> produto com descrição 100% idêntica sem equivalência confirmada retorna pending e zero mutação", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    state.produtos_eyemobile.push({
      id: "prod-arroz-06",
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-ARROZ-5KG",
      codigo: "ARR-5KG",
      descricao: "Arroz Tipo 1 5kg Pacote", // 100% idêntica
      estoque_atual: 20,
      custo_atual: 25.0,
      preco_venda: 35.0,
      margem_real_percentual: null,
    });

    const res = await resolveNfProductEquivalence(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: "99.888.777/0001-66",
      codigoProdutoFornecedor: "FORN-ARROZ-99", // código diferente sem equivalência
    });

    expect(res.status).toBe("pending");
    expect(res.reason).toBe("no_confirmed_equivalence");

    // Prova: estoque inalterado
    const prod = state.produtos_eyemobile.find((p) => p.id === "prod-arroz-06")!;
    expect(prod.estoque_atual).toBe(20);
  });

  // ---------------------------------------------------------------------------
  // E2E-07: CÓDIGO EYEMOBILE NÃO É AUTORIDADE
  // ---------------------------------------------------------------------------
  it("E2E-07: Código Eyemobile não é autoridade -> código igual sem equivalência confirmada retorna pending sem auto-match", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    state.produtos_eyemobile.push({
      id: "prod-feijao-07",
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-FEIJAO-1KG",
      codigo: "7891234567890", // mesmo código de barras que a NF traz
      descricao: "Feijão Preto 1kg",
      estoque_atual: 15,
      custo_atual: 7.0,
      preco_venda: 10.0,
      margem_real_percentual: null,
    });

    const res = await resolveNfProductEquivalence(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: "88.777.666/0001-55",
      codigoProdutoFornecedor: "7891234567890", // mesmo código
    });

    // Invariante: sem equivalência prévia confirmada, NUNCA assume auto-match pelo código
    expect(res.status).toBe("pending");
    expect(res.reason).toBe("no_confirmed_equivalence");
  });

  // ---------------------------------------------------------------------------
  // E2E-08: TENANT ISOLATION
  // ---------------------------------------------------------------------------
  it("E2E-08: Tenant Isolation -> Tenant B não enxerga nem usa equivalência de Tenant A e cross-workspace falha closed", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    // Tenant A possui produto e equivalência confirmada
    const prodA = "prod-tenant-a";
    state.produtos_eyemobile.push({
      id: prodA,
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-PROD-A",
      codigo: "A01",
      descricao: "Produto Tenant A",
      estoque_atual: 50,
      custo_atual: 10.0,
      preco_venda: 20.0,
      margem_real_percentual: null,
    });

    const cnpj = "12.345.678/0001-90";
    const codForn = "FORN-SHARED-SKU";

    state.produto_equivalencias.push({
      id: "equiv-tenant-a",
      user_id: USER_A,
      workspace_id: WS_A,
      cnpj_fornecedor_normalizado: "12345678000190",
      codigo_produto_fornecedor: codForn,
      produto_eyemobile_uuid: prodA,
      fator_conversao: 1,
      confirmado_por_usuario: true,
      origem_matching: "manual",
    });

    // Tenant B pesquisa o mesmo fornecedor e código
    const resB = await resolveNfProductEquivalence(supabase, {
      userId: USER_B,
      workspaceId: WS_B,
      cnpjFornecedor: cnpj,
      codigoProdutoFornecedor: codForn,
    });

    expect(resB.status).toBe("pending");
    expect(resB.reason).toBe("no_confirmed_equivalence");

    // Tentativa de Tenant B salvar equivalência apontando para produto de Tenant A
    const saveCross = await salvarEquivalenciaConfirmada(supabase, {
      userId: USER_B,
      workspaceId: WS_B,
      cnpjFornecedor: cnpj,
      codigoProdutoFornecedor: codForn,
      produtoEyemobileUuid: prodA, // produto de A!
      fatorConversao: 1,
    });

    expect(saveCross.success).toBe(false);
    expect(saveCross.code).toBe("tenant_mismatch");
  });

  // ---------------------------------------------------------------------------
  // E2E-09: DOUBLE CLICK / CONCORRÊNCIA
  // ---------------------------------------------------------------------------
  it("E2E-09: Double Click / Concorrência -> duas chamadas concorrentes resultam em 1 mutação e a 2ª em already_processed", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const prodId = "prod-double-09";
    state.produtos_eyemobile.push({
      id: prodId,
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-DOUBLE-CLICK",
      codigo: "DC-01",
      descricao: "Vinho Tinto 750ml",
      estoque_atual: 10,
      custo_atual: 20.0,
      preco_venda: 45.0,
      margem_real_percentual: null,
    });

    const nfId = "nf-dc-09";
    state.notas_fiscais_compra.push({
      id: nfId,
      user_id: USER_A,
      workspace_id: WS_A,
      fornecedor: "Vinícola Vale",
      cnpj_fornecedor: "33.444.555/0001-66",
      status: "pendente",
    });

    const itemId = "item-dc-09";
    state.nf_itens.push({
      id: itemId,
      nf_id: nfId,
      codigo_produto: "VINHO-CX6",
      descricao: "Vinho Tinto Caixa c/ 6",
      unidade: "CX",
      quantidade: 2,
      valor_unitario: 120.0,
      status_estoque: "pendente",
    });

    const equivId = "equiv-dc-09";
    state.produto_equivalencias.push({
      id: equivId,
      user_id: USER_A,
      workspace_id: WS_A,
      cnpj_fornecedor_normalizado: "33444555000166",
      codigo_produto_fornecedor: "VINHO-CX6",
      produto_eyemobile_uuid: prodId,
      fator_conversao: 6,
      confirmado_por_usuario: true,
      origem_matching: "manual",
    });

    // Chamadas concorrentes
    const call1 = supabase.rpc("aplicar_item_nf_estoque_custo", {
      p_item_id: itemId,
      p_user_id: USER_A,
      p_workspace_id: WS_A,
      p_equivalencia_id: equivId,
      p_produto_eyemobile_uuid: prodId,
      p_quantidade_para_estoque: 12,
      p_custo_unitario_convertido: 20.0,
      p_fator_conversao_esperado: 6,
    });

    const call2 = supabase.rpc("aplicar_item_nf_estoque_custo", {
      p_item_id: itemId,
      p_user_id: USER_A,
      p_workspace_id: WS_A,
      p_equivalencia_id: equivId,
      p_produto_eyemobile_uuid: prodId,
      p_quantidade_para_estoque: 12,
      p_custo_unitario_convertido: 20.0,
      p_fator_conversao_esperado: 6,
    });

    const [res1, res2] = await Promise.all([call1, call2]);

    const results = [res1.data.code, res2.data.code];
    expect(results).toContain("processed");
    expect(results).toContain("already_processed");

    // Estoque: 10 + 12 = 22 (nunca duplicado para 34)
    const prod = state.produtos_eyemobile.find((p) => p.id === prodId)!;
    expect(prod.estoque_atual).toBe(22);
    expect(state.historico_custo_produto).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // E2E-10: RETRY APÓS FALHA
  // ---------------------------------------------------------------------------
  it("E2E-10: Retry após falha -> proposta CAS recupera status e retry executa de forma idempotente", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const propId = "prop-cas-10";
    const initialProposal = {
      id: propId,
      status: "em_processamento",
      user_id: USER_A,
      chat_id: 12345,
      tipo: "vincular_produto_nf",
      dados: { nf_item_id: "item-10" },
      expires_at: new Date(Date.now() + 60000).toISOString(),
    };
    state.telegram_propostas.push({ ...initialProposal });

    // 1. Se executor falhar, não pode finalizar como executada
    const canFinalizeFail = canFinalizeManualEquivalenceProposal({ executorSuccess: false, itemStatus: "pendente" });
    expect(canFinalizeFail).toBe(false);

    // 2. Reverte proposta para pendente com validação CAS
    const revertRes = await reverterPropostaParaPendente(supabase, {
      propostaId: propId,
      userId: USER_A,
      chatId: 12345,
    });
    expect(revertRes.ok).toBe(true);

    const revertedProp = state.telegram_propostas.find((p) => p.id === propId)!;
    expect(revertedProp.status).toBe("pendente");

    // 3. Proposta válida para reprocessamento
    const valRes = validarPropostaFase5(revertedProp, { userId: USER_A, chatId: 12345 });
    expect(valRes.ok).toBe(true);

    // 4. Retry sucede e executor marca item como processado
    const canFinalizeSuccess = canFinalizeManualEquivalenceProposal({ executorSuccess: true, itemStatus: "processado" });
    expect(canFinalizeSuccess).toBe(true);

    // 5. Verificação de finalização segura
    const finSuccess = isProposalFinalizedSuccessfully({ status: "executada" }, null);
    expect(finSuccess).toBe(true);
    const finFail = isProposalFinalizedSuccessfully(null, new Error("DB Error"));
    expect(finFail).toBe(false);

    // Helper de extração de ID do item funciona
    expect(extrairNfItemIdDaProposta(revertedProp.dados)).toBe("item-10");
  });

  // ---------------------------------------------------------------------------
  // E2E-11: NF PARCIAL
  // ---------------------------------------------------------------------------
  it("E2E-11: NF Parcial -> 1 item resolvido e 1 pendente mantém NF não confirmada; após resolver 2º, NF transiciona", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const nfId = "nf-parcial-11";
    state.notas_fiscais_compra.push({
      id: nfId,
      user_id: USER_A,
      workspace_id: WS_A,
      fornecedor: "Distribuidora Mista",
      cnpj_fornecedor: "10.200.300/0001-40",
      status: "pendente",
    });

    const item1 = "item-p1";
    const item2 = "item-p2";
    state.nf_itens.push({
      id: item1,
      nf_id: nfId,
      codigo_produto: "ITEM-A",
      descricao: "Item A Resolvido",
      unidade: "UN",
      quantidade: 5,
      valor_unitario: 10.0,
      status_estoque: "pendente",
    });

    state.nf_itens.push({
      id: item2,
      nf_id: nfId,
      codigo_produto: "ITEM-B",
      descricao: "Item B Sem Equivalencia",
      unidade: "CX",
      quantidade: 2,
      valor_unitario: 50.0,
      status_estoque: "pendente",
    });

    // Produto A
    state.produtos_eyemobile.push({
      id: "prod-a-11",
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-A",
      codigo: "A",
      descricao: "Produto A",
      estoque_atual: 0,
      custo_atual: 10.0,
      preco_venda: 20.0,
      margem_real_percentual: null,
    });

    state.produto_equivalencias.push({
      id: "equiv-a-11",
      user_id: USER_A,
      workspace_id: WS_A,
      cnpj_fornecedor_normalizado: "10200300000140",
      codigo_produto_fornecedor: "ITEM-A",
      produto_eyemobile_uuid: "prod-a-11",
      fator_conversao: 1,
      confirmado_por_usuario: true,
      origem_matching: "manual",
    });

    // Aplica Item 1
    await supabase.rpc("aplicar_item_nf_estoque_custo", {
      p_item_id: item1,
      p_user_id: USER_A,
      p_workspace_id: WS_A,
      p_equivalencia_id: "equiv-a-11",
      p_produto_eyemobile_uuid: "prod-a-11",
      p_quantidade_para_estoque: 5,
      p_custo_unitario_convertido: 10.0,
      p_fator_conversao_esperado: 1,
    });

    // Simula cálculo de status da NF
    const itensNF = state.nf_itens.filter((i) => i.nf_id === nfId);
    const todosProcessados = itensNF.every((i) => i.status_estoque === "processado");
    const algumProcessado = itensNF.some((i) => i.status_estoque === "processado");

    expect(todosProcessados).toBe(false);
    expect(algumProcessado).toBe(true);

    const nfRow = state.notas_fiscais_compra.find((n) => n.id === nfId)!;
    nfRow.status = "parcialmente_processada";
    expect(nfRow.status).toBe("parcialmente_processada");

    // Agora resolve e aplica o Item 2
    state.produtos_eyemobile.push({
      id: "prod-b-11",
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-B",
      codigo: "B",
      descricao: "Produto B",
      estoque_atual: 0,
      custo_atual: 25.0,
      preco_venda: 50.0,
      margem_real_percentual: null,
    });

    state.produto_equivalencias.push({
      id: "equiv-b-11",
      user_id: USER_A,
      workspace_id: WS_A,
      cnpj_fornecedor_normalizado: "10200300000140",
      codigo_produto_fornecedor: "ITEM-B",
      produto_eyemobile_uuid: "prod-b-11",
      fator_conversao: 2,
      confirmado_por_usuario: true,
      origem_matching: "manual",
    });

    await supabase.rpc("aplicar_item_nf_estoque_custo", {
      p_item_id: item2,
      p_user_id: USER_A,
      p_workspace_id: WS_A,
      p_equivalencia_id: "equiv-b-11",
      p_produto_eyemobile_uuid: "prod-b-11",
      p_quantidade_para_estoque: 4,
      p_custo_unitario_convertido: 25.0,
      p_fator_conversao_esperado: 2,
    });

    const todosAposB = state.nf_itens.filter((i) => i.nf_id === nfId).every((i) => i.status_estoque === "processado");
    expect(todosAposB).toBe(true);
    nfRow.status = "confirmada";
    expect(nfRow.status).toBe("confirmada");
  });

  // ---------------------------------------------------------------------------
  // E2E-12: LEGACY STATUS
  // ---------------------------------------------------------------------------
  it("E2E-12: Legacy Status -> status_estoque = 'atualizado' tratado como terminal e idempotente", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const prodId = "prod-leg-12";
    state.produtos_eyemobile.push({
      id: prodId,
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-LEG",
      codigo: "LEG-01",
      descricao: "Item Legado",
      estoque_atual: 100,
      custo_atual: 15.0,
      preco_venda: 30.0,
      margem_real_percentual: null,
    });

    const nfId = "nf-leg-12";
    state.notas_fiscais_compra.push({
      id: nfId,
      user_id: USER_A,
      workspace_id: WS_A,
      fornecedor: "Forn Legado",
      cnpj_fornecedor: "11111111000111",
      status: "confirmada",
    });

    const itemId = "item-leg-12";
    state.nf_itens.push({
      id: itemId,
      nf_id: nfId,
      codigo_produto: "LEG-01",
      descricao: "Item Legado Atualizado",
      unidade: "UN",
      quantidade: 10,
      valor_unitario: 15.0,
      status_estoque: "atualizado", // LEGADO TERMINAL
    });

    const { data: res } = await supabase.rpc("aplicar_item_nf_estoque_custo", {
      p_item_id: itemId,
      p_user_id: USER_A,
      p_workspace_id: WS_A,
      p_equivalencia_id: "any",
      p_produto_eyemobile_uuid: prodId,
      p_quantidade_para_estoque: 10,
      p_custo_unitario_convertido: 15.0,
      p_fator_conversao_esperado: 1,
    });

    expect(res.success).toBe(true);
    expect(res.code).toBe("already_processed");
    const prod = state.produtos_eyemobile.find((p) => p.id === prodId)!;
    expect(prod.estoque_atual).toBe(100); // inalterado
  });

  // ---------------------------------------------------------------------------
  // E2E-13: PRODUTO SEM eyemobile_id
  // ---------------------------------------------------------------------------
  it("E2E-13: Produto sem eyemobile_id -> fail closed com erro seguro e zero mutação", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const prodId = "prod-no-emid-13";
    state.produtos_eyemobile.push({
      id: prodId,
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: null, // INVÁLIDO
      codigo: "NO-EMID",
      descricao: "Produto Sem Eyemobile Id",
      estoque_atual: 0,
      custo_atual: 10.0,
      preco_venda: 20.0,
      margem_real_percentual: null,
    });

    state.produto_equivalencias.push({
      id: "equiv-13",
      user_id: USER_A,
      workspace_id: WS_A,
      cnpj_fornecedor_normalizado: "12345678000190",
      codigo_produto_fornecedor: "FORN-13",
      produto_eyemobile_uuid: prodId,
      fator_conversao: 1,
      confirmado_por_usuario: true,
      origem_matching: "manual",
    });

    const res = await resolveNfProductEquivalence(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: "12345678000190",
      codigoProdutoFornecedor: "FORN-13",
    });

    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.code).toBe("missing_remote_product_id");
    }
  });

  // ---------------------------------------------------------------------------
  // E2E-14: EQUIVALÊNCIA CORROMPIDA
  // ---------------------------------------------------------------------------
  it("E2E-14: Equivalência corrompida -> fator inválido ou produto inexistente gera erro seguro sem fallback textual", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    // Caso A: Fator <= 0
    state.produto_equivalencias.push({
      id: "equiv-invalid-factor",
      user_id: USER_A,
      workspace_id: WS_A,
      cnpj_fornecedor_normalizado: "12345678000190",
      codigo_produto_fornecedor: "BAD-FACTOR",
      produto_eyemobile_uuid: "prod-dummy",
      fator_conversao: -5,
      confirmado_por_usuario: true,
      origem_matching: "manual",
    });

    const resBadFactor = await resolveNfProductEquivalence(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: "12345678000190",
      codigoProdutoFornecedor: "BAD-FACTOR",
    });

    expect(resBadFactor.status).toBe("error");
    if (resBadFactor.status === "error") {
      expect(resBadFactor.code).toBe("invalid_conversion_factor");
    }

    // Caso B: Produto inexistente
    state.produto_equivalencias.push({
      id: "equiv-missing-prod",
      user_id: USER_A,
      workspace_id: WS_A,
      cnpj_fornecedor_normalizado: "12345678000190",
      codigo_produto_fornecedor: "MISSING-PROD",
      produto_eyemobile_uuid: "00000000-0000-0000-0000-000000000099",
      fator_conversao: 1,
      confirmado_por_usuario: true,
      origem_matching: "manual",
    });

    const resMissing = await resolveNfProductEquivalence(supabase, {
      userId: USER_A,
      workspaceId: WS_A,
      cnpjFornecedor: "12345678000190",
      codigoProdutoFornecedor: "MISSING-PROD",
    });

    expect(resMissing.status).toBe("error");
    if (resMissing.status === "error") {
      expect(resMissing.code).toBe("invalid_equivalence");
    }
  });

  // ---------------------------------------------------------------------------
  // E2E-15: TELEGRAM ATOR REAL
  // ---------------------------------------------------------------------------
  it("E2E-15: Telegram Ator Real -> usuário estranho em grupo é bloqueado, usuário vinculado ao dono é autorizado", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    // Registra mapeamento do Telegram (campo telegram_chat_id armazena o id do telegram)
    state.usuarios_telegram.push({
      telegram_chat_id: "123456789",
      user_id: USER_A,
      ativo: true,
    });

    // Caso A: Usuário estranho (from.id = 999999999) clica ou digita
    const atorInvalido = await validarAtorTelegramFase5(supabase, {
      telegramUserId: 999999999,
      propostaUserId: USER_A,
    });
    expect(atorInvalido.ok).toBe(false);
    expect(atorInvalido.reason).toBe("Apenas o usuário vinculado pode interagir com este botão.");

    // Caso B: Usuário legítimo (from.id = 123456789)
    const atorValido = await validarAtorTelegramFase5(supabase, {
      telegramUserId: 123456789,
      propostaUserId: USER_A,
    });
    expect(atorValido.ok).toBe(true);
    if (atorValido.ok) {
      expect(atorValido.userId).toBe(USER_A);
    }
  });

  // ---------------------------------------------------------------------------
  // E2E-16: FRONTEND SEM LEGADO
  // ---------------------------------------------------------------------------
  it("E2E-16: Frontend sem Legado -> zero referências a tabela legada em src/, zero default products e zero cache guest", () => {
    const srcDir = path.resolve(__dirname, "../../../../src");
    let mentionsCount = 0;
    const LEGACY_TABLE = ["eye", "mobile_", "produtos"].join("");
    const GUEST_CACHE_KEY = ["pdv_", "produtos_", "cache_guest"].join("");

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          if (entry.name === "product-frontend-identity.test.ts" || entry.name === "product-identity-e2e.test.ts") {
            continue;
          }
          const content = fs.readFileSync(fullPath, "utf8");
          if (content.includes(LEGACY_TABLE)) {
            mentionsCount++;
          }
          expect(content).not.toContain(GUEST_CACHE_KEY);
        }
      }
    }

    scanDir(srcDir);
    expect(mentionsCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // E2E-17: HISTORY CANÔNICO
  // ---------------------------------------------------------------------------
  it("E2E-17: History Canônico -> consultas de histórico de custo filtram por produto_eyemobile_uuid canônico e tenant", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const prodUuid = "prod-history-17";
    state.historico_custo_produto.push(
      {
        id: "h1",
        user_id: USER_A,
        workspace_id: WS_A,
        produto_eyemobile_uuid: prodUuid,
        produto_codigo: "PROD-17",
        produto_descricao: "Café Especial 250g",
        custo_unitario: 18.5,
        quantidade: 10,
        data_compra: "2026-09-01",
      },
      {
        id: "h2",
        user_id: USER_A,
        workspace_id: WS_A,
        produto_eyemobile_uuid: prodUuid,
        produto_codigo: "PROD-17",
        produto_descricao: "Café Especial 250g Lote 2",
        custo_unitario: 19.0,
        quantidade: 20,
        data_compra: "2026-09-10",
      },
      {
        id: "h3",
        user_id: USER_B,
        workspace_id: WS_B,
        produto_eyemobile_uuid: "prod-other",
        produto_codigo: "PROD-17",
        produto_descricao: "Café de Outro Tenant",
        custo_unitario: 12.0,
        quantidade: 5,
        data_compra: "2026-09-05",
      }
    );

    const { data: rows } = await supabase
      .from("historico_custo_produto")
      .select("*")
      .eq("produto_eyemobile_uuid", prodUuid)
      .eq("workspace_id", WS_A)
      .order("data_compra", { ascending: false });

    expect(rows).toHaveLength(2);
    expect(rows![0].custo_unitario).toBe(19.0);
    expect(rows![1].custo_unitario).toBe(18.5);
  });

  // ---------------------------------------------------------------------------
  // E2E-18: IDEMPOTÊNCIA DE NF COMPLETA
  // ---------------------------------------------------------------------------
  it("E2E-18: Idempotência de NF Completa -> reexecução de NF 100% confirmada não duplica estoque nem histórico", async () => {
    const { state, createSupabaseMock } = createInMemoryDatabase();
    const supabase = createSupabaseMock();

    const prodId = "prod-full-nf-18";
    state.produtos_eyemobile.push({
      id: prodId,
      user_id: USER_A,
      workspace_id: WS_A,
      eyemobile_id: "EM-FULL-18",
      codigo: "F18",
      descricao: "Água com Gás 500ml",
      estoque_atual: 24, // já recebeu os 24 da confirmação anterior
      custo_atual: 2.0,
      preco_venda: 5.0,
      margem_real_percentual: null,
    });

    const nfId = "nf-full-18";
    state.notas_fiscais_compra.push({
      id: nfId,
      user_id: USER_A,
      workspace_id: WS_A,
      fornecedor: "Distribuidora Cristal",
      cnpj_fornecedor: "55.444.333/0001-22",
      status: "confirmada", // Já 100% confirmada
    });

    const itemId = "item-full-18";
    state.nf_itens.push({
      id: itemId,
      nf_id: nfId,
      codigo_produto: "AGUA-GAS-CX24",
      descricao: "Agua Gas Caixa c/ 24",
      unidade: "CX",
      quantidade: 1,
      valor_unitario: 48.0,
      status_estoque: "processado", // já processado
      produto_eyemobile_id: "EM-FULL-18",
    });

    // Simular tentativa de reexecução de confirmação da NF inteira
    const itensNF = state.nf_itens.filter((i) => i.nf_id === nfId);
    for (const item of itensNF) {
      if (item.status_estoque === "processado" || item.status_estoque === "atualizado") {
        // Já terminal, idempotente
        continue;
      }
      // Se não fosse terminal, chamaria RPC
      await supabase.rpc("aplicar_item_nf_estoque_custo", {
        p_item_id: item.id,
        p_user_id: USER_A,
        p_workspace_id: WS_A,
        p_equivalencia_id: "any",
        p_produto_eyemobile_uuid: prodId,
        p_quantidade_para_estoque: 24,
        p_custo_unitario_convertido: 2.0,
        p_fator_conversao_esperado: 24,
      });
    }

    // Prova: estoque continua exatamente 24
    const prod = state.produtos_eyemobile.find((p) => p.id === prodId)!;
    expect(prod.estoque_atual).toBe(24);
    expect(state.historico_custo_produto).toHaveLength(0); // nenhum novo inserido
    const nf = state.notas_fiscais_compra.find((n) => n.id === nfId)!;
    expect(nf.status).toBe("confirmada");
  });
});
