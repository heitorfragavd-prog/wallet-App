-- ============================================================
-- WALLET APP — Correção de Integridade de Produtos — Fase 4
-- Migration: 20260910120000_aplicar_item_nf_estoque_custo.sql
-- Descrição: Função atômica transacional para aplicação de item
--            de NF em estoque, custo e histórico, com proteção
--            contra concorrência (FOR UPDATE), revalidação
--            transacional da equivalência confirmada (anti-TOCTOU)
--            e garantia estrita de idempotência (incluindo legado).
-- ============================================================

DROP FUNCTION IF EXISTS public.aplicar_item_nf_estoque_custo(UUID, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.aplicar_item_nf_estoque_custo(
  p_item_id UUID,
  p_user_id UUID,
  p_workspace_id UUID,
  p_equivalencia_id UUID,
  p_produto_eyemobile_uuid UUID,
  p_quantidade_para_estoque NUMERIC,
  p_custo_unitario_convertido NUMERIC,
  p_fator_conversao_esperado NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item RECORD;
  v_nf RECORD;
  v_equiv RECORD;
  v_prod RECORD;
  v_novo_estoque NUMERIC;
  v_cnpj_nf_norm TEXT;
BEGIN
  -- 1. Validação estrita de parâmetros de entrada (fail closed)
  IF p_quantidade_para_estoque IS NULL OR p_quantidade_para_estoque <= 0 OR
     p_custo_unitario_convertido IS NULL OR p_custo_unitario_convertido <= 0 OR
     p_fator_conversao_esperado IS NULL OR p_fator_conversao_esperado <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_parameters',
      'error', 'Quantidade, custo unitário convertido e fator de conversão esperado devem ser não-nulos e estritamente maiores que zero.'
    );
  END IF;

  IF p_item_id IS NULL OR p_user_id IS NULL OR p_workspace_id IS NULL OR
     p_equivalencia_id IS NULL OR p_produto_eyemobile_uuid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'missing_required_ids',
      'error', 'Identificadores obrigatórios de item, tenant, equivalência ou produto ausentes.'
    );
  END IF;

  -- 2. Lockar o item da NF com FOR UPDATE (serializa chamadas concorrentes)
  SELECT * INTO v_item
  FROM public.nf_itens
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'item_not_found',
      'error', 'Item da NF não encontrado.'
    );
  END IF;

  -- 3. Idempotência estrita: trata 'processado' E legado 'atualizado' como already_processed
  IF v_item.status_estoque IN ('processado', 'atualizado') THEN
    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_processed',
      'item_id', p_item_id
    );
  END IF;

  -- 4. Validar tenant e carregar dados da NF
  SELECT * INTO v_nf
  FROM public.notas_fiscais_compra
  WHERE id = v_item.nf_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'nf_not_found',
      'error', 'Nota fiscal do item não encontrada.'
    );
  END IF;

  IF v_nf.user_id IS DISTINCT FROM p_user_id OR v_nf.workspace_id IS DISTINCT FROM p_workspace_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'tenant_mismatch',
      'error', 'Tenant do item ou da NF não corresponde ao contexto do usuário.'
    );
  END IF;

  -- 5. Lockar e REVALIDAR A EQUIVALÊNCIA CONFIRMADA DENTRO DA TRANSAÇÃO (Anti-TOCTOU)
  SELECT * INTO v_equiv
  FROM public.produto_equivalencias
  WHERE id = p_equivalencia_id
    AND user_id = p_user_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'equivalence_not_found',
      'error', 'Equivalência de produto não encontrada ou não pertence ao tenant especificado.'
    );
  END IF;

  IF NOT v_equiv.confirmado_por_usuario THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'equivalence_not_confirmed',
      'error', 'Equivalência de produto não está confirmada pelo usuário.'
    );
  END IF;

  IF v_equiv.produto_eyemobile_uuid IS DISTINCT FROM p_produto_eyemobile_uuid THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'equivalence_product_mismatch',
      'error', 'Produto canônico divergente do vinculado na equivalência confirmada.'
    );
  END IF;

  IF v_equiv.fator_conversao IS NULL OR v_equiv.fator_conversao <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_conversion_factor',
      'error', 'Fator de conversão da equivalência deve ser estritamente maior que zero.'
    );
  END IF;

  -- Anti-TOCTOU: Se o fator mudou concorrentemente em relação ao cálculo do preflight, falha fechado
  IF v_equiv.fator_conversao IS DISTINCT FROM p_fator_conversao_esperado THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'equivalence_changed',
      'error', 'Fator de conversão da equivalência foi alterado concorrentemente.'
    );
  END IF;

  v_cnpj_nf_norm := REGEXP_REPLACE(COALESCE(v_nf.cnpj_fornecedor, ''), '\D', '', 'g');
  IF v_equiv.cnpj_fornecedor_normalizado IS DISTINCT FROM v_cnpj_nf_norm THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'supplier_cnpj_mismatch',
      'error', 'CNPJ do fornecedor da NF não corresponde ao CNPJ da equivalência.'
    );
  END IF;

  IF v_equiv.codigo_produto_fornecedor IS DISTINCT FROM TRIM(COALESCE(v_item.codigo_produto, '')) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'supplier_code_mismatch',
      'error', 'Código do item da NF não corresponde ao código do fornecedor da equivalência.'
    );
  END IF;

  -- 6. Lockar o produto canônico e validar integridade e tenant
  SELECT * INTO v_prod
  FROM public.produtos_eyemobile
  WHERE id = p_produto_eyemobile_uuid
    AND user_id = p_user_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'canonical_product_not_found',
      'error', 'Produto canônico não encontrado ou não pertence ao tenant especificado.'
    );
  END IF;

  IF v_prod.eyemobile_id IS NULL OR TRIM(v_prod.eyemobile_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'missing_remote_id',
      'error', 'Produto canônico não possui identificador remoto eyemobile_id válido.'
    );
  END IF;

  -- 7. Atualizar produtos_eyemobile (estoque e custo)
  v_novo_estoque := COALESCE(v_prod.estoque_atual, 0) + p_quantidade_para_estoque;

  UPDATE public.produtos_eyemobile
  SET
    custo_atual = p_custo_unitario_convertido,
    estoque_atual = v_novo_estoque,
    ultima_atualizacao_custo = now()
  WHERE id = v_prod.id;

  -- 8. Inserir historico_custo_produto com produto_eyemobile_uuid canônico
  INSERT INTO public.historico_custo_produto (
    user_id,
    workspace_id,
    produto_eyemobile_uuid,
    produto_codigo,
    produto_descricao,
    fornecedor,
    custo_unitario,
    quantidade,
    nf_id,
    data_compra
  ) VALUES (
    p_user_id,
    p_workspace_id,
    v_prod.id,
    v_item.codigo_produto,
    v_item.descricao,
    v_nf.fornecedor,
    p_custo_unitario_convertido,
    v_item.quantidade,
    v_nf.id,
    COALESCE(v_nf.data_entrada, v_nf.data_emissao, CURRENT_DATE)
  );

  -- 9. Marcar nf_item como processado com vínculo ao produto Eyemobile
  UPDATE public.nf_itens
  SET
    status_estoque = 'processado',
    produto_eyemobile_id = v_prod.eyemobile_id
  WHERE id = v_item.id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'processed',
    'item_id', v_item.id,
    'produto_eyemobile_uuid', v_prod.id,
    'estoque_anterior', v_prod.estoque_atual,
    'novo_estoque', v_novo_estoque,
    'custo_anterior', v_prod.custo_atual,
    'novo_custo', p_custo_unitario_convertido
  );
END;
$$;

-- ─── SEGURANÇA (P0): Permissões restritas na RPC SECURITY DEFINER ───
-- Revoga execução de público, anônimo e usuários autenticados
REVOKE ALL ON FUNCTION public.aplicar_item_nf_estoque_custo(UUID, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

-- Concede execução estritamente ao papel de serviço privilegiado
GRANT EXECUTE ON FUNCTION public.aplicar_item_nf_estoque_custo(UUID, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC) TO service_role;
