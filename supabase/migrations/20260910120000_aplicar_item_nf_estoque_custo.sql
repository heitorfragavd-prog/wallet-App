-- ============================================================
-- WALLET APP — Correção de Integridade de Produtos — Fase 4
-- Migration: 20260910120000_aplicar_item_nf_estoque_custo.sql
-- Descrição: Função atômica transacional para aplicação de item
--            de NF em estoque, custo e histórico, com proteção
--            contra concorrência (FOR UPDATE) e garantia de idempotência.
-- ============================================================

CREATE OR REPLACE FUNCTION public.aplicar_item_nf_estoque_custo(
  p_item_id UUID,
  p_user_id UUID,
  p_workspace_id UUID,
  p_produto_eyemobile_uuid UUID,
  p_quantidade_para_estoque NUMERIC,
  p_custo_unitario_convertido NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item RECORD;
  v_nf RECORD;
  v_prod RECORD;
  v_novo_estoque NUMERIC;
BEGIN
  -- 1. Lockar o item da NF com FOR UPDATE (serializa chamadas concorrentes)
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

  -- 2. Idempotência estrita: se já processado, retornar sem mutação
  IF v_item.status_estoque = 'processado' THEN
    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_processed',
      'item_id', p_item_id
    );
  END IF;

  -- 3. Validar tenant e carregar dados da NF
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

  -- 4. Lockar o produto canônico e validar integridade e tenant
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

  -- 5. Atualizar produtos_eyemobile (estoque e custo)
  v_novo_estoque := COALESCE(v_prod.estoque_atual, 0) + p_quantidade_para_estoque;

  UPDATE public.produtos_eyemobile
  SET
    custo_atual = p_custo_unitario_convertido,
    estoque_atual = v_novo_estoque,
    ultima_atualizacao_custo = now()
  WHERE id = v_prod.id;

  -- 6. Inserir historico_custo_produto com produto_eyemobile_uuid canônico
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

  -- 7. Marcar nf_item como processado com vínculo ao produto Eyemobile
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
    'novo_estoque', v_novo_estoque,
    'novo_custo', p_custo_unitario_convertido
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_item_nf_estoque_custo(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION public.aplicar_item_nf_estoque_custo(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC) TO authenticated, service_role;
