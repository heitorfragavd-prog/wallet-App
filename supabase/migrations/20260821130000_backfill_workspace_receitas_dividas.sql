-- ============================================================================
-- Migration: 20260821130000_backfill_workspace_receitas_dividas.sql
-- Backfill estritamente conservador de workspace_id em despesas, receitas e dividas
-- ============================================================================

-- Backfill baseado EXCLUSIVAMENTE em evidências fortes e unânimes de relacionamentos.
-- NÃO altera registros onde workspace_id já esteja preenchido.
-- NÃO utiliza heurística textual ou adivinhação.
-- Se houver 0 evidências ou conflito (>1 workspaces), o registro PERMANECE NULL.

-- 1. DESPESAS: Backfill via conta_usuario unânime
WITH evidencias_despesas AS (
  SELECT d.id AS despesa_id, c.workspace_id
  FROM public.despesas d
  JOIN public.contas_usuario c ON c.id = d.conta_id
  JOIN public.workspaces w ON w.id = c.workspace_id AND w.user_id = d.user_id
  WHERE d.workspace_id IS NULL AND c.workspace_id IS NOT NULL
),
despesas_elegiveis AS (
  SELECT despesa_id, MIN(workspace_id) AS unico_workspace_id
  FROM evidencias_despesas
  GROUP BY despesa_id
  HAVING COUNT(DISTINCT workspace_id) = 1
)
UPDATE public.despesas d
SET workspace_id = de.unico_workspace_id
FROM despesas_elegiveis de
WHERE d.id = de.despesa_id
  AND d.workspace_id IS NULL;

-- 2. RECEITAS: Backfill via conta_usuario unânime
WITH evidencias_receitas AS (
  SELECT r.id AS receita_id, c.workspace_id
  FROM public.receitas r
  JOIN public.contas_usuario c ON c.id = r.conta_id
  JOIN public.workspaces w ON w.id = c.workspace_id AND w.user_id = r.user_id
  WHERE r.workspace_id IS NULL AND c.workspace_id IS NOT NULL
),
receitas_elegiveis AS (
  SELECT receita_id, MIN(workspace_id) AS unico_workspace_id
  FROM evidencias_receitas
  GROUP BY receita_id
  HAVING COUNT(DISTINCT workspace_id) = 1
)
UPDATE public.receitas r
SET workspace_id = re.unico_workspace_id
FROM receitas_elegiveis re
WHERE r.id = re.receita_id
  AND r.workspace_id IS NULL;

-- 3. DÍVIDAS: Backfill via pagamentos_dividas ou conta_usuario unânimes
WITH evidencias_dividas AS (
  -- Via conta_id da dívida
  SELECT d.id AS divida_id, c.workspace_id
  FROM public.dividas d
  JOIN public.contas_usuario c ON c.id = d.conta_id
  JOIN public.workspaces w ON w.id = c.workspace_id AND w.user_id = d.user_id
  WHERE d.workspace_id IS NULL AND c.workspace_id IS NOT NULL

  UNION ALL

  -- Via pagamentos da dívida com workspace_id direto
  SELECT p.divida_id AS divida_id, p.workspace_id
  FROM public.pagamentos_dividas p
  JOIN public.dividas d ON d.id = p.divida_id
  JOIN public.workspaces w ON w.id = p.workspace_id AND w.user_id = d.user_id
  WHERE d.workspace_id IS NULL AND p.workspace_id IS NOT NULL

  UNION ALL

  -- Via pagamentos da dívida com conta_id que possui workspace_id
  SELECT p.divida_id AS divida_id, c.workspace_id
  FROM public.pagamentos_dividas p
  JOIN public.dividas d ON d.id = p.divida_id
  JOIN public.contas_usuario c ON c.id = p.conta_id
  JOIN public.workspaces w ON w.id = c.workspace_id AND w.user_id = d.user_id
  WHERE d.workspace_id IS NULL AND c.workspace_id IS NOT NULL
),
dividas_elegiveis AS (
  SELECT divida_id, MIN(workspace_id) AS unico_workspace_id
  FROM evidencias_dividas
  GROUP BY divida_id
  HAVING COUNT(DISTINCT workspace_id) = 1
)
UPDATE public.dividas d
SET workspace_id = de.unico_workspace_id
FROM dividas_elegiveis de
WHERE d.id = de.divida_id
  AND d.workspace_id IS NULL;
