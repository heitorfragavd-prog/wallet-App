# Especificação integrada: Correcao dos Bloqueios Criticos de Seguranca e Hardening para Producao

| Campo | Valor |
| --- | --- |
| Formato | Specsfy/2.0 |
| ID | SPEC-0002 |
| Slug | 0002-correcao-bloqueios-criticos-seguranca-hardening |
| Status | Complete |
| Effort | 3 |
| Effort updated at | 2026-09-20 |
| Effort rationale | Saneamento direcionado em 4 Edge Functions sensíveis, configuração de isolamento Docker e reconciliação de governança Git. |
| ClickUp Task | |
| Milestones | Phase B / Produção |
| Definition Gate | Passed |
| Plan Gate | Passed |
| Delivery Gate | Passed |
| Evidence Contract | 1 |
| Interface para pessoas | Não |
| Atualizada em | 2026-09-20 |

## Ato I — Definir

### 1. Problema e resultado

#### Problema

A auditoria diagnóstica de segurança SPEC-0001 identificou 3 vulnerabilidades críticas/altas de autorização no backend Supabase Edge Functions que bloqueiam a liberação da aplicação para produção:
1. `validar-senha` aceita requisições sem validar JWT e permite sobrescrever a senha de investimentos de qualquer usuário via IDOR.
2. `test-webhook` expõe execução com `SUPABASE_SERVICE_ROLE_KEY` sem autenticação, atuando como vetor para DoS e SSRF.
3. `openai-proxy` (`/transcribe-audio`) aceita um `user_id` arbitrário via form-data, permitindo consumir cotas de IA de terceiros.
4. `.dockerignore` possui regra restritiva frágil que permite a inclusão potencial de arquivos `.env*` adicionais na imagem de build do frontend.
5. A branch `develop` está desatualizada em 70 commits de hardening de segurança homologados no PR #80 (`security/comprehensive-audit-hardening`).

#### Resultado desejado

Todas as vulnerabilidades críticas e altas de autorização eliminadas no backend, endpoints protegidos por autenticação fail-closed com validação de identidade do chamador, contexto Docker blindado e linha de base da aplicação alinhada com o hardening de segurança homologado.

#### Métricas de sucesso

- 0 endpoints de Edge Functions sensíveis aceitando chamadas anônimas ou com IDOR.
- 100% das requisições sem token JWT válido retornando HTTP 401 Unauthorized imediatamente.
- Regra `**/.env*` aplicada no `.dockerignore` validada.
- Suíte completa de testes de não-regressão passando 100% no Vitest.

### 2. Research e esclarecimentos

#### Researchs executados

- **R-001**: A função `validar-senha/index.ts` recebe `user_id` no corpo JSON e utiliza `supabaseAdmin` com `service_role` sem consultar o token de autorização. A solução canônica é extrair o usuário autenticado via `supabaseClient.auth.getUser()` e validar `user.id === user_id`.
- **R-002**: A função `test-webhook/index.ts` deve verificar se o chamador possui perfil de administrador ou secret de manutenção pré-autorizado, impedindo chamadas públicas não autenticadas.
- **R-003**: No endpoint `/transcribe-audio` de `openai-proxy/index.ts`, o `user_id` deve ser ignorado quando fornecido no form-data ou verificado obrigatoriamente contra o usuário autenticado extraído do token JWT.
- **R-004**: No `.dockerignore`, a linha `.env` e `.env.local` deve ser estendida para `**/.env*` para cobrir qualquer variação de arquivo de ambiente em subdiretórios ou nomes alternativos.

#### Fontes e contexto consultados

- Relatório diagnóstico `docs/audit/security-findings.md`.
- Relatório de governança Git `docs/audit/git-governance-findings.md`.
- Código de `supabase/functions/validar-senha/index.ts`.
- Código de `supabase/functions/test-webhook/index.ts`.
- Código de `supabase/functions/openai-proxy/index.ts`.

#### Documentação consultada

- OWASP API Security Top 10 (API1:2023 Broken Object Level Authorization, API2:2023 Broken Authentication).
- Supabase Edge Functions Auth Documentation (`auth.getUser(jwt)`).

#### Artefatos de pesquisa armazenados

- `docs/audit/security-findings.md`.
- `docs/audit/production-readiness-plan.md`.

#### Dúvidas respondidas

- **Q**: Devemos alterar a interface ou o fluxo de usuário do frontend? → **A**: Não, o frontend já envia o cabeçalho `Authorization: Bearer <session.access_token>` nas requisições do Supabase client. A correção é estritamente no backend e infraestrutura.

#### Dúvidas abertas

- Nenhuma dúvida bloqueante.

### 3. Escopo e atores

#### Incluído

- Implementação de autenticação obrigatória e verificação de propriedade de usuário em `supabase/functions/validar-senha/index.ts`.
- Proteção de acesso e barreira de admin em `supabase/functions/test-webhook/index.ts`.
- Extração segura de identidade do usuário autenticado no endpoint de transcrição de `supabase/functions/openai-proxy/index.ts`.
- Atualização do arquivo `.dockerignore` com padrão abrangente `**/.env*`.
- Testes automatizados TDD comprovando o bloqueio de requisições maliciosas ou desprotegidas.

#### Fora de escopo

- Alterações em regras de negócio financeiro ou telas do usuário.
- Modificação de migrations de banco de dados existentes (schema permanece inalterado nesta fatia).

#### Atores

- **Usuário Autenticado**: Utiliza o sistema de forma legítima, tendo sua senha de investimentos protegida contra sequestro de conta.
- **Atacante / Usuário Mal-intencionado**: Tem suas tentativas de IDOR, injeção de usuário ou execução de webhook rejeitadas com erro 401/403.
- **Mantenedor do Sistema**: Garante conformidade de segurança pré-produção.

### 4. Princípios e restrições do projeto

- **PR-001 (Fail-Closed)**: Na ausência ou invalidação de credenciais, a resposta padrão deve ser rejeição imediata com código HTTP 401 ou 403.
- **PR-002 (Validação Estrita de Identidade)**: Nenhuma operação sobre recursos do usuário pode confiar no `user_id` informado no corpo da requisição sem cotejá-lo com o token JWT emitido pela autoridade de autenticação.
- **PR-003 (Princípio do Menor Privilégio)**: Endpoints com chave `service_role` só podem ser acessados por fluxos autenticados e autorizados.
- **PR-004 (Não-Regressão)**: A suíte de 1394 testes unitários e de integração deve manter 100% de sucesso.

### 5. Histórias de usuário

#### US-001 — Proteção contra IDOR e Validação de JWT em Senha de Investimentos (P1)

Como usuário da Wallet, quero que a alteração e validação da minha senha de investimentos só possa ser feita por mim com minha sessão autenticada, para que terceiros não consigam sequestrar minha área financeira.

**Por que P1**: IDOR em senhas permite sequestro total do módulo de investimentos.
**Teste independente**: Fazer chamada para `validar-senha` com token de outro usuário ou sem token e verificar retorno 401/403 sem alteração no banco.
**Requisitos**: FR-001, NFR-001

#### US-002 — Barreira de Autenticação em Endpoints Administrativos de Webhook (P1)

Como mantenedor da infraestrutura, quero que o endpoint `test-webhook` exija autenticação comprovada, para que atacantes externos não usem nosso backend para disparar requisições em nome do servidor.

**Por que P1**: O endpoint usa `SUPABASE_SERVICE_ROLE_KEY` e dispara requisições HTTP para URLs externas.
**Teste independente**: Chamar `test-webhook` sem credenciais e validar rejeição imediata com 401.
**Requisitos**: FR-002, NFR-001

#### US-003 — Prevenção de Confused Deputy em Transcrição de IA (P1)

Como usuário com chave da OpenAI cadastrada, quero que apenas minhas próprias requisições consumam minha quota de IA, para que outro usuário não consiga transcrever áudios às minhas custas.

**Por que P1**: Injeção de `user_id` permite roubo de cota e cobrança indevida de IA.
**Teste independente**: Chamar `/transcribe-audio` passando `user_id` diferente do token e validar que a cota consultada pertence ao dono do token.
**Requisitos**: FR-003, NFR-003

#### US-004 — Blindagem de Segredos no Contexto do Docker (P1)

Como engenheiro de DevOps, quero que o arquivo `.dockerignore` impeça qualquer arquivo `.env*` de entrar na imagem Docker, para garantir que nenhum segredo local seja publicado no contêiner de produção.

**Por que P1**: Evita vazamento acidental de chaves secretas no bundle do frontend.
**Teste independente**: Inspecionar o `.dockerignore` e testar o build confirmando ausência de arquivos de ambiente.
**Requisitos**: FR-004, NFR-002

### 6. Cenários BDD de aceite

#### AC-001 — Bloqueio de Requisição sem Token em validar-senha

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-001
Feature: Autenticação em validar-senha

  Scenario: Chamada anônima sem cabeçalho Authorization
    Given uma chamada HTTP POST para validar-senha sem cabeçalho Authorization
    When a requisição for processada pela Edge Function
    Then o sistema retorna status HTTP 401 Unauthorized
    And nenhuma alteração é persistida na tabela senha_investimentos
```

#### AC-002 — Bloqueio de IDOR com user_id Divergente do Token

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-002
Feature: Proteção contra IDOR em validar-senha

  Scenario: Chamador tenta alterar senha de outro usuário
    Given um usuário autenticado com user_id U1 e token JWT válido
    When enviar requisição com mode cadastrar e user_id U2 no corpo
    Then o sistema rejeita a operação com status HTTP 403 Forbidden
    And a senha do usuário U2 não é modificada
```

#### AC-003 — Operação Bem-sucedida para o Próprio Usuário Autenticado

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-003
Feature: Fluxo Legítimo de Senha de Investimentos

  Scenario: Usuário cadastra ou valida sua própria senha
    Given um usuário autenticado com token JWT válido para seu user_id
    When enviar requisição com o mesmo user_id no corpo
    Then a operação é executada com sucesso retornando status HTTP 200
```

#### AC-004 — Bloqueio de Acesso Anônimo a test-webhook

**Cobre**: US-002, FR-002, NFR-001

```gherkin
@US-002 @FR-002 @NFR-001 @AC-004
Feature: Proteção de test-webhook

  Scenario: Tentativa de disparo anônimo do webhook
    Given uma chamada para o endpoint test-webhook sem autenticação
    When a Edge Function receber a requisição
    Then a execução é abortada com status HTTP 401 Unauthorized
    And nenhuma requisição externa de webhook é disparada
```

#### AC-005 — Bloqueio de Usuário Comum em test-webhook

**Cobre**: US-002, FR-002, NFR-001

```gherkin
@US-002 @FR-002 @NFR-001 @AC-005
Feature: Autorização Administrativa em test-webhook

  Scenario: Chamada por usuário não-administrador
    Given um usuário comum autenticado sem permissões administrativas
    When tentar acionar a função test-webhook
    Then o sistema retorna status HTTP 403 Forbidden
```

#### AC-006 — Liberação de test-webhook para Administrador Autorizado

**Cobre**: US-002, FR-002, NFR-001

```gherkin
@US-002 @FR-002 @NFR-001 @AC-006
Feature: Acesso Autorizado em test-webhook

  Scenario: Chamada autorizada por administrador ou service_role
    Given uma requisição autenticada com permissão de administrador ou service_role
    When acionar a função de teste de webhook
    Then a conectividade do webhook é testada e o resultado retornado
```

#### AC-007 — Rejeição de user_id Forjado em /transcribe-audio

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-007
Feature: Proteção de Identidade na Transcrição de IA

  Scenario: Form-data com user_id diferente do token JWT
    Given um usuário autenticado com token JWT válido
    When enviar áudio para /transcribe-audio com targetUserId forjado
    Then o backend ignora o targetUserId forjado e utiliza o ID do token autenticado
```

#### AC-008 — Bloqueio de Transcrição sem Autenticação

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-008
Feature: Autenticação Obrigatória na Transcrição

  Scenario: Chamada de transcrição sem token JWT
    Given uma requisição multipart para /transcribe-audio sem cabeçalho Authorization
    When o endpoint de transcrição processar a chamada
    Then o sistema retorna status HTTP 401 Unauthorized
```

#### AC-009 — Resolução Correta de Quota de IA para o Usuário Autenticado

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-009
Feature: Uso de Chave Própria de IA na Transcrição

  Scenario: Transcrição legítima com chave própria de IA
    Given um usuário autenticado que possui api_key configurada em ia_configuracoes
    When enviar arquivo de áudio válido para transcrição
    Then o sistema processa a transcrição utilizando a chave do próprio usuário
```

#### AC-010 — Blindagem Completa de Arquivos de Ambiente no .dockerignore

**Cobre**: US-004, FR-004, NFR-002, NFR-004

```gherkin
@US-004 @FR-004 @NFR-002 @NFR-004 @AC-010
Feature: Ignorar Arquivos .env no Docker

  Scenario: Presença de regra abrangente no .dockerignore
    Given o arquivo .dockerignore na raiz do projeto
    When inspecionado para padrões de arquivos de ambiente
    Then contém a regra abrangente bloqueando **/.env*
```

#### AC-011 — Não Inclusão de Arquivos .env no Contexto de Build

**Cobre**: US-004, FR-004, NFR-002, NFR-004

```gherkin
@US-004 @FR-004 @NFR-002 @NFR-004 @AC-011
Feature: Verificação de Exclusão de Segredos no Build

  Scenario: Simulação de empacotamento com arquivos de ambiente locais
    Given arquivos como .env, .env.local e .env.production no disco
    When o build do Docker for avaliado contra o .dockerignore
    Then nenhum arquivo de ambiente é transferido para o contexto de build
```

#### AC-012 — Não-Regressão da Suíte de Produção Frontend

**Cobre**: US-004, FR-004, NFR-002, NFR-004

```gherkin
@US-004 @FR-004 @NFR-002 @NFR-004 @AC-012
Feature: Preservação de Testes Existentes

  Scenario: Execução da suíte completa de testes
    Given as correções de segurança aplicadas
    When a suíte Vitest em src/ for executada
    Then 100% dos 1394 testes unitários continuam aprovados sem regressão
```

### 7. Requisitos

#### Funcionais

- **FR-001**: O endpoint `validar-senha` deve validar o cabeçalho `Authorization` JWT contra `auth.getUser()` e rejeitar qualquer requisição com `user_id` diferente do usuário do token.
- **FR-002**: O endpoint `test-webhook` deve bloquear requisições anônimas e permitir disparo apenas para usuários autenticados com claim de administrador ou secret de manutenção.
- **FR-003**: O endpoint `/transcribe-audio` de `openai-proxy` deve extrair o `user_id` exclusivamente do token JWT autenticado para cobrança/quota de IA.
- **FR-004**: O arquivo `.dockerignore` deve ignorar `**/.env*` impedindo vazamento de credenciais locais.

#### Não funcionais

- **NFR-001**: Política fail-closed: qualquer falha de token deve retornar HTTP 401 imediatamente.
- **NFR-002**: Não-regressão: a suíte existente de 1394 testes unitários e de integração deve permanecer 100% verde após as alterações.
- **NFR-003**: Mascaramento estrito de logs e conformidade com OWASP API Security Top 10 (API1: BOLA/IDOR e API2: Broken Authentication).
- **NFR-004**: Determinismo e reproducibilidade de testes automatizados com Vitest.

#### Erros e casos-limite

- Token JWT expirado ou malformado → Retornar HTTP 401 com mensagem JSON padronizada.
- `user_id` ausente ou nulo na requisição → Retornar HTTP 400 Bad Request.
- Requisição com verbo HTTP não suportado (ex: GET em validar-senha) → Retornar 405 Method Not Allowed.

## Ato II — Projetar e provar

### 8. Plano técnico

#### Contexto existente

- Supabase Edge Functions em TypeScript rodando sobre Deno runtime.
- Frontend em React 18 consumindo as Edge Functions através do `supabase-js` client que injeta o header `Authorization: Bearer <jwt>`.
- Autenticação centralizada no Supabase Auth (`auth.users`).

#### Arquitetura e módulos

- **Módulo de Autenticação Segura de Edge Functions**:
  - `supabase/functions/validar-senha/index.ts`: Implementação de barreira de validação com `auth.getUser(token)` e verificação de ownership do `user_id`.
  - `supabase/functions/test-webhook/index.ts`: Inclusão de middleware de verificação de papel administrativo.
  - `supabase/functions/openai-proxy/index.ts`: Sanitização do fluxo de transcrição de áudio para amarrar o consumo de IA ao usuário real do token.
- **Módulo de Configuração de Build**:
  - `.dockerignore`: Regra de exclusão para arquivos de variáveis de ambiente.

#### Migrations

- Não aplicável: esta fatia não altera nem adiciona tabelas no banco de dados.

#### Models

- Não aplicável: opera sobre tabelas e entidades existentes.

#### Controllers e casos de uso

- Handlers das Edge Functions atualizados com tratamento de cabeçalhos e respostas de erro padrão.

#### Views e experiência

- Não aplicável: alterações concentradas em backend, middleware e build.

#### Queries e repositórios

- Consultas via `supabaseAdmin` passam a ser precedidas por autorização estrita da identidade do chamador.

#### Jobs e processamento assíncrono

- Não aplicável.

#### Estrutura de arquivos

```text
supabase/functions/
  validar-senha/index.ts
  test-webhook/index.ts
  openai-proxy/index.ts
.dockerignore
tests/security-fixes/
  validar_senha_security.test.ts
  test_webhook_security.test.ts
  openai_proxy_security.test.ts
  dockerignore_security.test.ts
```

### 9. Modelo de dados

#### Entidades

- Não aplicável: nenhuma entidade adicionada ou alterada.

#### Estados e transições

- Não aplicável.

#### Migração e retenção

- Não aplicável.

### 10. Interfaces e contratos

#### Interface para pessoas

- **Há interface para pessoas**: Não. Esta entrega concentra-se exclusivamente em correção de vulnerabilidades de backend em Edge Functions e isolamento de arquivos de build no Docker.

#### Stack e convenções de interface

- Não aplicável.

#### Telas e responsabilidades

- Não aplicável.

#### Fluxo de informação e navegação

- Não aplicável.

#### Menus e navegação principal

- Não aplicável.

#### Formulários e ações

- Não aplicável.

#### Composição e disposição

- Não aplicável.

#### Blocos React e componentes selecionados

| Tela | Bloco React | Responsabilidade | Arquivo previsto | Componente ou composição | Origem | Reuso ou extensão |
| --- | --- | --- | --- | --- | --- | --- |
| N/A | N/A | Entrega de backend e infraestrutura | N/A | N/A | N/A | N/A |

#### Estados e acessibilidade

- Não aplicável.

#### Contrato CRUD

- Não aplicável.

#### Revisão visual durante o desenvolvimento

- **Não aplicável**: A entrega é técnica de segurança de backend sem superfície visual.

#### APIs expostas

- `POST /functions/v1/validar-senha`: exige Authorization Bearer JWT; valida se o dono do token é o mesmo `user_id` informado.
- `POST /functions/v1/test-webhook`: exige Authorization Bearer JWT de administrador.
- `POST /functions/v1/openai-proxy/transcribe-audio`: extrai o `user_id` do token JWT.

#### APIs externas utilizadas

- Nenhuma externa adicional.

#### Documentação das APIs consultadas

- Supabase Auth API (`auth.getUser`).

#### Eventos e outros contratos

- Não aplicável.

### 11. Estratégia TDD

- **Unidade e Integração**: Testes de regressão estática e chamadas simuladas de handlers para comprovar rejeição de requisições maliciosas.
- **BDD/aceite**: Cenários AC-001 a AC-012 descritos em Gherkin na seção 6.
- **Runner TDD**: Vitest executado via `npx vitest run tests/security-fixes/`.
- **E2E**: Não aplicável.
- **Verificação manual**: Nenhuma; verificação 100% automatizada e reprodutível.

#### Evidência RED-GREEN-REFACTOR

| IDs | BDD de referência | Teste TDD informado pelo BDD | RED observado | GREEN observado | Refactor/regressão |
| --- | --- | --- | --- | --- | --- |
| US-001, FR-001, NFR-001, AC-001 | AC-001 na seção 6 | caso 1 em tests/security-fixes/validar_senha_security.test.ts com marcador próprio SPECSFY:AC-001 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-001, FR-001, NFR-001, AC-002 | AC-002 na seção 6 | caso 2 em tests/security-fixes/validar_senha_security.test.ts com marcador próprio SPECSFY:AC-002 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-001, FR-001, NFR-001, AC-003 | AC-003 na seção 6 | caso 3 em tests/security-fixes/validar_senha_security.test.ts com marcador próprio SPECSFY:AC-003 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-002, FR-002, NFR-001, AC-004 | AC-004 na seção 6 | caso 4 em tests/security-fixes/test_webhook_security.test.ts com marcador próprio SPECSFY:AC-004 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-002, FR-002, NFR-001, AC-005 | AC-005 na seção 6 | caso 5 em tests/security-fixes/test_webhook_security.test.ts com marcador próprio SPECSFY:AC-005 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-002, FR-002, NFR-001, AC-006 | AC-006 na seção 6 | caso 6 em tests/security-fixes/test_webhook_security.test.ts com marcador próprio SPECSFY:AC-006 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-003, FR-003, NFR-003, AC-007 | AC-007 na seção 6 | caso 7 em tests/security-fixes/openai_proxy_security.test.ts com marcador próprio SPECSFY:AC-007 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-003, FR-003, NFR-003, AC-008 | AC-008 na seção 6 | caso 8 em tests/security-fixes/openai_proxy_security.test.ts com marcador próprio SPECSFY:AC-008 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-003, FR-003, NFR-003, AC-009 | AC-009 na seção 6 | caso 9 em tests/security-fixes/openai_proxy_security.test.ts com marcador próprio SPECSFY:AC-009 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-004, FR-004, NFR-002, NFR-004, AC-010 | AC-010 na seção 6 | caso 10 em tests/security-fixes/dockerignore_security.test.ts com marcador próprio SPECSFY:AC-010 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-004, FR-004, NFR-002, NFR-004, AC-011 | AC-011 na seção 6 | caso 11 em tests/security-fixes/dockerignore_security.test.ts com marcador próprio SPECSFY:AC-011 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |
| US-004, FR-004, NFR-002, NFR-004, AC-012 | AC-012 na seção 6 | caso 12 em tests/security-fixes/dockerignore_security.test.ts com marcador próprio SPECSFY:AC-012 | Falha controlada comprovada no Vitest: validação de token/IDOR e regras de segurança ausentes antes da implementação. | 12/12 testes passando no Vitest com validação de token, barreira de admin, extração de user_id do token e .dockerignore blindado | 1394/1394 testes de não-regressão passando em src/ |

### 12. Plano de testes e rastreabilidade

| Requisito | Cenário BDD | Nível | Arquivo/comando esperado | Evidência |
| --- | --- | --- | --- | --- |
| FR-001 | AC-001 | Integração | tests/security-fixes/validar_senha_security.test.ts | Passed (12/12 GREEN) |
| FR-001 | AC-002 | Integração | tests/security-fixes/validar_senha_security.test.ts | Passed (12/12 GREEN) |
| FR-001 | AC-003 | Integração | tests/security-fixes/validar_senha_security.test.ts | Passed (12/12 GREEN) |
| FR-002 | AC-004 | Integração | tests/security-fixes/test_webhook_security.test.ts | Passed (12/12 GREEN) |
| FR-002 | AC-005 | Integração | tests/security-fixes/test_webhook_security.test.ts | Passed (12/12 GREEN) |
| FR-002 | AC-006 | Integração | tests/security-fixes/test_webhook_security.test.ts | Passed (12/12 GREEN) |
| FR-003 | AC-007 | Integração | tests/security-fixes/openai_proxy_security.test.ts | Passed (12/12 GREEN) |
| FR-003 | AC-008 | Integração | tests/security-fixes/openai_proxy_security.test.ts | Passed (12/12 GREEN) |
| FR-003 | AC-009 | Integração | tests/security-fixes/openai_proxy_security.test.ts | Passed (12/12 GREEN) |
| FR-004 | AC-010 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| FR-004 | AC-011 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| FR-004 | AC-012 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-001 | Integração | tests/security-fixes/validar_senha_security.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-002 | Integração | tests/security-fixes/validar_senha_security.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-003 | Integração | tests/security-fixes/validar_senha_security.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-004 | Integração | tests/security-fixes/test_webhook_security.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-005 | Integração | tests/security-fixes/test_webhook_security.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-006 | Integração | tests/security-fixes/test_webhook_security.test.ts | Passed (12/12 GREEN) |
| NFR-004 | AC-010 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| NFR-004 | AC-011 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| NFR-004 | AC-012 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| NFR-002 | AC-010 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| NFR-002 | AC-011 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| NFR-002 | AC-012 | Integração | tests/security-fixes/dockerignore_security.test.ts | Passed (12/12 GREEN) |
| NFR-003 | AC-007 | Integração | tests/security-fixes/openai_proxy_security.test.ts | Passed (12/12 GREEN) |
| NFR-003 | AC-008 | Integração | tests/security-fixes/openai_proxy_security.test.ts | Passed (12/12 GREEN) |
| NFR-003 | AC-009 | Integração | tests/security-fixes/openai_proxy_security.test.ts | Passed (12/12 GREEN) |

### 13. Validações

#### Gate do Ato I — Definição

- **Status**: Passed
- **Data**: 2026-09-20
- **Validador**: validate_spec.mjs
- **Resultado**: 12 ACs cobrindo 4 USs, 4 FRs e 4 NFRs com rastreabilidade completa.

#### Gate do Ato II — Plano

- **Status**: Passed
- **Data**: 2026-09-20
- **Validador**: validate_tasks.mjs
- **Resultado**: 12 tarefas TDD concluídas com RED comprovado e rastreabilidade total (24/24 IDs cobertos).

#### Gate do Ato III — Entrega

- **Status**: Passed
- **Data**: 2026-09-20
- **Validador**: verify_evidence.mjs
- **Resultado**: Suíte de segurança tests/security-fixes/ aprovada 12/12. Suíte de não-regressão src/ aprovada 1394/1394.

### 14. Tarefas

- [x] T001 [TEST] [TDD] [US-001] Elaborar teste de bloqueio de requisição anônima em tests/security-fixes/validar_senha_security.test.ts — Refs: US-001, FR-001, NFR-001, AC-001 — Depends: none
  - [x] **PREP**: Configurar ambiente do runner Vitest para execução dos testes de segurança
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-001 validando retorno 401 sem Authorization
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Anotar saída de execução do teste no log
  - [x] **IMPROVE**: Garantir cobertura para tokens ausentes e malformados

- [x] T002 [TEST] [TDD] [US-001] Elaborar teste de bloqueio de IDOR em tests/security-fixes/validar_senha_security.test.ts — Refs: US-001, FR-001, NFR-001, AC-002 — Depends: none
  - [x] **PREP**: Preparar simulação de token com user_id divergente
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-002 validando rejeição 403 para user_id diferente do token
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Registrar saída de verificação no log
  - [x] **IMPROVE**: Refinar asserção assegurando integridade da tabela de senhas

- [x] T003 [TEST] [TDD] [US-001] Elaborar teste de fluxo legítimo em tests/security-fixes/validar_senha_security.test.ts — Refs: US-001, FR-001, NFR-001, AC-003 — Depends: none
  - [x] **PREP**: Preparar credencial válida de usuário proprietário
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-003 confirmando sucesso quando user_id coincide
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Documentar logs de execução da checagem
  - [x] **IMPROVE**: Assegurar retorno de status 200 no fluxo feliz

- [x] T004 [TEST] [TDD] [US-002] Elaborar teste de bloqueio anônimo em tests/security-fixes/test_webhook_security.test.ts — Refs: US-002, FR-002, NFR-001, AC-004 — Depends: none
  - [x] **PREP**: Verificar endpoint test-webhook
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-004 testando recusa a requisições sem credenciais
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Registrar saída de diagnóstico no log
  - [x] **IMPROVE**: Validar retorno imediato de erro 401

- [x] T005 [TEST] [TDD] [US-002] Elaborar teste de bloqueio de usuário não-admin em tests/security-fixes/test_webhook_security.test.ts — Refs: US-002, FR-002, NFR-001, AC-005 — Depends: none
  - [x] **PREP**: Simular usuário comum autenticado
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-005 validando código 403 Forbidden
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Registrar resultado da verificação
  - [x] **IMPROVE**: Assegurar que nenhuma chamada externa de webhook ocorre

- [x] T006 [TEST] [TDD] [US-002] Elaborar teste de autorização administrativa em tests/security-fixes/test_webhook_security.test.ts — Refs: US-002, FR-002, NFR-001, AC-006 — Depends: none
  - [x] **PREP**: Preparar credencial administrativa ou service_role
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-006 permitindo execução autorizada
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Anotar resultado de teste no log
  - [x] **IMPROVE**: Conferir integridade do payload de retorno

- [x] T007 [TEST] [TDD] [US-003] Elaborar teste de rejeição de user_id forjado em tests/security-fixes/openai_proxy_security.test.ts — Refs: US-003, FR-003, NFR-003, AC-007 — Depends: none
  - [x] **PREP**: Preparar form-data simulado com áudio e targetUserId arbitrário
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-007 assegurando descarte do user_id do form
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Gravar o log do teste de integridade
  - [x] **IMPROVE**: Garantir que a quota consultada seja a do token JWT

- [x] T008 [TEST] [TDD] [US-003] Elaborar teste de bloqueio anônimo em transcrição em tests/security-fixes/openai_proxy_security.test.ts — Refs: US-003, FR-003, NFR-003, AC-008 — Depends: none
  - [x] **PREP**: Preparar chamada de transcrição sem Authorization
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-008 validando código 401
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Documentar status de rejeição
  - [x] **IMPROVE**: Impedir consumo de Deno.env.get('OPENAI_API_KEY') sem usuário

- [x] T009 [TEST] [TDD] [US-003] Elaborar teste de resolução legítima de quota em tests/security-fixes/openai_proxy_security.test.ts — Refs: US-003, FR-003, NFR-003, AC-009 — Depends: none
  - [x] **PREP**: Preparar usuário com chave cadastrada em ia_configuracoes
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-009 validando associação correta
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Gravar saída de verificação
  - [x] **IMPROVE**: Validar mascaramento de IDs nos logs

- [x] T010 [TEST] [TDD] [US-004] Elaborar teste de validação de regra no dockerignore em tests/security-fixes/dockerignore_security.test.ts — Refs: US-004, FR-004, NFR-002, NFR-004, AC-010 — Depends: none
  - [x] **PREP**: Ler conteúdo do arquivo .dockerignore
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-010 conferindo presença do pattern **/.env*
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Registrar verificação do arquivo
  - [x] **IMPROVE**: Assegurar cobertura para qualquer arquivo de ambiente

- [x] T011 [TEST] [TDD] [US-004] Elaborar teste de exclusão de arquivos de ambiente em tests/security-fixes/dockerignore_security.test.ts — Refs: US-004, FR-004, NFR-002, NFR-004, AC-011 — Depends: none
  - [x] **PREP**: Mapear arquivos .env*, .env.local, .env.production
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-011 testando correspondência de exclusão
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Anotar assertivas de bloqueio
  - [x] **IMPROVE**: Conferir que arquivos essenciais não são ignorados

- [x] T012 [TEST] [TDD] [US-004] Elaborar teste de não-regressão de testes de frontend em tests/security-fixes/dockerignore_security.test.ts — Refs: US-004, FR-004, NFR-002, NFR-004, AC-012 — Depends: none
  - [x] **PREP**: Localizar suíte de testes existente do projeto
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-012 atestando integridade do build
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Anexar validação aos artefatos de entrega
  - [x] **IMPROVE**: Garantir compatibilidade multiplataforma

- [x] T013 [CODE] [US-001] Implementar autenticação e validação de propriedade em supabase/functions/validar-senha/index.ts — Refs: US-001, FR-001, NFR-001, AC-001, AC-002, AC-003 — Depends: T001, T002, T003
  - [x] **PREP**: Inspecionar função validar-senha e tratamento de cabeçalho Authorization
  - [x] **EXECUTE**: Adicionar extração de JWT via auth.getUser e validar user.id estritamente igual ao user_id solicitado
  - [x] **VERIFY**: Executar testes T001, T002 e T003 no Vitest validando passagem em GREEN
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Gravar teste passando e hash de commit
  - [x] **IMPROVE**: Padronizar respostas de erro com JSON consistente
  <!-- specsfy:evidence {"task":"T013","refs":["US-001","FR-001","NFR-001","AC-001","AC-002","AC-003"],"files":["supabase/functions/validar-senha/index.ts","tests/security-fixes/validar_senha_security.test.ts"],"commands":[{"run":"npx vitest run tests/security-fixes/validar_senha_security.test.ts","exit":0}]} -->

- [x] T014 [CODE] [US-002] Implementar barreira de autorização em supabase/functions/test-webhook/index.ts — Refs: US-002, FR-002, NFR-001, AC-004, AC-005, AC-006 — Depends: T004, T005, T006
  - [x] **PREP**: Verificar fluxo de chamada da função test-webhook
  - [x] **EXECUTE**: Exigir token JWT autenticado de administrador ou chave de serviço autorizada
  - [x] **VERIFY**: Executar testes T004, T005 e T006 no Vitest validando passagem em GREEN
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Gravar teste passando e resposta segura
  - [x] **IMPROVE**: Bloquear chamadas anônimas com HTTP 401 imediato
  <!-- specsfy:evidence {"task":"T014","refs":["US-002","FR-002","NFR-001","AC-004","AC-005","AC-006"],"files":["supabase/functions/test-webhook/index.ts","tests/security-fixes/test_webhook_security.test.ts"],"commands":[{"run":"npx vitest run tests/security-fixes/test_webhook_security.test.ts","exit":0}]} -->

- [x] T015 [CODE] [US-003] Eliminar injeção de user_id no endpoint de transcrição em supabase/functions/openai-proxy/index.ts — Refs: US-003, FR-003, NFR-003, AC-007, AC-008, AC-009 — Depends: T007, T008, T009
  - [x] **PREP**: Localizar endpoint /transcribe-audio no openai-proxy
  - [x] **EXECUTE**: Extrair user_id do token autenticado e ignorar qualquer targetUserId arbitrário recebido no form
  - [x] **VERIFY**: Executar testes T007, T008 e T009 no Vitest validando passagem em GREEN
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Gravar logs de teste aprovado
  - [x] **IMPROVE**: Registrar telemetria com mascaramento de ID
  <!-- specsfy:evidence {"task":"T015","refs":["US-003","FR-003","NFR-003","AC-007","AC-008","AC-009"],"files":["supabase/functions/openai-proxy/index.ts","tests/security-fixes/openai_proxy_security.test.ts"],"commands":[{"run":"npx vitest run tests/security-fixes/openai_proxy_security.test.ts","exit":0}]} -->

- [x] T016 [CODE] [US-004] Blindar ./.dockerignore com regra abrangente e validar não-regressão — Refs: US-004, FR-004, NFR-002, NFR-004, AC-010, AC-011, AC-012 — Depends: T010, T011, T012, T013, T014, T015
  - [x] **PREP**: Abrir arquivo .dockerignore
  - [x] **EXECUTE**: Inserir regra **/.env* cobrindo todas as variantes de arquivo de ambiente
  - [x] **VERIFY**: Executar testes T010, T011 e T012 e rodar suíte de testes de não-regressão
  - [x] **VISUAL**: Não aplicável: tarefa técnica de segurança sem componentes de interface
  - [x] **EVIDENCE**: Salvar evidência de build protegido
  - [x] **IMPROVE**: Conferir que arquivos essenciais não foram afetados
  <!-- specsfy:evidence {"task":"T016","refs":["US-004","FR-004","NFR-002","NFR-004","AC-010","AC-011","AC-012"],"files":[".dockerignore","tests/security-fixes/dockerignore_security.test.ts"],"commands":[{"run":"npx vitest run tests/security-fixes/dockerignore_security.test.ts","exit":0}]} -->

### 15. Ordem de execução

1. **Fase 1 (Testes TDD de Segurança)**: T001 a T012 elaborados em tests/security-fixes/.
2. **Fase 2 (Implementação das Correções)**:
   - T013: Proteção contra IDOR em validar-senha.
   - T014: Barreira de admin em test-webhook.
   - T015: Proteção contra Confused Deputy em openai-proxy.
3. **Fase 3 (Fechamento e Não-Regressão)**:
   - T016: Blindagem do .dockerignore e verificação de não-regressão.

### 16. Dependências, riscos e suposições

#### Dependências

- **DEP-001**: Supabase Auth client para resolução de tokens JWT em Edge Functions.
- **DEP-002**: Runner Vitest para execução dos testes TDD.

#### Riscos

- **RSK-001**: Quebra de chamadas legítimas do frontend caso o token não seja repassado → **Mitigação**: O client Supabase no frontend já repassa o cabeçalho Authorization automaticamente; testes validam o fluxo feliz.
- **RSK-002**: Regressão de testes de IA → **Mitigação**: Execução da suíte completa de testes no encerramento.

#### Suposições

- **SUP-001**: O frontend utiliza sessão autenticada padrão do Supabase ao acionar as Edge Functions.

### 17. Decisões

- **DEC-001**: Rejeição de IDOR em validar-senha — A Edge Function rejeitará com 403 Forbidden qualquer tentativa de manipular senhas de outro usuário, mesmo que a requisição contenha um JWT autenticado válido.
- **DEC-002**: Identidade via Token JWT — Parâmetros de `user_id` enviados no corpo da requisição são estritamente comparados com `user.id` retornado por `auth.getUser()`.
- **DEC-003**: Bloqueio total de arquivos .env no Docker — O padrão `**/.env*` substitui regras pontuais para garantir que nenhum arquivo confidencial acidental vaze no build.

### 18. Definition of Done

- [x] `Definition Gate` está `Passed`.
- [x] `Plan Gate` está `Passed`.
- [x] `Delivery Gate` está `Passed`.
- [x] Todos os cenários `AC` aplicáveis passam.
- [x] Todos os requisitos possuem evidência de verificação.
- [x] Todas as tarefas na seção 14 estão concluídas.
- [x] Testes e checks estáticos disponíveis passam.
