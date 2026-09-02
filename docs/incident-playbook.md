# 🚨 Incident Playbook & Catálogo de Alertas Operacionais — Wallet App

Este documento estabelece o catálogo oficial de alertas operacionais, a classificação de severidade e os procedimentos padrão de resposta a incidentes (Playbooks) do **Wallet App**, utilizando a infraestrutura de observabilidade implementada na **Etapa 7**.

---

## 1. Classificação de Severidade (SEV1 – SEV4)

| Nível | Nomenclatura | Definição | Exemplos Reais no Wallet App | Tempo Alvo de Resposta / Mitigação |
| :---: | :--- | :--- | :--- | :---: |
| **SEV1** | **CRÍTICO** | Sistema totalmente indisponível, corrupção de dados financeiros, falha generalizada de autenticação ou risco iminente de segurança/vazamento. | • Falha generalizada de login ou corrupção na tabela `transacoes`/`contas_usuario`.<br>• Supabase Database inacessível (HTTP 500 em cascata em todas as rotas).<br>• Vazamento ou exposição de chaves privadas (`service_role`, `openaiApiKey`). | Resposta: **15 min**<br>Mitigação: **1 hora** |
| **SEV2** | **ALTO** | Funcionalidade crítica ou integração primária degradada/indisponível para múltiplos usuários, sem contorno viável. | • `PLUGGY_AUTH_ERROR` ou `PLUGGY_TIMEOUT` generalizado bloqueando sincronização de múltiplos usuários.<br>• `OPENAI_RATE_LIMIT` ou `OPENAI_UPSTREAM_ERROR` persistente tornando o assistente/chat inoperante.<br>• Falha no pipeline de CI/CD bloqueando deploy de hotfix crítico em `master`. | Resposta: **30 min**<br>Mitigação: **4 horas** |
| **SEV3** | **MÉDIO** | Falha parcial recuperável, degradação pontual em fluxo secundário ou erro isolado com contorno imediato. | • `PLUGGY_TIMEOUT` ou erro de sincronização bancária isolado em uma conta específica.<br>• Falha temporária na transcrição de áudio Whisper ou timeout esporádico de IA com retry.<br>• Falha de build em branch de feature secundária (sem impactar `develop` ou `master`). | Resposta: **2 horas**<br>Mitigação: **24 horas** |
| **SEV4** | **BAIXO** | Ruído operacional, warnings, pequenos problemas cosméticos ou anomalias sem impacto direto na jornada do usuário. | • Aumento transitório de warnings de lint ou warnings não críticos em logs do console.<br>• Latência ligeiramente elevada em consultas de métricas sem timeout.<br>• Falha em webhook de serviço desativado. | Resposta: **1 dia útil**<br>Mitigação: **Próxima sprint** |

---

## 2. Fluxo Padrão de Resolução de Incidentes

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────────┐
│ 1. Identificação │ ──▶ │ 2. Classificação │ ──▶ │ 3. Coleta de Evidência│
└─────────────────┘     └──────────────────┘     └───────────────────────┘
                                                             │
┌─────────────────┐     ┌──────────────────┐     ┌───────────▼───────────┐
│ 6. Recuperação  │ ◀── │  5. Mitigação    │ ◀── │     4. Isolamento     │
└─────────────────┘     └──────────────────┘     └───────────────────────┘
         │
┌────────▼────────┐     ┌──────────────────┐     ┌───────────────────────┐
│  7. Validação   │ ──▶ │  8. Encerramento │ ──▶ │     9. Post-Mortem    │
└─────────────────┘     └──────────────────┘     └───────────────────────┘
```

1. **Identificação**: Detecção do problema via relato de usuário, código de suporte (`ERR_...`), falha de CI/CD ou inspeção de logs.
2. **Classificação (SEV)**: Determinar o impacto no usuário e definir a severidade conforme a matriz de severidade.
3. **Coleta de Evidência**: Obter o `correlation_id` e extrair o histórico completo da requisição nos logs estruturados.
4. **Isolamento**: Conter a propagação do incidente (desabilitar temporariamente features degradadas, revogar credenciais comprometidas, etc.).
5. **Mitigação**: Restaurar a operação normal ou aplicar fallback/hotfix de contorno.
6. **Recuperação**: Reestabelecer a integridade de dados e serviços dependentes.
7. **Validação**: Executar testes e monitorar logs estruturados para confirmar normalização do tráfego.
8. **Encerramento**: Notificar partes interessadas e registrar término formal do incidente.
9. **Post-Mortem**: Documentar causa-raiz, ações tomadas e melhorias preventivas no projeto.

---

## 3. Guia de Troubleshooting com Correlation ID

O **Correlation ID** (`X-Correlation-Id`) permite rastrear uma operação de ponta a ponta sem expor nenhum dado pessoal do usuário.

### Passo a Passo de Diagnóstico:

1. **Obter o Identificador**:
   - Solicitar ao usuário o código de suporte exibido no `ErrorBoundary` (ex: `ERR_REACT_...`) ou capturar o `correlationId` informado na notificação/toast de erro.
2. **Localizar Log no Frontend**:
   - Filtrar no console do cliente ou nas ferramentas de desenvolvedor por `correlationId: "a1b2c3d4-..."`.
   - Verificar `source`, `component`, `operation` e metadados contextuais sanitizados.
3. **Localizar Log da Edge Function no Supabase**:
   - No painel do Supabase, acessar **Edge Functions** ➔ Selecionar a função (ex: `pluggy-api`, `openai-proxy`) ➔ **Logs**.
   - Buscar pelo termo do `correlation_id`.
4. **Localizar Chamada Upstream / Externa**:
   - Identificar no log da Edge Function o evento correspondente à chamada externa (ex: `Chamada externa Pluggy concluída` ou `Chamada externa OpenAI concluída`).
5. **Comparar Timestamps e Latência**:
   - Verificar `timestamp` (ISO 8601) e avaliar se `duration_ms` ultrapassou o timeout do cliente (ex: > 30000ms).
6. **Identificar o `errorCode` Padronizado**:
   - Checar se o erro foi classificado como `PLUGGY_TIMEOUT`, `PLUGGY_UPSTREAM_ERROR`, `OPENAI_RATE_LIMIT`, `OPENAI_AUTH_ERROR`, etc.
7. **Determinar a Camada Raiz da Falha**:
   - Se o status upstream for `429`: Limite de cota no provedor externo.
   - Se o status for `504` ou `duration_ms >= timeout`: Degradação de rede ou lentidão no parceiro.
   - Se o erro ocorrer antes do fetch externo: Falha de autenticação JWT, workspace ou payload inválido.

#### Exemplo de Tracing Seguro (Sem PII):
```json
{
  "timestamp": "2026-09-02T10:15:30.120Z",
  "level": "error",
  "component": "openai-proxy",
  "message": "Falha na chamada externa OpenAI",
  "operation": "chat_completion",
  "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "errorCode": "OPENAI_RATE_LIMIT",
  "metadata": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "duration_ms": 340,
    "status": 429
  }
}
```

---

## 4. Playbook Especializado: Pluggy Open Finance

### 4.1. `PLUGGY_TIMEOUT`
- **Sintomas**: Usuário aguarda sincronização bancária e recebe mensagem de tempo limite esgotado.
- **Evidência Necessária**: Log com `component: "pluggy-api"`, `errorCode: "PLUGGY_TIMEOUT"`, `duration_ms >= 30000`.
- **Impacto**: Falha na importação de contas/transações recentes (SEV3 se isolado; SEV2 se generalizado).
- **Diagnóstico**: Verificar status operacional da API da Pluggy (`status.pluggy.ai`) e latência da instituição financeira conectada.
- **Ação Imediata**: Orientar usuário a aguardar alguns minutos; não forçar sincronizações em loop.
- **Escalonamento**: Se mais de 5 usuários apresentarem timeout no mesmo banco em menos de 15 minutos, classificar como SEV2 e acionar suporte da Pluggy.
- **Validação de Recuperação**: Executar nova sincronização pontual e confirmar resposta HTTP 200 com `duration_ms < 10000`.

### 4.2. `PLUGGY_UPSTREAM_ERROR`
- **Sintomas**: Erro 502 / falha de comunicação retornada pelo banco de origem via Pluggy.
- **Evidência Necessária**: Log com `errorCode: "PLUGGY_UPSTREAM_ERROR"`, `status: 502` ou status upstream `5xx`.
- **Diagnóstico**: Instabilidade momentânea no Open Finance da instituição bancária de destino.
- **Ação Imediata**: Preservar os dados existentes no Wallet App. **NUNCA apagar conexões ou contas do usuário**.
- **Validação**: Aguardar retorno da estabilidade do banco e efetuar trigger de sync.

### 4.3. `PLUGGY_AUTH_ERROR`
- **Sintomas**: Erro 401 retornado pela Pluggy ou token de consentimento expirado.
- **Evidência Necessária**: Log com `errorCode: "PLUGGY_AUTH_ERROR"`, `status: 401`.
- **Diagnóstico**: `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` incorretos no Supabase Secrets, ou consentimento do usuário expirado no banco (renovação necessária após 365 dias).
- **Ação Imediata**:
  - Se generalizado (todos os usuários): Checar segredos no Supabase Vault.
  - Se isolado em 1 conexão: Notificar o usuário para reconectar a conta bancária via Pluggy Connect Widget.

### 4.4. `PLUGGY_FORBIDDEN`
- **Sintomas**: Erro 403 ao tentar sincronizar item ou conta bancária.
- **Evidência Necessária**: Log com `errorCode: "PLUGGY_FORBIDDEN"`, `status: 403`.
- **Diagnóstico**: Usuário tentou acessar item de outro workspace ou token JWT sem permissão em `tem_acesso_workspace`.
- **Ação Imediata**: Validar integridade do vínculo `workspace_id` e permissões do usuário logado.

---

## 5. Playbook Especializado: OpenAI Proxy & Gateway de IA

### 5.1. `OPENAI_RATE_LIMIT`
- **Sintomas**: Mensagem de "Limite de requisições atingido. Tente novamente em instantes." no chat/assistente.
- **Evidência Necessária**: Log com `component: "openai-proxy"`, `errorCode: "OPENAI_RATE_LIMIT"`, `status: 429`.
- **Impacto**: SEV2 se indisponibilizar a IA para todos; SEV3 se for quota individual do usuário.
- **Diagnóstico**: Verificar se a chave utilizada é a global da plataforma ou a chave própria cadastrada pelo usuário em `ia_configuracoes`.
- **Ação Imediata**:
  - Se for chave da plataforma: Verificar saldo e limites no painel da OpenAI (`platform.openai.com`).
  - Se for chave do usuário: Informar no toast que o limite da chave pessoal OpenAI foi excedido.
- **Validação**: Executar prompt de teste no assistente e confirmar resposta `execution_status: "success"` no `wallet_ai_audit_events`.

### 5.2. `OPENAI_TIMEOUT`
- **Sintomas**: Assistente financeiro demora mais de 30/45 segundos e falha com HTTP 504.
- **Evidência Necessária**: Log com `errorCode: "OPENAI_TIMEOUT"`, `duration_ms >= 30000`.
- **Diagnóstico**: Lentidão em modelos maiores (`gpt-4o`) ou volume massivo de tools executadas na mesma iteração.
- **Ação Imediata**: O proxy executa fallback automático para `gpt-4o-mini` quando aplicável. Verificar status da OpenAI (`status.openai.com`).

### 5.3. `OPENAI_UPSTREAM_ERROR`
- **Sintomas**: HTTP 502 retornado pelo proxy ao chamar completions.
- **Evidência Necessária**: Log com `errorCode: "OPENAI_UPSTREAM_ERROR"`.
- **Diagnóstico**: Indisponibilidade de infraestrutura nos datacenters da OpenAI.
- **Ação Imediata**: Aguardar restabelecimento pelo provedor e monitorar `wallet_ai_audit_events`.

### 5.4. `OPENAI_AUTH_ERROR`
- **Sintomas**: HTTP 401 informando chave de API ausente ou inválida.
- **Evidência Necessária**: Log com `errorCode: "OPENAI_AUTH_ERROR"`, `status: 401`.
- **Diagnóstico**: Chave OpenAI revogada, saldo zerado ou segredo `OPENAI_API_KEY` ausente no ambiente.
- **Ação Imediata**: Validar a configuração em `ia_configuracoes` ou atualizar secret no Supabase Vault (**NUNCA logar o valor da chave**).

---

## 6. Playbook Especializado: CI/CD & Automação

### 6.1. `CI Quality Gates FAIL`
- **Sintomas**: GitHub Action `CI Quality Gates` falha no PR ou push para `develop`/`master`.
- **Procedimento**:
  1. Acessar a aba **Actions** no GitHub e abrir a execução falha.
  2. Identificar qual gate falhou:
     - `TypeCheck Gate` (`npm run typecheck`): Erro de tipagem TypeScript.
     - `Vitest Gate` (`npm run test`): Quebra de teste unitário ou de regressão.
     - `Vite Build Gate` (`npm run build`): Erro de bundling ou assets.
     - `Progressive Lint` (`xargs eslint`): Violação de estilo nos arquivos alterados no PR.
  3. **Regra de Ouro**: **NUNCA ignorar gates nem forçar merge via bypass de proteção de branch**.
  4. Reproduzir a falha localmente, aplicar a correção no código e efetuar novo commit na branch de trabalho.

### 6.2. `Docker Publish FAIL`
- **Sintomas**: Workflow `Build & Push Docker Image` falha após aprovação do CI.
- **Procedimento**:
  1. Verificar autenticação no Docker Hub (`DOCKERHUB_TOKEN` expirado ou cota de build excedida).
  2. Verificar se o checkout foi realizado no SHA correto (`github.event.workflow_run.head_sha`).
  3. **NUNCA fazer deploy manual de imagens construídas fora do pipeline oficial**.
  4. Corrigir credenciais no GitHub Secrets se necessário e disparar re-run do workflow pelo GitHub Actions.

### 6.3. `Release Workflow FAIL`
- **Sintomas**: Tag Git ou GitHub Release não são geradas após merge em `master`.
- **Procedimento**:
  1. Verificar se a tag (ex: `v1.0.48`) já existia previamente no repositório (conflito de versão).
  2. Confirmar se a versão no `package.json` foi devidamente incrementada antes do merge em `master`.
  3. **NUNCA criar tags ou releases manuais desordenadas sem seguir o versionamento semântico**.

---

## 7. Playbook de Infraestrutura e Produção (FUTURO)

> ⚠️ **Nota Operacional**: Esta seção documenta as diretrizes arquiteturais para quando o ambiente de produção dedicado for provisionado com Docker/Traefik/Coolify.

### 7.1. Health Check (`/health`)
- O container do frontend e o gateway reverso devem responder `200 OK` na rota `/health`.
- Em caso de 3 falhas consecutivas de health check, o orquestrador marca o container como `unhealthy`.

### 7.2. Procedimento de Rollback de Container
1. Identificar o digest da última imagem estável no Docker Hub (ex: `heitor84/wallet:master-<previous_sha>`).
2. Atualizar o apontamento do container para o digest/tag anterior.
3. Executar `docker compose up -d --force-recreate` ou redeploy no painel de orquestração.
4. Validar restabelecimento via rota `/health` e testes de fumaça.

---

## 8. Estado Real dos Alertas Operacionais

### 8.1. Recursos de Observabilidade Atualmente Ativos:
- ✅ **Structured JSON Logging**: Logs com campos padronizados emitidos pelo frontend (`LoggerService`) e Edge Functions (`createBackendLogger`).
- ✅ **Distributed Tracing (Correlation ID)**: Propagação de `X-Correlation-Id` em fluxos Pluggy e OpenAI.
- ✅ **Padronização de Códigos de Erro**: Envelopes com `errorCode` explícito em falhas externas e internas.
- ✅ **Sanitização Automática**: Redação estrita de senhas, JWTs, chaves de API e mascaramento de CPF/CNPJ/e-mails.
- ✅ **React Global Error Boundary**: Captura de falhas não tratadas na UI com códigos de suporte rastreáveis.

### 8.2. Alertas Automáticos Externos Atuais:
- *Ainda não existem plataformas externas conectadas (Sentry, Datadog, Grafana ou PagerDuty)*.
- O monitoramento atual é executado via inspeção dos logs estruturados no console do navegador, Supabase Function Logs e GitHub Actions.

### 8.3. Próxima Evolução Recomendada:
1. **Sentry**: Integração do SDK no frontend e Edge Functions para agrupamento automático de exceções.
2. **Supabase Log Drains / Alertas**: Configuração de webhooks para alertar picos de status 5xx e 429 no Slack/Discord.
3. **Uptime Monitor Externo**: Configuração de monitor externo (ex: BetterStack / UptimeRobot) sondando a URL de produção e o health check.
4. **OpenTelemetry Collector**: Exportação de métricas e traces de ponta a ponta.
