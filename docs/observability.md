# 🔭 Observabilidade e Segurança Operacional — Wallet App

Este documento define a arquitetura, as convenções e as diretrizes de observabilidade, logging estruturado, rastreabilidade e tratamento de erros do Wallet App.

---

## 1. Arquitetura de Observabilidade (Frontend)

O frontend utiliza um pipeline centralizado e seguro de logs e erros composto por:

```
[Componente / Hook / Service]
         │
         ├───▶ LoggerService (logger.debug / info / warn / error)
         │           │
         │           ▼
         │     sanitizer.ts (Redação de credenciais + Mascaramento PII)
         │           │
         │           ▼
         │     JSON estruturado no console + Listeners (Sentry / OTel futuro)
         │
         └───▶ ErrorService (errorService.handle)
                     │
                     ▼
         ErrorBoundary / React Query Cache / Toaster
```

---

## 2. Níveis de Log

| Nível | Uso Recomendado | Produção |
| :--- | :--- | :---: |
| `debug` | Detalhes de diagnóstico em desenvolvimento local | Oculto |
| `info` | Eventos operacionais normais (início de sincronização, conexões bem-sucedidas) | Ativo |
| `warn` | Condições anômalas recuperáveis (retries, fallbacks locais, avisos de API) | Ativo |
| `error` | Falhas que interromperam ou impactaram uma operação de usuário | Ativo |

---

## 3. Campos Estruturados do Log (`LogEntry`)

Todo log emitido pelo `LoggerService` ou pelos loggers de Edge Functions segue o padrão JSON estruturado com os seguintes campos:

- **`timestamp`** *(ISO 8601)*: Momento exato da ocorrência (ex: `2026-08-28T12:00:00.000Z`).
- **`level`**: `debug` | `info` | `warn` | `error`.
- **`component` / `source`**: Nome do módulo/serviço emissor (ex: `pluggyService`, `openai-proxy`, `ErrorService`).
- **`message`**: Descrição legível da operação.
- **`operation`** *(opcional)*: Ação específica executada (ex: `createPluggyConnectToken`, `chat_completion`).
- **`correlationId`** *(opcional)*: Identificador único da transação/requisição para rastreamento ponta a ponta (`X-Correlation-Id`).
- **`errorCode`** *(opcional)*: Código de erro da aplicação (ex: `OPENAI_TIMEOUT`, `PLUGGY_UPSTREAM_ERROR`).
- **`workspaceId`** *(opcional)*: Identificador do workspace ativo (sem expor credenciais).
- **`duration_ms`** *(opcional)*: Duração em milissegundos de operações externas.
- **`metadata`** *(opcional)*: Objeto de metadados contextuais, obrigatoriamente sanitizado.

---

## 4. Correlation ID / Distributed Tracing

- Utilitário Frontend: `src/core/logging/correlationId.ts`
- Utilitário Backend: `supabase/functions/_shared/observability/correlation.ts`
- Utiliza `crypto.randomUUID()` para gerar identificadores únicos formatados como UUID v4.
- **Header Padrão**: `X-Correlation-Id`.
- **Regra de Privacidade**: Nunca utilize dados pessoais (e-mail, CPF, nome) na composição do Correlation ID.

---

## 5. Regras de Segurança e Sanitização (`sanitizer.ts`)

O pipeline de sanitização aplica proteção obrigatória e automática antes de qualquer emissão de logs ou respostas de erro:

### 🚫 Informações Proibidas em Logs (REDACTED)
- Senhas e credenciais (`password`, `senha`, `pwd`)
- Tokens e chaves de acesso (`token`, `access_token`, `refresh_token`, `jwt`, `Bearer`)
- Chaves de API (`api_key`, `apiKey`, `sk-...`, `secret`, `service_role`, `openaiApiKey`, `clientSecret`)
- Dados de segurança de cartão (`cvv`, `cvc`, `security_code`)
- Prompts completos e respostas completas de IA contendo dados sensíveis
- Imagens em Base64, PDFs e DANFEs completos

### 🛡️ Mascaramento de Dados Sensíveis (PII / Financeiro)
- **Cartões de crédito**: Substituídos por `****-****-****-****`
- **CPF**: Substituído por `***.***.***-**`
- **CNPJ**: Substituído por `**.***.***/****-**`
- **E-mails**: Substituídos por `ab***@dominio.com`

---

## 6. Integrações de Observabilidade (Status por Domínio)

### 6.1. Pluggy Open Finance (`pluggyService` & `pluggy-api`) — IMPLEMENTADO (7.3A)
- **Rastreamento Ponta a Ponta**: Frontend → Edge Function via `X-Correlation-Id`.
- **Chamadas Upstream**: Rastreamento interno com `duration_ms` e status HTTP sem injetar headers não documentados na API da Pluggy.
- **Códigos de Erro**:
  - `PLUGGY_TIMEOUT` (HTTP 504)
  - `PLUGGY_UPSTREAM_ERROR` (HTTP 502)
  - `PLUGGY_AUTH_ERROR` (HTTP 401)
  - `PLUGGY_FORBIDDEN` (HTTP 403)

### 6.2. OpenAI Proxy (`openai-proxy`) — IMPLEMENTADO (7.3B)
- **Rastreamento**: `X-Correlation-Id` propagado em todas as chamadas e retornado nas respostas HTTP.
- **Métricas de Latência**: Medição de `duration_ms` com `performance.now()` e timeout de 45s.
- **Telemetria Segura**: Registro de `model`, `duration_ms`, `tokens_prompt`, `tokens_completion`, `tokens_total` sem expor prompts ou respostas completas.
- **Códigos de Erro**:
  - `OPENAI_TIMEOUT` (HTTP 504)
  - `OPENAI_UPSTREAM_ERROR` (HTTP 502)
  - `OPENAI_RATE_LIMIT` (HTTP 429)
  - `OPENAI_AUTH_ERROR` (HTTP 401)

### 6.3. Gemini / DANFE Vision — ADIADO (7.3B)
- **Status**: *Adiado para integração após merge da branch paralela de IA (`feat/ia-agente-financeiro-v2`).*
- **Motivo**: As chamadas Gemini estão acopladas à lógica de extração do pipeline DANFE (`_shared/danfe-gemini-v2.ts`), que está sob desenvolvimento ativo na branch paralela.

### 6.4. Telegram Webhook (`telegram-webhook`) — ADIADO (7.3B)
- **Status**: *Adiado para integração após merge da branch paralela de IA (`feat/ia-agente-financeiro-v2`).*
- **Motivo**: Forte divergência (3.045 linhas alteradas na branch paralela, incluindo refatoração de comandos e saldo bancário).

### 6.5. Assistente Financeiro / Wallet AI Orchestrator — ADIADO (7.3B)
- **Status**: *Adiado para integração após merge da branch paralela de IA.*
- **Motivo**: Dependências ativas em `wallet-ai-query/supabase-adapter.ts` e `financial-repository.ts`.

---

## 7. Roadmap da Etapa 7

- [x] **7.1**: Base de observabilidade no frontend (Logger + Sanitização + Correlation ID + ErrorBoundary + React Query).
- [x] **7.2**: Padronização de logs estruturados e shared observability nas Edge Functions (`_shared/observability`).
- [x] **7.3A**: Rastreamento ponta a ponta e correlation ID no fluxo Pluggy Open Finance.
- [x] **7.3B**: Observabilidade no gateway OpenAI Proxy e isolamento de dependências com a branch IA.
- [ ] **7.4**: GitHub Actions, secrets e correção da tag Docker `1.0.3` hardcoded em `.github/workflows/docker-publish.yml`.
- [ ] **7.5**: Catálogo de alertas operacionais (Crítico, Alto, Médio) e incident playbook.
- [ ] **7.6**: Testes finais, auditoria e preparação do PR para `develop`.
