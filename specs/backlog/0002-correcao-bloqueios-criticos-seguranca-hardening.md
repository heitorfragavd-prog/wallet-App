# Backlog: Correcao dos Bloqueios Criticos de Seguranca e Hardening para Producao

| Metainformação | Valor |
| --- | --- |
| ID | BACKLOG-0002 |
| Status | Promoted |
| Produto | Wallet |
| Épico | Prontidão de Produção e Auditoria |
| Funcionalidade | Correção de Bloqueios Críticos de Segurança (Fase 1) |
| Tipo | Técnico / Segurança |
| Prioridade | Alta |
| Milestones | Phase B / Produção |
| Criado em | 2026-09-20 |
| Spec promovida | [SPEC-0002](../draft/0002-correcao-bloqueios-criticos-seguranca-hardening/spec.md) |

## Ideia original

Implementar a Fase 1 do Plano de Prontidão para Produção: sanar os bloqueios de segurança identificados na auditoria SPEC-0001 (SEC-001, SEC-002, SEC-003, SEC-004 e GIT-001) para desbloquear a liberação de deploy.

## Problema percebido

Vulnerabilidades críticas e altas no backend Supabase Edge Functions (IDOR em validar-senha, test-webhook aberto com service_role, injeção de user_id em openai-proxy), risco de vazamento de credenciais locais em contêineres Docker (.dockerignore permissivo) e 70 commits de hardening de segurança homologados no PR #80 ainda não integrados na branch develop.

## Pessoa afetada ou beneficiada

Usuários finais do Wallet (proteção de seus dados patrimoniais e senhas), time de desenvolvimento e mantenedores de produção.

## Resultado ou valor esperado

Eliminação de 100% dos portões bloqueantes de segurança: endpoints de Edge Functions com autenticação obrigatória (JWT) e validação de tenant/usuário, .dockerignore blindado e governança de branches reconciliada com o PR #80.

## Contexto

Continuação da entrega de auditoria técnica. Plano de Prontidão (docs/audit/production-readiness-plan.md) definiu a Fase 1 como pré-requisito estrito para qualquer deploy produtivo.

## Referências relacionadas

- [Inbox: Correção Bloqueios Críticos](../inbox/2026-09-20-122300-correcao-bloqueios-criticos-seguranca-hardening.md)
- [Relatório de Segurança: docs/audit/security-findings.md](../../docs/audit/security-findings.md)
- [Plano de Prontidão: docs/audit/production-readiness-plan.md](../../docs/audit/production-readiness-plan.md)
- [Governança Git: docs/audit/git-governance-findings.md](../../docs/audit/git-governance-findings.md)

## Comportamento esperado

1. validar-senha: exige cabeçalho Authorization com JWT válido do Supabase; impede alteração ou validação de senha para user_id diferente do usuário autenticado no token.
2. test-webhook: endpoint protegido, rejeitando requisições anônimas e exigindo autenticação administrativa comprovada.
3. openai-proxy: endpoint /transcribe-audio obtém o user_id do token autenticado, rejeitando user_id arbitrário enviado via multipart formData.
4. .dockerignore: atualizado com pattern **/.env* cobrindo qualquer variante de arquivo de ambiente.
5. Reconciliação do PR #80: integração validada com develop para unificar o baseline de hardening de segurança.

## Regras de negócio

- **RN-01 (Tolerância Zero para IDOR):** Nenhum endpoint de mutação ou validação de credenciais sensíveis pode aceitar user_id não correspondente ao token do chamador.
- **RN-02 (Fail-Closed na Autenticação):** Qualquer requisição sem cabeçalho Authorization válido deve retornar 401 Unauthorized imediatamente antes de processar qualquer lógica.
- **RN-03 (Isolamento de Segredos de Build):** Nenhuma variável confidencial de ambiente local pode ser copiada para a imagem do frontend.
- **RN-04 (Preservação de Homologações):** O PR #80 deve ser integrado preservando a suíte de testes de não-regressão.

## Critérios de aceitação

- **Cenário 1: Proteção de validar-senha contra IDOR**
  - **Dado** uma requisição POST para a Edge Function validar-senha,
  - **Quando** o token JWT for ausente, inválido ou pertencer a outro user_id,
  - **Então** a função retorna 401 Unauthorized ou 403 Forbidden e não altera a tabela senha_investimentos.

- **Cenário 2: Proteção de test-webhook**
  - **Dado** uma requisição para a Edge Function test-webhook,
  - **Quando** disparada por um chamador anônimo sem credencial de admin,
  - **Então** a execução com service_role é bloqueada e retorna 401.

- **Cenário 3: Proteção de openai-proxy contra injeção de usuário**
  - **Dado** uma chamada ao endpoint /transcribe-audio,
  - **Quando** um formData contiver user_id arbitrário diferente do token,
  - **Então** o sistema ignora o user_id do formulário e usa estritamente o do token JWT autenticado.

- **Cenário 4: Blindagem do .dockerignore**
  - **Dado** a raiz do repositório,
  - **Quando** o .dockerignore for inspecionado,
  - **Então** a regra **/.env* impede a inclusão de qualquer arquivo de ambiente no contexto do Docker.

- **Cenário 5: Integração de Segurança do PR #80**
  - **Dado** o grafo Git da branch develop,
  - **Quando** a integração for consolidada,
  - **Então** o hardening de banco, rate-limit e SSRF passa a fazer parte da linha de base de desenvolvimento.
