# Comparativos Full Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Ritmo Diário e Histórico Mensal em um painel completo dentro de Relatórios, mantendo cálculos reais, isolamento por workspace, modos isolados e navegação persistida na URL.

**Architecture:** `ComparativosView` controla os três modos pela URL e compõe duas views independentes. Os hooks existentes continuam responsáveis por buscar dados; funções puras calculam resumos e estados visuais, permitindo TDD sem acoplar os testes ao Supabase ou ao Recharts.

**Tech Stack:** React 18, TypeScript, React Router 6, TanStack Query, Supabase, Recharts, Tailwind CSS, Vitest e Testing Library.

---

## File map

- Create `src/domains/finance/components/comparativos/comparativosNavigation.ts`: valida e atualiza `aba`/`visao` sem apagar outros parâmetros.
- Create `src/domains/finance/components/comparativos/comparativosNavigation.test.ts`: contrato de URL dos três modos.
- Create `src/domains/finance/components/comparativos/comparativoMetrics.ts`: resumos mensais, resultado, mês parcial e disponibilidade.
- Create `src/domains/finance/components/comparativos/comparativoMetrics.test.ts`: cálculos puros e casos negativos.
- Create `src/domains/finance/components/comparativos/ComparativoKpiCard.tsx`: card compartilhado com loading/erro/indisponível.
- Create `src/domains/finance/components/comparativos/ComparativoTooltip.tsx`: tooltip monetário compartilhado.
- Create `src/domains/finance/components/comparativos/ComparativoDiarioView.tsx`: UI diária extraída da página recuperada.
- Create `src/domains/finance/components/comparativos/ComparativoMensalView.tsx`: UI mensal baseada em `origin/develop`.
- Create `src/domains/finance/components/comparativos/ComparativosView.tsx`: painel completo e modos isolados.
- Create `src/domains/finance/components/comparativos/ComparativosView.test.tsx`: navegação, montagem e falhas parciais.
- Create `src/pages/Relatorios.test.tsx`: regressão de filtros/exportação/abas.
- Modify `src/domains/finance/hooks/useComparativoDiario.ts`: remover fallback global de workspace e tornar erro observável.
- Modify `src/domains/finance/hooks/useComparativoDiario.test.ts`: preservar datas e valores anteriores; cobrir workspace.
- Modify `src/domains/finance/hooks/useComparativoPeriodos.ts`: preservar soma mensal e aplicar isolamento estrito.
- Create `src/domains/finance/hooks/useComparativoPeriodos.test.ts`: valores, variações, períodos e workspace.
- Modify `src/pages/Relatorios.tsx`: aba URL-controlled e montagem do painel.
- Modify `src/pages/Comparativo.tsx`: redirecionamento legado sem consulta.
- Modify `src/App.tsx`: manter rota legada apontando ao redirecionamento leve.
- Modify `src/shared/components/layouts/DashboardLayout.tsx`: remover item separado e preservar destaque de Relatórios.

### Task 1: Contrato de navegação dos Comparativos

**Files:**
- Create: `src/domains/finance/components/comparativos/comparativosNavigation.ts`
- Test: `src/domains/finance/components/comparativos/comparativosNavigation.test.ts`

- [ ] **Step 1: Write the failing navigation tests**

```ts
import { describe, expect, it } from "vitest";
import { getComparativosLocation, parseComparativosView } from "./comparativosNavigation";

describe("comparativosNavigation", () => {
  it("usa a visão completa quando visao está ausente ou inválida", () => {
    expect(parseComparativosView(new URLSearchParams("aba=comparativos"))).toBe("completa");
    expect(parseComparativosView(new URLSearchParams("aba=comparativos&visao=x"))).toBe("completa");
  });

  it.each(["completa", "diaria", "mensal"] as const)("preserva a visão %s", (visao) => {
    expect(parseComparativosView(new URLSearchParams(`aba=comparativos&visao=${visao}`))).toBe(visao);
  });

  it("preserva parâmetros alheios ao atualizar aba e visão", () => {
    const next = getComparativosLocation(new URLSearchParams("foo=bar&aba=overview"), "mensal");
    expect(next.toString()).toBe("foo=bar&aba=comparativos&visao=mensal");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/domains/finance/components/comparativos/comparativosNavigation.test.ts`

Expected: FAIL because `comparativosNavigation.ts` does not exist.

- [ ] **Step 3: Implement the minimal URL contract**

```ts
export type ComparativosViewMode = "completa" | "diaria" | "mensal";

const VALID_VIEWS = new Set<ComparativosViewMode>(["completa", "diaria", "mensal"]);

export function parseComparativosView(params: URLSearchParams): ComparativosViewMode {
  const value = params.get("visao") as ComparativosViewMode | null;
  return value && VALID_VIEWS.has(value) ? value : "completa";
}

export function getComparativosLocation(
  current: URLSearchParams,
  view: ComparativosViewMode,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set("aba", "comparativos");
  next.set("visao", view);
  return next;
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run src/domains/finance/components/comparativos/comparativosNavigation.test.ts`

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/domains/finance/components/comparativos/comparativosNavigation.ts src/domains/finance/components/comparativos/comparativosNavigation.test.ts
git commit -m "test(relatorios): definir navegacao dos comparativos"
```

### Task 2: Métricas mensais e estados derivados

**Files:**
- Create: `src/domains/finance/components/comparativos/comparativoMetrics.ts`
- Test: `src/domains/finance/components/comparativos/comparativoMetrics.test.ts`

- [ ] **Step 1: Write failing tests for monthly results and summaries**

```ts
import { describe, expect, it } from "vitest";
import { buildMonthlyPresentation, summarizeMonthly } from "./comparativoMetrics";

const months = [
  { mes: "06/2026", receitas: 100, despesas: 60, saldo: 40, variacaoReceitas: 0, variacaoDespesas: 0 },
  { mes: "07/2026", receitas: 80, despesas: 120, saldo: -40, variacaoReceitas: -20, variacaoDespesas: 100 },
];

describe("comparativoMetrics", () => {
  it("define resultado exatamente como receitas menos despesas", () => {
    expect(buildMonthlyPresentation(months, new Date(2026, 6, 15))[1].resultado).toBe(-40);
  });

  it("marca somente o mês corrente como parcial", () => {
    const result = buildMonthlyPresentation(months, new Date(2026, 6, 15));
    expect(result.map((item) => item.parcial)).toEqual([false, true]);
  });

  it("calcula médias e melhor resultado usando os mesmos meses", () => {
    expect(summarizeMonthly(months)).toEqual({
      mediaReceitas: 90,
      mediaDespesas: 90,
      mediaResultado: 0,
      melhorResultado: 40,
      melhorMes: "06/2026",
    });
  });

  it("retorna nulls explícitos quando não há meses", () => {
    expect(summarizeMonthly([])).toEqual({
      mediaReceitas: null,
      mediaDespesas: null,
      mediaResultado: null,
      melhorResultado: null,
      melhorMes: null,
    });
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/domains/finance/components/comparativos/comparativoMetrics.test.ts`

Expected: FAIL because the metrics module does not exist.

- [ ] **Step 3: Implement pure metrics**

```ts
import type { ComparativoMes } from "@/domains/finance/hooks/useComparativoPeriodos";

export function buildMonthlyPresentation(data: ComparativoMes[], now = new Date()) {
  const current = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  return data.map((item) => ({
    ...item,
    resultado: item.receitas - item.despesas,
    parcial: item.mes === current,
  }));
}

export function summarizeMonthly(data: ComparativoMes[]) {
  if (data.length === 0) {
    return { mediaReceitas: null, mediaDespesas: null, mediaResultado: null, melhorResultado: null, melhorMes: null };
  }
  const presented = buildMonthlyPresentation(data);
  const divisor = data.length;
  const best = presented.reduce((a, b) => (b.resultado > a.resultado ? b : a));
  return {
    mediaReceitas: data.reduce((sum, item) => sum + item.receitas, 0) / divisor,
    mediaDespesas: data.reduce((sum, item) => sum + item.despesas, 0) / divisor,
    mediaResultado: presented.reduce((sum, item) => sum + item.resultado, 0) / divisor,
    melhorResultado: best.resultado,
    melhorMes: best.mes,
  };
}
```

- [ ] **Step 4: Run and verify GREEN**

Run: `npx vitest run src/domains/finance/components/comparativos/comparativoMetrics.test.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/domains/finance/components/comparativos/comparativoMetrics.ts src/domains/finance/components/comparativos/comparativoMetrics.test.ts
git commit -m "test(relatorios): definir metricas mensais comparativas"
```

### Task 3: Preservar consultas e isolar workspaces

**Files:**
- Modify: `src/domains/finance/hooks/useComparativoDiario.ts`
- Modify: `src/domains/finance/hooks/useComparativoDiario.test.ts`
- Modify: `src/domains/finance/hooks/useComparativoPeriodos.ts`
- Create: `src/domains/finance/hooks/useComparativoPeriodos.test.ts`

- [ ] **Step 1: Add failing assertions to the existing daily tests**

Adicionar um teste que monta o hook com workspace `empresa-a`, captura os builders Supabase e verifica que cada query recebe `.eq("workspace_id", "empresa-a")`, nunca `.or(...workspace_id.is.null)`. Manter os testes existentes de dia 12, fevereiro, bissexto, dia 31 e valores futuros nulos inalterados.

```ts
it("isola despesas no workspace empresarial sem fallback global", async () => {
  mockWorkspace("empresa-a");
  const { builders } = mockSupabaseQueries();
  renderHook(() => useComparativoDiario({ monthsCount: 3 }), { wrapper });
  await waitFor(() => expect(builders.every((builder) => builder.eq)).toBe(true));
  expect(builders.flatMap((builder) => builder.orCalls)).toEqual([]);
  expect(builders.flatMap((builder) => builder.eqCalls)).toContainEqual(["workspace_id", "empresa-a"]);
});
```

- [ ] **Step 2: Add failing monthly hook tests**

Cobrir 3/6/12 meses, ordenação cronológica, variações, saldo negativo e escopo estrito.

```ts
it.each([3, 6, 12])("consulta e devolve %i meses em ordem cronológica", async (count) => {
  mockMonthlyRows(count);
  const { result } = renderHook(() => useComparativoPeriodos(count), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(count);
  expect(result.current.data?.map((m) => m.mes)).toEqual(expectedChronologicalMonths(count));
});

it("mantém saldo negativo e variações contra o mês anterior", async () => {
  mockMonthlyTotals([{ receitas: 100, despesas: 60 }, { receitas: 80, despesas: 120 }]);
  const { result } = renderHook(() => useComparativoPeriodos(2), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.[1]).toMatchObject({ saldo: -40, variacaoReceitas: -20, variacaoDespesas: 100 });
});
```

- [ ] **Step 3: Run hook tests and verify RED**

Run: `npx vitest run src/domains/finance/hooks/useComparativoDiario.test.ts src/domains/finance/hooks/useComparativoPeriodos.test.ts`

Expected: workspace assertions FAIL because both hooks currently use `workspace_id.is.null`; monthly test file also lacks its test harness.

- [ ] **Step 4: Apply strict workspace filters and propagate query errors**

Em ambos os hooks, substituir o fallback empresarial por escopo explícito:

```ts
function applyWorkspaceFilter<T extends { eq: (column: string, value: string) => T }>(query: T, workspaceId: string | null): T {
  return workspaceId ? query.eq("workspace_id", workspaceId) : query;
}
```

Em `fetchAllQueryRows` e `fetchSomaValores`, lançar o erro retornado pelo Supabase em vez de interromper silenciosamente e retornar soma parcial:

```ts
if (error) throw new Error(error.message);
```

Não alterar as fórmulas de acumulado, média, saldo ou variação.

- [ ] **Step 5: Run hook tests and verify GREEN**

Run: `npx vitest run src/domains/finance/hooks/useComparativoDiario.test.ts src/domains/finance/hooks/useComparativoPeriodos.test.ts`

Expected: all daily and monthly hook tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/domains/finance/hooks/useComparativoDiario.ts src/domains/finance/hooks/useComparativoDiario.test.ts src/domains/finance/hooks/useComparativoPeriodos.ts src/domains/finance/hooks/useComparativoPeriodos.test.ts
git commit -m "fix(relatorios): isolar consultas dos comparativos por workspace"
```

### Task 4: Criar componentes compartilhados e as duas views

**Files:**
- Create: `src/domains/finance/components/comparativos/ComparativoKpiCard.tsx`
- Create: `src/domains/finance/components/comparativos/ComparativoTooltip.tsx`
- Create: `src/domains/finance/components/comparativos/ComparativoDiarioView.tsx`
- Create: `src/domains/finance/components/comparativos/ComparativoMensalView.tsx`
- Create: `src/domains/finance/components/comparativos/ComparativoViews.test.tsx`

- [ ] **Step 1: Write failing presentation tests**

Mockar somente os hooks de dados, não Recharts nem as funções de cálculo. Verificar textos e estados observáveis:

```tsx
it("distingue erro mensal de período sem movimentação", () => {
  mockUseComparativoPeriodos({ error: new Error("falha"), data: undefined, isLoading: false });
  render(<ComparativoMensalView />);
  expect(screen.getByText("Não foi possível carregar os dados mensais")).toBeInTheDocument();
  expect(screen.queryByText("Sem movimentação")).not.toBeInTheDocument();
});

it("exibe resultado, variações e mês parcial", () => {
  mockUseComparativoPeriodos({ data: monthlyFixture, error: null, isLoading: false });
  render(<ComparativoMensalView />);
  expect(screen.getByText(/Resultado do mês/)).toBeInTheDocument();
  expect(screen.getByText("Mês parcial")).toBeInTheDocument();
});

it("mantém dia selecionado e as quatro séries diárias", () => {
  mockUseComparativoDiario({ data: dailyFixture, error: null, isLoading: false });
  render(<ComparativoDiarioView />);
  expect(screen.getByText("Receita até Dia 12")).toBeInTheDocument();
  expect(screen.getByText("Receita Real (Mês Atual)")).toBeInTheDocument();
  expect(screen.getByText("Despesa Média")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/domains/finance/components/comparativos/ComparativoViews.test.tsx`

Expected: FAIL because the view components do not exist.

- [ ] **Step 3: Implement `ComparativoKpiCard` and `ComparativoTooltip`**

`ComparativoKpiCard` recebe `{ label, value, detail, tone, loading, unavailable }`; `unavailable` apresenta `Dados indisponíveis`, nunca zero. `ComparativoTooltip` recebe o payload do Recharts e usa `formatCurrency(Number(value))` para cada série presente.

- [ ] **Step 4: Extract the approved daily UI**

Mover a interface atual de `src/pages/Comparativo.tsx` para `ComparativoDiarioView.tsx`, removendo apenas `DashboardLayout` e o cabeçalho de página. Preservar seletores, cards, insight, quatro linhas e `ReferenceLine`. Aplicar a margem direita de `4e34793` para que `Dia 31` fique totalmente visível.

- [ ] **Step 5: Build the monthly view from `origin/develop`**

Usar `useComparativoPeriodos`, `buildMonthlyPresentation` e `summarizeMonthly`. Renderizar os quatro cards-resumo, `ComposedChart` com duas `Bar` e uma `Line`, tooltip compartilhado e cards mensais com receitas, despesas, resultado e variações.

- [ ] **Step 6: Run and verify GREEN**

Run: `npx vitest run src/domains/finance/components/comparativos/ComparativoViews.test.tsx src/domains/finance/components/comparativos/comparativoMetrics.test.ts`

Expected: all presentation and metrics tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/domains/finance/components/comparativos/ComparativoKpiCard.tsx src/domains/finance/components/comparativos/ComparativoTooltip.tsx src/domains/finance/components/comparativos/ComparativoDiarioView.tsx src/domains/finance/components/comparativos/ComparativoMensalView.tsx src/domains/finance/components/comparativos/ComparativoViews.test.tsx
git commit -m "feat(relatorios): criar visoes diaria e mensal comparativas"
```

### Task 5: Painel completo e falhas parciais

**Files:**
- Create: `src/domains/finance/components/comparativos/ComparativosView.tsx`
- Test: `src/domains/finance/components/comparativos/ComparativosView.test.tsx`

- [ ] **Step 1: Write failing panel tests**

```tsx
it("abre painel completo e monta as duas visões por padrão", () => {
  renderAt("/relatorios?aba=comparativos");
  expect(screen.getByRole("button", { name: "Painel completo" })).toHaveAttribute("data-state", "active");
  expect(screen.getByTestId("comparativo-diario")).toBeInTheDocument();
  expect(screen.getByTestId("comparativo-mensal")).toBeInTheDocument();
});

it.each([
  ["diaria", "comparativo-diario", "comparativo-mensal"],
  ["mensal", "comparativo-mensal", "comparativo-diario"],
] as const)("monta somente a visão %s", (mode, present, absent) => {
  renderAt(`/relatorios?aba=comparativos&visao=${mode}`);
  expect(screen.getByTestId(present)).toBeInTheDocument();
  expect(screen.queryByTestId(absent)).not.toBeInTheDocument();
});

it("mantém a visão mensal quando o diário falha", () => {
  renderAt("/relatorios?aba=comparativos&visao=completa", { dailyError: true });
  expect(screen.getByText("Não foi possível carregar os dados diários")).toBeInTheDocument();
  expect(screen.getByTestId("comparativo-mensal")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/domains/finance/components/comparativos/ComparativosView.test.tsx`

Expected: FAIL because `ComparativosView` does not exist.

- [ ] **Step 3: Implement the responsive panel**

Usar `useSearchParams`, `parseComparativosView` e `getComparativosLocation`. Renderizar os três botões de modo. Em `completa`, usar `grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4`; em modos isolados, renderizar apenas a view correspondente. Não criar hook que funda ou substitua os resultados originais.

- [ ] **Step 4: Run and verify GREEN**

Run: `npx vitest run src/domains/finance/components/comparativos/ComparativosView.test.tsx`

Expected: all panel tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/domains/finance/components/comparativos/ComparativosView.tsx src/domains/finance/components/comparativos/ComparativosView.test.tsx
git commit -m "feat(relatorios): adicionar painel completo de comparativos"
```

### Task 6: Integrar com Relatórios sem regressões

**Files:**
- Modify: `src/pages/Relatorios.tsx`
- Create: `src/pages/Relatorios.test.tsx`

- [ ] **Step 1: Write failing integration tests**

```tsx
it("abre Comparativos pela URL e oculta controles gerais", () => {
  renderRelatorios("/relatorios?aba=comparativos&visao=completa");
  expect(screen.getByRole("tab", { name: "Comparativos" })).toHaveAttribute("data-state", "active");
  expect(screen.queryByRole("button", { name: /Exportar Excel/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Período")).not.toBeInTheDocument();
  expect(screen.getByTestId("comparativos-view")).toBeInTheDocument();
});

it.each(["Visão Geral", "Categorias", "Transações", "Dívidas", "Metas", "Recorrentes"])(
  "restaura a aba %s sem quebrar seus controles",
  async (tab) => {
    renderRelatorios("/relatorios?aba=comparativos");
    await user.click(screen.getByRole("tab", { name: tab }));
    expect(screen.getByRole("button", { name: /Exportar Excel/ })).toBeInTheDocument();
    expect(screen.getByText("Período")).toBeInTheDocument();
  },
);
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/pages/Relatorios.test.tsx`

Expected: FAIL because Relatórios has no Comparativos tab and its tabs are not URL-controlled.

- [ ] **Step 3: Make the main tabs URL-controlled**

Adicionar `useSearchParams`; validar `aba` contra `overview | comparativos | categories | transactions | dividas | metas | recorrentes`; usar `overview` como fallback geral. Ao mudar a aba, atualizar somente `aba`; ao entrar em `comparativos`, normalizar `visao` para `completa` se necessário.

- [ ] **Step 4: Conditionally render general controls**

Calcular `const isComparativos = activeTab === "comparativos"`. Envolver header subtitle, exportações, FilterBar e os quatro cards gerais com `!isComparativos`. Manter o título `Relatórios` sempre visível. Inserir `TabsTrigger value="comparativos"` logo após Visão Geral e `TabsContent value="comparativos"><ComparativosView /></TabsContent>`.

- [ ] **Step 5: Run integration and existing tests**

Run: `npx vitest run src/pages/Relatorios.test.tsx src/domains/finance/components/comparativos/ComparativosView.test.tsx`

Expected: all integration and panel tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/pages/Relatorios.tsx src/pages/Relatorios.test.tsx
git commit -m "feat(relatorios): integrar painel de comparativos"
```

### Task 7: Rota legada e menu lateral

**Files:**
- Modify: `src/pages/Comparativo.tsx`
- Modify: `src/App.tsx`
- Modify: `src/shared/components/layouts/DashboardLayout.tsx`
- Create: `src/shared/components/layouts/DashboardLayout.test.tsx`

- [ ] **Step 1: Write failing route and menu tests**

```tsx
it("redireciona /comparativo para o painel completo", async () => {
  renderAppAt("/comparativo");
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/relatorios?aba=comparativos&visao=completa"));
});

it("remove o item Comparativo e mantém Relatórios", () => {
  renderDashboard();
  expect(screen.queryByRole("link", { name: "Comparativo" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Relatorios" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/shared/components/layouts/DashboardLayout.test.tsx`

Expected: FAIL because the separate menu link remains and `/comparativo` renders the daily page.

- [ ] **Step 3: Replace the legacy page with a redirect**

```tsx
import { Navigate } from "react-router-dom";

export default function Comparativo() {
  return <Navigate to="/relatorios?aba=comparativos&visao=completa" replace />;
}
```

Manter a lazy route de `App.tsx` apontando para esse módulo leve. Remover somente `{ icon: BarChart3, label: "Comparativo", path: "/comparativo" }` de `DashboardLayout.tsx`.

- [ ] **Step 4: Run and verify GREEN**

Run: `npx vitest run src/shared/components/layouts/DashboardLayout.test.tsx`

Expected: route and menu tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/pages/Comparativo.tsx src/App.tsx src/shared/components/layouts/DashboardLayout.tsx src/shared/components/layouts/DashboardLayout.test.tsx
git commit -m "feat(relatorios): redirecionar comparativo legado"
```

### Task 8: Verificação integral e validação visual

**Files:**
- Modify only files already listed if verification reveals a scoped defect.
- Capture screenshots outside Git-tracked source directories.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npx vitest run src/domains/finance/hooks/useComparativoDiario.test.ts src/domains/finance/hooks/useComparativoPeriodos.test.ts src/domains/finance/components/comparativos src/pages/Relatorios.test.tsx src/shared/components/layouts/DashboardLayout.test.tsx
```

Expected: all focused tests PASS without warnings.

- [ ] **Step 2: Run the complete verification suite**

```powershell
npx vitest run
npx tsc --noEmit
npm run build
git diff --check
```

Expected: tests PASS, TypeScript exits 0, Vite build exits 0, and `git diff --check` prints nothing.

- [ ] **Step 3: Start the development server and validate routes**

Open and verify:

```text
/relatorios?aba=comparativos&visao=completa
/relatorios?aba=comparativos&visao=diaria
/relatorios?aba=comparativos&visao=mensal
/comparativo
```

Expected: complete shows both live views; isolated modes show one; legacy route redirects to complete.

- [ ] **Step 4: Capture required screenshots**

Capture desktop and mobile screenshots of complete, daily and monthly modes, plus the sidebar without a Comparativo item. Check Dia 31, tooltips, negative result below zero, no horizontal scroll, aligned cards and real data.

- [ ] **Step 5: Audit Git scope before the final implementation commit**

```powershell
git status
git diff --stat
git diff --name-status origin/develop...HEAD
git diff --name-only origin/develop...HEAD | Select-String -Pattern "ImportarFatura|DRE|supabase/migrations"
```

Expected: the final command returns no matches; only spec, plan, comparativos, Relatórios, route, sidebar and related tests appear.

- [ ] **Step 6: Create the requested feature commit if uncommitted changes remain**

Stage only the exact scoped files shown by `git status`, never `git add -A`, then run:

```powershell
git commit -m "feat(relatorios): unificar comparativos diario e mensal"
```

- [ ] **Step 7: Record final evidence**

Report current branch, HEAD SHA, exact changed files, test count, TypeScript result, build result, screenshot paths, monthly parity confirmation, daily recovery confirmation and sidebar confirmation. Do not push, merge, deploy or run migrations.
