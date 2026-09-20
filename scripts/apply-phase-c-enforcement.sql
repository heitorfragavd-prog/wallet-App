-- =========================================================================
-- Script: scripts/apply-phase-c-enforcement.sql
-- Procedimento Oficial de Execucao da Fase C na Mesma Conexao/Sessao
-- =========================================================================
-- Pre-requisitos:
-- 1. Fase A (20260908120000_security_phase_a_infrastructure.sql) aplicada.
-- 2. Fase B (Deploy de codigo frontend e Edge Functions) concluido.
-- 3. Health checks funcionais da Fase B aprovados (Login, IA em /ia, Investimentos).
--
-- Execucao:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/apply-phase-c-enforcement.sql
--
-- Garantias:
-- - Executa atomicamente na MESMA transacao:
--   a) SET LOCAL wallet.deploy_phase_b_completed = 'true';
--   b) \i supabase/migrations/20260908120001_security_phase_c_enforcement.sql
--   c) Registro da migration em supabase_migrations.schema_migrations
-- - Interrompe imediatamente em caso de erro (ON_ERROR_STOP=1 + ROLLBACK automatico).
-- - A flag SET LOCAL e estritamente vinculada a esta transacao/sessao, nao afetando conexoes externas.
-- =========================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Configura a flag de confirmacao da Fase B estritamente para esta transacao/sessao
SET LOCAL wallet.deploy_phase_b_completed = 'true';

-- 2. Aplica a migracao da Fase C (Revogacao de colunas e RLS estrito)
\i supabase/migrations/20260908120001_security_phase_c_enforcement.sql

-- 3. Registra a versao na tabela de controle de migracoes do Supabase
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text NOT NULL PRIMARY KEY,
    statements text[],
    name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260908120001', 'security_phase_c_enforcement')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- 4. Notifica o PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';