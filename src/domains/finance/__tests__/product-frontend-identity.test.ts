import React from "react";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import PDVPage from "@/pages/PDVPage";

const renderPDV = () => render(
  React.createElement(MemoryRouter, null, React.createElement(PDVPage))
);

const { mockAuthState, mockInvoke } = vi.hoisted(() => ({
  mockAuthState: {
    user: null as { id: string } | null,
    loading: false,
  },
  mockInvoke: vi.fn(),
}));

vi.mock("@/domains/auth/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    loading: mockAuthState.loading,
    session: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

function getAllSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
      files.push(...getAllSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("Fase 6 — Product Identity & Legacy Deprecation in Frontend", () => {
  const srcDir = resolve("src");

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    mockInvoke.mockReset();
    mockAuthState.user = null;
    mockAuthState.loading = false;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("Teste A: Hard Gate — nenhuma menção à tabela legada 'eyemobile_produtos' em src/", () => {
    const allFiles = getAllSourceFiles(srcDir);
    const violations: { file: string; match: string }[] = [];

    for (const file of allFiles) {
      if (file.includes("product-frontend-identity.test.ts")) continue;

      const content = readFileSync(file, "utf8");
      if (content.includes("eyemobile_produtos")) {
        violations.push({
          file: file.replace(/\\/g, "/"),
          match: "eyemobile_produtos found in code"
        });
      }
    }

    expect(violations).toEqual([]);
  });

  it("Teste B: Preservação de domínios legítimos (cardápio, food cost e despensa)", () => {
    // 1. produtos_cardapio deve continuar existindo e sendo consumido no módulo de Cardápio
    const cardapioHookPath = resolve("src/domains/finance/hooks/useProdutosCardapio.ts");
    const cardapioHookContent = readFileSync(cardapioHookPath, "utf8");
    expect(cardapioHookContent).toContain("produtos_cardapio");

    // 2. v_produtos_custo deve continuar sendo consumida pelo hook de Food Cost
    const foodCostHookPath = resolve("src/domains/finance/hooks/useFoodCost.ts");
    const foodCostHookContent = readFileSync(foodCostHookPath, "utf8");
    expect(foodCostHookContent).toContain("v_produtos_custo");

    // 3. itens_mercado deve continuar sendo consumido no domínio de despensa / mercado
    const mercadoHookPath = resolve("src/domains/market/hooks/useItensMercado.ts");
    const mercadoHookContent = readFileSync(mercadoHookPath, "utf8");
    expect(mercadoHookContent).toContain("itens_mercado");
  });

  it("Teste C: PDVPage isola cache estritamente por user.id real e respeita authLoading", () => {
    const pdvSource = readFileSync(resolve("src/pages/PDVPage.tsx"), "utf8");

    // Deve checar authLoading e !user?.id antes de ler/gravar ou sincronizar
    expect(pdvSource).toContain("if (authLoading || !user?.id) return;");
    expect(pdvSource).toContain("if (!user?.id) return;");

    // A função de chave deve requerer id do usuário
    expect(pdvSource).toContain("const getProductCacheKey = useCallback((uid: string) => {");
    expect(pdvSource).toContain("return `pdv_produtos_cache_${uid}`;");
  });

  it("Teste D: Zero ocorrências de 'pdv_produtos_cache_guest' em todo o repositório", () => {
    const allFiles = getAllSourceFiles(srcDir);
    const violations: string[] = [];

    for (const file of allFiles) {
      if (file.includes("product-frontend-identity.test.ts")) continue;
      const content = readFileSync(file, "utf8");
      if (content.includes("pdv_produtos_cache_guest")) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it("Teste E: Chave global antiga 'pdv_produtos_cache' é removida preventivamente", () => {
    const pdvSource = readFileSync(resolve("src/pages/PDVPage.tsx"), "utf8");

    expect(pdvSource).toContain('localStorage.removeItem("pdv_produtos_cache")');
    expect(pdvSource).not.toContain('localStorage.setItem("pdv_produtos_cache",');
    expect(pdvSource).not.toContain('localStorage.getItem("pdv_produtos_cache")');
  });

  it("Teste F: Nenhuma lista DEFAULT_PRODUCTS usada como catálogo no runtime", () => {
    const allFiles = getAllSourceFiles(srcDir);
    const defaultProductUsages: string[] = [];

    for (const file of allFiles) {
      if (file.includes("product-frontend-identity.test.ts")) continue;
      const content = readFileSync(file, "utf8");
      if (content.includes("DEFAULT_PRODUCTS")) {
        defaultProductUsages.push(file);
      }
    }

    expect(defaultProductUsages).toEqual([]);
  });

  it("Teste G: Falha sem cache resulta em catálogo vazio, sem produtos fictícios", () => {
    const pdvSource = readFileSync(resolve("src/pages/PDVPage.tsx"), "utf8");

    // Em caso de falha sem cache, setProducts deve receber []
    expect(pdvSource).toContain("setProducts([]);");
    expect(pdvSource).not.toContain("Salgado Assado");
    expect(pdvSource).not.toContain("Pão de Queijo");
    expect(pdvSource).not.toContain("Café Expresso");
  });

  it("Teste H: useFinancialContext desacopla itens de mercado de vendas do Eyemobile", () => {
    const finContextSource = readFileSync(resolve("src/domains/ia/hooks/useFinancialContext.ts"), "utf8");

    // Interface e agregação não devem misturar itens_mercado no nó eyemobile
    expect(finContextSource).not.toContain("produtosBaixoEstoque");
    expect(finContextSource).toContain("eyemobile: { vendasHoje, vendasMes }");
    expect(finContextSource).toContain("mercado: { itensBaixoEstoque:");

    // O texto consolidado deve expor a seção Mercado & Despensa
    expect(finContextSource).toContain("## 🛒 Mercado & Despensa");
    expect(finContextSource).toContain("baixo estoque na despensa");
  });

  it("Teste I: UploadInteligente não faz write de produto e possui feedback preciso", () => {
    const uploadSource = readFileSync(resolve("src/domains/ia/components/UploadInteligente.tsx"), "utf8");

    // Não deve conter qualquer chamada à tabela legada
    expect(uploadSource).not.toContain("eyemobile_produtos");

    // Deve exibir aviso factual e preciso de acordo com os Casos A e B
    expect(uploadSource).toContain("Despesa lançada com sucesso!");
    expect(uploadSource).toContain("Documento revisado");
    expect(uploadSource).toContain(
      "Estoque e custo são processados pelo fluxo canônico de NF."
    );
  });

  it("Teste J: productMatcher consome estritamente as fontes canônicas de produtos e equivalências", () => {
    const matcherSource = readFileSync(resolve("src/domains/finance/services/productMatcher.ts"), "utf8");

    expect(matcherSource).toContain("produtos_eyemobile");
    expect(matcherSource).toContain("produto_equivalencias");
    expect(matcherSource).not.toContain("eyemobile_produtos");
  });

  it("Teste K: LOGOUT — usuário A possui produtos -> logout (user=null) -> produtos em memória esvaziados", async () => {
    localStorage.setItem("pdv_is_caixa_aberto", "true");
    mockAuthState.user = { id: "user-alpha" };
    const alphaProducts = [
      { id: "alpha-1", name: "Produto Alpha 1", price: 10, category: "outros" }
    ];
    localStorage.setItem("pdv_produtos_cache_user-alpha", JSON.stringify(alphaProducts));

    const { rerender } = renderPDV();
    expect(screen.getByText("Produto Alpha 1")).toBeDefined();

    // Simula logout: user vira null
    await act(async () => {
      mockAuthState.user = null;
    });
    rerender(React.createElement(MemoryRouter, null, React.createElement(PDVPage)));

    // Catálogo em memória deve estar vazio
    expect(screen.queryByText("Produto Alpha 1")).toBeNull();
    expect(screen.getByText("Nenhum produto encontrado")).toBeDefined();
  });

  it("Teste L: USER SWITCH — troca de A para B limpa produtos de A imediatamente e carrega B", async () => {
    localStorage.setItem("pdv_is_caixa_aberto", "true");
    mockAuthState.user = { id: "user-alpha" };
    const alphaProducts = [
      { id: "alpha-1", name: "Produto Alpha 1", price: 10, category: "outros" }
    ];
    const betaProducts = [
      { id: "beta-1", name: "Produto Beta 1", price: 20, category: "outros" }
    ];
    localStorage.setItem("pdv_produtos_cache_user-alpha", JSON.stringify(alphaProducts));
    localStorage.setItem("pdv_produtos_cache_user-beta", JSON.stringify(betaProducts));

    const { rerender } = renderPDV();
    expect(screen.getByText("Produto Alpha 1")).toBeDefined();
    expect(screen.queryByText("Produto Beta 1")).toBeNull();

    // Troca para o usuário B
    await act(async () => {
      mockAuthState.user = { id: "user-beta" };
    });
    rerender(React.createElement(MemoryRouter, null, React.createElement(PDVPage)));

    // Nenhum produto de A permanece visível, e produto de B está em tela
    expect(screen.queryByText("Produto Alpha 1")).toBeNull();
    expect(screen.getByText("Produto Beta 1")).toBeDefined();
  });

  it("Teste M: STALE RESPONSE — resposta atrasada de fetch do usuário A não sobrescreve catálogo do usuário B", async () => {
    localStorage.setItem("pdv_is_caixa_aberto", "true");
    mockAuthState.user = { id: "user-alpha" };

    let resolveAlphaFetch!: (val: unknown) => void;
    let resolveBetaFetch!: (val: unknown) => void;

    mockInvoke.mockImplementation((_fnName: string, options?: { body?: { mode?: string } }) => {
      if (options?.body?.mode === "PRODUCTS") {
        if (mockAuthState.user?.id === "user-alpha") {
          return new Promise((res) => {
            resolveAlphaFetch = res;
          });
        } else if (mockAuthState.user?.id === "user-beta") {
          return new Promise((res) => {
            resolveBetaFetch = res;
          });
        }
      }
      return Promise.resolve({ data: { products: [] } });
    });

    const { rerender } = renderPDV();

    // Garante que o fetch de A foi iniciado e capturado
    await waitFor(() => {
      expect(typeof resolveAlphaFetch).toBe("function");
    });

    // A requisição do usuário A está em andamento. Agora troca para o usuário B:
    await act(async () => {
      mockAuthState.user = { id: "user-beta" };
    });
    rerender(React.createElement(MemoryRouter, null, React.createElement(PDVPage)));

    // Garante que o fetch de B foi iniciado e capturado
    await waitFor(() => {
      expect(typeof resolveBetaFetch).toBe("function");
    });

    // A resposta do usuário B chega primeiro:
    await act(async () => {
      resolveBetaFetch({
        data: {
          products: [
            { id: "beta-10", name: "Cerveja Beta Gelada", default_price: 15 }
          ]
        }
      });
    });

    expect(screen.getByText("Cerveja Beta Gelada")).toBeDefined();
    expect(screen.queryByText("Refrigerante Alpha Antigo")).toBeNull();

    // Agora a resposta antiga/atrasada do usuário A conclui por último:
    await act(async () => {
      resolveAlphaFetch({
        data: {
          products: [
            { id: "alpha-10", name: "Refrigerante Alpha Antigo", default_price: 8 }
          ]
        }
      });
    });

    // A resposta atrasada deve ser descartada: catálogo continua sendo o de B
    expect(screen.getByText("Cerveja Beta Gelada")).toBeDefined();
    expect(screen.queryByText("Refrigerante Alpha Antigo")).toBeNull();

    // O cache de B não deve ter sido contaminado pelos produtos de A
    const betaCache = localStorage.getItem("pdv_produtos_cache_user-beta");
    expect(betaCache).toContain("Cerveja Beta Gelada");
    expect(betaCache).not.toContain("Refrigerante Alpha Antigo");
  });

  it("Teste N: CACHE CORROMPIDO — cache JSON válido mas não Array é expurgado e não quebra catálogo", async () => {
    localStorage.setItem("pdv_is_caixa_aberto", "true");
    mockAuthState.user = { id: "user-corrupted" };
    // Salva JSON válido mas objeto e não Array
    localStorage.setItem(
      "pdv_produtos_cache_user-corrupted",
      JSON.stringify({ status: "error", message: "invalid catalog structure" })
    );

    mockInvoke.mockResolvedValueOnce({
      data: {
        products: [
          { id: "rec-1", name: "Produto Recuperado Pos-Corrupcao", default_price: 30 }
        ]
      }
    });

    renderPDV();

    // 1. Chave corrompida deve ter sido expurgada do localStorage
    expect(localStorage.getItem("pdv_produtos_cache_user-corrupted")).toBeNull();

    // 2. Não quebrou a aplicação e recuperou produtos via sincronização canônica
    await waitFor(() => {
      expect(screen.getByText("Produto Recuperado Pos-Corrupcao")).toBeDefined();
    });
  });

  it("Teste O: UPLOAD UX — UploadInteligente não possui controles ativos prometendo alteração de custo/estoque", () => {
    const uploadSource = readFileSync(resolve("src/domains/ia/components/UploadInteligente.tsx"), "utf8");

    // Checkboxes clicáveis 'Custo' e 'Estoque' foram removidos da interface
    expect(uploadSource).not.toContain("<span>Custo</span>");
    expect(uploadSource).not.toContain("<span>Estoque</span>");

    // Não inicializa itens com flags ativas de mutação
    expect(uploadSource).not.toContain("updateCusto: true");
    expect(uploadSource).not.toContain("addEstoque: true");

    // Não contém promessa legada de atualização de estoque e custo na descrição
    expect(uploadSource).not.toContain("atualizar seu estoque, custos e despesas instantaneamente");

    // Informação visual neutra orientando para o fluxo canônico
    expect(uploadSource).toContain("Estoque e custo são atualizados pelo fluxo canônico de NF.");
  });

  it("Teste P: NO-OP SUCCESS — com nfLancarDespesa=false, a interface não afirma falso sucesso de dados salvos", () => {
    const uploadSource = readFileSync(resolve("src/domains/ia/components/UploadInteligente.tsx"), "utf8");

    // Na confirmação de NF sem lançamento de despesa, mensagem é factual de revisão
    expect(uploadSource).toContain('nfLancarDespesa ? "Despesa lançada com sucesso!" : "Documento revisado"');
    expect(uploadSource).toContain(
      'Nenhuma alteração financeira foi realizada. Estoque e custo devem ser processados pelo fluxo canônico de NF.'
    );
    expect(uploadSource).toContain(
      'nfLancarDespesa ? "Confirmar e Lançar Despesa" : "Concluir Revisão"'
    );
  });
});
