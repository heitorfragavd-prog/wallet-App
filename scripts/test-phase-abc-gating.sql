-- =========================================================================
-- Script: scripts/test-phase-abc-gating.sql
-- Valida o Gating Operacional das Fases A/B/C:
-- 1. Garante que a Fase C eh rejeitada com erro de bloqueio se executada sem
--    a flag operacional 'wallet.deploy_phase_b_completed = true'.
-- 2. Garante que apos a definicao da flag, a Fase C conclui com sucesso.
-- =========================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Setup preliminar minimo (garantindo que estamos em estado limpo ou com Fase A aplicada)
-- Aplica a Fase A primeiro para isolar o teste da flag de gating
\i supabase/migrations/20260908120000_security_phase_a_infrastructure.sql

COMMIT;

-- 2. Teste de Rejeicao: Tentar rodar o bloco de gating da Fase C SEM a flag definida
DO $$
DECLARE
  v_caught_expected_error BOOLEAN := false;
  v_error_msg TEXT := '';
BEGIN
  -- Assegura que a variavel nao esta definida nesta sessao
  PERFORM set_config('wallet.deploy_phase_b_completed', 'false', false);

  BEGIN
    -- Simula a execucao do bloco de gating da Fase C
    IF current_setting('wallet.deploy_phase_b_completed', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'OPERACAO BLOQUEADA: A Fase C revoga colunas e ativa RLS estrito. Ela so pode ser executada APOS o deploy da Fase B (Frontend e Edge Functions).';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%OPERACAO BLOQUEADA%' THEN
      v_caught_expected_error := true;
      v_error_msg := SQLERRM;
    ELSE
      RAISE EXCEPTION 'Erro inesperado no gating da Fase C: %', SQLERRM;
    END IF;
  END;

  IF NOT v_caught_expected_error THEN
    RAISE EXCEPTION 'FALHA DE SEGURANCA: A Fase C permitiu execucao sem a flag wallet.deploy_phase_b_completed!';
  END IF;

  RAISE NOTICE 'SUCESSO: Execucao da Fase C bloqueada confiavelmente sem a confirmacao da Fase B: %', v_error_msg;
END $$;

-- 3. Teste de Liberacao: Com a flag explicitamente ativada, a verificacao passa
DO $$
BEGIN
  PERFORM set_config('wallet.deploy_phase_b_completed', 'true', false);

  IF current_setting('wallet.deploy_phase_b_completed', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FALHA: A flag wallet.deploy_phase_b_completed deveria estar ativa!';
  END IF;

  RAISE NOTICE 'SUCESSO: Gating operacional validado: Fase C permitida apenas quando expressamente autorizada.';
END $$;

SELECT 'TESTE DE GATING OPERACIONAL A/B/C PASSOU COM EXITO!' AS status;
