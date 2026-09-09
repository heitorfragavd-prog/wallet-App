/**
 * WALLET APP — Correção de Integridade de Produtos — Fase 2
 * Testes Unitários: Matcher Seguro e Determinístico de Produtos
 * Arquivo: src/domains/finance/services/productMatcher.test.ts
 *
 * Cobertura Obrigatória de Cenários:
 * A. Equivalência confirmada -> matched
 * B. Fator de conversão correto retornado
 * C. Equivalência não confirmada -> NÃO matched (suggestion)
 * D. Mesmo código em fornecedor diferente -> não cruza
 * E. Mesmo fornecedor/código em workspace diferente -> não cruza
 * F. Mesmo fornecedor/código em user diferente -> não cruza
 * G. Código fornecedor inexistente -> not_found
 * H. CNPJ normalizado com pontuação -> encontra equivalência correta
 * I. Descrição idêntica sem equivalência -> suggestion, NUNCA matched
 * J. Descrição parcialmente parecida -> suggestion
 * K. Produtos com descrições muito semelhantes -> múltiplas sugestões, nenhuma escolha automática
 * L. Código Eyemobile coincidentemente igual ao codigo_produto da NF -> NÃO produz match sem equivalência
 * M. Produto inexistente -> not_found seguro
 * N. Fator de conversão decimal -> preservado corretamente
 * O. Input sem fornecedor/código suficiente -> invalid_input
 * P. Equivalência confirmada de outro workspace -> ignorada
 */

import { describe, it, expect } from "vitest";
import {
  matchProduct,
  normalizeCnpj,
  normalizeCodigoFornecedor,
  normalizeDescricao,
  calculateDescriptionSimilarity,
  extractProductTokens,
  type ProductMatchInput,
  type SupabaseClientLike,
} from "./productMatcher";

// ─── BANCO EM MEMÓRIA PARA TESTES DETERMINÍSTICOS ────────────────

interface MockDb {
  produto_equivalencias: Array<{
    id: string;
    user_id: string;
    workspace_id: string;
    cnpj_fornecedor_normalizado: string;
    codigo_produto_fornecedor: string;
    produto_eyemobile_uuid: string;
    fator_conversao: number | string;
    confirmado_por_usuario: boolean;
  }>;
  produtos_eyemobile: Array<{
    id: string;
    eyemobile_id: string;
    codigo: string | null;
    descricao: string;
    user_id: string;
    workspace_id: string;
  }>;
}

function createMockClient(db: MockDb): SupabaseClientLike {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};

      const getTableData = (): Record<string, unknown>[] => {
        if (table === "produto_equivalencias") {
          return db.produto_equivalencias as unknown as Record<string, unknown>[];
        }
        if (table === "produtos_eyemobile") {
          return db.produtos_eyemobile as unknown as Record<string, unknown>[];
        }
        return [];
      };

      const builder = {
        select: (_columns?: string) => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        limit: (_count: number) => builder,
        maybeSingle: async () => {
          const tableData = getTableData();
          const found = tableData.find((row) => {
            for (const [key, val] of Object.entries(filters)) {
              if (row[key] !== val) return false;
            }
            return true;
          });
          return { data: found || null, error: null };
        },
        then: <TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) => {
          const tableData = getTableData();
          const filtered = tableData.filter((row) => {
            for (const [key, val] of Object.entries(filters)) {
              if (row[key] !== val) return false;
            }
            return true;
          });
          return Promise.resolve({ data: filtered, error: null }).then(onfulfilled, onrejected);
        },
      };

      return builder as unknown as ReturnType<SupabaseClientLike["from"]>;
    },
  };
}

// ─── SUÍTE DE TESTES ─────────────────────────────────────────────

describe("productMatcher — Normalização e Helpers Puros", () => {
  it("normalizeCnpj: remove pontuação e caracteres não numéricos", () => {
    expect(normalizeCnpj("12.345.678/0001-90")).toBe("12345678000190");
    expect(normalizeCnpj("  12345678000190  ")).toBe("12345678000190");
    expect(normalizeCnpj("00.000.000/0001-91")).toBe("00000000000191");
    expect(normalizeCnpj("abc")).toBe(null);
    expect(normalizeCnpj("")).toBe(null);
    expect(normalizeCnpj(null)).toBe(null);
    expect(normalizeCnpj(undefined)).toBe(null);
  });

  it("normalizeCodigoFornecedor: preserva case original e remove whitespace externo (trim conservador)", () => {
    expect(normalizeCodigoFornecedor("  PROD-1234  ")).toBe("PROD-1234");
    expect(normalizeCodigoFornecedor("sk_sku_98a")).toBe("sk_sku_98a");
    expect(normalizeCodigoFornecedor("SK_SKU_98A")).toBe("SK_SKU_98A");
    expect(normalizeCodigoFornecedor("")).toBe(null);
    expect(normalizeCodigoFornecedor("   ")).toBe(null);
    expect(normalizeCodigoFornecedor(null)).toBe(null);
    expect(normalizeCodigoFornecedor(undefined)).toBe(null);
  });

  it("normalizeDescricao: converte para minúsculas e remove acentos e caracteres especiais", () => {
    expect(normalizeDescricao("ÁGUA MINERAL SEM GÁS 500ML")).toBe("agua mineral sem gas 500 ml");
    expect(normalizeDescricao("  Cerveja   Heineken - Long   Neck 330ml  ")).toBe("cerveja heineken long neck 330 ml");
    expect(normalizeDescricao("")).toBe("");
    expect(normalizeDescricao(null)).toBe("");
  });

  it("extractProductTokens: filtra stop words e tokens pequenos", () => {
    const tokens = extractProductTokens("agua mineral com gas de 500 ml");
    expect(tokens.has("agua")).toBe(true);
    expect(tokens.has("mineral")).toBe(true);
    expect(tokens.has("gas")).toBe(true);
    expect(tokens.has("500")).toBe(true);
    // Stop words excluídas:
    expect(tokens.has("com")).toBe(false);
    expect(tokens.has("de")).toBe(false);
    expect(tokens.has("ml")).toBe(false);
  });

  it("calculateDescriptionSimilarity: pontua adequadamente semânticas próximas", () => {
    const scoreExato = calculateDescriptionSimilarity("Cerveja Heineken 330ml", "Cerveja Heineken 330ml");
    expect(scoreExato).toBe(0.99);

    const scoreParecido = calculateDescriptionSimilarity("Heineken Long Neck 330ml", "Cerveja Heineken 330ml LN");
    expect(scoreParecido).toBeGreaterThan(0.4);

    const scoreDiferente = calculateDescriptionSimilarity("Refrigerante Coca Cola 2L", "Cerveja Heineken 330ml");
    expect(scoreDiferente).toBeLessThan(0.15);
  });
});

describe("productMatcher — Cenários Obrigatórios A até P", () => {
  const USER_1 = "11111111-1111-1111-1111-111111111111";
  const USER_2 = "22222222-2222-2222-2222-222222222222";

  const WORKSPACE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const WORKSPACE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const PROD_EYE_1 = "eeeeeeee-0001-0000-0000-000000000001";
  const PROD_EYE_2 = "eeeeeeee-0002-0000-0000-000000000002";
  const PROD_EYE_WS_B = "eeeeeeee-0003-0000-0000-000000000003";

  const CNPJ_FORNECEDOR_1 = "12345678000190";
  const CNPJ_FORNECEDOR_2 = "98765432000100";

  const baseDb: MockDb = {
    produto_equivalencias: [
      {
        id: "eq-1",
        user_id: USER_1,
        workspace_id: WORKSPACE_A,
        cnpj_fornecedor_normalizado: CNPJ_FORNECEDOR_1,
        codigo_produto_fornecedor: "COD-HEINEKEN-CX",
        produto_eyemobile_uuid: PROD_EYE_1,
        fator_conversao: 24,
        confirmado_por_usuario: true, // CONFIRMADA!
      },
      {
        id: "eq-2-unconfirmed",
        user_id: USER_1,
        workspace_id: WORKSPACE_A,
        cnpj_fornecedor_normalizado: CNPJ_FORNECEDOR_1,
        codigo_produto_fornecedor: "COD-PENDING-UNCONFIRMED",
        produto_eyemobile_uuid: PROD_EYE_2,
        fator_conversao: 12,
        confirmado_por_usuario: false, // NÃO CONFIRMADA!
      },
      {
        id: "eq-ws-b",
        user_id: USER_1,
        workspace_id: WORKSPACE_B,
        cnpj_fornecedor_normalizado: CNPJ_FORNECEDOR_1,
        codigo_produto_fornecedor: "COD-HEINEKEN-CX",
        produto_eyemobile_uuid: PROD_EYE_WS_B,
        fator_conversao: 1,
        confirmado_por_usuario: true,
      },
      {
        id: "eq-user-2",
        user_id: USER_2,
        workspace_id: WORKSPACE_A,
        cnpj_fornecedor_normalizado: CNPJ_FORNECEDOR_1,
        codigo_produto_fornecedor: "COD-USER-2-ONLY",
        produto_eyemobile_uuid: PROD_EYE_1,
        fator_conversao: 6,
        confirmado_por_usuario: true,
      },
      {
        id: "eq-decimal",
        user_id: USER_1,
        workspace_id: WORKSPACE_A,
        cnpj_fornecedor_normalizado: CNPJ_FORNECEDOR_1,
        codigo_produto_fornecedor: "COD-CARNE-KG",
        produto_eyemobile_uuid: PROD_EYE_2,
        fator_conversao: 0.5,
        confirmado_por_usuario: true,
      },
    ],
    produtos_eyemobile: [
      {
        id: PROD_EYE_1,
        eyemobile_id: "eye-remote-101",
        codigo: "EYE-101",
        descricao: "Cerveja Heineken Long Neck 330ml",
        user_id: USER_1,
        workspace_id: WORKSPACE_A,
      },
      {
        id: PROD_EYE_2,
        eyemobile_id: "eye-remote-102",
        codigo: "EYE-102",
        descricao: "Contra File Angus Kg",
        user_id: USER_1,
        workspace_id: WORKSPACE_A,
      },
      {
        id: PROD_EYE_WS_B,
        eyemobile_id: "eye-remote-999",
        codigo: "EYE-WS-B",
        descricao: "Produto do Workspace B",
        user_id: USER_1,
        workspace_id: WORKSPACE_B,
      },
    ],
  };

  it("Cenário A: equivalência confirmada -> matched", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "COD-HEINEKEN-CX",
      descricao: "CERVEJA HEINEKEN CX COM 24",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.source).toBe("confirmed_equivalence");
      expect(result.produtoEyemobileUuid).toBe(PROD_EYE_1);
      expect(result.eyemobileId).toBe("eye-remote-101");
    }
  });

  it("Cenário B: fator de conversão correto retornado", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "COD-HEINEKEN-CX",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.fatorConversao).toBe(24);
    }
  });

  it("Cenário C: equivalência não confirmada (confirmado_por_usuario = false) -> NÃO matched", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "COD-PENDING-UNCONFIRMED",
      descricao: "Produto Pendente de Revisao",
    };

    const result = await matchProduct(input, client);
    // JAMAIS matched!
    expect(result.status).not.toBe("matched");
    expect(result.status).toBe("suggestion");
    if (result.status === "suggestion") {
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].produtoEyemobileUuid).toBe(PROD_EYE_2);
    }
  });

  it("Cenário D: mesmo código em fornecedor diferente -> não cruza", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_2, // Outro CNPJ!
      codigoFornecedor: "COD-HEINEKEN-CX",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("not_found");
  });

  it("Cenário E: mesmo fornecedor/código em workspace diferente -> não cruza", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A, // Buscando no Workspace A
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "COD-HEINEKEN-CX",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      // Retorna PROD_EYE_1 do Workspace A, NUNCA PROD_EYE_WS_B do Workspace B
      expect(result.produtoEyemobileUuid).toBe(PROD_EYE_1);
      expect(result.produtoEyemobileUuid).not.toBe(PROD_EYE_WS_B);
    }
  });

  it("Cenário F: mesmo fornecedor/código em user diferente -> não cruza", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1, // User 1 busca
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "COD-USER-2-ONLY", // Código cadastrado apenas pelo User 2
    };

    const result = await matchProduct(input, client);
    // User 1 não deve encontrar a equivalência do User 2
    expect(result.status).toBe("not_found");
  });

  it("Cenário G: código fornecedor inexistente sem descrição -> not_found", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "CODIGO-INEXISTENTE-12345",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("not_found");
  });

  it("Cenário H: CNPJ normalizado com pontuação -> encontra equivalência correta", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: "  12.345.678/0001-90  ", // Formatado com pontuação e espaços
      codigoFornecedor: "COD-HEINEKEN-CX",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.produtoEyemobileUuid).toBe(PROD_EYE_1);
    }
  });

  it("Cenário I: descrição 100% idêntica sem equivalência -> suggestion, NUNCA matched", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: "99.999.999/0001-99", // Fornecedor sem equivalência cadastrada
      codigoFornecedor: "NOVO-COD-99",
      descricao: "Cerveja Heineken Long Neck 330ml", // 100% IDÊNTICA ao produto 1!
    };

    const result = await matchProduct(input, client);
    // REGRA DE OURO: Descrição nunca gera matched automático!
    expect(result.status).not.toBe("matched");
    expect(result.status).toBe("suggestion");
    if (result.status === "suggestion") {
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].produtoEyemobileUuid).toBe(PROD_EYE_1);
      expect(result.suggestions[0].score).toBe(0.99);
    }
  });

  it("Cenário J: descrição parcialmente parecida -> suggestion", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      descricao: "Heineken LN 330",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("suggestion");
    if (result.status === "suggestion") {
      expect(result.suggestions.some((s) => s.produtoEyemobileUuid === PROD_EYE_1)).toBe(true);
    }
  });

  it("Cenário K: produtos com descrições muito semelhantes -> múltiplas sugestões, nenhuma escolha automática", async () => {
    const dbWithSimilars: MockDb = {
      produto_equivalencias: [],
      produtos_eyemobile: [
        {
          id: "prod-sim-1",
          eyemobile_id: "sim-1",
          codigo: "COD-1",
          descricao: "Cerveja Heineken Long Neck 330ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
        {
          id: "prod-sim-2",
          eyemobile_id: "sim-2",
          codigo: "COD-2",
          descricao: "Cerveja Heineken Lata 350ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
        {
          id: "prod-sim-3",
          eyemobile_id: "sim-3",
          codigo: "COD-3",
          descricao: "Cerveja Heineken Zero 330ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const client = createMockClient(dbWithSimilars);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      descricao: "Cerveja Heineken",
    };

    const result = await matchProduct(input, client);
    expect(result.status).not.toBe("matched");
    expect(result.status).toBe("suggestion");
    if (result.status === "suggestion") {
      expect(result.suggestions.length).toBe(3);
      // Nenhuma escolha automática foi feita
    }
  });

  it("Cenário L: código Eyemobile coincidentemente igual ao codigo_produto da NF -> NÃO produz match sem equivalência", async () => {
    const client = createMockClient(baseDb);
    // Produto 1 tem codigo "EYE-101"
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_2, // Sem equivalência neste fornecedor
      codigoFornecedor: "EYE-101", // Coincidentemente o mesmo código!
    };

    const result = await matchProduct(input, client);
    // PROIBIÇÃO ABSOLUTA: Não pode dar match só porque codigo == codigo!
    expect(result.status).not.toBe("matched");
    expect(result.status).toBe("not_found");
  });

  it("Cenário M: produto inexistente -> not_found seguro", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: "00000000000199",
      codigoFornecedor: "XYZ-999-INEXISTENTE",
      descricao: "Produto Totalmente Desconhecido No Catalogo",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("not_found");
  });

  it("Cenário N: fator_conversao decimal -> preservado corretamente", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "COD-CARNE-KG",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.fatorConversao).toBe(0.5);
    }
  });

  it("Cenário O: input sem dados suficientes -> invalid_input", async () => {
    const client = createMockClient(baseDb);

    // Sem userId
    const resNoUser = await matchProduct({ userId: "", workspaceId: WORKSPACE_A }, client);
    expect(resNoUser.status).toBe("invalid_input");

    // Sem workspaceId
    const resNoWs = await matchProduct({ userId: USER_1, workspaceId: "" }, client);
    expect(resNoWs.status).toBe("invalid_input");

    // Sem fornecedor/código E sem descrição
    const resEmpty = await matchProduct({ userId: USER_1, workspaceId: WORKSPACE_A }, client);
    expect(resEmpty.status).toBe("invalid_input");
  });

  it("Cenário P: equivalência confirmada de outro workspace -> ignorada", async () => {
    const client = createMockClient(baseDb);
    // eq-ws-b pertence ao WORKSPACE_B
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A, // Tentando consultar a partir do Workspace A
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "COD-HEINEKEN-CX",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      // Garante que o produto retornado é estritamente do Workspace A
      expect(result.produtoEyemobileUuid).toBe(PROD_EYE_1);
      expect(result.produtoEyemobileUuid).not.toBe(PROD_EYE_WS_B);
    }
  });

  it("Compatibilidade: eanGtin no input é aceito sem erro mas não realiza matching automático", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      eanGtin: "7891991000833",
      descricao: "Item com EAN mas sem equivalencia",
    };

    const result = await matchProduct(input, client);
    // Não produz matched
    expect(result.status).not.toBe("matched");
  });
});
