-- ============================================================================
-- Migration: 20260821120000_backfill_workspace_contas_cartoes.sql
-- Backfill seguro e determinístico de workspace_id em public.contas_usuario
-- ============================================================================

-- 1. Garantir que todo usuário com contas possua os workspaces padrão (PF e PJ)
DO $$
DECLARE
  u RECORD;
  pf_ws_id UUID;
BEGIN
  FOR u IN 
    SELECT DISTINCT user_id 
    FROM public.contas_usuario 
    WHERE workspace_id IS NULL
  LOOP
    -- Verificar/criar workspace PF padrão
    SELECT id INTO pf_ws_id 
    FROM public.workspaces 
    WHERE user_id = u.user_id AND (tipo = 'PF' OR is_default = true)
    ORDER BY is_default DESC, created_at ASC 
    LIMIT 1;

    IF pf_ws_id IS NULL THEN
      INSERT INTO public.workspaces (user_id, nome, tipo, is_default)
      VALUES (u.user_id, 'Minha Conta Pessoal', 'PF', true)
      RETURNING id INTO pf_ws_id;
    END IF;

    -- Verificar/criar workspace PJ padrão caso não exista
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE user_id = u.user_id AND tipo = 'PJ') THEN
      INSERT INTO public.workspaces (user_id, nome, tipo, is_default)
      VALUES (u.user_id, 'Conta Rodo Point', 'PJ', false);
    END IF;
  END LOOP;
END $$;

-- 2. Backfill determinístico baseado em relacionamentos existentes
-- Cascata de evidências:
-- 1. Transações da conta/cartão com workspace_id (maior frequência)
-- 2. Faturas de cartão com workspace_id
-- 3. Importações de fatura com workspace_id
-- 4. Despesas da conta com workspace_id
-- 5. Receitas da conta com workspace_id
-- 6. Dívidas da conta com workspace_id
-- 7. Transferências da conta com workspace_id
-- 8. Nome da conta contendo termos empresariais/PJ -> workspace PJ do usuário
-- 9. Fallback: workspace padrão (PF / is_default) do usuário

UPDATE public.contas_usuario AS c
SET workspace_id = COALESCE(
  -- Evidência 1: Transações associadas (workspace mais frequente)
  (
    SELECT t.workspace_id
    FROM public.transacoes t
    JOIN public.workspaces w ON w.id = t.workspace_id AND w.user_id = c.user_id
    WHERE t.conta_id = c.id AND t.workspace_id IS NOT NULL
    GROUP BY t.workspace_id
    ORDER BY COUNT(*) DESC, MAX(t.created_at) DESC
    LIMIT 1
  ),
  -- Evidência 2: Faturas de cartão associadas
  (
    SELECT f.workspace_id
    FROM public.faturas_cartao f
    JOIN public.workspaces w ON w.id = f.workspace_id AND w.user_id = c.user_id
    WHERE f.cartao_id = c.id AND f.workspace_id IS NOT NULL
    GROUP BY f.workspace_id
    ORDER BY COUNT(*) DESC, MAX(f.created_at) DESC
    LIMIT 1
  ),
  -- Evidência 3: Importações de faturas associadas
  (
    SELECT i.workspace_id
    FROM public.fatura_cartao_importacoes i
    JOIN public.workspaces w ON w.id = i.workspace_id AND w.user_id = c.user_id
    WHERE i.cartao_id = c.id AND i.workspace_id IS NOT NULL
    GROUP BY i.workspace_id
    ORDER BY COUNT(*) DESC, MAX(i.created_at) DESC
    LIMIT 1
  ),
  -- Evidência 4: Despesas associadas
  (
    SELECT d.workspace_id
    FROM public.despesas d
    JOIN public.workspaces w ON w.id = d.workspace_id AND w.user_id = c.user_id
    WHERE d.conta_id = c.id AND d.workspace_id IS NOT NULL
    GROUP BY d.workspace_id
    ORDER BY COUNT(*) DESC, MAX(d.created_at) DESC
    LIMIT 1
  ),
  -- Evidência 5: Receitas associadas
  (
    SELECT r.workspace_id
    FROM public.receitas r
    JOIN public.workspaces w ON w.id = r.workspace_id AND w.user_id = c.user_id
    WHERE r.conta_id = c.id AND r.workspace_id IS NOT NULL
    GROUP BY r.workspace_id
    ORDER BY COUNT(*) DESC, MAX(r.created_at) DESC
    LIMIT 1
  ),
  -- Evidência 6: Dívidas associadas
  (
    SELECT dv.workspace_id
    FROM public.dividas dv
    JOIN public.workspaces w ON w.id = dv.workspace_id AND w.user_id = c.user_id
    WHERE dv.conta_id = c.id AND dv.workspace_id IS NOT NULL
    GROUP BY dv.workspace_id
    ORDER BY COUNT(*) DESC, MAX(dv.created_at) DESC
    LIMIT 1
  ),
  -- Evidência 7: Transferências associadas
  (
    SELECT tr.workspace_id
    FROM public.transferencias tr
    JOIN public.workspaces w ON w.id = tr.workspace_id AND w.user_id = c.user_id
    WHERE (tr.conta_origem_id = c.id OR tr.conta_destino_id = c.id) AND tr.workspace_id IS NOT NULL
    GROUP BY tr.workspace_id
    ORDER BY COUNT(*) DESC, MAX(tr.created_at) DESC
    LIMIT 1
  ),
  -- Evidência 8: Nomenclatura corporativa/PJ -> workspace PJ do próprio usuário
  CASE 
    WHEN c.nome ~* '(rodo\s*point|divipay|empresa|pj|comercial|neg[oó]cio|loja)' THEN
      (
        SELECT w.id
        FROM public.workspaces w
        WHERE w.user_id = c.user_id AND w.tipo = 'PJ'
        ORDER BY w.is_default DESC, w.created_at ASC
        LIMIT 1
      )
    ELSE NULL
  END,
  -- Evidência 9: Fallback padrão para workspace PF / is_default do próprio usuário
  (
    SELECT w.id
    FROM public.workspaces w
    WHERE w.user_id = c.user_id
    ORDER BY (CASE WHEN w.tipo = 'PF' THEN 1 WHEN w.is_default THEN 2 ELSE 3 END), w.created_at ASC
    LIMIT 1
  )
)
WHERE c.workspace_id IS NULL;

-- 3. Assegurar integridade e índice composto
CREATE INDEX IF NOT EXISTS idx_contas_usuario_workspace_user 
  ON public.contas_usuario(workspace_id, user_id);
