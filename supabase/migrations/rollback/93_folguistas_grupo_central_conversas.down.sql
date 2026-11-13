-- =============================================================================
-- Rollback Migration 93: Reverter Grupo Operacional Folguistas
-- =============================================================================

BEGIN;

-- 1. Remove conversas vinculadas a grupos de folguistas
DELETE FROM public.wallet_ai_conversations
WHERE grupo_id IN (
  SELECT id FROM public.telegram_grupos_config WHERE tipo_grupo = 'folguistas'
);

-- 2. Remove participantes vinculados a grupos de folguistas
DELETE FROM public.grupo_participantes
WHERE grupo_id IN (
  SELECT id FROM public.telegram_grupos_config WHERE tipo_grupo = 'folguistas'
);

-- 3. Remove grupos de folguistas
DELETE FROM public.telegram_grupos_config
WHERE tipo_grupo = 'folguistas';

-- 4. Restaura constraint original de tipo_grupo
ALTER TABLE public.telegram_grupos_config
  DROP CONSTRAINT IF EXISTS chk_telegram_grupos_config_tipo_grupo;

ALTER TABLE public.telegram_grupos_config
  ADD CONSTRAINT chk_telegram_grupos_config_tipo_grupo
  CHECK (tipo_grupo IN ('fechamento', 'nfe_boletos', 'contas_empresa', 'conversas_loja'));

COMMIT;
