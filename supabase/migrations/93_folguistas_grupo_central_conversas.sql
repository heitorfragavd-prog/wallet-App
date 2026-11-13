-- =============================================================================
-- Migration 93: Grupo Operacional Folguistas Rodo Point & Gestão de Escalas
-- =============================================================================

BEGIN;

-- ─── 1. Atualização da constraint de tipo_grupo em telegram_grupos_config ────

ALTER TABLE public.telegram_grupos_config
  DROP CONSTRAINT IF EXISTS chk_telegram_grupos_config_tipo_grupo;

ALTER TABLE public.telegram_grupos_config
  ADD CONSTRAINT chk_telegram_grupos_config_tipo_grupo
  CHECK (tipo_grupo IN ('fechamento', 'nfe_boletos', 'contas_empresa', 'conversas_loja', 'folguistas'));

-- ─── 2. Provisionamento Idempotente do Grupo Folguistas nos Workspaces ───────

INSERT INTO public.telegram_grupos_config (
  workspace_id,
  nome_grupo,
  descricao,
  tipo_grupo,
  ferramentas_permitidas,
  dados_permitidos,
  acoes_permitidas,
  funcionalidades_autorizadas,
  ativo,
  chat_id,
  created_by
)
SELECT
  w.id,
  '👥 Folguistas Rodo Point',
  'Gestão inteligente de escalas, confirmação de disponibilidades, regras de turnos e folgas e recebimento de fechamento de caixa para espelhamento seguro no grupo principal.',
  'folguistas',
  ARRAY['consultar_rotinas']::text[],
  ARRAY['escalas', 'folguistas', 'disponibilidade', 'turnos', 'fechamento']::text[],
  ARRAY['confirmar_disponibilidade', 'extrair_fechamento', 'registrar_recado']::text[],
  ARRAY['gestao_escalas', 'consulta_folguistas', 'confirmacao_disponibilidade', 'recebimento_fechamento']::text[],
  true,
  NULL,
  w.user_id
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.telegram_grupos_config g
  WHERE g.workspace_id = w.id
    AND g.tipo_grupo = 'folguistas'
);

-- ─── 3. Garantir Proprietário como admin_grupo em grupo_participantes ────────

INSERT INTO public.grupo_participantes (
  grupo_id,
  workspace_id,
  user_id,
  role_no_grupo,
  permissoes,
  ativo,
  autorizado_por
)
SELECT
  g.id,
  g.workspace_id,
  w.user_id,
  'admin_grupo',
  jsonb_build_object(
    'ler', true,
    'enviar_mensagens', true,
    'enviar_documentos', true,
    'confirmar_operacoes', true,
    'gerenciar_grupo', true
  ),
  true,
  w.user_id
FROM public.telegram_grupos_config g
JOIN public.workspaces w ON w.id = g.workspace_id
WHERE g.tipo_grupo = 'folguistas'
ON CONFLICT (grupo_id, user_id) DO NOTHING;

-- ─── 4. Criação da Conversa Canônica na Central de Conversas ─────────────────

INSERT INTO public.wallet_ai_conversations (
  workspace_id,
  user_id,
  grupo_id,
  title,
  agent_type,
  is_shared,
  is_group,
  channel,
  last_channel,
  external_chat_id,
  processing_status
)
SELECT
  g.workspace_id,
  w.user_id,
  g.id,
  coalesce(nullif(trim(g.nome_grupo), ''), '👥 Folguistas Rodo Point'),
  'operational',
  true,
  true,
  'web',
  'web',
  NULL,
  'idle'
FROM public.telegram_grupos_config g
JOIN public.workspaces w ON w.id = g.workspace_id
WHERE g.tipo_grupo = 'folguistas'
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_ai_conversations c
    WHERE c.workspace_id = g.workspace_id
      AND c.grupo_id = g.id
      AND c.is_group = true
      AND c.is_archived = false
  );

COMMIT;
