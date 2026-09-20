# Especificação integrada: Preparacao e Orquestracao do Deploy em Producao na Hostinger

| Campo | Valor |
| --- | --- |
| Formato | Specsfy/2.0 |
| ID | SPEC-0004 |
| Slug | 0004-preparacao-e-orquestracao-deploy-producao-hostinger |
| Status | Complete |
| Effort | 3 |
| Effort updated at | 2026-09-20 |
| Effort rationale | Preparação dos artefatos de release Docker Swarm, Traefik, script de deploy multi-arch e testes automatizados de prontidão de produção. |
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

Após a reconciliação e homologação dos 70 commits de segurança do PR #80 na branch `develop` (SPEC-0003), a aplicação Wallet encontra-se com sua base de código íntegra e 100% dos testes aprovados. No entanto, para publicar a aplicação de forma resiliente na VPS da Hostinger com Docker Swarm e Traefik, os seguintes aspectos operacionais requerem estruturação e garantia formal:
1. O script legado `deploy-multiarch.sh` possui a versão hardcoded desatualizada em `1.0.21`, divergindo da versão oficial `1.0.49` do `package.json`.
2. A configuração de orquestração em `docker-stack.yml` precisa ter seus contratos de rede (`network_public`), roteamento HTTPS e políticas de atualização `start-first` verificados por testes automatizados.
3. O endpoint de verificação de integridade `/health` do servidor Nginx precisa ser validado por suíte automatizada para garantir que o Docker Swarm não roteie tráfego para réplicas com falha.
4. As instruções e procedimentos de deploy com estratégia Zero-Downtime precisam ser formalizados em runbook canônico antes da execução da Phase C no banco Supabase.

#### Resultado desejado

O repositório preparado com artefatos determinísticos de container, script de empacotamento multi-arquitetura sincronizado com o `package.json`, manifesto Docker Swarm auditado, endpoint de healthcheck testado e suíte de testes de release validando 100% dos requisitos operacionais.

#### Métricas de sucesso

- 100% de paridade entre a versão do `package.json` e a imagem gerada pelo script de deploy.
- Suíte automatizada de prontidão de release (`tests/release/production_release.test.ts`) operando com 100% de aprovação.
- Manifesto `docker-stack.yml` em conformidade estrita com Traefik v2/v3 e Docker Swarm.
- Endpoint `/health` respondendo HTTP 200 sem dependências externas.
- Build do Vite (`npm run build`) validado sem erros.

### 2. Research e esclarecimentos

#### Researchs executados

- **R-001**: Análise do `package.json` vs `deploy-multiarch.sh` → Identificada discrepância de versão (`1.0.49` no manifest npm vs `1.0.21` no script bash). A versão no script deve ser extraída dinamicamente do `package.json` ou receber fallback seguro.
- **R-002**: Análise do `docker-stack.yml` e Traefik → Confirmado que o serviço utiliza labels do Traefik apontando para `wallet.cortexx.online`, entrypoint `websecure`, middleware de redirect HTTP->HTTPS e rede externa `network_public`.
- **R-003**: Análise do `Dockerfile` e `nginx.conf` → Confirmado build multi-stage (`node:22-alpine` para build e `nginx:alpine` para runtime) com endpoint `/health` configurado com `return 200 'ok'` e healthcheck nativo com `wget`.

#### Fontes e contexto consultados

- Runbook operacional `PR80_PRODUCTION_RUNBOOK.md`.
- Checklist operacional `PR80_OWNER_DEPLOY_CHECKLIST.md`.
- Arquivo de manifesto `docker-stack.yml`.
- Arquivo de configuração de servidor `nginx.conf`.
- Dockerfile multi-stage `Dockerfile`.
- Script de empacotamento `deploy-multiarch.sh`.

#### Documentação consultada

- Docker Documentation: Docker Swarm mode deploy specification (v24.0+).
- Traefik Documentation: Docker Swarm provider and Routers/Middlewares (v2.10+ / v3.0+).
- Nginx Documentation: HTTP Core module and Gzip compression.

#### Artefatos de pesquisa armazenados

- Nenhum artefato externo.

#### Dúvidas respondidas

- **Q**: A imagem Docker deve ser gerada localmente no ambiente Windows ou pelo script multi-arquitetura? → **A**: O script `deploy-multiarch.sh` utiliza `docker buildx` para produzir imagens compatíveis com `linux/amd64` e `linux/arm64` diretamente para o Docker Hub (`heitor84/wallet`), permitindo que a VPS Hostinger faça o pull da arquitetura nativa.
- **Q**: Como garantir que variáveis de ambiente confidenciais não sejam incorporadas à imagem? → **A**: As variáveis de frontend em Vite são estáticas (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`). Variáveis confidenciais como `service_role` residem exclusivamente no Supabase e nunca no bundle web nem no Dockerfile.

#### Dúvidas abertas

- Nenhuma dúvida bloqueante.

### 3. Escopo e atores

#### Incluído

- Atualização de `deploy-multiarch.sh` para extrair dinamicamente a versão de `package.json` ou aceitar variável de versão.
- Elaboração de suíte de testes de prontidão de release em `tests/release/production_release.test.ts`.
- Validação estática de contratos de Traefik e Docker Swarm em `docker-stack.yml`.
- Validação de regras de roteamento SPA e healthcheck em `nginx.conf`.
- Verificação de build estático do Vite (`dist/`).
- Criação de checklist operacional sintetizado para execução do deploy no servidor.

#### Fora de escopo

- Alteração visual em telas do sistema.
- Execução antecipada da migração Phase C no Postgres (permanece após implantação do frontend).
- Configuração manual de infraestrutura fora do repositório.

#### Atores

- **Engenheiro de DevOps / Release**: Executa e monitora os procedimentos de build e publicação do container.
- **Operador do Docker Swarm**: Aplica a atualização de serviço na VPS Hostinger.
- **Usuários do Sistema**: Acessam a aplicação atualizada com conexão criptografada SSL/TLS e alta disponibilidade.

### 4. Princípios e restrições do projeto

- **PR-001**: Rollout sem indisponibilidade (Zero-Downtime) com política `order: start-first`.
- **PR-002**: Saúde verificável: container deve possuir healthcheck autônomo sem dependências externas.
- **PR-003**: Princípio de menor privilégio: segredos de backend jamais expostos no container web.
- **PR-004**: Multi-arquitetura: suporte transparente para `linux/amd64` da VPS Hostinger.

### 5. Histórias de usuário

#### US-001 — Automação e Parametrização do Script de Release (P1)

Como engenheiro de release, quero que o script `deploy-multiarch.sh` detecte dinamicamente a versão da aplicação a partir do `package.json`, para que a imagem publicada no Docker Hub corresponda com exatidão à release homologada.

**Por que P1**: Evita divergência de tags e sobreposição incorreta de versões antigas no registro de containers.
**Teste independente**: Execução de teste estático validando a resolução da versão no script.
**Requisitos**: FR-001, NFR-001

#### US-002 — Validação de Conformidade do Docker Swarm e Traefik (P1)

Como operador de infraestrutura, quero validar que o manifesto `docker-stack.yml` possui todas as diretivas de roteamento SSL, redirecionamento HTTPS e rede externa, para que a publicação na Hostinger ocorra sem falhas de conectividade.

**Por que P1**: Assegura a integridade de roteamento antes de aplicar o comando de stack deploy.
**Teste independente**: Teste estático validando o schema e labels do Traefik no manifesto.
**Requisitos**: FR-002, NFR-002

#### US-003 — Confiabilidade do Runtime Nginx e Healthcheck (P1)

Como operador de infraestrutura, quero que o servidor Nginx e o Dockerfile possuam rota de healthcheck isolada e regras SPA consistentes, para que réplicas defeituosas sejam reiniciadas automaticamente.

**Por que P1**: Garante que o swarm apenas roteie requisições para containers saudáveis.
**Teste independente**: Validação de configuração de `/health` e comandos de healthcheck no Dockerfile e nginx.conf.
**Requisitos**: FR-003, NFR-003

#### US-004 — Verificação de Prontidão e Procedimento Operacional (P1)

Como engenheiro de operações, quero um guia operacional conciso e testado para atualização na VPS Hostinger, para garantir a aplicação segura da imagem e dos smoke tests em produção.

**Por que P1**: Facilita a execução precisa sem risco de esquecimento de passos críticos.
**Teste independente**: Verificação de integridade dos comandos no runbook e na suíte de testes.
**Requisitos**: FR-004, NFR-004

### 6. Cenários BDD de aceite

#### AC-001 — Resolução Dinâmica da Versão do Release

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-001
Feature: Resolução Dinâmica da Versão no Script de Deploy

  Scenario: Leitura da versão a partir do package.json
    Given o arquivo package.json contendo a versão 1.0.49
    When o script deploy-multiarch.sh inspecionar os parâmetros de versão
    Then a versão atribuída à tag da imagem Docker é 1.0.49
    And nenhuma referência hardcoded a versões defasadas é utilizada
```

#### AC-002 — Suporte a Override de Versão via Argumento ou Variável

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-002
Feature: Flexibilidade na Definição da Versão de Imagem

  Scenario: Sobrescrita de versão para releases customizadas
    Given o script deploy-multiarch.sh
    When uma variável VERSION for explicitamente informada no ambiente
    Then o script adota a versão informada com prioridade
    And mantém o fallback determinístico para package.json na ausência do parâmetro
```

#### AC-003 — Configuração de Plataformas Multi-Arquitetura

**Cobre**: US-001, FR-001, NFR-001

```gherkin
@US-001 @FR-001 @NFR-001 @AC-003
Feature: Plataformas Multi-Arquitetura no Buildx

  Scenario: Inclusão explícita de arquiteturas padrão
    Given o script deploy-multiarch.sh
    When verificar a flag de plataformas do docker buildx
    Then a lista contempla linux/amd64 e linux/arm64
    And o builder multiarch-builder é configurado corretamente
```

#### AC-004 — Validação de Labels do Traefik no Manifesto Swarm

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-004
Feature: Verificação das Labels Traefik no docker-stack.yml

  Scenario: Inspeção das labels de roteamento seguro
    Given o arquivo docker-stack.yml
    When verificar a lista de labels do serviço wallet-app
    Then traefik.enable está definido como true
    And o router seguro possui regra Host para wallet.cortexx.online com tls ativado
```

#### AC-005 — Configuração de Redirecionamento HTTP para HTTPS

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-005
Feature: Redirecionamento Incondicional para HTTPS

  Scenario: Verificação do middleware de redirecionamento no Traefik
    Given as diretivas de roteamento em docker-stack.yml
    When inspecionar o router insecure
    Then o entrypoint web está mapeado com middleware redirectscheme permanente para https
```

#### AC-006 — Políticas de Atualização e Rollback sem Indisponibilidade

**Cobre**: US-002, FR-002, NFR-002

```gherkin
@US-002 @FR-002 @NFR-002 @AC-006
Feature: Políticas de Atualização com Zero Downtime

  Scenario: Conferência da ordem de atualização start-first
    Given o manifesto docker-stack.yml
    When examinar a seção update_config do serviço
    Then a ordem de inicialização é start-first
    And a ação de falha está configurada para rollback automático
```

#### AC-007 — Endpoint de Integridade Autônomo no Nginx

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-007
Feature: Endpoint de Healthcheck Dedicado

  Scenario: Configuração de location /health no nginx.conf
    Given o arquivo nginx.conf
    When inspecionar o bloco de rotas HTTP
    Then existe location exclusiva para /health retornando status 200 ok
    And os logs de acesso para /health estão desativados para evitar poluição
```

#### AC-008 — Diretivas de Roteamento SPA e Cache Estático

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-008
Feature: Roteamento SPA e Cache de Assets no Nginx

  Scenario: Suporte a Single Page Application e cache longo
    Given o arquivo nginx.conf
    When examinar as regras de try_files e extensões estáticas
    Then requisições não encontradas são roteadas para index.html
    And arquivos js, css e imagens possuem cabeçalho de cache imutável
```

#### AC-009 — Healthcheck Nativo Declarado no Dockerfile

**Cobre**: US-003, FR-003, NFR-003

```gherkin
@US-003 @FR-003 @NFR-003 @AC-009
Feature: Verificação de Saúde Declarativa no Container

  Scenario: Instrução HEALTHCHECK no Dockerfile
    Given o Dockerfile de produção
    When verificar a diretiva HEALTHCHECK
    Then o comando invoca wget apontando para http://127.0.0.1/health
    And o intervalo e timeout são configurados com tolerância segura
```

#### AC-010 — Validação da Integridade do Build Vite para Produção

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-010
Feature: Validação dos Assets em dist/

  Scenario: Verificação da geração dos artefatos estáticos
    Given o processo de compilação da aplicação
    When verificar a pasta dist/
    Then o arquivo index.html está presente e possui referências a bundles válidos
```

#### AC-011 — Preflight de Variáveis de Ambiente sem Segredos

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-011
Feature: Preflight de Configuração e Ausência de Segredos

  Scenario: Inspeção das variáveis VITE_
    Given a lista de argumentos de build no Dockerfile e scripts
    When inspecionar as variáveis públicas
    Then nenhuma chave com sufixo SERVICE_ROLE ou PRIVATE_KEY está presente no Dockerfile
```

#### AC-012 — Rastreabilidade e Procedimento de Deploy Operacional

**Cobre**: US-004, FR-004, NFR-004

```gherkin
@US-004 @FR-004 @NFR-004 @AC-012
Feature: Instruções Operacionais de Publicação

  Scenario: Disponibilidade do comando de atualização de serviço
    Given o runbook de implantação
    When consultar o comando de update no Docker Swarm
    Then o comando docker service update referenciando a tag correta é fornecido
```

### 7. Requisitos

#### Funcionais

- **FR-001**: O script `deploy-multiarch.sh` deve resolver a versão dinamicamente via `package.json` mantendo a opção de override via variável de ambiente.
- **FR-002**: O manifesto `docker-stack.yml` deve conter as diretivas válidas do Traefik para SSL automático e a política `start-first` com rollback automático.
- **FR-003**: O Nginx e o Dockerfile devem conter a rota e o teste de `/health` autônomos sem chamadas ao backend.
- **FR-004**: O repositório deve dispor de suíte automatizada de prontidão de release cobrindo todos os cenários AC-001 a AC-012.

#### Não funcionais

- **NFR-001**: Determinismo: o processo de build deve garantir que a versão documentada coincida com a tag do container.
- **NFR-002**: Resiliência: o Docker Swarm não deve desativar réplicas anteriores antes que a nova réplica esteja saudável.
- **NFR-003**: Desempenho: a rota de healthcheck deve responder em menos de 5ms sem overhead de processamento ou I/O.
- **NFR-004**: Segurança: nenhum segredo confidencial deve ser embutido nos artefatos de imagem pública.

#### Erros e casos-limite

- `package.json` ilegível → Fallback para erro explícito impedindo build de versão nula.
- Healthcheck falha durante o deploy → Docker Swarm aborta atualização e aciona rollback para a versão anterior.
- Ausência de rede externa `network_public` na VPS → Instrução clara de pré-requisito documentada no runbook.

## Ato II — Projetar e provar

### 8. Plano técnico

#### Contexto existente

- Arquivo `docker-stack.yml` estruturado para Swarm.
- Arquivo `Dockerfile` multi-stage com Nginx.
- Arquivo `nginx.conf` com compressão gzip e cache.
- Script `deploy-multiarch.sh` com versão legada hardcoded.

#### Arquitetura e módulos

- **Módulo de Automação de Release**: Script `deploy-multiarch.sh` com leitura de versão e build multi-plataforma.
- **Módulo de Orquestração Swarm**: Manifest `docker-stack.yml` conectado à rede `network_public`.
- **Módulo de Servidor Web**: `nginx.conf` configurado para SPA React e rota `/health`.
- **Módulo de Testes de Release**: Arquivo `tests/release/production_release.test.ts` cobrindo AC-001 a AC-012.

#### Migrations

- Não aplicável: a Phase C no banco Supabase será aplicada via psql após a implantação do frontend.

#### Models

- Não aplicável.

#### Controllers e casos de uso

- Não aplicável.

#### Views e experiência

- Não aplicável.

#### Queries e repositórios

- Não aplicável.

#### Jobs e processamento assíncrono

- Não aplicável.

#### Estrutura de arquivos

```text
docker-stack.yml
Dockerfile
nginx.conf
deploy-multiarch.sh
tests/release/
  production_release.test.ts
```

### 9. Modelo de dados

#### Entidades

- Não aplicável.

#### Estados e transições

- Não aplicável.

#### Migração e retenção

- Não aplicável.

### 10. Interfaces e contratos

#### Interface para pessoas

- **Há interface para pessoas**: Não. Esta entrega concentra-se exclusivamente em artefatos de container, scripts de automação, manifestos de infraestrutura e testes de release.

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
| N/A | N/A | Entrega técnica de DevOps e release | N/A | N/A | N/A | N/A |

#### Estados e acessibilidade

- Não aplicável.

#### Contrato CRUD

- Não aplicável.

#### Revisão visual durante o desenvolvimento

- **Não aplicável**: A entrega é técnica de infraestrutura sem alterações em componentes visuais.

#### APIs expostas

- `GET /health`: retorna 200 OK com payload 'ok' para checagem interna do Docker Swarm.

#### APIs externas utilizadas

- Docker Hub Registry (`heitor84/wallet`).

#### Documentação das APIs consultadas

- Docker Swarm CLI Reference.

#### Eventos e outros contratos

- Não aplicável.

### 11. Estratégia TDD

- **Unidade e Integração**: Testes de integridade em `tests/release/production_release.test.ts` validando arquivos de release, scripts e contratos.
- **BDD/aceite**: Cenários AC-001 a AC-012 descritos em Gherkin na seção 6.
- **Runner TDD**: Vitest executado via `npx vitest run tests/release/production_release.test.ts`.

#### Evidência RED-GREEN-REFACTOR

| IDs | BDD de referência | Teste TDD informado pelo BDD | RED observado | GREEN observado | Refactor/regressão |
| --- | --- | --- | --- | --- | --- |
| US-001, FR-001, NFR-001, AC-001 | AC-001 na seção 6 | caso 1 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-001 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-001, FR-001, NFR-001, AC-002 | AC-002 na seção 6 | caso 2 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-002 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-001, FR-001, NFR-001, AC-003 | AC-003 na seção 6 | caso 3 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-003 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-002, FR-002, NFR-002, AC-004 | AC-004 na seção 6 | caso 4 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-004 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-002, FR-002, NFR-002, AC-005 | AC-005 na seção 6 | caso 5 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-005 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-002, FR-002, NFR-002, AC-006 | AC-006 na seção 6 | caso 6 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-006 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-003, FR-003, NFR-003, AC-007 | AC-007 na seção 6 | caso 7 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-007 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-003, FR-003, NFR-003, AC-008 | AC-008 na seção 6 | caso 8 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-008 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-003, FR-003, NFR-003, AC-009 | AC-009 na seção 6 | caso 9 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-009 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-004, FR-004, NFR-004, AC-010 | AC-010 na seção 6 | caso 10 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-010 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-004, FR-004, NFR-004, AC-011 | AC-011 na seção 6 | caso 11 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-011 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |
| US-004, FR-004, NFR-004, AC-012 | AC-012 na seção 6 | caso 12 em tests/release/production_release.test.ts com marcador próprio SPECSFY:AC-012 | Falha controlada comprovada no Vitest: script de deploy com versão hardcoded desatualizada. | 12/12 testes passando no Vitest com resolução dinâmica de versão 1.0.49, docker-stack.yml e nginx.conf auditados e prontos. | 12/12 testes de release verdes, build do Vite em dist/ íntegro e runbook de deploy Hostinger documentado. |

### 12. Plano de testes e rastreabilidade

| Requisito | Cenário BDD | Nível | Arquivo/comando esperado | Evidência |
| --- | --- | --- | --- | --- |
| FR-001 | AC-001 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-001 | AC-002 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-001 | AC-003 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-002 | AC-004 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-002 | AC-005 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-002 | AC-006 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-003 | AC-007 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-003 | AC-008 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-003 | AC-009 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-004 | AC-010 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-004 | AC-011 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| FR-004 | AC-012 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-001 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-002 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-001 | AC-003 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-002 | AC-004 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-002 | AC-005 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-002 | AC-006 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-003 | AC-007 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-003 | AC-008 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-003 | AC-009 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-004 | AC-010 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-004 | AC-011 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |
| NFR-004 | AC-012 | Integração | tests/release/production_release.test.ts | Passed (12/12 GREEN) |

### 13. Validações

#### Gate do Ato I — Definição

- **Status**: Passed
- **Data**: 2026-09-20
- **Validador**: validate_spec.mjs
- **Resultado**: 12 ACs cobrindo 4 USs, 4 FRs e 4 NFRs com rastreabilidade completa.

##### Gate do Ato II — Plano

- **Status**: Passed
- **Data**: 2026-09-20
- **Validador**: validate_tasks.mjs
- **Resultado**: 12 tarefas TDD concluídas com RED comprovado no Vitest e rastreabilidade total (24/24 IDs cobertos).

#### Gate do Ato III — Entrega

- **Status**: Passed
- **Data**: 2026-09-20
- **Validador**: verify_evidence.mjs
- **Resultado**: Script deploy-multiarch.sh harmonizado com package.json 1.0.49. Suíte de release 12/12 GREEN, docker-stack.yml e nginx.conf auditados e guia de deploy gerado.

### 14. Tarefas

- [x] T001 [TEST] [TDD] [US-001] Elaborar teste de resolução dinâmica de versão em tests/release/production_release.test.ts — Refs: US-001, FR-001, NFR-001, AC-001 — Depends: none
  - [x] **PREP**: Configurar ambiente do runner Vitest para a nova suíte de testes de release
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-001 validando resolução de versão via package.json
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar saída de verificação no log
  - [x] **IMPROVE**: Assegurar suporte para extração automática da versão 1.0.49

- [x] T002 [TEST] [TDD] [US-001] Elaborar teste de suporte a override de versão em tests/release/production_release.test.ts — Refs: US-001, FR-001, NFR-001, AC-002 — Depends: none
  - [x] **PREP**: Inspecionar regras de precedence de variáveis de ambiente no script
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-002 validando precedência da variável VERSION
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Registrar saída de verificação no log
  - [x] **IMPROVE**: Conferir fallback seguro quando variável for omitida

- [x] T003 [TEST] [TDD] [US-001] Elaborar teste de plataformas multi-arquitetura em tests/release/production_release.test.ts — Refs: US-001, FR-001, NFR-001, AC-003 — Depends: none
  - [x] **PREP**: Verificar configuração de plataformas no deploy-multiarch.sh
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-003 conferindo presença de linux/amd64 e linux/arm64
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Anotar conformidade das plataformas no log
  - [x] **IMPROVE**: Assegurar suporte a buildx nativo

- [x] T004 [TEST] [TDD] [US-002] Elaborar teste de validação de labels Traefik em tests/release/production_release.test.ts — Refs: US-002, FR-002, NFR-002, AC-004 — Depends: none
  - [x] **PREP**: Ler arquivo docker-stack.yml
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-004 testando presença de Host(wallet.cortexx.online) e tls=true
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar saída no log
  - [x] **IMPROVE**: Conferir integridade do entrypoint websecure

- [x] T005 [TEST] [TDD] [US-002] Elaborar teste de redirecionamento HTTPS em tests/release/production_release.test.ts — Refs: US-002, FR-002, NFR-002, AC-005 — Depends: none
  - [x] **PREP**: Verificar middleware de redirecionamento em docker-stack.yml
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-005 validando redirectscheme permanente
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Anotar resultado no log
  - [x] **IMPROVE**: Assegurar que nenhuma chamada HTTP trafega sem criptografia

- [x] T006 [TEST] [TDD] [US-002] Elaborar teste de políticas de zero downtime em tests/release/production_release.test.ts — Refs: US-002, FR-002, NFR-002, AC-006 — Depends: none
  - [x] **PREP**: Ler seção update_config e rollback_config em docker-stack.yml
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-006 garantindo ordem start-first e action rollback
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar validação no log
  - [x] **IMPROVE**: Confirmar que a política previne interrupção no deploy

- [x] T007 [TEST] [TDD] [US-003] Elaborar teste de integridade do endpoint health em tests/release/production_release.test.ts — Refs: US-003, FR-003, NFR-003, AC-007 — Depends: none
  - [x] **PREP**: Inspecionar arquivo nginx.conf
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-007 checando location /health com status 200
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar assertiva no log
  - [x] **IMPROVE**: Conferir desativação de access_log na rota de saúde

- [x] T008 [TEST] [TDD] [US-003] Elaborar teste de regras SPA e cache em tests/release/production_release.test.ts — Refs: US-003, FR-003, NFR-003, AC-008 — Depends: none
  - [x] **PREP**: Localizar diretivas de try_files e headers de cache em nginx.conf
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-008 garantindo fallback para index.html e cache público
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Registrar aprovação no log
  - [x] **IMPROVE**: Validar regras de compressão gzip

- [x] T009 [TEST] [TDD] [US-003] Elaborar teste de instrução HEALTHCHECK no container em tests/release/production_release.test.ts — Refs: US-003, FR-003, NFR-003, AC-009 — Depends: none
  - [x] **PREP**: Ler Dockerfile
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-009 conferindo comando wget em 127.0.0.1/health
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Anotar instrução no log
  - [x] **IMPROVE**: Assegurar parâmetros adequados de interval e retries

- [x] T010 [TEST] [TDD] [US-004] Elaborar teste de validação de bundle estático em tests/release/production_release.test.ts — Refs: US-004, FR-004, NFR-004, AC-010 — Depends: none
  - [x] **PREP**: Verificar pasta dist/ gerada pelo build
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-010 atestando existência de dist/index.html e assets
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar evidência no log
  - [x] **IMPROVE**: Conferir consistência das tags de script geradas

- [x] T011 [TEST] [TDD] [US-004] Elaborar teste de ausência de segredos confidenciais em tests/release/production_release.test.ts — Refs: US-004, FR-004, NFR-004, AC-011 — Depends: none
  - [x] **PREP**: Mapear variáveis de ambiente presentes no Dockerfile e deploy-multiarch.sh
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-011 validando ausência de tokens de service_role e chaves privadas
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Registrar integridade de variáveis no log
  - [x] **IMPROVE**: Garantir que apenas variáveis públicas VITE_ sejam passadas

- [x] T012 [TEST] [TDD] [US-004] Elaborar teste de comando operacional de serviço em tests/release/production_release.test.ts — Refs: US-004, FR-004, NFR-004, AC-012 — Depends: none
  - [x] **PREP**: Inspecionar instruções de comando no script e documentação
  - [x] **EXECUTE**: Escrever caso de teste com marcador SPECSFY:AC-012 validando sintaxe de docker service update
  - [x] **VERIFY**: Executar teste no Vitest confirmando falha controlada inicial
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar dados de governança no log
  - [x] **IMPROVE**: Garantir comando idempotente para aplicação remota

- [x] T013 [CODE] [US-001] Harmonizar deploy-multiarch.sh com extração dinâmica de versão de package.json — Refs: US-001, FR-001, NFR-001, AC-001, AC-002, AC-003 — Depends: T001, T002, T003
  - [x] **PREP**: Fazer backup e inspecionar deploy-multiarch.sh
  - [x] **EXECUTE**: Atualizar script para extrair versão via node/jq de package.json mantendo suporte a override
  - [x] **VERIFY**: Executar testes T001, T002 e T003 no Vitest validando passagem em GREEN
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar teste passando e hash de commit
  - [x] **IMPROVE**: Garantir mensagens de log informativas com cores adequadas
  <!-- specsfy:evidence {"task":"T013","refs":["US-001","FR-001","NFR-001","AC-001","AC-002","AC-003"],"files":["deploy-multiarch.sh","package.json"],"commands":[{"run":"npx vitest run tests/release/production_release.test.ts","exit":0}]} -->

- [x] T014 [CODE] [US-002] Auditar e harmonizar manifesto docker-stack.yml e labels de rede Traefik — Refs: US-002, FR-002, NFR-002, AC-004, AC-005, AC-006 — Depends: T004, T005, T006
  - [x] **PREP**: Inspecionar docker-stack.yml
  - [x] **EXECUTE**: Garantir que as diretivas de Traefik, network_public e start-first atendam aos requisitos
  - [x] **VERIFY**: Executar testes T004, T005 e T006 no Vitest validando passagem em GREEN
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Salvar evidência de manifesto seguro
  - [x] **IMPROVE**: Confirmar valores de timeout e retries
  <!-- specsfy:evidence {"task":"T014","refs":["US-002","FR-002","NFR-002","AC-004","AC-005","AC-006"],"files":["docker-stack.yml","tests/release/production_release.test.ts"],"commands":[{"run":"npx vitest run tests/release/production_release.test.ts","exit":0}]} -->

- [x] T015 [CODE] [US-003] Validar e assegurar integridade em docker-stack.yml e nginx.conf — Refs: US-003, FR-003, NFR-003, AC-007, AC-008, AC-009 — Depends: T007, T008, T009
  - [x] **PREP**: Ler nginx.conf e Dockerfile
  - [x] **EXECUTE**: Consolidar configuração de healthcheck em /health e try_files SPA
  - [x] **VERIFY**: Executar testes T007, T008 e T009 no Vitest validando passagem em GREEN
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar log da execução dos testes
  - [x] **IMPROVE**: Garantir compatibilidade multiplataforma do comando wget
  <!-- specsfy:evidence {"task":"T015","refs":["US-003","FR-003","NFR-003","AC-007","AC-008","AC-009"],"files":["docker-stack.yml","nginx.conf","Dockerfile"],"commands":[{"run":"npx vitest run tests/release/production_release.test.ts","exit":0}]} -->

- [x] T016 [CODE] [US-004] Executar validação integral em tests/release/production_release.test.ts e compilar checklist — Refs: US-004, FR-004, NFR-004, AC-010, AC-011, AC-012 — Depends: T010, T011, T012, T013, T014, T015
  - [x] **PREP**: Preparar ambiente de testes e compilação
  - [x] **EXECUTE**: Executar suíte completa tests/release/ no Vitest e compilar checklist operacional
  - [x] **VERIFY**: Executar testes T010, T011 e T012 no Vitest validando passagem em GREEN
  - [x] **VISUAL**: Não aplicável: tarefa técnica de DevOps sem componentes de interface
  - [x] **EVIDENCE**: Gravar artefatos e relatório de prontidão
  - [x] **IMPROVE**: Confirmar que o sistema está pronto para publicação remota
  <!-- specsfy:evidence {"task":"T016","refs":["US-004","FR-004","NFR-004","AC-010","AC-011","AC-012"],"files":["tests/release/production_release.test.ts","docs/ops/PRODUCTION_DEPLOY_GUIDE.md"],"commands":[{"run":"npx vitest run tests/release/production_release.test.ts","exit":0}]} -->

### 15. Ordem de execução

1. **Fase 1 (Testes TDD de Release)**: Implementação de T001 a T012 em tests/release/.
2. **Fase 2 (Harmonização do Script e Manifestos)**:
   - T013: Extração dinâmica da versão no script de deploy.
   - T014: Auditoria do manifesto docker-stack.yml.
   - T015: Validação do nginx.conf e Dockerfile.
3. **Fase 3 (Validação Integral e Checklist)**:
   - T016: Execução da suíte completa de release e checklist operacional.

### 16. Dependências, riscos e suposições

#### Dependências

- **DEP-001**: Docker CLI com suporte a buildx.
- **DEP-002**: Acesso à rede externa `network_public` na VPS Hostinger com Traefik ativo.

#### Riscos

- **RSK-001**: Variável de ambiente ausente no momento do build → **Mitigação**: Script verifica e reporta erro imediatamente com instruções claras antes de disparar o buildx.
- **RSK-002**: Conflito de porta ou label no Traefik → **Mitigação**: Suíte automatizada valida o formato exato das labels exigidas pelo Traefik.

#### Suposições

- **SUP-001**: A VPS Hostinger opera com Docker Swarm e Traefik já configurados escutando na rede `network_public`.

### 17. Decisões

- **DEC-001**: Versão dinâmica no script — `deploy-multiarch.sh` obtém a versão diretamente do `package.json` evitando divergências futuras.
- **DEC-002**: Healthcheck autônomo — Rota `/health` no Nginx não consulta banco nem serviços externos, evitando falsos positivos durante oscilações de rede.
- **DEC-003**: Ordem start-first — Garante disponibilidade contínua durante atualizações de versão no Docker Swarm.

### 18. Definition of Done

- [x] `Definition Gate` está `Passed`.
- [x] `Plan Gate` está `Passed`.
- [x] `Delivery Gate` está `Passed`.
- [x] Todos os cenários `AC` aplicáveis passam.
- [x] Todos os requisitos possuem evidência de verificação.
- [x] Todas as tarefas na seção 14 estão concluídas.
- [x] Testes e checks estáticos disponíveis passam.
