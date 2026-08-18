# Wallet Finance Agent V2 — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a Edge Function `wallet-ai-orchestrator` com o ciclo de orquestração server-side (OpenAI Responses / Tool Calling), catálogo de ferramentas de leitura tipadas da camada canônica, proteções anti-loop, limite de passos, auditoria e cliente frontend.

**Architecture:** A Edge Function `wallet-ai-orchestrator` recebe a mensagem e o workspace. Autentica no Supabase Auth, valida propriedade do workspace, monta o prompt do sistema com diretrizes determinísticas e executa o ciclo de Tool Calling (máx 5 iterações). As ferramentas são executadas via dispatcher tipado que injeta o `AiExecutionContext` validado no servidor. O resultado registra auditoria sanitizada e retorna a resposta com fontes, período, filtros e metadados de tokens/custo.

**Tech Stack:** TypeScript, Deno/Supabase Edge Functions, OpenAI API (Responses / Tool Calling), Supabase Auth/PostgreSQL, Zod, Vitest, React/Vite.

---

### Task 1: Catálogo de Ferramentas OpenAI e Dispatcher

**Files:**
- Create: `supabase/functions/_shared/ai/openai-tools-definition.ts`
- Create: `supabase/functions/_shared/ai/tool-dispatcher.ts`
- Create: `src/domains/ia/agent-core/tool-dispatcher.test.ts`

- [ ] **Step 1: Escrever testes unitários do dispatcher e schemas**
- [ ] **Step 2: Implementar schemas OpenAI para as 6 ferramentas de leitura**
- [ ] **Step 3: Implementar o dispatcher injetando `AiExecutionContext` e `FinancialRepository`**
- [ ] **Step 4: Executar testes com vitest e validar 100% de aprovação**

---

### Task 2: Core do Orquestrador e Proteções Anti-Loop

**Files:**
- Create: `supabase/functions/_shared/ai/orchestrator-core.ts`
- Create: `src/domains/ia/agent-core/orchestrator-core.test.ts`

- [ ] **Step 1: Escrever testes do ciclo do orquestrador (máx 5 passos, detecção de loop, injeção de sistema, formatação canônica)**
- [ ] **Step 2: Implementar `orchestrator-core.ts` com system prompt financeiro rigoroso e controle de iterações**
- [ ] **Step 3: Executar testes e garantir aprovação**

---

### Task 3: Adaptador OpenAI e Cálculo de Custos

**Files:**
- Create: `supabase/functions/_shared/ai/openai-adapter.ts`
- Create: `src/domains/ia/agent-core/openai-adapter.test.ts`

- [ ] **Step 1: Escrever testes para o adaptador OpenAI com simulação de tool calls e contagem de tokens/custos**
- [ ] **Step 2: Implementar adaptador com timeout, headers sanitizados e mapeamento de modelos permitidos**
- [ ] **Step 3: Executar testes e garantir aprovação**

---

### Task 4: Handler HTTP e Entrypoint da Edge Function

**Files:**
- Create: `supabase/functions/wallet-ai-orchestrator/handler.ts`
- Create: `supabase/functions/wallet-ai-orchestrator/index.ts`
- Create: `src/domains/ia/agent-core/orchestrator-handler.test.ts`

- [ ] **Step 1: Escrever testes HTTP cobrindo autenticação, CORS, tenant cruzado, ciclo com sucesso e auditoria**
- [ ] **Step 2: Implementar handler e entrypoint Deno**
- [ ] **Step 3: Executar testes e garantir aprovação**

---

### Task 5: Cliente Frontend do Orquestrador

**Files:**
- Create: `src/domains/ia/services/WalletAiOrchestratorClient.ts`
- Create: `src/domains/ia/services/WalletAiOrchestratorClient.test.ts`

- [ ] **Step 1: Escrever testes do cliente frontend**
- [ ] **Step 2: Implementar `WalletAiOrchestratorClient`**
- [ ] **Step 3: Executar testes e garantir aprovação**

---

### Task 6: Verificação Completa e Relatório da Fase 2

**Files:**
- Create: `docs/ia/phase-2-report.md`

- [ ] **Step 1: Executar todos os testes de `src/domains/ia/`**
- [ ] **Step 2: Gerar relatório da Fase 2 e registrar evidências**
