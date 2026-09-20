# Backlog: Reconciliacao e Integracao do PR 80 na develop

| Metainformação | Valor |
| --- | --- |
| ID | BACKLOG-0003 |
| Status | Refined |
| Produto | Wallet App |
| Épico | Governança Git e Hardening de Produção |
| Funcionalidade | Reconciliação do PR #80 na branch develop |
| Tipo | Segurança / Governança Git |
| Prioridade | Alta |
| Milestones | Phase B / Produção |
| Criado em | 2026-09-20 |
| Spec promovida | Nenhuma |

## Ideia original

Integrar os 70 commits de hardening de seguranca do PR 80 na branch develop para unificar a linha de base de producao

## Problema percebido

A branch develop encontra-se sem os 70 commits de hardening de seguranca ja homologados no PR 80, gerando descompasso com o banco (onde a Fase A ja esta aplicada) e impedindo o deploy inaugural da Phase B.

## Pessoa afetada ou beneficiada

Equipe de Engenharia, Administracao de Infraestrutura e Usuarios da plataforma Wallet.

## Resultado ou valor esperado

Branch develop atualizada e alinhada com as defesas contra SSRF, rate limit atomico e RLS seguro sem quebrar os 1394 testes existentes nem regredir as correções de segurança da SPEC-0002.

## Contexto

- Auditoria diagnóstica SPEC-0001 (item GIT-001 de governança Git).
- Saneamento de vulnerabilidades críticas concluído na SPEC-0002.
- PR #80 aberto no GitHub (`heitorfragavd-prog/wallet-App/pull/80`) com 70 commits e CI verde.
- Worktree de auditoria isolado em `wallet-worktrees/security-audit` congelado no commit `62abcca849598abf8c815a11746393cc5e84d5ff`.

## Referências relacionadas

- `specs/completed/0001-auditoria-seguranca-debito-tecnico-producao/spec.md` (GIT-001)
- `specs/completed/0002-correcao-bloqueios-criticos-seguranca-hardening/spec.md`
- `docs/audit/git-governance-findings.md`
- `docs/audit/production-readiness-plan.md`
- `PR80_PRODUCTION_RUNBOOK.md`
- `PR80_PRODUCTION_PREFLIGHT.md`

## Comportamento esperado

1. Unificar na branch `develop` o histórico e as alterações dos 70 commits do PR #80 (`security/comprehensive-audit-hardening`).
2. Resolver qualquer divergência textual ou conflito garantindo a preservação estrita tanto dos guardrails de release do PR #80 quanto dos saneamentos de `validar-senha`, `test-webhook`, `openai-proxy` e `.dockerignore` da SPEC-0002.
3. Assegurar que os testes de segurança de ambas as frentes continuem 100% em verde (`GREEN`).
4. Prover rastreabilidade completa e atestar a prontidão da base de código para a Phase B (deploy na Hostinger).

## Regras de negócio

- Não mutar o worktree isolado `wallet-worktrees/security-audit`.
- Manter o princípio de Zero Downtime (Expand & Contract): a Phase C de revogação de colunas permanece desacoplada e reservada para o pós-deploy.
- Preservar integridade das suítes de testes automatizados existentes (1394 testes de aplicação).

## Critérios de aceitação

- **AC-001**: Incorporação limpa dos commits de `security/comprehensive-audit-hardening` na branch `develop`.
- **AC-002**: Coexistência harmônica das proteções do PR #80 (rate limiter atômico, mitigação SSRF, RLS com sessão de investimentos) e das correções de SPEC-0002.
- **AC-003**: Execução bem-sucedida de toda a suíte de testes Vitest (`src/` e `tests/security-fixes/`).
- **AC-004**: Build do frontend via Vite gerando artefatos sem erros de compilação ou empacotamento.

## Qualidades e operação

- **Segurança**: Incorporação de rate limit atômico compartilhado via Postgres, proteção SSRF e sanitização contra XSS.
- **Privacidade**: Isolamento de segredos de terceiros (DiviPay, Eyemobile, OpenAI) exclusivamente no servidor.
- **Desempenho e volume**: Transações Postgres com lock de linha para rate limits sem concorrência destrutiva.
- **Auditoria e observabilidade**: Preservação de logs e metadados de execução com mascaramento de dados sensíveis.

## Dependências

- Git CLI local com acesso às branches `develop` e `security/comprehensive-audit-hardening`.
- Dependências npm instaladas e runner Vitest.

## Situações de erro

- Conflito de mesclagem em Edge Functions compartilhadas -> Resolução manual preservando a versão mais segura e auditada.
- Regressão em testes existentes -> Interrupção imediata e ajuste fino antes de concluir a entrega.

## Escopo

- **Dentro**: Reconciliação do PR #80 na branch `develop`, resolução de conflitos, unificação das suítes de testes e validação de build.
- **Fora**: Deploy em produção na VPS Hostinger (reservado para SPEC-0004 / Phase B) e aplicação da Phase C no banco de produção.

## Dúvidas, decisões e riscos

- **DEC-001**: Merge com commit de integração formal (`--no-ff`) para manter a rastreabilidade histórica do PR #80 no grafo Git.
- **RSK-001**: Conflitos entre as alterações da SPEC-0002 e os módulos `_shared` do PR #80 -> Mitigado pela execução contínua dos testes focais de segurança.

## Pronto para desenvolvimento

- [x] O problema e a pessoa beneficiada estão claros.
- [x] O evento inicial e o resultado esperado estão claros.
- [x] Permissões, regras e exceções relevantes estão claras.
- [x] O resultado pode ser verificado objetivamente.
- [x] Segurança, privacidade e desempenho foram avaliados conforme o risco.
- [x] Fora de escopo, dependências e decisões pendentes estão registrados.

## Próximo passo

Promover este item refinado para a especificação integrada `SPEC-0003` via `$specsfy-03-specify`.
