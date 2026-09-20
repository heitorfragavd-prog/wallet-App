# Especificação integrada: Auditoria Geral de Seguranca Debito Tecnico e Prontidao para Producao

| Campo | Valor |
| --- | --- |
| Formato | Specsfy/2.0 |
| ID | SPEC-0001 |
| Slug | 0001-auditoria-seguranca-debito-tecnico-producao |
| Status | Complete |
| Effort | 4 |
| Effort updated at | 2026-09-16 |
| Effort rationale | Diagnóstico exaustivo em 4 frentes simultâneas (Segurança/Segredos, Qualidade/Build/Testes, Governança Git/Branches e Infraestrutura/Produção) sem efeitos colaterais. |
| ClickUp Task | |
| Milestones | Phase B / Produção |
| Definition Gate | Passed |
| Plan Gate | Passed |
| Delivery Gate | Passed |
| Evidence Contract | 1 |
| Interface para pessoas | Não |
| Atualizada em | 2026-09-16 |

## Ato I — Definir

### 1. Problema e resultado

#### Problema

A aplicação Wallet está sendo preparada para entrada em ambiente produtivo (Phase B com Docker Swarm, Traefik e PostgreSQL Supabase), porém há riscos de vulnerabilidades de segurança, valores fixos (*hardcoded*) e segredos no código-fonte, débitos técnicos acumulados (testes quebrados, erros de compilação TypeScript), divergências entre branches/worktrees de homologação e lacunas de configuração de runtime que podem provocar incidentes, vazamento de dados ou indisponibilidade em produção.

#### Resultado desejado

Um diagnóstico minucioso, qualificado e auditável de o repositório completo, cobrindo as 4 frentes críticas sem alterar o código, acompanhado de uma matriz de severidade (Crítico, Alto, Médio, Baixo) e um plano de correção detalhado com bloqueios rígidos para a liberação da release em produção.

#### Métricas de sucesso

- 100% dos arquivos do repositório varridos para identificação de credenciais, chaves de API e segredos expostos.
- 100% das branches locais/remotas e worktrees mapeadas com cálculo do delta de commits e integridade do worktree homologado PR #80.
- Relatório completo de sanidade técnica com contagem exata de erros de tipagem (`tsc`), falhas de build (`vite build`) e testes quebrados (`vitest`).
- Plano de ação estruturado com 0 tolerância para itens Críticos/Altos na liberação de deploy.

### 2. Research e esclarecimentos

#### Researchs executados

- **R-001**: O worktree `wallet-worktrees/security-audit` na branch `security/comprehensive-audit-hardening` contém o HEAD homologado da Phase A (`62abcca849598abf8c815a11746393cc5e84d5ff`) sobre develop (`3a057fe506d13be80a97925a09100ecc9ef8899f`) e deve permanecer intocado durante o diagnóstico.
- **R-002**: A branch `develop` atual na raiz principal `c:\Users\Heitor\OneDrive\Documentos\Dev\wallet` é a base de código consumidora onde as checagens estáticas e varreduras serão executadas.
- **R-003**: A arquitetura de produção definida é Docker Swarm single-node + Traefik + Nginx/frontend Wallet sob o domínio `wallet.cortexx.online`, utilizando PostgreSQL e Edge Functions no Supabase.

#### Fontes e contexto consultados

- Código-fonte, migrations em `supabase/migrations/`, funções em `supabase/functions/`, configurações em `.env.example`, `vite.config.ts`, `tsconfig.json`.
- Repositório Git local e worktrees registrados via `git worktree list`.
- Documentação técnica recém-gerada em `docs/` e `PROJECT.md`.

#### Documentação consultada

- Documentação do Supabase Auth e Row Level Security (RLS).
- Diretrizes de segurança OWASP para proteção de credenciais e API keys em SPAs React.
- Guia de Docker Swarm e Traefik para proxy reverso SSL/TLS.

#### Artefatos de pesquisa armazenados

- Nenhum artefato externo além das fontes locais do projeto.

#### Dúvidas respondidas

- **Q**: Qual estratégia deve orientar o diagnóstico? → **A**: Varredura completa cobrindo simultaneamente as 4 frentes em modo leitura estrita (sem alterar código).
- **Q**: Como estruturar o plano de correção e bloqueio? → **A**: Fatiamento por severidade com bloqueio estrito; itens Críticos e Altos impedem o deploy para produção.

#### Dúvidas abertas

- Nenhuma dúvida bloqueante para a fase de especificação da auditoria.

### 3. Escopo e atores

#### Incluído

- Varredura de segurança: segredos, credenciais, API keys, tokens, endpoints desprotegidos e policies RLS em migrations.
- Diagnóstico de qualidade técnica: checagem estática de tipos TypeScript (`npx tsc --noEmit`), execução e levantamento de falhas na suíte de testes Vitest, linter e integridade do build Vite.
- Auditoria de branches e worktrees: análise de branches ativas, worktrees existentes, histórico de commits divergentes e conformidade com PR #80.
- Avaliação de infraestrutura e runtime: Dockerfile, compose/stack files, configuração de proxy Traefik, sanitização de variáveis de ambiente de frontend (`VITE_*`).
- Consolidação do relatório diagnóstico com matriz de severidade e plano de mitigação/correção.

#### Fora de escopo

- Aplicação imediata de correções de código em produção durante esta etapa.
- Modificação ou descarte do worktree `wallet-worktrees/security-audit`.
- Contratação, compra ou provisionamento de VPS antes da aprovação do plano.

#### Atores

- **Desenvolvedor / Auditor**: Responsável por executar as varreduras, compilar os resultados e propor o plano de ação.
- **Mantenedor / Tomador de Decisão**: Avalia os achados, autoriza as prioridades do plano e valida os gates de release.
- **Usuário Final**: Beneficiário da confiabilidade, estabilidade e segurança da aplicação em produção.

### 4. Princípios e restrições do projeto

- **PR-001 (Modo Leitura Estrita)**: A auditoria diagnóstica não deve alterar o código de produção nem a base de dados até a validação do plano.
- **PR-002 (Preservação de Homologações Anteriores)**: O PR #80 e a branch de auditoria de segurança da Phase A permanecem congelados e isolados.
- **PR-003 (Tolerância Zero para Chaves Expostas)**: Nenhuma chave de API privada, service_role key ou segredo pode permanecer no frontend ou no bundle compilado.
- **PR-004 (Rastreabilidade Normativa)**: Toda evidência e diagnóstico devem ser mensuráveis com arquivos, números de linha e comandos executáveis.

### 5. Histórias de usuário

#### US-001 — Varredura Exaustiva de Segurança e Segredos (P1)

Como mantenedor do projeto, quero uma varredura completa de valores hardcoded, chaves de API, credenciais e permissões de banco, para garantir que o sistema não possua brechas de segurança antes de ir para produção.

**Por que P1**: Vazamento de credenciais ou brechas de segurança causam danos imediatos e irreparáveis em produção.
**Teste independente**: Executar scripts estáticos de detecção de segredos e patterns de chaves e validar que todas as ocorrências sejam catalogadas com severidade.
**Requisitos**: FR-001, NFR-001

#### US-002 — Diagnóstico de Qualidade Técnica, Build e Testes (P1)

Como desenvolvedor da Wallet, quero saber exatamente quais erros de TypeScript, falhas de testes e débitos de build existem no código atual, para conhecer os gargalos de estabilidade que impedem uma release limpa.

**Por que P1**: Software que não compila com 0 erros de tipos ou possui testes falhando não pode ser empacotado para produção.
**Teste independente**: Executar `tsc --noEmit`, `vitest run` e `vite build`, capturando logs completos e catalogando as falhas.
**Requisitos**: FR-002, NFR-002

#### US-003 — Auditoria de Branches, Worktrees e Histórico Git (P1)

Como mantenedor do repositório, quero auditar todas as branches e worktrees do projeto, para garantir que branches divergentes não sejam mescladas acidentalmente e que a homologação da Phase A permaneça preservada.

**Por que P1**: Conflitos e branches desincronizadas causam regressão silenciosa de código homologado.
**Teste independente**: Inspecionar o grafo Git (`git log`, `git worktree list`, `git status`), reportando deltas exatos entre `develop`, PR #80 e origin.
**Requisitos**: FR-003, NFR-003

#### US-004 — Matriz de Severidade e Plano de Ação para Produção (P1)

Como tomador de decisão, quero uma matriz consolidada de riscos e um plano de ação priorizado com bloqueios estritos, para coordenar as correções necessárias antes do deploy produtivo.

**Por que P1**: É o produto final indispensável para orientar a implementação das correções de forma segura e organizada.
**Teste independente**: Apresentação de matriz categorizada por severidade (Crítico, Alto, Médio, Baixo) contendo plano de mitigação por frentes.
**Requisitos**: FR-004, NFR-004

### 6. Cenários BDD de aceite

#### AC-001 — Detecção e Catalogação de Chaves e Segredos

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-001
Feature: Varredura de Segurança e Segredos

  Scenario: Identificação de credenciais e valores hardcoded
    Given o código-fonte atual na branch develop e os manifests do projeto
    When a rotina de varredura estática de segurança for executada
    Then todas as ocorrências de chaves expostas, segredos, senhas e URLs fixas são catalogadas
    And cada ocorrência recebe classificação de severidade com arquivo e linha identificados
```

#### AC-002 — Identificação de Credenciais em Edge Functions e Migrations

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-002
Feature: Auditoria de Backend e Migrations

  Scenario: Inspeção de Edge Functions e SQLs do Supabase
    Given as pastas de edge functions e migrations no repositório
    When os arquivos SQL e TypeScript forem inspecionados para grants e segredos
    Then qualquer uso indevido de service_role ou ausência de RLS é catalogado
    And os endpoints sensíveis são listados com suas respectivas políticas de acesso
```

#### AC-003 — Validação de Mascaramento e Catalogação de Gravidade

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-003
Feature: Proteção de Segredos e Mascaramento

  Scenario: Mascaramento de dados confidenciais nos relatórios
    Given os achados de segurança identificados
    When o relatório diagnóstico for compilado
    Then nenhum segredo real ou token sensível é exposto em texto claro no artefato
    And a matriz apresenta o nível de severidade correspondente a cada vulnerabilidade
```

#### AC-004 — Checagem Estática de Tipagem TypeScript com tsc

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-004
Feature: Checagem Estática TypeScript

  Scenario: Execução do compilador de tipos
    Given o código-fonte TypeScript da aplicação
    When o comando tsc sem emissão for executado
    Then todas as falhas de tipagem são catalogadas com arquivo e código de erro
    And a contagem consolidada de erros de compilação é apresentada
```

#### AC-005 — Execução e Diagnóstico de Falhas na Suíte Vitest

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-005
Feature: Diagnóstico da Suíte de Testes

  Scenario: Execução dos testes automatizados
    Given a suíte de testes unitários e de integração
    When o comando de execução do Vitest for disparado
    Then o total de testes aprovados, reprovados e pulados é contabilizado
    And cada teste com falha é detalhado com sua mensagem de erro e causa raiz
```

#### AC-006 — Verificação de Empacotamento de Produção com vite build

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-006
Feature: Verificação de Build de Produção

  Scenario: Teste de geração de bundle
    Given o ambiente de build configurado no projeto
    When o processo de build do Vite for acionado
    Then o resultado de sucesso ou falha na geração dos artefatos estáticos é registrado
    And eventuais alertas de dependências circulares ou bundles excessivos são listados
```

#### AC-007 — Mapeamento e Comparação de Branches Locais e Remotas

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-007
Feature: Governança do Grafo Git

  Scenario: Levantamento de branches ativas
    Given o repositório Git local e os remotos configurados
    When o inventário de branches for inspecionado
    Then a lista completa de branches locais e rastreadas remotamente é exibida
    And o estado de avanço ou atraso em relação à develop é reportado
```

#### AC-008 — Verificação de Integridade e Isolamento do Worktree PR #80

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-008
Feature: Isolamento do Worktree de Auditoria

  Scenario: Checagem do worktree homologado da Phase A
    Given o worktree wallet-worktrees/security-audit configurado
    When a auditoria de repositório for executada
    Then o HEAD do worktree permanece inalterado no commit homologado
    And nenhuma alteração é introduzida na sua working tree
```

#### AC-009 — Auditoria de Divergências e Commits Não Mesclados

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-009
Feature: Detecção de Divergências de Branches

  Scenario: Auditoria de commits divergentes
    Given as branches ativas no repositório
    When as diferenças de commits forem calculadas
    Then todos os commits não integrados são identificados com autor e data
    And os potenciais conflitos para futuros merges são mapeados
```

#### AC-010 — Consolidação da Matriz de Severidade dos Achados

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-010
Feature: Matriz de Severidade

  Scenario: Classificação de risco dos apontamentos
    Given a lista consolidada de achados das frentes auditadas
    When a matriz de riscos for gerada
    Then cada item recebe severidade entre Crítico, Alto, Médio e Baixo
    And a justificativa técnica do risco é anexada a cada apontamento
```

#### AC-011 — Definição de Critérios Bloqueantes para Deploy

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-011
Feature: Portões de Bloqueio de Release

  Scenario: Aplicação da regra de tolerância zero
    Given a matriz de severidade preenchida
    When os critérios de liberação para produção forem avaliados
    Then qualquer apontamento Crítico ou Alto é marcado como bloqueante para deploy
    And a liberação para produção é suspensa até a resolução desses itens
```

#### AC-012 — Estruturação do Plano de Ação Corretivo Faseado

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-012
Feature: Plano de Ação para Produção

  Scenario: Ordenação e planejamento das correções
    Given os achados priorizados por severidade
    When o plano de ação for estruturado
    Then as correções são organizadas em fases lógicas com dependências claras
    And estimativas de esforço e testes de validação são fornecidos para cada fase
```

### 7. Requisitos

#### Funcionais

- **FR-001**: O sistema de auditoria deve varrer arquivos de frontend, edge functions, migrations e scripts buscando padrões de chaves sensíveis (OpenAI, Pluggy, Supabase service_role, senhas).
- **FR-002**: O sistema de diagnóstico deve executar checagem de tipos (`tsc --noEmit`), suíte de testes (`vitest run`) e teste de empacotamento (`vite build`), extraindo o inventário de falhas.
- **FR-003**: A auditoria de repositório deve listar todas as branches locais e remotas, comparar HEADs de branches ativas (`develop`, `security/comprehensive-audit-hardening`, PR #80) e apontar commits não mesclados ou divergentes.
- **FR-004**: O relatório deve consolidar os achados em matriz de severidade (Crítico, Alto, Médio, Baixo) e propor plano de ação estruturado em etapas.

#### Não funcionais

- **NFR-001**: A varredura de segurança não deve armazenar nem expor valores reais de tokens confidenciais nos artefatos públicos. **Verificação**: Mascaramento de segredos nos logs e relatórios.
- **NFR-002**: O diagnóstico deve ser 100% determinístico e reproduzível através de comandos de linha de comando documentados. **Verificação**: Execução idêntica dos comandos reportados.
- **NFR-003**: A integridade dos worktrees deve ser preservada sem gerar commits espúrios nem alterações na working tree de auditoria. **Verificação**: `git status` limpo no worktree PR #80.
- **NFR-004**: O plano de correção deve obedecer à política de tolerância zero para falhas Críticas/Altas antes do deploy. **Verificação**: Matriz de gates com status explícito.

#### Erros e casos-limite

- Variável de ambiente ausente no `.env.example` → Catalogada como débito de configuração.
- Teste com falha por mock de API externa → Catalogado como fragilidade de teste unitário.
- Divergência de commits entre develop e branches de homologação → Sinalizada como risco de regressão.

## Ato II — Projetar e provar

### 8. Plano técnico

#### Contexto existente

- Repositório monorepo/SPA em React 18 + TypeScript + Vite + TailwindCSS.
- Backend em Supabase (PostgreSQL 15 com extensões, Edge Functions em Deno e Row Level Security).
- Testes automatizados com Vitest e React Testing Library.
- Ambiente de produção alvo: Docker Swarm single-node com proxy reverso Traefik e terminação SSL/TLS em `wallet.cortexx.online`.
- Branches críticas no Git: `develop` (linha de base de desenvolvimento) e `security/comprehensive-audit-hardening` (worktree isolado do PR #80).

#### Arquitetura e módulos

- **Módulo de Segurança**: Inspeção estática de variáveis de ambiente, arquivos frontend (`src/`), Edge Functions (`supabase/functions/`) e migrations SQL (`supabase/migrations/`).
- **Módulo de Qualidade**: Verificação estática de tipos via compilador TypeScript (`tsc`), suíte de testes unitários e de integração (`vitest`) e validação de empacotamento com Vite.
- **Módulo de Governança Git**: Inspeção de branches, worktrees, integridade de commits e conformidade com PR #80.
- **Módulo de Prontidão de Produção**: Matriz de severidade dos achados e plano de ação estruturado com critérios bloqueantes.

#### Migrations

- Não aplicável: auditoria diagnóstica em modo estrito de leitura, sem alterações de banco de dados.

#### Models

- Não aplicável: a auditoria opera sobre metadados, código-fonte e histórico Git.

#### Controllers e casos de uso

- Não aplicável: sem novos endpoints ou controladores de aplicação.

#### Views e experiência

- Não aplicável: a entrega consiste em relatórios diagnósticos técnicos em Markdown (`docs/audit/`).

#### Queries e repositórios

- Não aplicável: nenhuma consulta a dados produtivos de usuários.

#### Jobs e processamento assíncrono

- Não aplicável.

#### Estrutura de arquivos

```text
docs/audit/
  security-findings.md
  quality-findings.md
  git-governance-findings.md
  production-readiness-plan.md
tests/audit/
  security_audit.test.ts
  quality_audit.test.ts
  git_governance.test.ts
  production_readiness.test.ts
```

### 9. Modelo de dados

#### Entidades

- Não aplicável: auditoria estática sem persistência de entidades.

#### Estados e transições

- Não aplicável.

#### Migração e retenção

- Não aplicável.

### 10. Interfaces e contratos

#### Interface para pessoas

- **Há interface para pessoas**: Não. Esta entrega concentra-se exclusivamente em auditoria diagnóstica de segurança, qualidade técnica, governança Git e infraestrutura, executada via scripts estáticos e comandos de inspeção em linha de comando, sem alteração nem criação de novas telas ou interfaces visuais.

#### Stack e convenções de interface

- Não aplicável para a execução desta auditoria diagnóstica.

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
| N/A | N/A | Auditoria sem componentes visuais | N/A | N/A | N/A | N/A |

#### Estados e acessibilidade

- Não aplicável.

#### Contrato CRUD

- Não aplicável.

#### Revisão visual durante o desenvolvimento

- **Não aplicável**: A entrega é uma auditoria diagnóstica e plano de ação técnico sem superfície visual.

#### APIs expostas

- Não aplicável: nenhuma API REST ou RPC criada.

#### APIs externas utilizadas

- Nenhuma: diagnósticos estáticos e locais.

#### Documentação das APIs consultadas

- Nenhuma: sem chamadas externas.

#### Eventos e outros contratos

- Não aplicável.

### 11. Estratégia TDD

- **Unidade**: Testes de validação de mascaramento de segredos, ausência de tokens em relatórios e formatação canônica de matrizes de risco.
- **Integração/contrato**: Testes de verificação estática do grafo Git, integridade do worktree PR #80 e consistência dos relatórios de auditoria.
- **BDD/aceite**: Cenários AC-001 a AC-012 descritos em Gherkin na seção 6.
- **Runner TDD**: Vitest executado via `npx vitest run tests/audit/`.
- **E2E**: Não aplicável.
- **Verificação manual**: Nenhuma; verificação 100% automatizada e reprodutível.

#### Evidência RED-GREEN-REFACTOR

| IDs | BDD de referência | Teste TDD informado pelo BDD | RED observado | GREEN observado | Refactor/regressão |
| --- | --- | --- | --- | --- | --- |
| US-001, FR-001, NFR-001, AC-001 | AC-001 na seção 6 | caso 1 em tests/audit/security_audit.test.ts com marcador próprio SPECSFY:AC-001 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-001, FR-001, NFR-001, AC-002 | AC-002 na seção 6 | caso 2 em tests/audit/security_audit.test.ts com marcador próprio SPECSFY:AC-002 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-001, FR-001, NFR-001, AC-003 | AC-003 na seção 6 | caso 3 em tests/audit/security_audit.test.ts com marcador próprio SPECSFY:AC-003 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-002, FR-002, NFR-002, AC-004 | AC-004 na seção 6 | caso 4 em tests/audit/quality_audit.test.ts com marcador próprio SPECSFY:AC-004 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-002, FR-002, NFR-002, AC-005 | AC-005 na seção 6 | caso 5 em tests/audit/quality_audit.test.ts com marcador próprio SPECSFY:AC-005 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-002, FR-002, NFR-002, AC-006 | AC-006 na seção 6 | caso 6 em tests/audit/quality_audit.test.ts com marcador próprio SPECSFY:AC-006 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-003, FR-003, NFR-003, AC-007 | AC-007 na seção 6 | caso 7 em tests/audit/git_governance.test.ts com marcador próprio SPECSFY:AC-007 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-003, FR-003, NFR-003, AC-008 | AC-008 na seção 6 | caso 8 em tests/audit/git_governance.test.ts com marcador próprio SPECSFY:AC-008 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-003, FR-003, NFR-003, AC-009 | AC-009 na seção 6 | caso 9 em tests/audit/git_governance.test.ts com marcador próprio SPECSFY:AC-009 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-004, FR-004, NFR-004, AC-010 | AC-010 na seção 6 | caso 10 em tests/audit/production_readiness.test.ts com marcador próprio SPECSFY:AC-010 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-004, FR-004, NFR-004, AC-011 | AC-011 na seção 6 | caso 11 em tests/audit/production_readiness.test.ts com marcador próprio SPECSFY:AC-011 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |
| US-004, FR-004, NFR-004, AC-012 | AC-012 na seção 6 | caso 12 em tests/audit/production_readiness.test.ts com marcador próprio SPECSFY:AC-012 | Falha controlada comprovada no Vitest (12 failed): relatório em docs/audit/ ausente antes da execução diagnóstica. | 12/12 testes passando no Vitest com relatórios diagnósticos gerados em docs/audit/ | Pending |

### 12. Plano de testes e rastreabilidade

| Requisito | Cenário BDD | Nível | Arquivo/comando esperado | Evidência |
| --- | --- | --- | --- | --- |
| FR-001 | AC-001 | Integração | tests/audit/security_audit.test.ts | Pending |
| FR-001 | AC-002 | Integração | tests/audit/security_audit.test.ts | Pending |
| FR-001 | AC-003 | Integração | tests/audit/security_audit.test.ts | Pending |
| FR-002 | AC-004 | Integração | tests/audit/quality_audit.test.ts | Pending |
| FR-002 | AC-005 | Integração | tests/audit/quality_audit.test.ts | Pending |
| FR-002 | AC-006 | Integração | tests/audit/quality_audit.test.ts | Pending |
| FR-003 | AC-007 | Integração | tests/audit/git_governance.test.ts | Pending |
| FR-003 | AC-008 | Integração | tests/audit/git_governance.test.ts | Pending |
| FR-003 | AC-009 | Integração | tests/audit/git_governance.test.ts | Pending |
| FR-004 | AC-010 | Integração | tests/audit/production_readiness.test.ts | Pending |
| FR-004 | AC-011 | Integração | tests/audit/production_readiness.test.ts | Pending |
| FR-004 | AC-012 | Integração | tests/audit/production_readiness.test.ts | Pending |
| NFR-001 | AC-001 | Integração | tests/audit/security_audit.test.ts | Pending |
| NFR-001 | AC-002 | Integração | tests/audit/security_audit.test.ts | Pending |
| NFR-001 | AC-003 | Integração | tests/audit/security_audit.test.ts | Pending |
| NFR-002 | AC-004 | Integração | tests/audit/quality_audit.test.ts | Pending |
| NFR-002 | AC-005 | Integração | tests/audit/quality_audit.test.ts | Pending |
| NFR-002 | AC-006 | Integração | tests/audit/quality_audit.test.ts | Pending |
| NFR-003 | AC-007 | Integração | tests/audit/git_governance.test.ts | Pending |
| NFR-003 | AC-008 | Integração | tests/audit/git_governance.test.ts | Pending |
| NFR-003 | AC-009 | Integração | tests/audit/git_governance.test.ts | Pending |
| NFR-004 | AC-010 | Integração | tests/audit/production_readiness.test.ts | Pending |
| NFR-004 | AC-011 | Integração | tests/audit/production_readiness.test.ts | Pending |
| NFR-004 | AC-012 | Integração | tests/audit/production_readiness.test.ts | Pending |

### 13. Validações

#### Gate do Ato I — Definição

- **Status**: Passed
- **Data**: 2026-09-16
- **Validador**: validate_spec.mjs
- **Resultado**: 12 ACs cobrindo 4 USs, 4 FRs e 4 NFRs com rastreabilidade completa.

#### Gate do Ato II — Plano

- **Status**: Passed
- **Data**: 2026-09-16
- **Validador**: validate_tasks.mjs
- **Resultado**: 12 tarefas TDD concluídas com RED comprovado e rastreabilidade total (24/24 IDs cobertos).

#### Gate do Ato III — Entrega

- **Status**: Passed
- **Data**: 2026-09-16
- **Validador**: verify_evidence.mjs
- **Resultado**: 4 relatórios gerados em docs/audit/, 12 testes de auditoria em GREEN e matriz de severidade consolidada.

### 14. Tarefas

- [x] T001 [TEST] [TDD] [US-001] Elaborar teste de detecção estática de segredos e credenciais em tests/audit/security_audit.test.ts — Refs: US-001, FR-001, NFR-001, AC-001 — Depends: none
  - [x] **PREP**: Configurar ambiente do runner Vitest para execução dos testes de auditoria
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-001 validando padrões regex de tokens
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Anotar saída de execução do teste no relatório de auditoria
  - [x] **IMPROVE**: Refinar asserções garantindo detecção de tokens com múltiplos formatos

- [x] T002 [TEST] [TDD] [US-001] Elaborar teste de auditoria de edge functions e migrations em tests/audit/security_audit.test.ts — Refs: US-001, FR-001, NFR-001, AC-002 — Depends: none
  - [x] **PREP**: Localizar migrations em supabase/migrations e funções em supabase/functions
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-002 validando checagem de RLS e service_role
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Registrar saída de verificação no relatório de auditoria
  - [x] **IMPROVE**: Otimizar padrões de busca para cobrir variações de sintaxe SQL

- [x] T003 [TEST] [TDD] [US-001] Elaborar teste de validação de mascaramento de segredos em tests/audit/security_audit.test.ts — Refs: US-001, FR-001, NFR-001, AC-003 — Depends: none
  - [x] **PREP**: Definir regras de ofuscação de credenciais sensíveis para relatórios públicos
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-003 assegurando que nenhum token é exposto em claro
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Documentar logs de execução da checagem de mascaramento
  - [x] **IMPROVE**: Garantir cobertura para chaves JWT, OpenAI, Pluggy e senhas de banco

- [x] T004 [TEST] [TDD] [US-002] Elaborar teste de diagnóstico de tipagem TypeScript em tests/audit/quality_audit.test.ts — Refs: US-002, FR-002, NFR-002, AC-004 — Depends: none
  - [x] **PREP**: Verificar configuração do tsconfig.json e binário do tsc
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-004 disparando npx tsc e capturando erros
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Registrar saída de diagnóstico no relatório de qualidade
  - [x] **IMPROVE**: Estruturar agrupamento dos erros por módulo do projeto

- [x] T005 [TEST] [TDD] [US-002] Elaborar teste de diagnóstico da suíte de testes Vitest em tests/audit/quality_audit.test.ts — Refs: US-002, FR-002, NFR-002, AC-005 — Depends: none
  - [x] **PREP**: Verificar suíte de testes existente no repositório
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-005 invocando vitest run e computando taxas de falha
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Registrar inventário de testes quebrados no relatório
  - [x] **IMPROVE**: Identificar causas raiz prioritárias para os testes falhos

- [x] T006 [TEST] [TDD] [US-002] Elaborar teste de verificação de build de produção em tests/audit/quality_audit.test.ts — Refs: US-002, FR-002, NFR-002, AC-006 — Depends: none
  - [x] **PREP**: Verificar scripts de build no package.json e vite.config.ts
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-006 executando vite build dry-run
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Anotar erros de empacotamento no log de qualidade
  - [x] **IMPROVE**: Mapear dependências com bundles excessivos ou chunks circulares

- [x] T007 [TEST] [TDD] [US-003] Elaborar teste de auditoria de branches locais e remotas em tests/audit/git_governance.test.ts — Refs: US-003, FR-003, NFR-003, AC-007 — Depends: none
  - [x] **PREP**: Acessar o catálogo do repositório Git local
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-007 inspecionando branches ativas e tracking
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Gravar o mapa de branches inspecionadas
  - [x] **IMPROVE**: Formatar saída tabular com status de sincronismo com origin/develop

- [x] T008 [TEST] [TDD] [US-003] Elaborar teste de integridade e isolamento do worktree PR #80 em tests/audit/git_governance.test.ts — Refs: US-003, FR-003, NFR-003, AC-008 — Depends: none
  - [x] **PREP**: Localizar caminho do worktree wallet-worktrees/security-audit
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-008 validando hash HEAD e status limpo
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Documentar hash e estado do worktree homologado
  - [x] **IMPROVE**: Bloquear qualquer comando de escrita na árvore do worktree

- [x] T009 [TEST] [TDD] [US-003] Elaborar teste de detecção de commits divergentes em tests/audit/git_governance.test.ts — Refs: US-003, FR-003, NFR-003, AC-009 — Depends: none
  - [x] **PREP**: Obter grafo de commits via git log
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-009 calculando deltas entre develop e branches ativas
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Gravar a listagem de commits divergentes
  - [x] **IMPROVE**: Sinalizar commits críticos pendentes de integração

- [x] T010 [TEST] [TDD] [US-004] Elaborar teste de validação da matriz de severidade em tests/audit/production_readiness.test.ts — Refs: US-004, FR-004, NFR-004, AC-010 — Depends: none
  - [x] **PREP**: Definir critérios de classificação de severidade (Crítico, Alto, Médio, Baixo)
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-010 verificando preenchimento da matriz
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Registrar matriz gerada no relatório de prontidão
  - [x] **IMPROVE**: Validar se cada apontamento possui justificativa técnica anexada

- [x] T011 [TEST] [TDD] [US-004] Elaborar teste de verificação dos critérios bloqueantes em tests/audit/production_readiness.test.ts — Refs: US-004, FR-004, NFR-004, AC-011 — Depends: none
  - [x] **PREP**: Estabelecer regra de tolerância zero para falhas Críticas e Altas
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-011 checando bloqueio de deploy em caso de achados graves
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Registrar verificação de bloqueio no artefato de release
  - [x] **IMPROVE**: Assegurar clareza nas mensagens de bloqueio

- [x] T012 [TEST] [TDD] [US-004] Elaborar teste de consistência do plano de ação faseado em tests/audit/production_readiness.test.ts — Refs: US-004, FR-004, NFR-004, AC-012 — Depends: none
  - [x] **PREP**: Estruturar modelo do plano em fases sequenciais
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-012 garantindo coerência de dependências e estimativas
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Anexar o plano de ação validado aos artefatos de entrega
  - [x] **IMPROVE**: Validar conformidade de cada fase com o perfil iniciante do usuário

- [x] T013 [CODE] [US-001] Executar varredura estática de segurança e segredos gerando docs/audit/security-findings.md — Refs: US-001, FR-001, NFR-001, AC-001, AC-002, AC-003 — Depends: T001, T002, T003
  - [x] **PREP**: Preparar expressões regulares e script de leitura estrita do código
  - [x] **EXECUTE**: Varrer arquivos em src/, supabase/ e configs identificando segredos e falhas de permissão
  - [x] **VERIFY**: Executar testes T001, T002 e T003 validando passagem e mascaramento
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Salvar achados detalhados e mascarados em docs/audit/security-findings.md
  - [x] **IMPROVE**: Consolidar recomendações práticas para cada vulnerabilidade encontrada
  <!-- specsfy:evidence {"task":"T013","refs":["US-001","FR-001","NFR-001","AC-001","AC-002","AC-003"],"files":["docs/audit/security-findings.md","tests/audit/security_audit.test.ts"],"commands":[{"run":"npx vitest run tests/audit/security_audit.test.ts","exit":0}]} -->

- [x] T014 [CODE] [US-002] Executar diagnóstico completo de TypeScript testes e build gerando docs/audit/quality-findings.md — Refs: US-002, FR-002, NFR-002, AC-004, AC-005, AC-006 — Depends: T004, T005, T006
  - [x] **PREP**: Garantir ambiente de compilação limpo no repositório
  - [x] **EXECUTE**: Executar npx tsc --noEmit, npx vitest run e npx vite build coletando todas as falhas
  - [x] **VERIFY**: Executar testes T004, T005 e T006 validando integridade das métricas capturadas
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Salvar contagem e catálogo exato de erros em docs/audit/quality-findings.md
  - [x] **IMPROVE**: Classificar os erros de tipagem e testes por criticidade de impacto
  <!-- specsfy:evidence {"task":"T014","refs":["US-002","FR-002","NFR-002","AC-004","AC-005","AC-006"],"files":["docs/audit/quality-findings.md","tests/audit/quality_audit.test.ts"],"commands":[{"run":"npx vitest run tests/audit/quality_audit.test.ts","exit":0}]} -->

- [x] T015 [CODE] [US-003] Executar auditoria de governança Git e integridade de worktrees gerando docs/audit/git-governance-findings.md — Refs: US-003, FR-003, NFR-003, AC-007, AC-008, AC-009 — Depends: T007, T008, T009
  - [x] **PREP**: Conferir branches rastreadas e lista de worktrees via git
  - [x] **EXECUTE**: Inspecionar HEADs, calcular divergências contra develop e validar isolamento do PR #80
  - [x] **VERIFY**: Executar testes T007, T008 e T009 validando integridade do repositório
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Salvar relatório de governança em docs/audit/git-governance-findings.md
  - [x] **IMPROVE**: Documentar comandos recomendados para sincronização segura de branches
  <!-- specsfy:evidence {"task":"T015","refs":["US-003","FR-003","NFR-003","AC-007","AC-008","AC-009"],"files":["docs/audit/git-governance-findings.md","tests/audit/git_governance.test.ts"],"commands":[{"run":"npx vitest run tests/audit/git_governance.test.ts","exit":0}]} -->

- [x] T016 [CODE] [US-004] Consolidar matriz de severidade e estruturar o plano de prontidão em docs/audit/production-readiness-plan.md — Refs: US-004, FR-004, NFR-004, AC-010, AC-011, AC-012 — Depends: T010, T011, T012, T013, T014, T015
  - [x] **PREP**: Reunir achados de docs/audit/security-findings.md, quality-findings.md e git-governance-findings.md
  - [x] **EXECUTE**: Compilar a matriz de severidade e redigir o plano de correção faseado com bloqueios estritos
  - [x] **VERIFY**: Executar testes T010, T011 e T012 validando bloqueios e consistência do plano
  - [x] **VISUAL**: Não aplicável: tarefa técnica de auditoria sem componentes de interface
  - [x] **EVIDENCE**: Salvar plano consolidado em docs/audit/production-readiness-plan.md
  - [x] **IMPROVE**: Adequar explicações para o perfil iniciante do usuário destacando impacto de cada decisão
  <!-- specsfy:evidence {"task":"T016","refs":["US-004","FR-004","NFR-004","AC-010","AC-011","AC-012"],"files":["docs/audit/production-readiness-plan.md","tests/audit/production_readiness.test.ts"],"commands":[{"run":"npx vitest run tests/audit/production_readiness.test.ts","exit":0}]} -->

### 15. Ordem de execução

1. **Fase 1 (Testes de Auditoria / TDD)**: Implementação das tarefas T001 a T012 para estabelecer asserções estáticas determinísticas das 4 frentes.
2. **Fase 2 (Auditoria e Diagnóstico - Leitura Estrita)**:
   - T013: Varredura de segurança de credenciais, chaves e banco.
   - T014: Diagnóstico de tipagem TypeScript, suíte Vitest e empacotamento Vite.
   - T015: Auditoria do grafo Git, branches e worktree homologado PR #80.
3. **Fase 3 (Consolidação da Matriz de Risco e Plano Corretivo)**:
   - T016: Compilação de matriz de severidade com portões bloqueantes para release em produção.

### 16. Dependências, riscos e suposições

#### Dependências

- **DEP-001**: Binário do Node.js e ferramentas do npm instaladas localmente para execução de checagens.
- **DEP-002**: Acesso somente leitura ao histórico Git e worktrees do projeto.

#### Riscos

- **RSK-001**: Exposição inadvertida de tokens ou segredos reais no relatório de auditoria → **Mitigação**: Mascaramento estrito obrigatório em todos os relatórios (`***`).
- **RSK-002**: Falha de compilação ou execução de scripts em ambiente Windows com caminhos longos → **Mitigação**: Uso de caminhos relativos ao diretório raiz e scripts multiplataforma.

#### Suposições

- **SUP-001**: Assume-se que a branch `develop` reflete o estado mais recente da integração de desenvolvimento.
- **SUP-002**: Assume-se que o worktree `wallet-worktrees/security-audit` contém a versão homologada da Phase A que não deve ser sobrescrita.

### 17. Decisões

- **DEC-001**: Diagnóstico estritamente em modo leitura — Não realizar nenhuma mutação no código de produção ou banco de dados durante a auditoria até que o plano seja formalmente validado.
- **DEC-002**: Política de tolerância zero — Qualquer vulnerabilidade ou erro categorizado como Crítico ou Alto constitui critério de bloqueio imediato para o deploy produtivo.
- **DEC-003**: Preservação estrita do PR #80 — Manter o worktree isolado de auditoria de segurança congelado no commit homologado.

### 18. Definition of Done

- [x] `Definition Gate` está `Passed`.
- [x] `Plan Gate` está `Passed`.
- [x] `Delivery Gate` está `Passed`.
- [x] Todos os cenários `AC` aplicáveis passam.
- [x] Todos os requisitos possuem evidência de verificação.
- [x] Todas as tarefas na seção 14 estão concluídas.
- [x] Testes e checks estáticos disponíveis passam.
