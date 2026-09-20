# Especificação integrada: Reconciliacao e Integracao do PR 80 na develop

| Campo | Valor |
| --- | --- |
| Formato | Specsfy/2.0 |
| ID | SPEC-0003 |
| Slug | 0003-reconciliacao-e-integracao-do-pr-80-na-develop |
| Status | Implementing |
| Effort | 3 |
| Effort updated at | 2026-09-20 |
| Effort rationale | Reconciliação do grafo Git de 70 commits, resolução de divergências em Edge Functions e validação da suíte completa de testes e build. |
| ClickUp Task | |
| Milestones | Phase B / Produção |
| Definition Gate | Passed |
| Plan Gate | Passed |
| Delivery Gate | In Progress |
| Evidence Contract | 1 |
| Interface para pessoas | Não |
| Atualizada em | 2026-09-20 |

## Ato I — Definir

### 1. Problema e resultado

#### Problema

A auditoria SPEC-0001 e o diagnóstico de governança Git apontaram que a branch `develop` está defasada em 70 commits de hardening de segurança homologados no PR #80 (`security/comprehensive-audit-hardening`). Embora o banco de produção (Supabase) já tenha recebido a Fase A das migrations (`20260908120000_security_phase_a_infrastructure.sql`), a base de código da branch `develop` ainda não contém:
1. Os módulos compartilhados de rate limit atômico no Postgres e mitigação contra SSRF.
2. O RLS atômico de sessão para investimentos (`is_investimentos_unlocked`).
3. As baterias de testes de segurança em `src/core/security/`.
4. Os guardrails de release e scripts operacionais de build do container Docker para a Phase B.

Além disso, a `develop` recebeu recentemente as correções imediatas de bloqueios críticos da SPEC-0002 em `validar-senha`, `test-webhook`, `openai-proxy` e `.dockerignore`, que precisam ser consolidadas harmonicamente com os 70 commits do PR #80 sem conflitos.

#### Resultado desejado

A branch `develop` unificada com o histórico do PR #80 através de uma integração formal e segura, preservando todas as defesas contra SSRF, rate limit atômico, proteções de perfil, testes de segurança e os saneamentos da SPEC-0002, com 100% dos testes e build do Vite operando com sucesso.

#### Métricas de sucesso

- 0 conflitos não resolvidos entre `develop` e `security/comprehensive-audit-hardening`.
- 100% dos 1394 testes de aplicação passando no Vitest.
- 100% dos testes de segurança passando no Vitest.
- Build do frontend (`npm run build`) concluído com saída 0 em `dist/`.
- PR #80 no GitHub devidamente atualizado.

### 2. Research e esclarecimentos

#### Researchs executados

- **R-001**: Análise de divergência do grafo Git entre `develop` e `security/comprehensive-audit-hardening` → Verificado que a branch de segurança descende diretamente do commit base `3a057fe506d13be80a97925a09100ecc9ef8899f`, sem commits divergentes na árvore original de develop.
- **R-002**: Inspeção de conflitos em Edge Functions sensíveis → Confirmado que o PR #80 moveu lógica de regras para arquivos em `supabase/functions/_shared/`, tornando a resolução de conflito com SPEC-0002 direta e complementar.
- **R-003**: Inspeção de status no GitHub → PR #80 encontra-se aberto, marcado como draft, mergeable e com workflows de CI verdes (Runs #35033279995 e #35033279981).

#### Fontes e contexto consultados

- Relatório `docs/audit/git-governance-findings.md`.
- Plano `docs/audit/production-readiness-plan.md`.
- Runbook operacional `PR80_PRODUCTION_RUNBOOK.md`.
- Preflight operacional `PR80_PRODUCTION_PREFLIGHT.md`.
- Especificação concluída `specs/completed/0002-correcao-bloqueios-criticos-seguranca-hardening/spec.md`.

#### Documentação consultada

- Git Documentation: Git Branching and Merging (v2.40+, https://git-scm.com/doc).
- Supabase Documentation: Database Functions and Security Definer (v2.38+).

#### Artefatos de pesquisa armazenados

- Nenhum artefato externo.

#### Dúvidas respondidas

- **Q**: A integração deve manter o commit de merge histórico ou usar rebase? → **A**: Utilizar merge formal sem fast-forward (`--no-ff`) para registrar no histórico do Git o fechamento auditado do PR #80.
- **Q**: A migration da Fase C deve ser aplicada durante a unificação? → **A**: Não. O princípio Expand & Contract estabelece que a Fase C só é ativada no banco após o deploy inaugural do frontend em produção.

#### Dúvidas abertas

- Nenhuma dúvida bloqueante.

### 3. Escopo e atores

#### Incluído

- Merge da branch `security/comprehensive-audit-hardening` na branch `develop`.
- Resolução e harmonização de qualquer divergência em Edge Functions e arquivos de configuração.
- Validação cruzada das suítes de testes Vitest (`src/` e `tests/security-fixes/`).
- Verificação do processo de build do frontend com Vite.
- Atualização e sincronização do status do PR #80 no GitHub.

#### Fora de escopo

- Deploy em produção na VPS Hostinger (reservado para SPEC-0004 / Phase B).
- Execução de migração Fase C no banco de produção.
- Alterações de design de interface visual ou novas features de produto.

#### Atores

- **Engenharia de Software**: Responsável pela unificação do repositório, resolução de divergências e garantia de testes verdes.
- **Operação de Infraestrutura**: Consome a linha de base unificada e auditada para empacotar o container de produção.
- **Usuários da Wallet**: Beneficiados pela eliminação de vulnerabilidades e estabilidade operacional.

### 4. Princípios e restrições do projeto

- **PR-001**: Tolerância zero para regressões em testes automatizados.
- **PR-002**: Preservação do histórico auditado através de commit formal de integração.
- **PR-003**: Princípio de não-interferência no worktree congelado `wallet-worktrees/security-audit`.
- **PR-004**: Mascaramento estrito de qualquer token ou credencial nos logs.

### 5. Histórias de usuário

#### US-001 — Unificação do Histórico Git do PR #80 (P1)

Como engenheiro de software, quero integrar os 70 commits da branch `security/comprehensive-audit-hardening` na `develop`, para consolidar integralmente o hardening de segurança homologado na base principal.

**Por que P1**: Bloqueio essencial para que a aplicação possa ser empacotada e promovida para produção.
**Teste independente**: Verificação via `git log` confirmando presença dos commits de segurança na árvore de `develop`.
**Requisitos**: FR-001, NFR-001

#### US-002 — Harmonização das Defesas de Segurança e Guardrails (P1)

Como engenheiro de software, quero garantir a convergência das proteções de SSRF, rate limit atômico e RLS seguro com os saneamentos da SPEC-0002, para manter o sistema protegido em todas as camadas.

**Por que P1**: Evita que melhorias de uma frente anulem proteções de outra frente.
**Teste independente**: Verificação estática e testes unitários das funções `validar-senha`, `test-webhook` e `openai-proxy`.
**Requisitos**: FR-002, NFR-002

#### US-003 — Validação Integral de Testes Automatizados (P1)

Como engenheiro de qualidade, quero executar a totalidade das baterias de testes no Vitest, para assegurar que nenhuma funcionalidade de produto sofreu regressão.

**Por que P1**: Garantia factual de que a plataforma continua íntegra e estável.
**Teste independente**: Execução do Vitest cobrindo 100% dos testes sem nenhuma quebra.
**Requisitos**: FR-003, NFR-003

#### US-004 — Verificação de Build e Prontidão de Release (P1)

Como operador de infraestrutura, quero validar o build estático do frontend e os arquivos de release, para liberar o empacotamento oficial da imagem Docker.

**Por que P1**: Assegura que o deploy na VPS ocorrerá sem erros de bundling ou arquivos ausentes.
**Teste independente**: Execução de `npm run build` gerando distribuição completa em `dist/`.
**Requisitos**: FR-004, NFR-004

### 6. Cenários BDD de aceite

#### AC-001 — Inspeção de Pré-Condições da Árvore Git

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-001
Feature: Verificação da Árvore Git Pré-Integração

  Scenario: Validação de estado limpo e conectividade com a branch de segurança
    Given o repositório local na branch develop
    When verificar o status da working tree e o apontamento para security/comprehensive-audit-hardening
    Then a base de divergência é confirmada sem commits órfãos
    And a working tree está pronta para receber a integração
```

#### AC-002 — Execução da Mesclagem Formal no Grafo Git

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-002
Feature: Mesclagem Formal de Branches

  Scenario: Unificação dos 70 commits com commit de integração
    Given a branch develop selecionada
    When executar o comando git merge para security/comprehensive-audit-hardening
    Then todos os commits de hardening são integrados na árvore
    And um commit de unificação formal é registrado no histórico
```

#### AC-003 — Preservação do Worktree de Auditoria Isolado

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-003
Feature: Preservação do Worktree Homologado

  Scenario: Conferência do diretório de segurança isolado
    Given o worktree em wallet-worktrees/security-audit
    When inspecionar o HEAD commit deste diretório
    Then o commit permanece inalterado em 62abcca849598abf8c815a11746393cc5e84d5ff
    And nenhum arquivo foi modificado no worktree isolado
```

#### AC-004 — Coexistência de Rate Limiting e Validação JWT

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-004
Feature: Harmonização de Rate Limit e Identidade

  Scenario: Verificação da função validar-senha com defesas completas
    Given o código unificado de validar-senha
    When uma requisição com modo validar for processada
    Then a identidade é validada contra auth.getUser
    And o rate limit atômico é conferido no banco Postgres
```

#### AC-005 — Mitigação Integrada contra SSRF em Webhooks

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-005
Feature: Proteção Integrada contra SSRF

  Scenario: Disparo de webhook com endereço restrito
    Given o validador ssrf-validator ativo na Edge Function
    When submeter uma URL apontando para IP privado ou loopback
    Then a requisição é interceptada e bloqueada com código de erro seguro
```

#### AC-006 — Manutenção do Isolamento de Segredos no .dockerignore

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-006
Feature: Manutenção da Blindagem Docker

  Scenario: Inspeção das regras de exclusão no .dockerignore unificado
    Given o arquivo .dockerignore resultante da integração
    When verificar a lista de padrões de exclusão
    Then o padrão amplo de bloqueio de variáveis de ambiente permanece ativo
```

#### AC-007 — Execução da Suíte de Testes da Aplicação

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-007
Feature: Não-Regressão da Aplicação

  Scenario: Execução dos testes existentes no Vitest
    Given os 1394 testes unitários e de integração em src/
    When o executor Vitest for acionado na suíte completa
    Then todos os testes passam sem falhas
```

#### AC-008 — Validação dos Testes de Segurança de SPEC-0002

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-008
Feature: Testes Focais de Segurança SPEC-0002

  Scenario: Execução da suíte tests/security-fixes/
    Given os 12 testes de bloqueio criados na SPEC-0002
    When executados pelo Vitest
    Then todos os 12 testes passam com resultado verde
```

#### AC-009 — Validação dos Testes de Segurança do PR #80

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-009
Feature: Testes de Segurança Integrados do PR #80

  Scenario: Execução dos testes em src/core/security/
    Given os arquivos de teste de matriz de autorização e rate limit
    When acionados pelo Vitest
    Then as asserções de segurança confirmam operação protegida
```

#### AC-010 — Compilação e Geração do Bundle com Vite

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-010
Feature: Build de Produção do Frontend

  Scenario: Execução do script npm run build
    Given o código-fonte unificado do frontend
    When o empacotador Vite processar os módulos da aplicação
    Then a pasta dist é gerada contendo os assets estáticos sem erros de compilação
```

#### AC-011 — Verificação do Manifesto docker-stack.yml

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-011
Feature: Integridade do Manifesto Docker

  Scenario: Verificação da configuração de serviço para Traefik
    Given o arquivo docker-stack.yml
    When inspecionar os serviços e labels do Traefik
    Then a regra de roteamento para wallet.cortexx.online com HTTPS automático é validada
```

#### AC-012 — Registro de Prontidão no GitHub

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-012
Feature: Governança do Repositório GitHub

  Scenario: Documentação do alinhamento do PR #80
    Given a reconciliação concluída no repositório local
    When inspecionar o status do PR #80 no GitHub
    Then as notas operacionais registram que a branch develop foi sincronizada
```

### 7. Requisitos

#### Funcionais

- **FR-001**: O repositório deve unificar os 70 commits de `security/comprehensive-audit-hardening` na branch `develop` via merge formal.
- **FR-002**: As Edge Functions devem harmonizar os módulos `_shared` (rate limiting, mitigação SSRF) com as proteções de identidade JWT da SPEC-0002.
- **FR-003**: Todas as suítes de testes automatizados (aplicação, segurança SPEC-0002 e segurança PR #80) devem ser executadas com 100% de sucesso.
- **FR-004**: O frontend deve compilar com sucesso via Vite e o manifesto `docker-stack.yml` deve estar validado para a release.

#### Não funcionais

- **NFR-001**: Rastreabilidade histórica: a integração deve preservar a linhagem de commits sem reescrita destrutiva.
- **NFR-002**: Segurança em profundidade: coexistência de rate limit atômico e validação de token JWT em todas as Edge Functions.
- **NFR-003**: Confiabilidade: zero regressões funcionais na aplicação comprovada pela suíte de 1394 testes.
- **NFR-004**: Determinismo no build: geração de assets estáticos em `dist/` sem dependências externas dinâmicas.

#### Erros e casos-limite

- Conflitos textuais de merge → Resolução manual preservando a versão mais restritiva de segurança.
- Falha em teste unitário após merge → Reversão ou ajuste pontual antes de avançar para a próxima etapa.
- Build do Vite com erro de importação de arquivo renomeado → Correção do caminho relativo mantendo o padrão modular.

## Ato II — Projetar e provar

### 8. Plano técnico

#### Contexto existente

- Branch `develop` em commit base com correções da SPEC-0002 aplicadas.
- Branch `security/comprehensive-audit-hardening` com 70 commits e CI verde.
- Worktree de auditoria isolado em `wallet-worktrees/security-audit`.

#### Arquitetura e módulos

- **Módulo de Governança Git**: Execução de merge formal `--no-ff` com validação de status limpo.
- **Módulo de Edge Functions Compartilhadas**: Inclusão de `_shared/ssrf-validator.ts`, `_shared/ai-rate-limiter.ts`, `_shared/validar-senha-core.ts` e `_shared/test-webhook-core.ts`.
- **Módulo de Testes de Segurança**: Inclusão de testes de integração em `src/core/security/` coexistindo com `tests/security-fixes/`.

#### Migrations

- Não aplicável: as migrações da Fase A já foram aplicadas no banco de produção e a Fase C aguarda o deploy do frontend.

#### Models

- Não aplicável: utiliza models e schemas existentes.

#### Controllers e casos de uso

- Handlers das Edge Functions atualizados para utilizar os módulos compartilhados harmonizados.

#### Views e experiência

- Não aplicável: entrega técnica de governança e segurança.

#### Queries e repositórios

- Consultas protegidas por RPCs seguras (`check_rate_limit`, `is_investimentos_unlocked`).

#### Jobs e processamento assíncrono

- Não aplicável.

#### Estrutura de arquivos

```text
supabase/functions/
  _shared/
    ssrf-validator.ts
    ai-rate-limiter.ts
    validar-senha-core.ts
    test-webhook-core.ts
  validar-senha/index.ts
  test-webhook/index.ts
  openai-proxy/index.ts
src/core/security/
  authorization-matrix.test.ts
  ai-consumers-integration.test.ts
  cross-feature-regression.test.ts
  ssrf-protection.test.ts
  validar-senha-crypto.test.ts
tests/reconciliation/
  git_reconciliation.test.ts
tests/security-fixes/
  validar_senha_security.test.ts
  test_webhook_security.test.ts
  openai_proxy_security.test.ts
  dockerignore_security.test.ts
```

### 9. Modelo de dados

#### Entidades

- Não aplicável: nenhuma entidade adicionada nesta fatia.

#### Estados e transições

- Não aplicável.

#### Migração e retenção

- Não aplicável.

### 10. Interfaces e contratos

#### Interface para pessoas

- **Há interface para pessoas**: Não. Esta entrega concentra-se exclusivamente em governança Git, unificação de branches, harmonização de Edge Functions e validação de testes.

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
| N/A | N/A | Entrega técnica de governança Git | N/A | N/A | N/A | N/A |

#### Estados e acessibilidade

- Não aplicável.

#### Contrato CRUD

- Não aplicável.

#### Revisão visual durante o desenvolvimento

- **Não aplicável**: A entrega é técnica de repositório e infraestrutura sem superfície visual.

#### APIs expostas

- Edge Functions integradas mantêm suas rotas canônicas no Supabase (`validar-senha`, `test-webhook`, `openai-proxy`, etc.).

#### APIs externas utilizadas

- Nenhuma externa adicional.

#### Documentação das APIs consultadas

- Git CLI reference manual.

#### Eventos e outros contratos

- Não aplicável.

### 11. Estratégia TDD

- **Unidade**: Testes de validação de criptografia de senha (`validar-senha-crypto.test.ts`), sanitização HTML (`gerar-recibo-xss.test.ts`) e proteção SSRF (`ssrf-protection.test.ts`).
- **Integração**: Testes de matriz de autorização (`authorization-matrix.test.ts`) e suíte de bloqueios (`tests/security-fixes/`).
- **BDD/aceite**: Cenários AC-001 a AC-012 descritos em Gherkin na seção 6.
- **Runner TDD**: Vitest executado via `npx vitest run`.

#### Evidência RED-GREEN-REFACTOR

| IDs | BDD de referência | Teste TDD informado pelo BDD | RED observado | GREEN observado | Refactor/regressão |
| --- | --- | --- | --- | --- | --- |
| US-001, FR-001, NFR-001, AC-001 | AC-001 na seção 6 | caso 1 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-001 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-001, FR-001, NFR-001, AC-002 | AC-002 na seção 6 | caso 2 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-002 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-001, FR-001, NFR-001, AC-003 | AC-003 na seção 6 | caso 3 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-003 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-002, FR-002, NFR-002, AC-004 | AC-004 na seção 6 | caso 4 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-004 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-002, FR-002, NFR-002, AC-005 | AC-005 na seção 6 | caso 5 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-005 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-002, FR-002, NFR-002, AC-006 | AC-006 na seção 6 | caso 6 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-006 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-003, FR-003, NFR-003, AC-007 | AC-007 na seção 6 | caso 7 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-007 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-003, FR-003, NFR-003, AC-008 | AC-008 na seção 6 | caso 8 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-008 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-003, FR-003, NFR-003, AC-009 | AC-009 na seção 6 | caso 9 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-009 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-004, FR-004, NFR-004, AC-010 | AC-010 na seção 6 | caso 10 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-010 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-004, FR-004, NFR-004, AC-011 | AC-011 na seção 6 | caso 11 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-011 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |
| US-004, FR-004, NFR-004, AC-012 | AC-012 na seção 6 | caso 12 em tests/reconciliation/git_reconciliation.test.ts com marcador próprio SPECSFY:AC-012 | Falha controlada comprovada no Vitest: branch develop defasada em 70 commits antes da mesclagem. | Pending | Pending |

### 12. Plano de testes e rastreabilidade

| Requisito | Cenário BDD | Nível | Arquivo/comando esperado | Evidência |
| --- | --- | --- | --- | --- |
| FR-001 | AC-001 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-001 | AC-002 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-001 | AC-003 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-002 | AC-004 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-002 | AC-005 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-002 | AC-006 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-003 | AC-007 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-003 | AC-008 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-003 | AC-009 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-004 | AC-010 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-004 | AC-011 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| FR-004 | AC-012 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-001 | AC-001 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-001 | AC-002 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-001 | AC-003 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-002 | AC-004 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-002 | AC-005 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-002 | AC-006 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-003 | AC-007 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-003 | AC-008 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-003 | AC-009 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-004 | AC-010 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-004 | AC-011 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |
| NFR-004 | AC-012 | Integração | tests/reconciliation/git_reconciliation.test.ts | Pending |

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
- **Resultado**: 12 tarefas TDD concluídas com RED comprovado no Vitest e rastreabilidade total (24/24 IDs cobertos).

#### Gate do Ato III — Entrega

- **Status**: Pending
- **Validador**: verify_evidence.mjs
- **Condição de saída**: Merge formal executado sem conflitos, suíte Vitest em GREEN e build do Vite aprovado.

### 14. Tarefas

- [x] T001 [TEST] [TDD] [US-001] Elaborar teste de inspeção de pré-condições da árvore Git em tests/reconciliation/git_reconciliation.test.ts — Refs: US-001, FR-001, NFR-001, AC-001 — Depends: none
  - [x] **PREP**: Configurar ambiente do runner Vitest para execução dos testes de reconciliação
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-001 validando base de divergência entre branches
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Gravar saída de verificação no log
  - [x] **IMPROVE**: Garantir validação precisa dos SHAs de base

- [x] T002 [TEST] [TDD] [US-001] Elaborar teste de confirmação da mesclagem formal em tests/reconciliation/git_reconciliation.test.ts — Refs: US-001, FR-001, NFR-001, AC-002 — Depends: none
  - [x] **PREP**: Inspecionar histórico do grafo Git local
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-002 validando presença do commit de unificação
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Registrar saída de verificação no log
  - [x] **IMPROVE**: Checar presença dos 70 commits no log

- [x] T003 [TEST] [TDD] [US-001] Elaborar teste de integridade do worktree isolado em tests/reconciliation/git_reconciliation.test.ts — Refs: US-001, FR-001, NFR-001, AC-003 — Depends: none
  - [x] **PREP**: Localizar caminho do worktree wallet-worktrees/security-audit
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-003 conferindo HEAD commit fixo em 62abcca8
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Anotar integridade do repositório no log
  - [x] **IMPROVE**: Assegurar que o worktree permanece congelado

- [x] T004 [TEST] [TDD] [US-002] Elaborar teste de coexistência de rate limit e auth em tests/reconciliation/git_reconciliation.test.ts — Refs: US-002, FR-002, NFR-002, AC-004 — Depends: none
  - [x] **PREP**: Verificar arquivos da função validar-senha e módulos compartilhados
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-004 testando presença de check_rate_limit e auth.getUser
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Gravar saída no log
  - [x] **IMPROVE**: Conferir código de retorno 401 e 429

- [x] T005 [TEST] [TDD] [US-002] Elaborar teste de presença de proteção SSRF em tests/reconciliation/git_reconciliation.test.ts — Refs: US-002, FR-002, NFR-002, AC-005 — Depends: none
  - [x] **PREP**: Verificar arquivo supabase/functions/_shared/ssrf-validator.ts
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-005 validando bloqueio de IPs privados e loopback
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Anotar resultado no log
  - [x] **IMPROVE**: Validar regras para faixas RFC 1918

- [x] T006 [TEST] [TDD] [US-002] Elaborar teste de manutenção de .dockerignore blindado em tests/reconciliation/git_reconciliation.test.ts — Refs: US-002, FR-002, NFR-002, AC-006 — Depends: none
  - [x] **PREP**: Ler conteúdo do arquivo .dockerignore
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-006 garantindo padrão de exclusão **/.env*
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Gravar validação no log
  - [x] **IMPROVE**: Confirmar que nenhuma regra frágil substitui o padrão amplo

- [x] T007 [TEST] [TDD] [US-003] Elaborar teste de conformidade da suíte de aplicação em tests/reconciliation/git_reconciliation.test.ts — Refs: US-003, FR-003, NFR-003, AC-007 — Depends: none
  - [x] **PREP**: Localizar suíte de testes em src/
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-007 checando ausência de erros na execução
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Gravar contagem de testes no log
  - [x] **IMPROVE**: Assegurar cobertura total de 1394 testes

- [x] T008 [TEST] [TDD] [US-003] Elaborar teste de execução dos testes de SPEC-0002 em tests/reconciliation/git_reconciliation.test.ts — Refs: US-003, FR-003, NFR-003, AC-008 — Depends: none
  - [x] **PREP**: Localizar pasta tests/security-fixes/
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-008 garantindo 12 testes verdes
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Registrar aprovação no log
  - [x] **IMPROVE**: Validar persistência dos testes de regressão

- [x] T009 [TEST] [TDD] [US-003] Elaborar teste de execução dos testes de segurança do PR #80 em tests/reconciliation/git_reconciliation.test.ts — Refs: US-003, FR-003, NFR-003, AC-009 — Depends: none
  - [x] **PREP**: Localizar pasta src/core/security/
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-009 conferindo presença dos testes de segurança
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Anotar lista de testes no log
  - [x] **IMPROVE**: Assegurar integridade dos testes de rate limit

- [x] T010 [TEST] [TDD] [US-004] Elaborar teste de validação do build estático em tests/reconciliation/git_reconciliation.test.ts — Refs: US-004, FR-004, NFR-004, AC-010 — Depends: none
  - [x] **PREP**: Verificar configuração do package.json para script build
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-010 atestando integridade do bundle em dist/
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Gravar evidência de build no log
  - [x] **IMPROVE**: Conferir existência dos arquivos index.html e assets/

- [x] T011 [TEST] [TDD] [US-004] Elaborar teste de integridade do docker-stack.yml em tests/reconciliation/git_reconciliation.test.ts — Refs: US-004, FR-004, NFR-004, AC-011 — Depends: none
  - [x] **PREP**: Ler arquivo docker-stack.yml
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-011 validando labels do Traefik e rede pública
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Registrar integridade do manifesto no log
  - [x] **IMPROVE**: Conferir parâmetros de rollback do serviço

- [x] T012 [TEST] [TDD] [US-004] Elaborar teste de governança do PR #80 no GitHub em tests/reconciliation/git_reconciliation.test.ts — Refs: US-004, FR-004, NFR-004, AC-012 — Depends: none
  - [x] **PREP**: Consultar estado do PR #80 via GitHub API
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-012 validando rastreabilidade da sincronização
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [x] **EVIDENCE**: Gravar dados de governança no log
  - [x] **IMPROVE**: Garantir registro claro de commits integrados

- [ ] T013 [CODE] [US-001] Executar merge formal da branch security/comprehensive-audit-hardening na develop — Refs: US-001, FR-001, NFR-001, AC-001, AC-002, AC-003 — Depends: T001, T002, T003
  - [ ] **PREP**: Garantir working tree limpa e sincronizada
  - [ ] **EXECUTE**: Executar git merge --no-ff security/comprehensive-audit-hardening resolvendo eventuais conflitos
  - [ ] **VERIFY**: Executar testes T001, T002 e T003 no Vitest validando passagem em GREEN
  - [ ] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [ ] **EVIDENCE**: Gravar hash do commit de unificação
  - [ ] **IMPROVE**: Garantir preservação integral do grafo de commits

- [ ] T014 [CODE] [US-002] Conciliar e harmonizar Edge Functions em supabase/functions/ e configurações unificadas — Refs: US-002, FR-002, NFR-002, AC-004, AC-005, AC-006 — Depends: T004, T005, T006
  - [ ] **PREP**: Mapear arquivos modificados em supabase/functions/ e .dockerignore
  - [ ] **EXECUTE**: Consolidar código de validar-senha, test-webhook e openai-proxy com módulos _shared
  - [ ] **VERIFY**: Executar testes T004, T005 e T006 no Vitest validando passagem em GREEN
  - [ ] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [ ] **EVIDENCE**: Salvar evidência de código seguro e harmonizado
  - [ ] **IMPROVE**: Garantir mascaramento de tokens em mensagens de erro

- [ ] T015 [CODE] [US-003] Executar suíte completa de testes em src/ e tests/reconciliation/ no Vitest e assegurar zero regressões — Refs: US-003, FR-003, NFR-003, AC-007, AC-008, AC-009 — Depends: T007, T008, T009
  - [ ] **PREP**: Preparar ambiente de execução de testes
  - [ ] **EXECUTE**: Rodar npx vitest run para aplicação e testes de segurança
  - [ ] **VERIFY**: Executar testes T007, T008 e T009 no Vitest validando passagem em GREEN
  - [ ] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [ ] **EVIDENCE**: Gravar log da execução dos testes
  - [ ] **IMPROVE**: Confirmar que todos os 1394 testes originais continuam passando

- [ ] T016 [CODE] [US-004] Executar build do Vite gerando dist/ e validar manifestos em docker-stack.yml — Refs: US-004, FR-004, NFR-004, AC-010, AC-011, AC-012 — Depends: T010, T011, T012, T013, T014, T015
  - [ ] **PREP**: Limpar pasta dist/ e verificar variáveis de ambiente de build
  - [ ] **EXECUTE**: Executar npm run build e validar docker-stack.yml
  - [ ] **VERIFY**: Executar testes T010, T011 e T012 no Vitest validando passagem em GREEN
  - [ ] **VISUAL**: Não aplicável: tarefa técnica de governança sem componentes de interface
  - [ ] **EVIDENCE**: Gravar artefatos de build gerados com sucesso
  - [ ] **IMPROVE**: Confirmar que a base está pronta para a Phase B

### 15. Ordem de execução

1. **Fase 1 (Testes TDD de Reconciliação)**: Implementação de T001 a T012 em tests/reconciliation/.
2. **Fase 2 (Merge Formal e Harmonização)**:
   - T013: Execução de merge formal `--no-ff`.
   - T014: Conciliação de Edge Functions e .dockerignore.
3. **Fase 3 (Validação Integral e Prontidão de Release)**:
   - T015: Execução da suíte completa de testes (não-regressão).
   - T016: Build do Vite e validação do manifesto Docker Swarm.

### 16. Dependências, riscos e suposições

#### Dependências

- **DEP-001**: Git CLI local instalado e operacional.
- **DEP-002**: Dependências npm do projeto e runner Vitest.

#### Riscos

- **RSK-001**: Conflitos de mesclagem em Edge Functions → **Mitigação**: Resolução manual metódica integrando os módulos modulares de `_shared` com as proteções de token da SPEC-0002.
- **RSK-002**: Regressão de testes de frontend → **Mitigação**: Execução obrigatória dos 1394 testes antes de fechar a entrega.

#### Suposições

- **SUP-001**: A branch `security/comprehensive-audit-hardening` contém exatamente os 70 commits auditados no PR #80.

### 17. Decisões

- **DEC-001**: Merge `--no-ff` — Manter commit explícito de unificação no grafo Git para rastreabilidade auditável.
- **DEC-002**: Não aplicar Fase C antes do deploy — O princípio Expand & Contract mantém as colunas seguras permissivas até que o novo frontend esteja em produção na VPS.

### 18. Definition of Done

- [ ] `Definition Gate` está `Passed`.
- [ ] `Plan Gate` está `Passed`.
- [ ] `Delivery Gate` está `Passed`.
- [ ] Todos os cenários `AC` aplicáveis passam.
- [ ] Todos os requisitos possuem evidência de verificação.
- [ ] Todas as tarefas na seção 14 estão concluídas.
- [ ] Testes e checks estáticos disponíveis passam.
