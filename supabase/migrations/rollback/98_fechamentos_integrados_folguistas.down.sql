-- Rollback Migration 98: Fechamentos Integrados dos Folguistas (Etapa 3D)

DROP INDEX IF EXISTS public.idx_fechamentos_caixa_data_turno;
DROP INDEX IF EXISTS public.idx_fechamentos_caixa_colaborador;
DROP INDEX IF EXISTS public.idx_fechamentos_caixa_chave_operacional;

ALTER TABLE public.fechamentos_caixa
  DROP COLUMN IF EXISTS espelhado_message_id,
  DROP COLUMN IF EXISTS espelhado_em,
  DROP COLUMN IF EXISTS divergencias,
  DROP COLUMN IF EXISTS telegram_message_ids,
  DROP COLUMN IF EXISTS anexos,
  DROP COLUMN IF EXISTS chave_operacional,
  DROP COLUMN IF EXISTS origem_canal,
  DROP COLUMN IF EXISTS origem_grupo_id,
  DROP COLUMN IF EXISTS turno,
  DROP COLUMN IF EXISTS escala_id,
  DROP COLUMN IF EXISTS colaborador_id;

DROP INDEX IF EXISTS public.idx_colaboradores_ws_tg_id;

ALTER TABLE public.colaboradores
  DROP COLUMN IF EXISTS telegram_username,
  DROP COLUMN IF EXISTS telegram_user_id;
