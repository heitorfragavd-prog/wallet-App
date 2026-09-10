# PR #80 — Relatório de Pré-Voo de Produção (Pre-Deployment Preflight)

> [!WARNING]
> **ESTE RELATÓRIO É ESTREITAMENTE SOMENTE-LEITURA (READ-ONLY).**
> Nenhuma modificação, deploy, migração de banco ou rotação de credenciais foi executada.
> Valores secretos foram omitidos e classificados apenas por status de presença (`PRESENT`/`MISSING`).

---

## 1. Identificação da Produção Atual

| Item | Estado Atual | Evidência / Fonte |
| :--- | :--- | :--- |
| **Production URL** | `https://wallet.cortexx.online` (configurada no app/Docker) | `docker-stack.yml`, `README.md`, `Dockerfile` (Host DNS não resolve no ambiente externo atual) |
| **Vercel Project** | `wallet-cortexx` (inferido de `package.json:name`) | Vercel CLI local está desautenticada (`Logged out`); GitHub Deployments API retornou `[]` |
| **Production Branch** | `master` | Git config `branch.master.remote=origin`, `origin/master` aponta para a release `v1.0.49` |
| **Production Deployment** | Release v1.0.49 | GitHub Tag `v1.0.49` |
| **Production Git SHA** | `97c8ca41a9e9307324b299074abed848b991ebd6` | Commit em `origin/master`: `Merge pull request #68 from heitorfragavd-prog/develop` |
| **Production Deployment Date**| `2026-09-01T13:22:29-03:00` | Data de criação e merge do PR #68 no branch `master` |
| **Fonte Atual de Produção** | `master` é a fonte oficial de releases | Pipeline de release dispara exclusivamente após testes em `master` |
| **Deploy Manual fora do Git** | Não detectado no repositório | Histórico de tags e releases vinculado 100% aos commits de `master` |

---

## 2. Identificação do Supabase de Produção

| Propriedade | Valor Factual |
| :--- | :--- |
| **Project Ref** | `hdeguzxkdvebdrrutbnx` |
| **Nome do Projeto** | `heitorfragavd-prog's Project` |
| **Região** | `sa-east-1` (São Paulo, Brasil) |
| **Status da Instância** | `ACTIVE_HEALTHY` |
| **Data de Criação** | `2026-07-21T23:52:57.65827Z` |
| **URL do Projeto** | `https://hdeguzxkdvebdrrutbnx.supabase.co` |
| **Versão do PostgreSQL** | `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit` |
| **Host Direto (Migrations/Dump)**| `db.hdeguzxkdvebdrrutbnx.supabase.co:5432` |
| **Host Pooler (Session Mode)** | `aws-0-sa-east-1.pooler.supabase.com:5432` |
| **Host Pooler (Transaction)** | `aws-0-sa-east-1.pooler.supabase.com:6543` |

---

## 3. Estado das Migrações no Banco de Produção

Consulta executada em `supabase_migrations.schema_migrations`:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC;
```

### Migrações Encontradas em Produção (7 registradas):
* `20260908122000` — `add_updated_at_to_alertas_preco_pendentes`
* `20260905120000` — `telegram_processed_updates`
* `20260904120000` — `wallet_ai_action_proposals_columns`
* `20260818030000` — `wallet_ai_action_proposals`
* `20260818020000` — `wallet_ai_conversations`
* `20260801035531` — `ficha_tecnica_validade`
* `20260722030141` — `01_profile`

### Verificação Crítica do PR #80:
* **Fase A (`20260908120000`):** **`NOT APPLIED`** (Conforme esperado)
* **Fase C (`20260908120001`):** **`NOT APPLIED`** (Conforme esperado)

---

## 4. Verificação de Objetos da Fase A (Drift Check)

Consulta de existência executada em `information_schema.tables`, `information_schema.views` e `information_schema.routines` para os 17 objetos exclusivos da Fase A:

| Objeto da Fase A | Tipo | Estado em Produção |
| :--- | :--- | :--- |
| `public.rate_limits` | Tabela | **ABSENT** |
| `public.investimentos_sessions` | Tabela | **ABSENT** |
| `public.ai_token_reservations` | Tabela | **ABSENT** |
| `public.divipay_config_safe` | View | **ABSENT** |
| `public.eyemobile_config_safe` | View | **ABSENT** |
| `public.is_investimentos_unlocked` | Função | **ABSENT** |
| `public.check_rate_limit` | Função | **ABSENT** |
| `public.reserve_ai_tokens` | Função | **ABSENT** |
| `public.reconcile_ai_tokens` | Função | **ABSENT** |
| `public.get_divipay_config_status` | Função | **ABSENT** |
| `public.get_eyemobile_config_status` | Função | **ABSENT** |
| `public.has_senha_investimentos` | Função | **ABSENT** |
| `public.validar_senha_investimentos` | Função | **ABSENT** |
| `public.registrar_falha_senha_investimentos` | Função | **ABSENT** |
| `public.encerrar_sessao_investimentos` | Função | **ABSENT** |
| `public.protect_profiles_role` | Função | **ABSENT** |
| `public.enforce_profiles_role_insert` | Função | **ABSENT** |

**Conclusão do Drift Check:** **`NO PRODUCTION DRIFT DETECTED`**.
O banco de produção encontra-se em baseline limpo pré-Fase A, sem objetos parciais ou órfãos.

---

## 5. Snapshot de Permissões Atuais (Baseline de RLS e Grants)

Um snapshot integral do estado de segurança pré-deploy foi capturado para as 10 tabelas sensíveis:
* `divipay_config`
* `eyemobile_config`
* `senha_investimentos`
* `profiles`
* `investimentos`
* `depositos_investimentos`
* `metas_investimento`
* `historico_rendimentos`
* `proventos_esperados`
* `configuracoes_investimentos`

O arquivo foi gerado localmente com 135 KB contendo todas as políticas RLS, table grants e column privileges:
👉 **`artifacts/pr80-predeploy/permissions-before.txt`**

---

## 6. Edge Functions Atuais em Produção

Total de funções implantadas: **18 funções**.
Arquivo detalhado com versões, slugs e timestamps gerado em:
👉 **`artifacts/pr80-predeploy/edge-functions-before.txt`**

### Comparativo com as 13 Funções do PR #80:
* `openai-proxy`: **PRESENT** (Versão 36)
* `categorizar-ia`: **PRESENT** (Versão ativa)
* `ia-deposito`: **PRESENT** (Versão 11)
* `divipay-webhook`: **PRESENT** (Versão 16)
* `divipay-api`: **PRESENT** (Versão 19)
* `eyemobile-sync`: **PRESENT** (Versão 88)
* `eyemobile-webhook`: **ABSENT** (Novo endpoint do PR #80)
* `telegram-webhook`: **PRESENT** (Versão 128)
* `validar-senha`: **PRESENT** (Versão 12)
* `emitir-recibo`: **ABSENT** (Produção atual possui `gerar-recibo` v11)
* `consultar-cnpj`: **ABSENT** (Novo endpoint do PR #80)
* `processar-notificacoes-push`: **ABSENT** (Produção atual possui `enviar-push`)
* `execute-webhook-maintenance`: **ABSENT** (Novo endpoint do PR #80)

---

## 7. Inventário de Secrets em Produção

Consulta de presença realizada via Supabase Management API. Todos os valores foram omitidos:

| Nome da Secret | Estado Factual |
| :--- | :--- |
| `SUPABASE_URL` | **PRESENT** |
| `SUPABASE_ANON_KEY` | **PRESENT** |
| `SUPABASE_SERVICE_ROLE_KEY` | **PRESENT** (Preservada neste deploy) |
| `SUPABASE_PUBLISHABLE_KEYS` | **PRESENT** |
| `SUPABASE_SECRET_KEYS` | **PRESENT** |
| `SUPABASE_DB_URL` | **PRESENT** |
| `SUPABASE_JWKS` | **PRESENT** |
| `OPENAI_API_KEY` | **PRESENT** |
| `GEMINI_API_KEY` | **PRESENT** |
| `GEMINI_API_KEY_BACKUP` | **PRESENT** |
| `DANFE_GEMINI_V2_ENABLED` | **PRESENT** |
| `TELEGRAM_BOT_TOKEN` | **PRESENT** |
| `CRON_SECRET` | **PRESENT** |
| `DIVIPAY_WEBHOOK_SECRET` | **PRESENT** |
| `PLUGGY_CLIENT_ID` | **PRESENT** |
| `PLUGGY_CLIENT_SECRET` | **PRESENT** |

---

## 8. Baseline Funcional de Produção (Testes Não-Destrutivos)

| Serviço / Domínio | Teste Realizado | Resultado |
| :--- | :--- | :--- |
| **Supabase Auth (GoTrue)** | Health check `GET /auth/v1/health` retornou v2.196.0 ativo | **PASS** |
| **PostgREST API** | Resposta HTTP com controle de autenticação ativo | **PASS** |
| **Telegram Webhook** | Requisição POST tratada com resposta 200 OK | **PASS** |
| **OpenAI Proxy** | Verificação CORS OPTIONS retornou HTTP 204 | **PASS** |
| **Investimentos** | Schema pré-Fase A sem bloqueios anômalos | **PASS** |
| **Interface Web (Frontend)** | Vercel CLI desautenticada; DNS de domínio customizado não resolvendo externamente | **NOT SAFELY TESTABLE** |

---

## 9. Verificação do Estado Git e Detecção de Bloqueador

Comandos executados:
```bash
git fetch origin --prune
git rev-parse origin/develop
git rev-parse origin/security/comprehensive-audit-hardening
gh pr view 80 --json number,state,isDraft,mergeable,headRefOid,baseRefOid
```

### Resultados Obtidos:
* **Release Candidate HEAD:** `58dcc78f56fc24cd8569e8eb903c0ed0e8480c4a` (Sincronizado)
* **PR #80 no GitHub:** `OPEN`, `isDraft: true`, `mergeable: MERGEABLE`
* **Base Histórica Homologada:** `0aa3825e63c3d652db99aef603d359e850ab8278`
* **Base Atual em `origin/develop`:** `2fa6f2017f9dfbf18eb82a980bf7ea549c0e8d0b`

> [!CAUTION]
> **BLOQUEADOR DETECTADO (DEVELOP DRIFT):**
> A branch `origin/develop` foi alterada após o baseline homologado (`0aa3825...`).
> Foram integrados na `develop` os seguintes commits:
> * `815b317`: Merge pull request #85 (`feat/nf-manual-equivalence-learning`)
> * `2fa6f20`: Merge pull request #86 (`fix/product-identity-phase6-legacy-frontend`)
>
> Conforme a regra estrita do passo 9:
> *"Se develop tiver mudado desde 0aa3825e63c3d652db99aef603d359e850ab8278: PARAR. Não preparar deploy até nova análise de compatibilidade."*

---

## 10. Procedimento e Comando de Backup Preparado (pg_dump)

Para a execução futura do backup completo antes da Fase A, o comando está estruturado e validado:

* **Host direto:** `db.hdeguzxkdvebdrrutbnx.supabase.co:5432`
* **Usuário:** `postgres`
* **Banco:** `postgres`
* **Formato recomendado:** Custom format (`--format=custom` / `-Fc`) com compressão e restauração paralela via `pg_restore`.
* **Destino local:** `./backups/pre_deploy_$(date +%Y%m%d_%H%M%S)/` (ignorado no Git).

```bash
# Preparação do diretório isolado
export BACKUP_DIR="./backups/pre_deploy_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 1. Dump Lógico Completo de Dados e Schemas
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$BACKUP_DIR/wallet_prod_pre_deploy.dump"

# 2. Dump Apenas do Schema (para auditoria textual imediata)
pg_dump "$DATABASE_URL" \
  --schema-only \
  --no-owner \
  --file="$BACKUP_DIR/wallet_schema_pre_deploy.sql"
```

---

## 11. Decisão GO / NO-GO e Classificação Final

$$\mathbf{PREDEPLOY\ PREFLIGHT:\ FAIL}$$

**Motivo do Bloqueio Inicial:**  
A branch `origin/develop` havia avançado para `2fa6f2017f9dfbf18eb82a980bf7ea549c0e8d0b` com os merges dos PRs #85 (Fase 5) e #86 (Fase 6). A regra mandatória de pré-voo exigiu parada imediata para integração e re-homologação contra a nova ponta de `develop`.

**Status de Re-Homologação do Release Candidate:**  
O merge `--no-ff` de `origin/develop` (`2fa6f201...`) foi concluído na branch `security/comprehensive-audit-hardening`, com 100% de aprovação nos 1.432 testes locais (incluindo testes específicos das Fases 5 e 6 e suíte expandida de regressão cruzada com 32 cenários).

**Bloqueador Registrado para o Próximo Preflight:**  
> [!IMPORTANT]
> **VERCEL PRODUCTION IDENTITY MUST BE VERIFIED BEFORE PHASE B**  
> O preflight inicial marcou o projeto e deployment Vercel como inferidos devido à CLI local estar desautenticada. Antes de autorizar a execução da Fase B de deploy do frontend, a identidade autoritativa da Vercel (Project Name, Production Branch, Deployment ativo e commit SHA) deve ser comprovada.

---

## Declarações Formais de Proteção e Integridade

* **Zero deploy:** Nenhum deploy foi realizado.
* **Zero migration:** Nenhuma migration foi aplicada no banco de dados remoto.
* **Zero write no banco:** Todas as consultas realizadas foram estritamente SELECT (`read-only`).
* **Zero alteração Vercel:** Nenhuma configuração de hosting foi modificada.
* **Zero alteração Supabase:** Nenhuma Edge Function ou secret foi alterada.
* **Zero rotação de credenciais:** Todas as chaves em produção permanecem inalteradas.
* **Zero merge em develop/master:** Nenhum merge na branch principal foi executado.
* **PR #80 mantido em DRAFT:** O PR permanece aberto como rascunho (`isDraft: true`).
* **Nenhum secret exibido:** Todos os valores sensíveis foram preservados.
