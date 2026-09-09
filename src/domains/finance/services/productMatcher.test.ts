/**
 * WALLET APP — Correção de Integridade de Produtos — Fase 2
 * Testes Unitários: Matcher Seguro e Determinístico de Produtos (Hardened)
 * Arquivo: src/domains/finance/services/productMatcher.test.ts
 *
 * Cobertura Completa de Cenários:
 * A-P: Cenários de Integridade Relacional e Normalização
 * Q-AD: Hardening Fail-Closed (Fator Inválido, Erros de Banco, IDs Remotos e Integridade de Tenant)
 */

import { describe, it, expect } from "vitest";
import {
  matchProduct,
  normalizeCnpj,
  normalizeCodigoFornecedor,
  normalizeDescricao,
  calculateDescriptionSimilarity,
  extractProductTokens,
  sanitizeErrorMessage,
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
    fator_conversao: unknown;
    confirmado_por_usuario: boolean;
  }>;
  produtos_eyemobile: Array<{
    id: string;
    eyemobile_id: string | null;
    codigo: string | null;
    descricao: string;
    user_id: string;
    workspace_id: string;
  }>;
  simulateErrors?: {
    produto_equivalencias?: string | null;
    produtos_eyemobile_single?: string | null;
    produtos_eyemobile_list?: string | null;
  };
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
          if (table === "produto_equivalencias" && db.simulateErrors?.produto_equivalencias) {
            return { data: null, error: { message: db.simulateErrors.produto_equivalencias } };
          }
          if (table === "produtos_eyemobile" && db.simulateErrors?.produtos_eyemobile_single) {
            return { data: null, error: { message: db.simulateErrors.produtos_eyemobile_single } };
          }

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
          if (table === "produtos_eyemobile" && db.simulateErrors?.produtos_eyemobile_list) {
            return Promise.resolve({
              data: null,
              error: { message: db.simulateErrors.produtos_eyemobile_list },
            }).then(onfulfilled, onrejected);
          }

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

  it("sanitizeErrorMessage: mascara tokens de autenticação", () => {
    const sanitized = sanitizeErrorMessage("Authorization error: Bearer eyJhbGciOiJIUzI1NiIsInR...", "fallback");
    expect(sanitized).toContain("Bearer [REDACTED]");
    expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR");
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
      fornecedorCnpj: CNPJ_FORNECEDOR_2,
      codigoFornecedor: "COD-HEINEKEN-CX",
    };

    const result = await matchProduct(input, client);
    expect(result.status).toBe("not_found");
  });

  it("Cenário E: mesmo fornecedor/código em workspace diferente -> não cruza", async () => {
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
      expect(result.produtoEyemobileUuid).toBe(PROD_EYE_1);
      expect(result.produtoEyemobileUuid).not.toBe(PROD_EYE_WS_B);
    }
  });

  it("Cenário F: mesmo fornecedor/código em user diferente -> não cruza", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_1,
      codigoFornecedor: "COD-USER-2-ONLY",
    };

    const result = await matchProduct(input, client);
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
      fornecedorCnpj: "  12.345.678/0001-90  ",
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
      fornecedorCnpj: "99.999.999/0001-99",
      codigoFornecedor: "NOVO-COD-99",
      descricao: "Cerveja Heineken Long Neck 330ml",
    };

    const result = await matchProduct(input, client);
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
    }
  });

  it("Cenário L: código Eyemobile coincidentemente igual ao codigo_produto da NF -> NÃO produz match sem equivalência", async () => {
    const client = createMockClient(baseDb);
    const input: ProductMatchInput = {
      userId: USER_1,
      workspaceId: WORKSPACE_A,
      fornecedorCnpj: CNPJ_FORNECEDOR_2,
      codigoFornecedor: "EYE-101",
    };

    const result = await matchProduct(input, client);
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

    const resNoUser = await matchProduct({ userId: "", workspaceId: WORKSPACE_A }, client);
    expect(resNoUser.status).toBe("invalid_input");

    const resNoWs = await matchProduct({ userId: USER_1, workspaceId: "" }, client);
    expect(resNoWs.status).toBe("invalid_input");

    const resEmpty = await matchProduct({ userId: USER_1, workspaceId: WORKSPACE_A }, client);
    expect(resEmpty.status).toBe("invalid_input");
  });

  it("Cenário P: equivalência confirmada de outro workspace -> ignorada", async () => {
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
    expect(result.status).not.toBe("matched");
  });
});

describe("productMatcher — Cenários de Hardening Q até AD (Fail-Closed)", () => {
  const USER_1 = "11111111-1111-1111-1111-111111111111";
  const USER_2 = "22222222-2222-2222-2222-222222222222";
  const WORKSPACE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const WORKSPACE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const PROD_EYE_1 = "eeeeeeee-0001-0000-0000-000000000001";
  const CNPJ_FORN = "12345678000190";

  it("Cenário Q: fator_conversao = 0 -> status error (invalid_conversion_factor), NUNCA fator 1", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-zero",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-FATOR-ZERO",
          produto_eyemobile_uuid: PROD_EYE_1,
          fator_conversao: 0,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [
        {
          id: PROD_EYE_1,
          eyemobile_id: "eye-remote-101",
          codigo: "EYE-101",
          descricao: "Cerveja Heineken 330ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-FATOR-ZERO",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("invalid_conversion_factor");
      expect(result.stage).toBe("integrity_validation");
      expect(result.reason).toContain("inválido");
    }
  });

  it("Cenário R: fator_conversao negativo -> status error (invalid_conversion_factor)", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-neg",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-NEG",
          produto_eyemobile_uuid: PROD_EYE_1,
          fator_conversao: -5,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [
        {
          id: PROD_EYE_1,
          eyemobile_id: "eye-remote-101",
          codigo: "EYE-101",
          descricao: "Cerveja Heineken 330ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-NEG",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("invalid_conversion_factor");
    }
  });

  it("Cenário S: fator_conversao = 'abc' -> status error (invalid_conversion_factor)", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-str",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-STR",
          produto_eyemobile_uuid: PROD_EYE_1,
          fator_conversao: "abc",
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [
        {
          id: PROD_EYE_1,
          eyemobile_id: "eye-remote-101",
          codigo: "EYE-101",
          descricao: "Cerveja Heineken 330ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-STR",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("invalid_conversion_factor");
    }
  });

  it("Cenário T: fator_conversao = null -> status error (invalid_conversion_factor)", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-null-factor",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-NULL-FACTOR",
          produto_eyemobile_uuid: PROD_EYE_1,
          fator_conversao: null,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [
        {
          id: PROD_EYE_1,
          eyemobile_id: "eye-remote-101",
          codigo: "EYE-101",
          descricao: "Cerveja Heineken 330ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-NULL-FACTOR",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("invalid_conversion_factor");
    }
  });

  it("Cenário U: erro na query produto_equivalencias -> database_error, NUNCA not_found", async () => {
    const db: MockDb = {
      produto_equivalencias: [],
      produtos_eyemobile: [],
      simulateErrors: {
        produto_equivalencias: "connection refused: 5432",
      },
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-ANY",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("database_error");
      expect(result.stage).toBe("equivalence_lookup");
    }
  });

  it("Cenário V: erro na query produtos_eyemobile -> database_error", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-valid",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-PROD-ERR",
          produto_eyemobile_uuid: PROD_EYE_1,
          fator_conversao: 1,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [],
      simulateErrors: {
        produtos_eyemobile_single: "deadlock detected in postgres transaction",
      },
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-PROD-ERR",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("database_error");
      expect(result.stage).toBe("canonical_product_lookup");
    }
  });

  it("Cenário W: erro na query de suggestions -> database_error", async () => {
    const db: MockDb = {
      produto_equivalencias: [],
      produtos_eyemobile: [],
      simulateErrors: {
        produtos_eyemobile_list: "timeout during suggestion candidate retrieval",
      },
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        descricao: "Cerveja Heineken",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("database_error");
      expect(result.stage).toBe("suggestion_lookup");
    }
  });

  it("Cenário X: produto canônico com eyemobile_id null -> status error (missing_remote_product_id)", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-null-remote",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-NULL-REMOTE",
          produto_eyemobile_uuid: "prod-null-remote-id",
          fator_conversao: 1,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [
        {
          id: "prod-null-remote-id",
          eyemobile_id: null, // Legado sem ID remoto!
          codigo: "COD-LEGACY",
          descricao: "Produto Legado",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-NULL-REMOTE",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("missing_remote_product_id");
      expect(result.stage).toBe("integrity_validation");
    }
  });

  it("Cenário Y: produto canônico com eyemobile_id vazio -> status error (missing_remote_product_id)", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-empty-remote",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-EMPTY-REMOTE",
          produto_eyemobile_uuid: "prod-empty-remote-id",
          fator_conversao: 1,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [
        {
          id: "prod-empty-remote-id",
          eyemobile_id: "   ", // String em branco
          codigo: "COD-LEGACY-2",
          descricao: "Produto Legado Vazio",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-EMPTY-REMOTE",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("missing_remote_product_id");
    }
  });

  it("Cenário Z: equivalência confirmada apontando produto inexistente -> status error (invalid_equivalence)", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-nonexistent-prod",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-ORPHAN",
          produto_eyemobile_uuid: "uuid-inexistente-no-eyemobile",
          fator_conversao: 1,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [], // Banco sem esse produto
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-ORPHAN",
        descricao: "Tentativa de cair em sugestao",
      },
      createMockClient(db)
    );

    // Deve falhar fechado com invalid_equivalence e NÃO cair em sugestão!
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("invalid_equivalence");
      expect(result.stage).toBe("integrity_validation");
    }
  });

  it("Cenário AA: equivalência confirmada cross-workspace simulada -> status error (invalid_equivalence)", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-cross-ws",
          user_id: USER_1,
          workspace_id: WORKSPACE_A, // Equivalência no Workspace A
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-CROSS-WS",
          produto_eyemobile_uuid: "prod-ws-b",
          fator_conversao: 1,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [
        {
          id: "prod-ws-b",
          eyemobile_id: "remote-ws-b",
          codigo: "COD-B",
          descricao: "Produto do WS B",
          user_id: USER_1,
          workspace_id: WORKSPACE_B, // Produto no Workspace B!
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-CROSS-WS",
      },
      createMockClient(db)
    );

    // Falha fechado com erro de integridade de tenant
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("invalid_equivalence");
    }
  });

  it("Cenário AB: equivalência confirmada cross-user simulada -> status error (invalid_equivalence)", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-cross-user",
          user_id: USER_1, // Equivalência no User 1
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-CROSS-USER",
          produto_eyemobile_uuid: "prod-user-2",
          fator_conversao: 1,
          confirmado_por_usuario: true,
        },
      ],
      produtos_eyemobile: [
        {
          id: "prod-user-2",
          eyemobile_id: "remote-user-2",
          codigo: "COD-U2",
          descricao: "Produto do User 2",
          user_id: USER_2, // Produto do User 2!
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-CROSS-USER",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("invalid_equivalence");
    }
  });

  it("Cenário AC: equivalência não confirmada continua suggestion e nunca matched", async () => {
    const db: MockDb = {
      produto_equivalencias: [
        {
          id: "eq-pending",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
          cnpj_fornecedor_normalizado: CNPJ_FORN,
          codigo_produto_fornecedor: "COD-PENDING",
          produto_eyemobile_uuid: PROD_EYE_1,
          fator_conversao: 1,
          confirmado_por_usuario: false, // PENDENTE!
        },
      ],
      produtos_eyemobile: [
        {
          id: PROD_EYE_1,
          eyemobile_id: "remote-101",
          codigo: "EYE-101",
          descricao: "Cerveja Heineken 330ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        fornecedorCnpj: CNPJ_FORN,
        codigoFornecedor: "COD-PENDING",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("suggestion");
    expect(result.status).not.toBe("matched");
    if (result.status === "suggestion") {
      expect(result.suggestions[0].produtoEyemobileUuid).toBe(PROD_EYE_1);
    }
  });

  it("Cenário AD: descrição 100% idêntica continua nunca matched", async () => {
    const db: MockDb = {
      produto_equivalencias: [],
      produtos_eyemobile: [
        {
          id: PROD_EYE_1,
          eyemobile_id: "remote-101",
          codigo: "EYE-101",
          descricao: "Cerveja Heineken 330ml",
          user_id: USER_1,
          workspace_id: WORKSPACE_A,
        },
      ],
    };

    const result = await matchProduct(
      {
        userId: USER_1,
        workspaceId: WORKSPACE_A,
        descricao: "Cerveja Heineken 330ml",
      },
      createMockClient(db)
    );

    expect(result.status).toBe("suggestion");
    expect(result.status).not.toBe("matched");
  });
});
