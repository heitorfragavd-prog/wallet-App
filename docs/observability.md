# ðŸ”­ Observabilidade e SeguranÃ§a Operacional â€” Wallet App

Este documento define a arquitetura, as convenÃ§Ãµes e as diretrizes de observabilidade, logging estruturado, rastreabilidade e tratamento de erros do Wallet App.

---

## 1. Arquitetura de Observabilidade (Frontend)

O frontend utiliza um pipeline centralizado e seguro de logs e erros composto por:

```
[Componente / Hook / Service]
         â”‚
         â”œâ”€â”€â”€â–¶ LoggerService (logger.debug / info / warn / error)
         â”‚           â”‚
         â”‚           â–¼
         â”‚     sanitizer.ts (RedaÃ§Ã£o de credenciais + Mascaramento PII)
         â”‚           â”‚
         â”‚           â–¼
         â”‚     JSON estruturado no console + Listeners (Sentry / OTel futuro)
         â”‚
         â””â”€â”€â”€â–¶ ErrorService (errorService.handle)
                     â”‚
                     â–¼
         ErrorBoundary / React Query Cache / Toaster
```

---

## 2. NÃ­veis de Log

| NÃ­vel | Uso Recomendado | ProduÃ§Ã£o |
| :--- | :--- | :---: |
| `debug` | Detalhes de diagnÃ³stico em desenvolvimento local | Oculto |
| `info` | Eventos operacionais normais (inÃ­cio de sincronizaÃ§Ã£o, conexÃµes bem-sucedidas) | Ativo |
| `warn` | CondiÃ§Ãµes anÃ´malas recuperÃ¡veis (retries, fallbacks locais, avisos de API) | Ativo |
| `error` | Falhas que interromperam ou impactaram uma operaÃ§Ã£o de usuÃ¡rio | Ativo |

---

## 3. Campos Estruturados do Log (`LogEntry`)

Todo log emitido pelo `LoggerService` segue o padrÃ£o JSON estruturado com os seguintes campos:

- **`timestamp`** *(ISO 8601)*: Momento exato da ocorrÃªncia (ex: `2026-08-28T12:00:00.000Z`).
- **`level`**: `debug` \| `info` \| `warn` \| `error`.
- **`component`**: Nome do mÃ³dulo/serviÃ§o emissor (ex: `pluggyService`, `ErrorService`).
- **`message`**: DescriÃ§Ã£o legÃ­vel da operaÃ§Ã£o.
- **`source`** *(opcional)*: Origem de alto nÃ­vel (`frontend`, `react-query`, `pluggy`, `auth`, `error-boundary`).
- **`operation`** *(opcional)*: AÃ§Ã£o especÃ­fica executada (ex: `getConnectToken`, `extrairPDF`).
- **`correlationId`** *(opcional)*: Identificador Ãºnico da transaÃ§Ã£o/requisiÃ§Ã£o para rastreamento ponta a ponta.
- **`errorCode`** *(opcional)*: CÃ³digo de erro da aplicaÃ§Ã£o (ex: `ERR_NETW_...`).
- **`workspaceId`** *(opcional)*: Identificador do workspace ativo (sem expor credenciais).
- **`data`** *(opcional)*: Objeto de metadados contextuais, obrigatoriamente sanitizado.

---

## 4. Correlation ID / Request ID

- UtilitÃ¡rio: `src/core/logging/correlationId.ts`
- Utiliza `crypto.randomUUID()` (ou fallback seguro) para gerar identificadores Ãºnicos.
- **Regra**: Nunca utilize dados pessoais (e-mail, CPF, nome) na composiÃ§Ã£o do Correlation ID.

Exemplo de uso:
```ts
import { ensureCorrelationId } from "@/core/logging/correlationId";
import { logger } from "@/core/logging/LoggerService";

const correlationId = ensureCorrelationId(existingCorrelationId);
logger.info("ImportacaoService", "Iniciando importaÃ§Ã£o de extrato", {
  operation: "import_statement",
  correlationId,
});
```

---

## 5. Regras de SeguranÃ§a e SanitizaÃ§Ã£o (`sanitizer.ts`)

O pipeline de sanitizaÃ§Ã£o do `LoggerService` aplica proteÃ§Ã£o obrigatÃ³ria e automÃ¡tica antes de qualquer emissÃ£o:

### ðŸš« InformaÃ§Ãµes Proibidas em Logs (REDACTED)
- Senhas e credenciais (`password`, `senha`, `pwd`)
- Tokens e chaves de acesso (`token`, `access_token`, `refresh_token`, `jwt`, `Bearer`)
- Chaves de API (`api_key`, `apiKey`, `sk-...`, `secret`, `service_role`)
- Dados de seguranÃ§a de cartÃ£o (`cvv`, `cvc`, `security_code`)
- Cookies e cabeÃ§alhos de autorizaÃ§Ã£o

### ðŸ›¡ï¸ Mascaramento de Dados SensÃ­veis (PII / Financeiro)
- **CartÃµes de crÃ©dito**: SubstituÃ­dos por `****-****-****-****`
- **CPF**: SubstituÃ­do por `***.***.***-**`
- **CNPJ**: SubstituÃ­do por `**.***.***/****-**`
- **E-mails**: SubstituÃ­dos por `ab***@dominio.com`

---

## 6. Error Boundary e Tratamento de Erros

- O `ErrorBoundary` ativo em `src/shared/components/ErrorBoundary.tsx` captura falhas de renderizaÃ§Ã£o da Ã¡rvore React.
- Gera automaticamente um cÃ³digo de suporte rastreÃ¡vel (`ERR_...`) exibido ao usuÃ¡rio.
- NÃ£o expÃµe stack trace ou detalhes de infraestrutura em ambiente de produÃ§Ã£o.
- Oferece aÃ§Ãµes de `Voltar` e `Tentar novamente` / reload seguro.

---

## 7. React Query Global Error Handling

- O `QueryClient` em `src/main.tsx` estÃ¡ configurado com `QueryCache` e `MutationCache`.
- Falhas assÃ­ncronas em queries e mutations sÃ£o capturadas e encaminhadas ao `errorService.handle(...)` com `source: 'react-query'`, sem duplicar toasts ou quebrar handlers especÃ­ficos dos componentes.

---

## 8. PendÃªncias e PrÃ³ximos Passos (Subetapas da Etapa 7)

- [x] **7.1**: Base de observabilidade no frontend (Logger + SanitizaÃ§Ã£o + Correlation ID + ErrorBoundary + React Query).
- [ ] **7.2**: PadronizaÃ§Ã£o de logs estruturados e tratamento nas 31 Edge Functions do Supabase.
- [ ] **7.3**: Rastreamento ponta a ponta e correlation ID em integraÃ§Ãµes externas (Pluggy, Telegram, OpenAI/Gemini, Webhooks).
- [ ] **7.4**: CorreÃ§Ã£o do workflow `docker-publish.yml` (tag hardcoded `1.0.3`) e auditoria de secrets em CI.
- [ ] **7.5**: CatÃ¡logo de alertas operacionais (CrÃ­tico, Alto, MÃ©dio) e playbook de incidentes.
- [ ] **7.6**: Testes finais, auditoria e preparaÃ§Ã£o do PR para `develop`.
