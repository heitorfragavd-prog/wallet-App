-- =========================================================================
-- Script: scripts/test-phase-abc-gating.sql
-- Valida o Gating Operacional e Procedimento Oficial das Fases A/B/C:
-- 1. Garante que apos a tentativa de execucao da migration real sem a flag,
--    nada da Fase C foi aplicado ou registrado no historico.
-- 2. Executa o procedimento oficial atomico na mesma sessao (scripts/apply-phase-c-enforcement.sql).
-- 3. Comprova que a flag SET LOCAL nao vaza para sessoes ou transacoes subsequentes.
-- =========================================================================

\set ON_ERROR_STOP on

-- 1. Verificacao Pos-Tentativa Sem Flag:
-- Comprova que a tentativa de rodar a migration real sem a flag foi bloqueada e nada persistiu
DO $$
BEGIN
  -- Nao deve haver versao registrada no historico
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'supabase_migrations' AND tablename = 'schema_migrations') THEN
    IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260908120001') THEN
      RAISE EXCEPTION 'FALHA DE GATING: A versao 20260908120001 foi indevidamente registrada no historico!';
    END IF;
  END IF;

  -- Colunas sensiveis nao devem ter sido revogadas
  IF NOT has_column_privilege('authenticated', 'public.divipay_config', 'client_secret', 'SELECT') THEN
    RAISE EXCEPTION 'FALHA DE GATING: Colunas sensiveis foram revogadas indevidamente antes da confirmacao!';
  END IF;

  RAISE NOTICE 'SUCESSO: Estado do banco verificado como integro e sem aplicacao previa da Fase C.';
END $$;

-- 2. Teste do Procedimento Oficial: Aplicar Fase C na MESMA transacao com SET LOCAL
\i scripts/apply-phase-c-enforcement.sql

-- 3. Comprovacao de Isolamento: A flag SET LOCAL nao deve vazar para novas transacoes
DO $$
BEGIN
  IF current_setting('wallet.deploy_phase_b_completed', true) = 'true' THEN
    RAISE EXCEPTION 'FALHA: A flag SET LOCAL vazou para transacoes subsequentes!';
  END IF;

  RAISE NOTICE 'SUCESSO: Flag de confirmacao operou estritamente na sessao/transacao autorizada.';
END $$;

SELECT 'PROCEDIMENTO OFICIAL ATOMICO DA FASE C E ISOLAMENTO DE FLAG VALIDADO COM SUCESSO!' AS status;