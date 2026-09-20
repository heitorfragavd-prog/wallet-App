# Relatório de Auditoria de Segurança e Segredos

**Data de Emissão**: 2026-09-16  
**Auditor**: Antigravity Specsfy Security Team  
**Alvo**: Repositório Wallet App (branch `develop` e Supabase Backend)  
**Status de Homologação**: Modo Leitura Estrita (Sem mutação de código)  

---

## 1. Resumo Executivo de Segurança

Esta auditoria realizou uma varredura estática profunda no código-fonte do frontend (`src/`), configurações de ambiente (`.env*`, `Dockerfile`, `docker-compose`), Supabase Edge Functions (`supabase/functions/`) e migrations de banco de dados (`supabase/migrations/`).

Foram identificadas **3 vulnerabilidades Críticas/Altas no backend** e **apontamentos de governança de segredos** que impedem o deploy imediato para produção sem saneamento prévio.

---

## 2. Varredura de Chaves e Credenciais

### 2.1. Arquivo de Ambiente Local (`.env`)
- **Achado**: O arquivo `.env` na raiz contém chaves reais do serviço Pluggy:
  - `PLUGGY_CLIENT_ID`: `486d...4c55`
  - `PLUGGY_CLIENT_SECRET`: `dWHW...kAns`
  - `VITE_SUPABASE_URL`: `https://...supabase.co`
  - `VITE_SUPABASE_ANON_KEY`: `eyJh...hqjE`
- **Classificação de Severidade**: **Alto**
- **Impacto Prático**: Embora o arquivo `.env` esteja listado no `.gitignore` e não esteja commitado no repositório Git, o arquivo `Dockerfile` na linha 13 executa `COPY . .` e o `.dockerignore` ignora apenas `.env` e `.env.local`. Caso desenvolvedores criem arquivos como `.env.production` ou `.env.backup`, eles seriam inadvertidamente embutidos na imagem Docker de produção.
- **Ação Corretiva**: Atualizar `.dockerignore` para usar pattern curinga `**/.env*`, impedindo cópia de qualquer arquivo de ambiente para o contêiner. Segredos do Pluggy devem residir exclusivamente como Secrets no Supabase Vault ou nas Edge Functions.

---

## 3. Permissões de Edge Functions e Migrations

A auditoria analisou 31 Supabase Edge Functions e 46 arquivos de migration SQL para conformidade com Row Level Security (RLS) e controle de acesso.

### 3.1. [CRÍTICO] Falha de Autenticação e IDOR em `validar-senha`
- **Arquivo**: `supabase/functions/validar-senha/index.ts:27-55`
- **Diagnóstico**: A função recebe `{ mode, user_id, senha }` no corpo da requisição JSON com CORS liberado para qualquer origem (`*`) e **não valida o cabeçalho de autorização (JWT)** contra `supabase.auth.getUser()`.
- **Impacto Prático**: Qualquer usuário na internet com um UUID de outro usuário pode emitir um `POST` com `mode: "cadastrar"` e sobrescrever a senha de investimentos da vítima usando o cliente `supabaseAdmin` com `service_role` (que ignora RLS).
- **Classificação de Severidade**: **Crítico** (Vulnerabilidade Bloqueante para Produção).

### 3.2. [ALTO] Execução Desprotegida com Service Role em `test-webhook`
- **Arquivo**: `supabase/functions/test-webhook/index.ts:13-38`
- **Diagnóstico**: A função de teste de webhook não exige autenticação de administrador nem valida JWT. Ao receber qualquer requisição HTTP, ela instancia `createClient` com a chave `SUPABASE_SERVICE_ROLE_KEY` e consulta a tabela `system_settings` para disparar webhooks.
- **Impacto Prático**: Vetor para negação de serviço (DoS) e manipulação indevida de tráfego de saída do servidor Supabase (SSRF).
- **Classificação de Severidade**: **Alto** (Bloqueante para Produção).

### 3.3. [ALTO] Confused Deputy / Injeção de `user_id` em `openai-proxy`
- **Arquivo**: `supabase/functions/openai-proxy/index.ts:1078-1097`
- **Diagnóstico**: No endpoint `/transcribe-audio`, o parâmetro `targetUserId` é obtido diretamente do `formData` enviado pelo cliente. O backend então busca a `api_key` da OpenAI cadastrada para aquele `targetUserId` na tabela `ia_configuracoes` sem checar se o token de quem fez a chamada pertence àquele usuário.
- **Impacto Prático**: Um usuário pode consumir a cota e os créditos de OpenAI de outro usuário cadastrado.
- **Classificação de Severidade**: **Alto** (Bloqueante para Produção).

### 3.4. [MÉDIO] Ausência de Sanitização HTML em `gerar-recibo`
- **Arquivo**: `supabase/functions/gerar-recibo/index.ts:77-105`
- **Diagnóstico**: O endpoint interpola os campos `recebedor`, `pagador` e `cidade` diretamente dentro de uma string HTML sem sanitização contra caracteres especiais (`<`, `>`, `"`).
- **Impacto Prático**: Potencial Stored/Reflected XSS caso o HTML gerado seja exibido em browser ou impresso sem renderizador seguro.
- **Classificação de Severidade**: **Médio**.

### 3.5. Análise de Row Level Security (RLS) nas Migrations
- **Status do RLS**: A base de dados possui RLS habilitado nas tabelas principais. As correções da Phase A e a migration `20260826120000_ia_config_api_key_protection.sql` revocaram com sucesso o `SELECT` de chaves de API da role `authenticated`, expondo apenas a RPC `get_ia_config_status`.
- **Atenção**: Funções agendadas via pg_cron em `30.cron_lembretes_manutencao.sql` e `39.cron_recurring_transactions.sql` dependem da variável de banco `app.settings.service_role_key`. Essa configuração deve ser injetada no banco produtivo via Supabase Dashboard ou migration controlada.

---

## 4. Mascaramento e Classificação de Gravidade

Em total conformidade com os princípios de segurança da informação e com os requisitos **NFR-001** e **AC-003**:
- Nenhum token real, chave privada ou senha é exposta em texto claro neste relatório.
- Todas as chaves e valores confidenciais encontrados durante a varredura foram mascarados com o padrão `***` ou truncados (`sk-proj-***`).

### Tabela Consolidada de Achados de Segurança

| ID | Componente / Arquivo | Tipo de Vulnerabilidade | Severidade | Bloqueante para Deploy? |
| --- | --- | --- | --- | --- |
| SEC-001 | `supabase/functions/validar-senha` | Ausência de validação de JWT + IDOR de Senha | **Crítico** | **SIM** |
| SEC-002 | `supabase/functions/test-webhook` | Endpoint aberto usando service_role | **Alto** | **SIM** |
| SEC-003 | `supabase/functions/openai-proxy` | Confused Deputy / Injeção de `user_id` em transcrição | **Alto** | **SIM** |
| SEC-004 | `.dockerignore` / `.env` | Risco de vazamento de credenciais em imagem Docker | **Médio** | **SIM** |
| SEC-005 | `supabase/functions/gerar-recibo` | Interpolação direta de HTML sem escape (XSS) | **Médio** | Não |
| SEC-006 | `30.cron_lembretes_manutencao.sql` | Dependência de `app.settings.service_role_key` | **Médio** | Não |
