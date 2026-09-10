# PR #80 — Owner Execution Checklist (Guia Operacional de Implantação)

> [!IMPORTANT]
> **GUIA OPERACIONAL ESTRITO PARA O PROPRIETÁRIO DO PROJETO**
> Este checklist contém a sequência prática exata para execução durante a janela de implantação em produção.
>
> * **Zero Downtime Strategy:** Expand & Contract em 3 fases (`Fase A (DB)` → `Fase B (Código)` → `6 etapas de rotação de credenciais` → `Fase C (DB Enforcement PSQL ONLY)`).
> * **Preservação de Credencial:** A chave mestra `SUPABASE_SERVICE_ROLE_KEY`, o segredo `JWT_SECRET` e as chaves anônimas/publishable **NÃO entram em rotação** neste deploy.
> * **Ponto de Não Retorno:** A conclusão da Fase C é o `SECURITY POINT OF NO RETURN`. Em caso de anomalia após a Fase C, utilize exclusivamente a recuperação segura `supabase/ops/rollback_20260908120000_safe_recovery.sql`.

---

## 1. ANTES DA IMPLANTAÇÃO (Pré-Requisitos e Baseline)

- [ ] **1.1 Snapshot e Backup Completo do Banco:**
  ```bash
  # Criar diretório isolado de backup com timestamp
  export BACKUP_DIR="./backups/pre_deploy_$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$BACKUP_DIR"

  # Dump lógico completo de schemas e dados
  pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_DIR/wallet_prod_pre_deploy.dump"
  pg_dump "$DATABASE_URL" --schema-only --file="$BACKUP_DIR/wallet_schema_pre_deploy.sql"
  ```
  *Confirmação:* Arquivo `.dump` gerado com tamanho não-nulo e verificado.

- [ ] **1.2 Snapshot das Políticas RLS Existentes:**
  ```bash
  psql "$DATABASE_URL" -c "
    SELECT schemaname, tablename, policyname, permissive, roles, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  " > "$BACKUP_DIR/rls_policies_baseline.txt"
  ```

- [ ] **1.3 Confirmar Commit SHA e Estado Git:**
  * Executar no terminal:
    ```bash
    git fetch origin --prune
    git checkout security/comprehensive-audit-hardening
    git rev-parse HEAD
    git rev-parse origin/develop
    ```
  * *Verificação:* O SHA da base deve corresponder a `origin/develop` (`2fa6f2017f9dfbf18eb82a980bf7ea549c0e8d0b`), com integração completa das Fases 1 a 6.

- [ ] **1.4 Confirmar Secrets Existentes no Supabase (Apenas Nomes, Sem Valores):**
  ```bash
  supabase secrets list
  ```
  *Verificação:* As chaves atuais existem (`OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`).

- [ ] **1.5 Acessos Operacionais Validados:**
  * [ ] Acesso administrativo autenticado ao Dashboard do Supabase (SQL Editor, Edge Functions, Settings).
  * [ ] Acesso administrativo autenticado ao Dashboard da Vercel (Wallet App Frontend).
  * [ ] Acesso aos provedores externos:
    * OpenAI Platform (API Keys)
    * Google AI Studio (Gemini API Key)
    * Telegram BotFather (`/mybots`)
    * Dashboards de Parceiros (DiviPay e Eyemobile)

- [ ] **1.5.1 Verificação da Identidade de Produção da Vercel (OBRIGATÓRIO ANTES DA FASE B):**
  * [ ] **VERCEL PRODUCTION IDENTITY MUST BE VERIFIED BEFORE PHASE B**
  * [ ] Validar no Dashboard da Vercel (ou CLI autenticada) o Project Name exato (`wallet-cortexx` ou equivalente).
  * [ ] Validar a Production Branch configurada na Vercel (deve ser `master`).
  * [ ] Validar o Deployment ativo e o commit SHA atualmente servido.
  * [ ] Confirmar que o domínio público de produção aponta para esse deployment.

- [ ] **1.6 Smoke Tests Baseline Pré-Deploy (Confirmar que a Produção Atual está Sadia):**
  * [ ] Login de usuário existente funciona normalmente.
  * [ ] Dashboard e listagem de transações carregam sem erros 5xx.
  * [ ] Acesso a investimentos abre com senha atual.

---

## 2. FASE A: BANCO DE DADOS EXPANDIDO (Infraestrutura Permissiva)

A Fase A introduz as novas tabelas (`investimentos_sessions`, `rate_limits`, `ai_token_reservations`, `divipay_config_safe`, `eyemobile_config_safe`), triggers de integridade de perfil e RPCs seguras, **mantendo 100% dos acessos legados ativos**.

- [ ] **2.1 Aplicar Migration da Fase A:**
  A migration `supabase/migrations/20260908120000_security_phase_a_infrastructure.sql` pode ser aplicada conforme o procedimento documentado e validado:
  ```bash
  psql "$DATABASE_URL" -f supabase/migrations/20260908120000_security_phase_a_infrastructure.sql
  ```
  *(Como este arquivo contém apenas SQL padrão sem meta-comandos de cliente, ele também pode ser executado pelo SQL Editor do Dashboard do Supabase).*

- [ ] **2.2 Validação da Fase A:**
  * Executar a verificação de sanidade dos objetos criados:
    ```sql
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN ('investimentos_sessions', 'rate_limits', 'ai_token_reservations');

    SELECT proname FROM pg_proc WHERE proname IN (
      'check_rate_limit', 'reserve_ai_tokens', 'reconcile_ai_tokens',
      'is_investimentos_unlocked', 'get_divipay_config_status', 'get_eyemobile_config_status'
    );
    ```
  * *Verificação:* Todas as 3 tabelas e 6 funções retornam linhas ativas.
  * *Retrocompatibilidade:* Confirmar que o frontend e Edge Functions legados continuam operando sem nenhuma falha.

- [ ] **2.3 Decisão GO / NO-GO da Fase A:**
  * Se OK: **GO** para a Fase B.
  * Se falhar: **NO-GO**. Executar rollback da Fase A (apagar tabelas e funções criadas, pois nenhuma permissão foi revogada).

---

## 3. FASE B: DEPLOY DO CÓDIGO (Frontend e Edge Functions)

A Fase B atualiza a aplicação para consumir as novas RPCs seguras e os endpoints com validação atômica.

- [ ] **3.1 Deploy das 13 Edge Functions no Supabase:**
  ```bash
  supabase functions deploy openai-proxy --no-verify-jwt
  supabase functions deploy categorizar-ia --no-verify-jwt
  supabase functions deploy ia-deposito --no-verify-jwt
  supabase functions deploy divipay-webhook --no-verify-jwt
  supabase functions deploy divipay-api --no-verify-jwt
  supabase functions deploy eyemobile-sync --no-verify-jwt
  supabase functions deploy eyemobile-webhook --no-verify-jwt
  supabase functions deploy telegram-webhook --no-verify-jwt
  supabase functions deploy validar-senha --no-verify-jwt
  supabase functions deploy emitir-recibo --no-verify-jwt
  supabase functions deploy consultar-cnpj --no-verify-jwt
  supabase functions deploy processar-notificacoes-push --no-verify-jwt
  supabase functions deploy execute-webhook-maintenance --no-verify-jwt
  ```

- [ ] **3.2 Deploy do Frontend na Vercel:**
  * Disparar o deploy da branch `security/comprehensive-audit-hardening` na Vercel (ou push de release).
  * Aguardar o build completar com sucesso.
  * Purgar o cache CDN se aplicável.

- [ ] **3.3 Smoke Tests da Fase B (Validação do Código Seguro):**
  * [ ] **Investimentos:** Desbloqueio de sessão de investimentos via RPC `validar_senha_investimentos`.
  * [ ] **Configurações de Integração:** Tela de configurações DiviPay e Eyemobile carregam status seguro sem requisitar `client_secret` ou `secret_key`.
  * [ ] **IA / Rate Limit:** Chamada de categorização ou chat IA reserva tokens via `reserve_ai_tokens` sem estourar limite.
  * [ ] **Perfil de Usuário:** Atualização de nome/telefone funciona; tentativa de alterar role para `admin` é bloqueada.
  * [ ] **Recibos:** Visualização e impressão de recibo sanitizado sem quebra de layout.

- [ ] **3.4 Decisão GO / NO-GO da Fase B:**
  * Se OK: **GO** para a Rotação de Credenciais Externas.
  * Se falhar: **NO-GO**. Fazer redeploy do build anterior do frontend na Vercel e das versões anteriores das Edge Functions.

---

## 4. ROTAÇÃO CONTROLADA DE CREDENCIAIS (6 ETAPAS DE ROTAÇÃO/ATUALIZAÇÃO)

> [!WARNING]
> Execute esta etapa na ordem estrita de 1 a 6.
>
> **REGRAS DE SEGURANÇA MANDATÓRIAS:**
> * **NÃO** rotacionar `SUPABASE_SERVICE_ROLE_KEY`;
> * **NÃO** rotacionar o `JWT Signing Secret`;
> * **NÃO** alterar as chaves `anon` ou Publishable Keys.

- [ ] **Etapa 1: Senha do Banco PostgreSQL (`POSTGRES_PASSWORD`):**
  * [ ] Alterar a senha do banco no dashboard do Supabase (`Settings > Database > Database Password`).
  * [ ] Atualizar connection strings em ferramentas externas de BI/scripts de migração (PostgREST e Edge Functions continuam funcionando sem interrupção).

- [ ] **Etapa 2: OpenAI API Key (`OPENAI_API_KEY`):**
  * [ ] Gerar nova Secret Key no dashboard da OpenAI (`platform.openai.com`).
  * [ ] Injetar no Supabase:
    ```bash
    supabase secrets set OPENAI_API_KEY="nova-chave"
    ```
  * [ ] Testar prompt na Wallet IA.
  * [ ] Revogar a chave antiga na OpenAI após confirmação.

- [ ] **Etapa 3: Gemini API Key (`GEMINI_API_KEY`):**
  * [ ] Gerar nova chave no Google AI Studio.
  * [ ] Injetar no Supabase:
    ```bash
    supabase secrets set GEMINI_API_KEY="nova-chave"
    ```
  * [ ] Testar OCR/categorização.
  * [ ] Revogar a chave antiga após confirmação.

- [ ] **Etapa 4: Telegram Bot Token (`TELEGRAM_BOT_TOKEN`):**
  * [ ] No Telegram com `@BotFather`: Executar `/mybots` > Selecionar bot > `API Token` > `/revoke`.
  * [ ] Obter o novo token.
  * [ ] Injetar no Supabase:
    ```bash
    supabase secrets set TELEGRAM_BOT_TOKEN="novo-token"
    ```
  * [ ] Reconfigurar o webhook do bot:
    ```bash
    curl -F "url=https://<PROJECT-REF>.supabase.co/functions/v1/telegram-webhook" \
      https://api.telegram.org/bot<NOVO-TELEGRAM-TOKEN>/setWebhook
    ```
  * [ ] Enviar `/start` para o bot e verificar recebimento no banco.

- [ ] **Etapa 5: Cron Shared Secret (`CRON_SECRET`):**
  * [ ] Gerar segredo criptográfico aleatório (32 bytes hex).
  * [ ] Injetar no Supabase e no agendador externo (ex: Upstash / GitHub Actions / pg_cron):
    ```bash
    supabase secrets set CRON_SECRET="novo-segredo"
    ```

- [ ] **Etapa 6: Credenciais de Parceiros (DiviPay e Eyemobile):**
  * [ ] Gerar novos tokens nos painéis DiviPay / Eyemobile.
  * [ ] Atualizar via UI administrativa da Wallet App (ou Edge Function autorizada).
  * [ ] Executar sincronização de teste e confirmar resposta 200.

---

## 5. FASE C: ENFORCEMENT ATÔMICO NO BANCO DE DADOS (OBRIGATORIAMENTE PSQL)

A Fase C revoga o acesso da role `authenticated` às colunas confidenciais e ativa o RLS estrito de investimentos.

> [!CAUTION]
> **NÃO COPIAR `scripts/apply-phase-c-enforcement.sql` PARA O SQL EDITOR DO SUPABASE.**
>
> A Fase C deve ser executada **exclusivamente via cliente `psql`** a partir da raiz do repositório.
>
> **Motivos Operacionais e Técnicos:**
> 1. `\set ON_ERROR_STOP on` é um meta-comando específico do `psql` (o SQL Editor do navegador falha ao interpretar).
> 2. `\i supabase/migrations/20260908120001_security_phase_c_enforcement.sql` é um meta-comando `psql` de interpolação de arquivo relativo.
> 3. Precisamos manter a **mesma conexão e sessão transacional atômica**.
> 4. A variável transacional `SET LOCAL wallet.deploy_phase_b_completed = 'true'` precisa existir obrigatoriamente dentro da mesma transação que executa a migration C para satisfazer o gating de segurança.
> 5. O script `scripts/apply-phase-c-enforcement.sql` é o único orquestrador autorizado da Fase C.

### 5.1 Pré-Check do PSQL e Verificação de Conexão

Executar a partir da raiz do repositório (sem imprimir `DATABASE_URL` e sem expor senhas):

```bash
# 1. Confirmar versão da ferramenta psql
psql --version

# 2. Testar conectividade real com o banco de produção
psql "$DATABASE_URL" -c "SELECT current_database(), current_user, now();"

# 3. Confirmar que está na raiz do repositório (o script utiliza caminho relativo)
ls supabase/migrations/20260908120001_security_phase_c_enforcement.sql
```

### 5.2 Execução Oficial da Fase C via PSQL

- [ ] **Executar o Script Oficial em Transação Única:**
  ```bash
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/apply-phase-c-enforcement.sql
  ```

- [ ] **5.3 Confirmar Saída do Script:**
  * O script deve finalizar com código de saída 0 e a mensagem de confirmação:
    `FASE C APLICADA COM SUCESSO EM TRANSACAO ATOMICA E REGISTRADA NO SCHEMA_MIGRATIONS.`

---

## 6. PÓS-C: HOMOLOGAÇÃO FINAL EM PRODUÇÃO (Checklist de Sanidade)

Executar os testes operacionais ponta a ponta com a aplicação 100% endurecida:

- [ ] **6.1 Autenticação e Sessão:** Login, logout e refresh token funcionando normalmente.
- [ ] **6.2 Investimentos:**
  * Sem desbloquear: Saldo de investimentos permanece mascarado ou omitido.
  * Ao digitar a senha: RPC `validar_senha_investimentos` cria sessão e dados são exibidos perfeitamente.
  * Tentativa de `SELECT * FROM public.investimentos` direta no PostgREST sem sessão ativa retorna 0 linhas.
- [ ] **6.3 Eyemobile & DiviPay:** Listagem de configurações carrega status sem falhas de coluna ausente.
- [ ] **6.4 Telegram Webhook:** Envio de mensagem financeira via bot é processada e categorizada.
- [ ] **6.5 Nota Fiscal / Recibos:** Visualização e emissão operam normalmente.
- [ ] **6.6 IA & Orçamento:** Interação com o assistente é autorizada e rate limit persiste estado no banco.
- [ ] **6.7 Verificação RLS:** Zero bypass em tabelas protegidas.
- [ ] **6.8 Monitoramento HTTP:** Dashboard do Supabase e Vercel mostram taxas normais de 2xx; ausência anômala de 401/403/429/5xx.

---

## 7. CONTINGÊNCIA: PROCEDIMENTO DE RECUPERAÇÃO SEGURA (Rollback C)

Se for identificada qualquer anomalia crítica após a Fase C:

> [!CAUTION]
> **SECURITY POINT OF NO RETURN — NÃO RESTAURAR PERMISSÕES LEGADAS DE SECRETS**
> Em hipótese alguma execute scripts que reabram `GRANT SELECT` em `client_secret`, `secret_key` ou `senha_hash` para a role `authenticated`.

- [ ] **7.1 Executar o Script Oficial de Recuperação Segura (via PSQL):**
  ```bash
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260908120000_safe_recovery.sql
  ```
  *O que este script faz com segurança:*
  * Habilita RLS em todas as tabelas de investimentos (`investimentos`, `metas_investimento`, `historico_rendimentos`, `proventos_esperados`, `configuracoes_investimentos`).
  * Cria policies de fallback estritas vinculadas a `is_investimentos_unlocked(auth.uid())`.
  * Preserva os bloqueios de coluna contra vazamento de credenciais.
  * Remove a marcação da Fase C do histórico de migrações em transação única atômica.
