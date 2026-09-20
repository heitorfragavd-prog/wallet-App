# Backlog: Auditoria Geral de Seguranca Debito Tecnico e Prontidao para Producao

| Metainformação | Valor |
| --- | --- |
| ID | BACKLOG-0001 |
| Status | Promoted |
| Produto | Wallet |
| Épico | Prontidão de Produção e Auditoria |
| Funcionalidade | Diagnóstico Geral e Plano de Correção |
| Tipo | Técnico / Governança |
| Prioridade | Alta |
| Milestones | Phase B / Produção |
| Criado em | 2026-09-16 |
| Spec promovida | [SPEC-0001](../draft/0001-auditoria-seguranca-debito-tecnico-producao/spec.md) |

## Ideia original

Eu quero uma revisão completa de segurança, débito técnico, erro, falha, branch, tudo que pode estar de errado. Eu quero que você analise porque a gente tem que preparar esse software para produção. Então, hardcode, tudo que tiver problema, você tem que analisar, entender, qualificar, diagnosticar e apresentar um plano de correção.

## Problema percebido

Risco de vulnerabilidades de seguranca, valores hardcoded/chaves expostas, debitos tecnicos acumulados e inconsistencias entre branches que possam comprometer a operacao em producao.

## Pessoa afetada ou beneficiada

Desenvolvedores, mantenedores e usuarios finais da aplicacao em producao.

## Resultado ou valor esperado

Diagnostico completo e qualificado das falhas, seguranca e branches, acompanhado de plano de correcao e mitigacao para prontidao de producao.

## Contexto

Preparacao do software Wallet para entrada segura em producao com Docker Swarm, Traefik e PostgreSQL Supabase.

## Referências relacionadas

- [Inbox: Revisão Completa](../inbox/2026-09-15-220649-revisao-completa-seguranca-debito-tecnico-producao.md) (origem capturada)

## Comportamento esperado

Execução de varredura automatizada e estática sem efeitos colaterais (somente leitura), consolidando um relatório de diagnóstico qualificado com matriz de severidade (Crítico, Alto, Médio, Baixo) e um plano de ação ordenado para implementação posterior.

## Regras de negócio

- **RN-01 (Modo Leitura Estrita):** A auditoria e diagnóstico não devem alterar arquivos de código nem estado do banco/infraestrutura enquanto o plano de ação não for aprovado.
- **RN-02 (Bloqueio Estrito por Severidade):** Achados de severidade Crítica (ex: chaves privadas ou segredos expostos, brechas de RLS) e Alta (ex: build falhando, testes quebrando, divergência grave de branches) bloqueiam categoricamente qualquer deploy para produção.
- **RN-03 (Fatiamento das Frentes):** A análise deve cobrir 4 frentes: Segurança/Segredos, Qualidade Técnica/Build, Governança Git/Branches e Infraestrutura/Swarm.
- **RN-04 (Matriz de Qualificação):** Todo problema encontrado deve conter localização exata, gravidade (Crítico, Alto, Médio, Baixo), impacto operacional e recomendação de correção.

## Critérios de aceitação

- **Cenário 1: Varredura de Segurança e Segredos**
  - **Dado** o repositório e configurações atuais da aplicação Wallet,
  - **Quando** a auditoria de segurança for executada,
  - **Então** nenhum token, chave privada, segredo ou valor sensível hardcoded deve passar despercebido, sendo todos catalogados com sua localização e gravidade.

- **Cenário 2: Diagnóstico de Build, Testes e TypeScript**
  - **Dado** o código-fonte atual na branch `develop`,
  - **Quando** a verificação de sanidade técnica for realizada,
  - **Então** o status do `tsc` (TypeScript), da suíte de testes Vitest e do `build` Vite deve ser registrado com contagem exata de erros, advertências e testes passando/falhando.

- **Cenário 3: Auditoria de Branches e Worktrees**
  - **Dado** o estado das branches locais e remotas (incluindo `develop`, PR #80 e worktree de auditoria),
  - **Quando** a governança Git for inspecionada,
  - **Então** o relatório deve demonstrar o delta exato entre branches, commits pendentes e garantia de que o worktree homologado da Phase B permaneça íntegro.

- **Cenário 4: Matriz e Plano de Correção para Produção**
  - **Dado** o conjunto consolidado de achados das 4 frentes,
  - **Quando** o relatório final for estruturado,
  - **Então** deve ser apresentado um plano de correção priorizado por severidade com gates claros de bloqueio produtivo.

## Qualidades e operação

- **Segurança:** Identificação exaustiva de credenciais, chaves, autorização RLS e conformidade de variáveis de ambiente.
- **Confiabilidade:** Evidências auditáveis com comandos executáveis e rastreabilidade de arquivos.
- **Integridade do Repositório:** Isolamento absoluto entre a branch `develop` e o worktree de homologação PR #80.

## Dependências

- Nenhuma dependência externa bloqueante para a execução do diagnóstico.

## Situações de erro

- Se algum comando de checagem falhar ou não puder ser executado, a inconsistência deve ser registrada como débito técnico ou risco no inventário.

## Escopo

- Dentro: Diagnóstico completo em 4 frentes simultâneas:
  1. Segurança e Segredos: varredura de valores hardcoded, chaves de API, credenciais e RLS/permissões de banco.
  2. Qualidade Técnica e Build: compilação TypeScript, suíte de testes Vitest, linter e débitos de código.
  3. Governança Git e Repositório: status de branches (develop, PR #80, homologação), worktrees e integridade do histórico.
  4. Infraestrutura e Prontidão Produtiva: configurações Docker, Swarm, Traefik, variáveis de ambiente e segurança de runtime.
- Fora: Alterações imediatas no código de produção ou aplicação de correções antes da aprovação do plano de ação unificado.

## Dúvidas, decisões e riscos

- **Decisão 1:** Diagnóstico em 4 frentes simultâneas em modo somente leitura confirmado.
- **Decisão 2:** Fatiamento do plano por severidade com bloqueio estrito para itens Críticos e Altos confirmado.
- **Risco:** Grande volume de arquivos e migrations a serem auditados; mitigado por varreduras estáticas e automatizadas.

## Pronto para desenvolvimento

- [x] O problema e a pessoa beneficiada estão claros.
- [x] O evento inicial e o resultado esperado estão claros.
- [x] Permissões, regras e exceções relevantes estão claras.
- [x] O resultado pode ser verificado objetivamente.
- [x] Segurança, privacidade e desempenho foram avaliados conforme o risco.
- [x] Fora de escopo, dependências e decisões pendentes estão registrados.

## Próximo passo

Aprofundar nesta etapa até o item ficar pronto para `$specsfy-03-specify`.
