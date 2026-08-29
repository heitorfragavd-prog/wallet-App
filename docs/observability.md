# Observabilidade e Segurança Operacional — Wallet App

Este documento define a arquitetura, as convenções e as diretrizes de observabilidade, logging estruturado, rastreabilidade e tratamento de erros do Wallet App tanto no frontend quanto nas Supabase Edge Functions.

---

## 1. Arquitetura de Observabilidade (Frontend)

O frontend utiliza um pipeline centralizado e seguro de logs e erros composto por:

`
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
`

---

## 2. Níveis de Log

| Nível | Uso Recomendado | Produção |
| :--- | :--- | :---: |
| debug | Detalhes de diagnóstico em desenvolvimento local | Oculto |
| info | Eventos operacionais normais (início de sincronização, conexões bem-sucedidas) | Ativo |
| warn | Condições anômalas recuperáveis (retries, fallbacks locais, avisos de API) | Ativo |
| error | Falhas que interromperam ou impactaram uma operação de usuário | Ativo |

---

## 3. Campos Estruturados do Log (LogEntry)

Todo log emitido segue o padrão JSON estruturado com os seguintes campos:

- **	imestamp** *(ISO 8601)*: Momento exato da ocorrência (ex: 2026-08-28T12:00:00.000Z).
- **level**: debug | info | warn | error.
- **source**: Identificador do módulo/função emissora (ex: pluggyService, pluggy-api, openai-proxy).
- **operation** *(opcional)*: Ação específica executada (ex: getConnectToken, chat_completion).
- **correlation_id** *(opcional)*: Identificador único para rastreamento distribuído ponta a ponta.
- **error_code** *(opcional)*: Código de erro da aplicação (ex: ERR_NETW_..., BAD_REQUEST).
- **metadata** *(opcional)*: Objeto de metadados contextuais, obrigatoriamente sanitizado.

---

## 4. Correlation ID / Request ID

- Frontend: src/core/logging/correlationId.ts
- Backend: supabase/functions/_shared/observability/correlation.ts
- Utiliza crypto.randomUUID() para gerar UUIDs v4 seguros.
- Header HTTP padrão: X-Correlation-Id.
- **Regra**: Nunca utilize dados pessoais (e-mail, CPF, nome) na composição do Correlation ID.

---

## 5. Regras de Segurança e Sanitização (sanitizer.ts)

O pipeline de sanitização aplica proteção obrigatória e automática antes de qualquer emissão:

### 🚫 Informações Proibidas em Logs (REDACTED)
- Senhas e credenciais (password, senha, pwd)
- Tokens e chaves de acesso (	oken, ccess_token, efresh_token, jwt, Bearer)
- Chaves de API (pi_key, piKey, sk-..., secret, service_role)
- Dados de segurança de cartão (cvv, cvc, security_code)
- Cookies e cabeçalhos de autorização (Authorization, Cookie)

### 🛡️ Mascaramento de Dados Sensíveis (PII / Financeiro)
- **Cartões de crédito**: Substituídos por ****-****-****-1234
- **CPF**: Substituído por ***.123.***-**
- **CNPJ**: Substituído por **.123.***/****-**
- **E-mails**: Substituídos por u***@dominio.com

---

## 6. Observabilidade nas Supabase Edge Functions (Backend)

Localização dos módulos compartilhados: supabase/functions/_shared/observability/

### 6.1 Módulos Disponíveis
1. **logger.ts**: Instanciado via createBackendLogger('function-name'). Emite JSON com timestamp ISO, level, correlation_id e sanitização automática de metadados.
2. **sanitizer.ts**: Sanitizador recursivo para ambiente Deno com proteção anti-ciclo.
3. **correlation.ts**: Utilitário para extrair X-Correlation-Id de headers de requisição ou gerar novo UUID.
4. **errors.ts**: Função createErrorResponse(req, { status, message, correlationId, corsHeaders }) que padroniza erros no formato seguro.

### 6.2 Formato Padrão de Resposta de Erro HTTP
`json
{
  success: false,
  error: {
    code: BAD_REQUEST,
    message: Parâmetro obrigatório ausente.,
    correlation_id: c85d1c3a-928e-4a67-b5b4-f3c95973b4e1
  }
}
`

### 6.3 Mapeamento de Status HTTP
- 400: BAD_REQUEST (Parâmetros inválidos)
- 401: UNAUTHORIZED (JWT ausente ou expirado)
- 403: FORBIDDEN (Acesso negado ao workspace ou recurso)
- 404: NOT_FOUND (Recurso não encontrado)
- 409: CONFLICT (Item já registrado em outro contexto)
- 429: RATE_LIMIT_EXCEEDED (Limite de requisições do provedor excedido)
- 500: INTERNAL_SERVER_ERROR (Falha interna sem vazamento de internals)
- 502: BAD_GATEWAY (Falha ou resposta inválida de API externa)
- 503: SERVICE_UNAVAILABLE (Serviço externo indisponível)
- 504: GATEWAY_TIMEOUT (Timeout na conexão com provedor)

### 6.4 Gestão de Timeout e CORS
- **Timeouts**: Chamadas HTTP para APIs externas (OpenAI, Pluggy, Eyemobile, DiviPay) devem utilizar etchWithTimeout com AbortController e timeouts explícitos (15s a 45s).
- **CORS**: Headers Access-Control-Allow-Origin, Access-Control-Allow-Headers com inclusão de x-correlation-id. Funções com allowlist restrita (como pluggy-api) devem ser preservadas.

---

## 7. Error Boundary e React Query (Frontend)

- O ErrorBoundary ativo em src/shared/components/ErrorBoundary.tsx captura falhas de renderização da árvore React e exibe suporte amigável com código rastreável.
- O QueryClient em src/main.tsx está configurado com QueryCache e MutationCache interceptando falhas assíncronas para o errorService.

---

## 8. Status das Subetapas da Etapa 7

- [x] **7.1**: Base de observabilidade no frontend (Logger + Sanitização + Correlation ID + ErrorBoundary + React Query).
- [x] **7.2**: Módulos backend compartilhados (_shared/observability) e migração das funções críticas (pluggy-api, openai-proxy).
- [ ] **7.3**: Rastreamento ponta a ponta e correlation ID em integrações externas (Telegram, IA, Pluggy completo e falhas de APIs externas).
- [ ] **7.4**: Correção do workflow docker-publish.yml (tag hardcoded 1.0.3) e auditoria de secrets em CI.
- [ ] **7.5**: Catálogo de alertas operacionais e playbook de incidentes.
- [ ] **7.6**: Testes finais, auditoria e preparação do PR para develop.
