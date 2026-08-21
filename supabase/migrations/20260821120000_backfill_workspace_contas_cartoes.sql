-- ============================================================================
-- Migration: 20260821120000_backfill_workspace_contas_cartoes.sql
-- Backfill estritamente conservador de workspace_id em public.contas_usuario
-- ============================================================================

-- Backfill baseado EXCLUSIVAMENTE em evidências fortes e unânimes de relacionamentos.
-- NÃO utiliza heurística de nomes (ex: "empresa", "pj", "rodo point").
-- NÃO utiliza fallback automático para PF padrão.
-- Se houver 0 evidências ou evidências conflitantes (>1 workspaces), o registro PERMANECE NULL.

WITH evidencias AS (
  -- 1. Transações da conta
  SELECT t.conta_id AS conta_id, t.workspace_id, c.user_id
  FROM public.transacoes t
  JOIN public.contas_usuario c ON c.id = t.conta_id
  JOIN public.workspaces w ON w.id = t.workspace_id AND w.user_id = c.user_id
  WHERE c.workspace_id IS NULL AND t.workspace_id IS NOT NULL

  UNION ALL

  -- 2. Faturas de cartão (cartao_id)
  SELECT f.cartao_id AS conta_id, f.workspace_id, c.user_id
  FROM public.faturas_cartao f
  JOIN public.contas_usuario c ON c.id = f.cartao_id
  JOIN public.workspaces w ON w.id = f.workspace_id AND w.user_id = c.user_id
  WHERE c.workspace_id IS NULL AND f.workspace_id IS NOT NULL

  UNION ALL

  -- 3. Importações de fatura (conta_id)
  SELECT i.conta_id AS conta_id, i.workspace_id, c.user_id
  FROM public.fatura_cartao_importacoes i
  JOIN public.contas_usuario c ON c.id = i.conta_id
  JOIN public.workspaces w ON w.id = i.workspace_id AND w.user_id = c.user_id
  WHERE c.workspace_id IS NULL AND i.workspace_id IS NOT NULL

  UNION ALL

  -- 4. Despesas
  SELECT d.conta_id AS conta_id, d.workspace_id, c.user_id
  FROM public.despesas d
  JOIN public.contas_usuario c ON c.id = d.conta_id
  JOIN public.workspaces w ON w.id = d.workspace_id AND w.user_id = c.user_id
  WHERE c.workspace_id IS NULL AND d.workspace_id IS NOT NULL

  UNION ALL

  -- 5. Receitas
  SELECT r.conta_id AS conta_id, r.workspace_id, c.user_id
  FROM public.receitas r
  JOIN public.contas_usuario c ON c.id = r.conta_id
  JOIN public.workspaces w ON w.id = r.workspace_id AND w.user_id = c.user_id
  WHERE c.workspace_id IS NULL AND r.workspace_id IS NOT NULL

  UNION ALL

  -- 6. Dívidas
  SELECT dv.conta_id AS conta_id, dv.workspace_id, c.user_id
  FROM public.dividas dv
  JOIN public.contas_usuario c ON c.id = dv.conta_id
  JOIN public.workspaces w ON w.id = dv.workspace_id AND w.user_id = c.user_id
  WHERE c.workspace_id IS NULL AND dv.workspace_id IS NOT NULL

  UNION ALL

  -- 7. Transferências (origem)
  SELECT tr.conta_origem_id AS conta_id, tr.workspace_id, c.user_id
  FROM public.transferencias tr
  JOIN public.contas_usuario c ON c.id = tr.conta_origem_id
  JOIN public.workspaces w ON w.id = tr.workspace_id AND w.user_id = c.user_id
  WHERE c.workspace_id IS NULL AND tr.workspace_id IS NOT NULL

  UNION ALL

  -- 8. Transferências (destino)
  SELECT tr.conta_destino_id AS conta_id, tr.workspace_id, c.user_id
  FROM public.transferencias tr
  JOIN public.contas_usuario c ON c.id = tr.conta_destino_id
  JOIN public.workspaces w ON w.id = tr.workspace_id AND w.user_id = c.user_id
  WHERE c.workspace_id IS NULL AND tr.workspace_id IS NOT NULL
),
contas_elegiveis AS (
  -- Agrupar por conta_id e selecionar SOMENTE aquelas com exatamente 1 workspace_id único (unânime)
  SELECT conta_id, MIN(workspace_id) AS unico_workspace_id
  FROM evidencias
  GROUP BY conta_id
  HAVING COUNT(DISTINCT workspace_id) = 1
)
UPDATE public.contas_usuario c
SET workspace_id = ce.unico_workspace_id
FROM contas_elegiveis ce
WHERE c.id = ce.conta_id
  AND c.workspace_id IS NULL;

-- Assegurar índice composto para performance e isolamento
CREATE INDEX IF NOT EXISTS idx_contas_usuario_workspace_user 
  ON public.contas_usuario(workspace_id, user_id);
