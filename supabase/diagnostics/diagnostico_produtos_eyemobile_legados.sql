-- ============================================================
-- WALLET APP — SUBETAPA 9.1: RELATÓRIO DIAGNÓSTICO DE DADOS LEGADOS
-- Script: supabase/diagnostics/diagnostico_produtos_eyemobile_legados.sql
-- Finalidade: Consultas puramente READ-ONLY para avaliar a integridade dos
--             produtos Eyemobile e do histórico de custo no banco antes de
--             aplicar alterações de constraints futuras.
-- ============================================================

-- 1. TOTAL DE PRODUTOS EYEMOBILE
SELECT
  COUNT(*) AS total_produtos_eyemobile
FROM public.produtos_eyemobile;

-- 2. PRODUTOS COM eyemobile_id IS NULL OU VAZIO
-- (Identifica produtos criados pelo fluxo inseguro de NF ou antes do sync)
SELECT
  COUNT(*) AS total_eyemobile_id_null,
  COALESCE(workspace_id::text, 'SEM_WORKSPACE') AS workspace,
  COUNT(*) FILTER (WHERE codigo IS NOT NULL) AS com_codigo
FROM public.produtos_eyemobile
WHERE eyemobile_id IS NULL OR TRIM(eyemobile_id) = ''
GROUP BY workspace_id;

-- 3. PRODUTOS SEM workspace_id
SELECT
  COUNT(*) AS total_sem_workspace_id
FROM public.produtos_eyemobile
WHERE workspace_id IS NULL;

-- 4. DUPLICIDADES DE eyemobile_id POR WORKSPACE
-- (Verifica se é seguro adicionar UNIQUE(workspace_id, eyemobile_id))
SELECT
  workspace_id,
  eyemobile_id,
  COUNT(*) AS ocorrencias,
  array_agg(id) AS ids_produtos,
  array_agg(codigo) AS codigos,
  array_agg(descricao) AS descricoes
FROM public.produtos_eyemobile
WHERE eyemobile_id IS NOT NULL AND TRIM(eyemobile_id) <> ''
GROUP BY workspace_id, eyemobile_id
HAVING COUNT(*) > 1;

-- 5. DUPLICIDADES DE codigo POR WORKSPACE
SELECT
  workspace_id,
  codigo,
  COUNT(*) AS ocorrencias,
  array_agg(id) AS ids_produtos,
  array_agg(eyemobile_id) AS eyemobile_ids,
  array_agg(descricao) AS descricoes
FROM public.produtos_eyemobile
WHERE codigo IS NOT NULL AND TRIM(codigo) <> ''
GROUP BY workspace_id, codigo
HAVING COUNT(*) > 1;

-- 6. MESMO eyemobile_id APARECENDO EM WORKSPACES DIFERENTES
-- (Normal se o mesmo catálogo Eyemobile for compartilhado entre lojas/contas)
SELECT
  eyemobile_id,
  COUNT(DISTINCT workspace_id) AS total_workspaces,
  array_agg(DISTINCT workspace_id) AS workspaces
FROM public.produtos_eyemobile
WHERE eyemobile_id IS NOT NULL AND TRIM(eyemobile_id) <> ''
GROUP BY eyemobile_id
HAVING COUNT(DISTINCT workspace_id) > 1;

-- 7. REGISTROS POTENCIALMENTE CRIADOS PELO FLUXO INSEGURO DA NF
-- (Itens com eyemobile_id NULL e criados com código originado da NF)
SELECT
  p.id,
  p.workspace_id,
  p.user_id,
  p.codigo,
  p.descricao,
  p.preco_venda,
  p.custo_atual,
  p.estoque_atual,
  p.created_at
FROM public.produtos_eyemobile p
WHERE p.eyemobile_id IS NULL
ORDER BY p.created_at DESC;

-- 8. TOTAL DE REGISTROS EM historico_custo_produto
SELECT
  COUNT(*) AS total_historico_custo
FROM public.historico_custo_produto;

-- 9. HISTÓRICO DE CUSTO ATUALMENTE SEM IDENTIDADE CANÔNICA (produto_eyemobile_uuid IS NULL)
SELECT
  COUNT(*) AS historico_sem_uuid_canonico,
  COUNT(*) FILTER (WHERE produto_eyemobile_uuid IS NOT NULL) AS historico_com_uuid_canonico
FROM public.historico_custo_produto;
