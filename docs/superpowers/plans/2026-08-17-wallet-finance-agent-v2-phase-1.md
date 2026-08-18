# Wallet Finance Agent V2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma fundação server-side funcional para consultas financeiras autenticadas e isoladas por workspace, com cálculos canônicos iniciais, auditoria e testes de segurança.

**Architecture:** Uma nova Edge Function `wallet-ai-query` autentica o JWT no Supabase Auth, valida que o usuário é proprietário do workspace e cria um contexto imutável. Ferramentas de consulta tipadas acessam um repositório que aplica simultaneamente `user_id` e `workspace_id`; agregações e deduplicação ficam em módulos puros testáveis. Esta fase não usa grupos nem executa escritas financeiras.

**Tech Stack:** TypeScript, Deno/Supabase Edge Functions, Supabase Auth/PostgreSQL, Zod, Vitest, React/Vite.

---

### Task 1: Registrar baseline e decisões de branch

**Files:**
- Create: `docs/ia/phase-1-baseline.md`

- [ ] **Step 1: Registrar branches comparadas**

Documentar HEAD, `develop`, `master`, `fix/correcoes-criticas-v1.0.45`, contagens de divergência e arquivos de IA alterados.

- [ ] **Step 2: Registrar baseline de qualidade**

Documentar os resultados exatos de `npm test`, `npm run lint`, `npx tsc -b --pretty false` e `npm run build`, distinguindo falhas de sandbox de falhas pré-existentes do projeto.

- [ ] **Step 3: Registrar riscos encontrados**

Incluir no mínimo: `assistente-financeiro` confia em `userId` do body; `useFinancialContext` inclui `workspace_id IS NULL`; agregação atual soma tabelas potencialmente espelhadas; configuração de lint já falha fora do escopo da IA.

### Task 2: Autenticação e autorização testáveis

**Files:**
- Create: `supabase/functions/_shared/ai/auth.ts`
- Create: `src/domains/ia/agent-core/auth.test.ts`

- [ ] **Step 1: Escrever testes que falham**

Cobrir ausência/malformação de Bearer token, token inválido, workspace inexistente, workspace de outro usuário e sucesso. A interface central será:

```ts
export interface AiExecutionContext {
  userId: string;
  workspaceId: string;
  accessToken: string;
}

export async function authorizeAiRequest(
  request: Request,
  workspaceId: string,
  dependencies: AuthorizationDependencies,
): Promise<AiExecutionContext>;
```

- [ ] **Step 2: Executar o teste e confirmar falha**

Run: `npm test -- src/domains/ia/agent-core/auth.test.ts`
Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar o mínimo seguro**

Extrair Bearer sem fallback, validar UUID, chamar `getUser(token)` e depois `findOwnedWorkspace(workspaceId, user.id)`. Não aceitar `user_id`, papel ou permissão fornecidos pelo cliente.

- [ ] **Step 4: Executar o teste e confirmar sucesso**

Run: `npm test -- src/domains/ia/agent-core/auth.test.ts`
Expected: todos os casos passam.

### Task 3: Camada financeira canônica inicial

**Files:**
- Create: `supabase/functions/_shared/ai/financial-types.ts`
- Create: `supabase/functions/_shared/ai/financial-core.ts`
- Create: `src/domains/ia/agent-core/financial-core.test.ts`

- [ ] **Step 1: Escrever testes de deduplicação e conceitos**

Os testes devem provar que registros com a mesma origem/chave não são somados duas vezes, transferência interna não entra em receita/despesa operacional, saldo não é chamado de lucro e fontes aparecem no resultado.

```ts
export interface CanonicalFinancialRecord {
  id: string;
  sourceType: "receita" | "despesa" | "transacao";
  sourceId: string;
  workspaceId: string;
  userId: string;
  kind: "income" | "expense" | "transfer";
  amount: number;
  occurredOn: string;
  deduplicationKey: string;
}
```

- [ ] **Step 2: Executar o teste e confirmar falha**

Run: `npm test -- src/domains/ia/agent-core/financial-core.test.ts`
Expected: FAIL porque os módulos ainda não existem.

- [ ] **Step 3: Implementar normalização, deduplicação e resumo**

Criar `deduplicateRecords(records)` e `buildFinancialSummary(records, balances, period)`. Rejeitar registros fora do contexto esperado em vez de filtrá-los silenciosamente.

- [ ] **Step 4: Executar o teste e confirmar sucesso**

Run: `npm test -- src/domains/ia/agent-core/financial-core.test.ts`
Expected: PASS.

### Task 4: Repositório e ferramentas prioritárias

**Files:**
- Create: `supabase/functions/_shared/ai/financial-repository.ts`
- Create: `supabase/functions/_shared/ai/query-tools.ts`
- Create: `src/domains/ia/agent-core/query-tools.test.ts`

- [ ] **Step 1: Escrever testes de escopo obrigatório**

Testar que todas as consultas recebem o contexto autenticado, aplicam `user_id` e `workspace_id`, nunca usam `workspace_id IS NULL` e rejeitam períodos inválidos.

- [ ] **Step 2: Executar o teste e confirmar falha**

Run: `npm test -- src/domains/ia/agent-core/query-tools.test.ts`
Expected: FAIL porque o catálogo ainda não existe.

- [ ] **Step 3: Implementar ferramentas iniciais**

Criar ferramentas `buscar_receitas`, `buscar_despesas`, `buscar_transacoes`, `consultar_saldos`, `consultar_dividas` e `consultar_resumo_mensal`. Cada saída inclui período, filtros, fontes, fórmula e avisos.

- [ ] **Step 4: Executar o teste e confirmar sucesso**

Run: `npm test -- src/domains/ia/agent-core/query-tools.test.ts`
Expected: PASS.

### Task 5: Endpoint seguro de consultas

**Files:**
- Create: `supabase/functions/wallet-ai-query/index.ts`
- Create: `supabase/functions/wallet-ai-query/handler.ts`
- Create: `src/domains/ia/agent-core/query-handler.test.ts`

- [ ] **Step 1: Escrever testes HTTP que falham**

Cobrir CORS, método inválido, body inválido, token inválido, workspace cruzado, ferramenta não permitida, consulta válida e erro sanitizado.

- [ ] **Step 2: Executar o teste e confirmar falha**

Run: `npm test -- src/domains/ia/agent-core/query-handler.test.ts`
Expected: FAIL porque o handler ainda não existe.

- [ ] **Step 3: Implementar handler com dependências injetáveis**

O handler aceitará apenas `{ workspace_id, tool, arguments }`, autorizará antes de construir o repositório e limitará o catálogo às seis ferramentas de leitura. O `index.ts` criará clientes Supabase e nunca registrará token ou payload financeiro.

- [ ] **Step 4: Executar o teste e confirmar sucesso**

Run: `npm test -- src/domains/ia/agent-core/query-handler.test.ts`
Expected: PASS.

### Task 6: Migration reversível de auditoria

**Files:**
- Create: `supabase/migrations/20260818010000_wallet_ai_phase1_security.sql`
- Create: `supabase/migrations/rollback/20260818010000_wallet_ai_phase1_security.down.sql`
- Create: `src/domains/ia/agent-core/migration-security.test.ts`

- [ ] **Step 1: Escrever teste estático da migration**

Exigir tabela `wallet_ai_audit_events`, RLS, FKs para usuário/workspace, ausência de payload sensível, índices de consulta e rollback que remove somente objetos desta migration.

- [ ] **Step 2: Executar teste e confirmar falha**

Run: `npm test -- src/domains/ia/agent-core/migration-security.test.ts`
Expected: FAIL porque as migrations ainda não existem.

- [ ] **Step 3: Implementar migration e rollback**

A tabela armazenará IDs, ferramenta, status, duração, código de erro, contagem de registros e timestamps; não armazenará prompt, token ou dados financeiros brutos. Usuários autenticados não terão acesso direto; gravação será server-side.

- [ ] **Step 4: Executar teste e confirmar sucesso**

Run: `npm test -- src/domains/ia/agent-core/migration-security.test.ts`
Expected: PASS.

### Task 7: Integração controlada e verificação

**Files:**
- Modify: `src/domains/ia/hooks/useFinancialContext.ts`
- Create: `src/domains/ia/services/WalletAiQueryClient.ts`
- Create: `src/domains/ia/services/WalletAiQueryClient.test.ts`
- Create: `docs/ia/phase-1-report.md`

- [ ] **Step 1: Testar cliente e remoção do fallback inseguro**

O cliente deve exigir workspace ativo e chamar somente `wallet-ai-query`. O contexto atual não poderá mais concatenar `workspace_id IS NULL` quando houver workspace ativo.

- [ ] **Step 2: Implementar o cliente e endurecer o contexto legado**

Usar `.eq("workspace_id", workspaceId)` em todas as tabelas que possuem workspace. Se não houver workspace, não consultar dados financeiros e retornar erro de contexto explícito.

- [ ] **Step 3: Executar verificação focada**

Run: `npm test -- src/domains/ia/agent-core src/domains/ia/services/WalletAiQueryClient.test.ts`
Expected: todos os testes novos passam.

- [ ] **Step 4: Executar verificação global**

Run: `npx tsc -b --pretty false`, `npm run lint`, `npm test`, `npm run build`.
Expected: registrar separadamente regressões da Fase 1 e falhas preexistentes do baseline.

- [ ] **Step 5: Produzir relatório e commit**

O relatório final listará arquivos, migrations, testes, resultados, pendências e riscos. O commit incluirá somente alterações concluídas e verificadas da Fase 1.
