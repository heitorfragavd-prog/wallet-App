// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

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

    // Deve exibir aviso preciso quando estoque foi desativado
    expect(uploadSource).toContain("Despesa lançada; estoque não atualizado");
    expect(uploadSource).toContain("Estoque e custo não atualizados");
    expect(uploadSource).toContain(
      "A atualização de estoque e custo foi desativada nesta tela legada. Utilize o fluxo canônico de processamento de NF."
    );
  });

  it("Teste J: productMatcher consome estritamente as fontes canônicas de produtos e equivalências", () => {
    const matcherSource = readFileSync(resolve("src/domains/finance/services/productMatcher.ts"), "utf8");

    expect(matcherSource).toContain("produtos_eyemobile");
    expect(matcherSource).toContain("produto_equivalencias");
    expect(matcherSource).not.toContain("eyemobile_produtos");
  });
});
