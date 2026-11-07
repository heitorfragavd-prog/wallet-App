-- Migration: 20261107140000_audit_v_produtos_custo_reliability.sql
-- Auditoria de Confiabilidade da View de Food Cost (v_produtos_custo)
-- Garante:
-- 1. Security Invoker para isolamento estrito de Workspace via RLS
-- 2. Não inflar margem tratando insumo sem custo como custo zero
-- 3. Exposição de qtd_insumos_sem_custo e status_ficha ('sem_ficha', 'incompleta', 'com_estimativas', 'comprovada')

CREATE OR REPLACE VIEW public.v_produtos_custo WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.workspace_id,
  p.nome,
  p.descricao,
  p.preco_venda,
  p.categoria,
  p.ativo,
  COALESCE(sum(ft.quantidade * ft.custo_unitario), 0::numeric) AS custo_total,
  count(ft.id) AS qtd_insumos,
  CASE
    WHEN p.preco_venda = 0::numeric THEN 0::numeric
    WHEN count(ft.id) = 0 THEN 0::numeric
    WHEN count(ft.id) FILTER (WHERE ft.custo_unitario IS NULL OR ft.custo_unitario = 0) > 0 THEN NULL
    ELSE round((p.preco_venda - COALESCE(sum(ft.quantidade * ft.custo_unitario), 0::numeric)) / p.preco_venda * 100::numeric, 2)
  END AS margem_percentual,
  CASE
    WHEN p.preco_venda = 0::numeric THEN 'sem_preco'::text
    WHEN count(ft.id) = 0 THEN 'sem_ficha'::text
    WHEN count(ft.id) FILTER (WHERE ft.custo_unitario IS NULL OR ft.custo_unitario = 0) > 0 THEN 'incompleta'::text
    WHEN ((p.preco_venda - COALESCE(sum(ft.quantidade * ft.custo_unitario), 0::numeric)) / p.preco_venda * 100::numeric) >= 65::numeric THEN 'excelente'::text
    WHEN ((p.preco_venda - COALESCE(sum(ft.quantidade * ft.custo_unitario), 0::numeric)) / p.preco_venda * 100::numeric) >= 50::numeric THEN 'boa'::text
    WHEN ((p.preco_venda - COALESCE(sum(ft.quantidade * ft.custo_unitario), 0::numeric)) / p.preco_venda * 100::numeric) >= 30::numeric THEN 'atencao'::text
    ELSE 'perigoso'::text
  END AS status_margem,
  count(ft.id) FILTER (WHERE ft.custo_unitario IS NULL OR ft.custo_unitario = 0) AS qtd_insumos_sem_custo,
  CASE
    WHEN count(ft.id) = 0 THEN 'sem_ficha'::text
    WHEN count(ft.id) FILTER (WHERE ft.custo_unitario IS NULL OR ft.custo_unitario = 0) > 0 THEN 'incompleta'::text
    WHEN bool_or(
      ft.insumo_nome ILIKE '%estimad%' OR
      ft.insumo_nome ILIKE '%cotaç%' OR
      ft.insumo_nome ILIKE '%gerson%' OR
      ft.insumo_nome ILIKE '%alimentos%' OR
      ft.insumo_nome ILIKE '%café%' OR
      ft.insumo_nome ILIKE '%leite%' OR
      ft.insumo_nome ILIKE '%pão de queijo%' OR
      ft.insumo_nome ILIKE '%sellpack%'
    ) THEN 'com_estimativas'::text
    ELSE 'comprovada'::text
  END AS status_ficha
FROM produtos_cardapio p
LEFT JOIN fichas_tecnicas ft ON ft.produto_id = p.id
GROUP BY p.id, p.user_id, p.workspace_id, p.nome, p.descricao, p.preco_venda, p.categoria, p.ativo;

REVOKE ALL ON public.v_produtos_custo FROM anon;
GRANT SELECT ON public.v_produtos_custo TO authenticated, service_role;
