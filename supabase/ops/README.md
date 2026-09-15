# Diretório de Scripts Operacionais (Ops)

Este diretório contém scripts SQL e utilitários destinados exclusivamente a **operações manuais de manutenção, contingência ou recuperação segura de desastres**.

> [!WARNING]
> **NÃO execute estes scripts via pipeline automático de migrations.**  
> Eles foram deliberadamente isolados da pasta `supabase/migrations/` para evitar execução não intencional durante `supabase db push` ou `supabase migration up`.

---

## 1. `rollback_20260908120000_safe_recovery.sql`

### Finalidade
Script de recuperação segura em caso de necessidade de reverter ou restaurar a infraestrutura de colunas protegidas e RPCs (`get_eyemobile_config_status`, `has_senha_investimentos`), sem comprometer a confidencialidade de segredos (`client_secret`, `secret_key`, `senha_hash`).

### Pré-requisitos
- Acesso com privilégios de `postgres` ou `service_role` (via console Supabase SQL Editor ou psql).
- Confirmação formal da equipe de engenharia e segurança.

### Procedimento de Execução Manual
1. Conecte-se ao banco de dados via Supabase Dashboard ou psql com usuário administrativo.
2. Revise o script linha por linha antes da execução:
   ```bash
   # Exemplo via psql conectado à instância correta:
   psql "$SUPABASE_DB_URL" -f supabase/ops/rollback_20260908120000_safe_recovery.sql
   ```
3. Confirme que nenhuma concessão de `SELECT` foi aberta para `authenticated` ou `anon` nas colunas de segredo após a execução.