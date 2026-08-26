-- ============================================================
-- WALLET APP — Hardening de RLS e Database Advisors (Final)
-- Migration: 20260825220000_harden_rls_database_advisors.sql
-- ============================================================

-- ─── 1. TABELAS TELEGRAM (SERVICE-ROLE ONLY) ──────────────────
-- Uso exclusivo por Edge Functions (telegram-webhook, lembrete-precos)
-- RLS ativado + Revoke explícito de anon e authenticated.
ALTER TABLE IF EXISTS public.telegram_propostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.telegram_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_propostas_select_policy" ON public.telegram_propostas;
DROP POLICY IF EXISTS "telegram_conversas_select_policy" ON public.telegram_conversas;
DROP POLICY IF EXISTS "telegram_propostas_user_policy" ON public.telegram_propostas;
DROP POLICY IF EXISTS "telegram_conversas_user_policy" ON public.telegram_conversas;

REVOKE ALL ON public.telegram_propostas FROM anon, authenticated;
REVOKE ALL ON public.telegram_conversas FROM anon, authenticated;


-- ─── 2. AI QUERY CACHE (SERVICE-ROLE ONLY) ────────────────────
-- Tabela interna de cache de queries de IA.
-- RLS ativado + Revoke explícito de anon e authenticated.
ALTER TABLE IF EXISTS public.ai_query_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_query_cache_all_policy" ON public.ai_query_cache;
DROP POLICY IF EXISTS "ai_query_cache_select_policy" ON public.ai_query_cache;

REVOKE ALL ON public.ai_query_cache FROM anon, authenticated;


-- ─── 3. HISTÓRICO DE RENDIMENTOS / RENTABILIDADE ──────────────
-- Valida user_id E propriedade estrita do investimento_id relacionado
ALTER TABLE IF EXISTS public.historico_rendimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own historico" ON public.historico_rendimentos;
DROP POLICY IF EXISTS "historico_rendimentos_isolation_policy" ON public.historico_rendimentos;

CREATE POLICY "historico_rendimentos_isolation_policy"
  ON public.historico_rendimentos
  FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.investimentos i
      WHERE i.id = historico_rendimentos.investimento_id
        AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.investimentos i
      WHERE i.id = historico_rendimentos.investimento_id
        AND i.user_id = auth.uid()
    )
  );

ALTER TABLE IF EXISTS public.historico_rentabilidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_rentabilidade_isolation_policy" ON public.historico_rentabilidade;

CREATE POLICY "historico_rentabilidade_isolation_policy"
  ON public.historico_rentabilidade
  FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.investimentos i
      WHERE i.id = historico_rentabilidade.investimento_id
        AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.investimentos i
      WHERE i.id = historico_rentabilidade.investimento_id
        AND i.user_id = auth.uid()
    )
  );


-- ─── 4. ISOLAMENTO DE WORKSPACE (FOOD COST) ───────────────────
-- produtos_cardapio e fichas_tecnicas protegidas com tem_acesso_workspace
ALTER TABLE IF EXISTS public.produtos_cardapio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_veem_proprios_produtos" ON public.produtos_cardapio;
DROP POLICY IF EXISTS "produtos_cardapio_workspace_policy" ON public.produtos_cardapio;

CREATE POLICY "produtos_cardapio_workspace_policy"
  ON public.produtos_cardapio
  FOR ALL
  USING (
    (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
    AND auth.uid() = user_id
  )
  WITH CHECK (
    (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
    AND auth.uid() = user_id
  );

ALTER TABLE IF EXISTS public.fichas_tecnicas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_veem_proprias_fichas" ON public.fichas_tecnicas;
DROP POLICY IF EXISTS "fichas_tecnicas_workspace_policy" ON public.fichas_tecnicas;

CREATE POLICY "fichas_tecnicas_workspace_policy"
  ON public.fichas_tecnicas
  FOR ALL
  USING (
    (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
    AND auth.uid() = user_id
  )
  WITH CHECK (
    (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
    AND auth.uid() = user_id
  );


-- ─── 5. VIEW: v_produtos_custo (SECURITY INVOKER) ─────────────
-- Reconstruída com security_invoker = true + Revoke explícito de anon
CREATE OR REPLACE VIEW public.v_produtos_custo
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.workspace_id,
  p.nome,
  p.descricao,
  p.preco_venda,
  p.categoria,
  p.ativo,
  COALESCE(SUM(ft.quantidade * ft.custo_unitario), 0)              AS custo_total,
  COUNT(ft.id)                                                      AS qtd_insumos,
  CASE
    WHEN p.preco_venda = 0 THEN 0
    ELSE ROUND(
      ((p.preco_venda - COALESCE(SUM(ft.quantidade * ft.custo_unitario), 0))
        / p.preco_venda) * 100, 2
    )
  END                                                              AS margem_percentual,
  CASE
    WHEN p.preco_venda = 0 THEN 'sem_preco'
    WHEN COALESCE(SUM(ft.quantidade * ft.custo_unitario), 0) = 0 THEN 'sem_ficha'
    WHEN ((p.preco_venda - COALESCE(SUM(ft.quantidade * ft.custo_unitario), 0))
          / p.preco_venda) * 100 >= 65 THEN 'excelente'
    WHEN ((p.preco_venda - COALESCE(SUM(ft.quantidade * ft.custo_unitario), 0))
          / p.preco_venda) * 100 >= 50 THEN 'boa'
    WHEN ((p.preco_venda - COALESCE(SUM(ft.quantidade * ft.custo_unitario), 0))
          / p.preco_venda) * 100 >= 30 THEN 'atencao'
    ELSE 'perigoso'
  END                                                              AS status_margem
FROM public.produtos_cardapio p
LEFT JOIN public.fichas_tecnicas ft ON ft.produto_id = p.id
GROUP BY p.id, p.user_id, p.workspace_id, p.nome, p.descricao,
         p.preco_venda, p.categoria, p.ativo;

-- Revogar acesso anônimo e conceder apenas a authenticated e service_role
REVOKE ALL ON public.v_produtos_custo FROM anon;
GRANT SELECT ON public.v_produtos_custo TO authenticated, service_role;
