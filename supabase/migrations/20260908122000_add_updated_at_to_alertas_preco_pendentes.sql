-- Migration: 20260908122000_add_updated_at_to_alertas_preco_pendentes.sql
-- Descrição: Adiciona updated_at NOT NULL em alertas_preco_pendentes com backfill
--            e cria a RPC transacional aplicar_preco_alerta_eyemobile (SECURITY INVOKER)

-- 1. Adição da coluna updated_at com valor padrão
ALTER TABLE public.alertas_preco_pendentes
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Backfill para linhas existentes
UPDATE public.alertas_preco_pendentes
SET updated_at = COALESCE(data_resolucao, ultimo_lembrete, data_criacao, created_at, now())
WHERE updated_at IS NULL;

-- 3. Imposição de NOT NULL e DEFAULT now()
ALTER TABLE public.alertas_preco_pendentes
ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.alertas_preco_pendentes
ALTER COLUMN updated_at SET DEFAULT now();

-- 4. Índice composto para performance e isolamento de workspace
CREATE INDEX IF NOT EXISTS idx_alertas_preco_user_ws_status
ON public.alertas_preco_pendentes(user_id, workspace_id, status);

-- 5. RPC Atômico e Transacional para aplicação de preço Eyemobile
CREATE OR REPLACE FUNCTION public.aplicar_preco_alerta_eyemobile(
  p_alerta_id UUID,
  p_user_id UUID,
  p_workspace_id UUID,
  p_novo_preco NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_alerta RECORD;
  v_produto_rows INT := 0;
  v_alerta_rows INT := 0;
  v_produto_eyemobile_id TEXT;
BEGIN
  -- Invariante 1: Preço deve ser positivo
  IF p_novo_preco IS NULL OR p_novo_preco <= 0 THEN
    RAISE EXCEPTION 'Preço inválido: deve ser maior que zero (recebido: %)', p_novo_preco;
  END IF;

  -- Invariante 2: Buscar alerta com FOR UPDATE e verificar status 'aplicando'
  SELECT id, user_id, workspace_id, produto_eyemobile_id, status
  INTO v_alerta
  FROM public.alertas_preco_pendentes
  WHERE id = p_alerta_id
    AND user_id = p_user_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alerta % não encontrado para o usuário % e workspace %', p_alerta_id, p_user_id, p_workspace_id;
  END IF;

  IF v_alerta.status <> 'aplicando' THEN
    RAISE EXCEPTION 'Alerta % está com status "%", esperado "aplicando"', p_alerta_id, v_alerta.status;
  END IF;

  v_produto_eyemobile_id := v_alerta.produto_eyemobile_id;

  IF v_produto_eyemobile_id IS NULL OR TRIM(v_produto_eyemobile_id) = '' THEN
    RAISE EXCEPTION 'Alerta % não possui produto_eyemobile_id associado', p_alerta_id;
  END IF;

  -- Invariante 3: Atualizar produto no espelho local usando estritamente a chave canônica eyemobile_id
  -- com isolamento obrigatório por user_id e workspace_id (sem adivinhar ou fallback por codigo)
  UPDATE public.produtos_eyemobile
  SET preco_venda = p_novo_preco
  WHERE eyemobile_id = v_produto_eyemobile_id
    AND user_id = p_user_id
    AND workspace_id = p_workspace_id;

  GET DIAGNOSTICS v_produto_rows = ROW_COUNT;

  -- Exigir exatamente UMA correspondência canônica
  IF v_produto_rows <> 1 THEN
    RAISE EXCEPTION 'Esperado atualizar exatamente 1 produto em produtos_eyemobile para eyemobile_id % (linhas afetadas: %)', v_produto_eyemobile_id, v_produto_rows;
  END IF;

  -- Invariante 4: Atualizar alerta para 'aplicado' na mesma transação
  UPDATE public.alertas_preco_pendentes
  SET status = 'aplicado',
      preco_definido_usuario = p_novo_preco,
      data_resolucao = now(),
      updated_at = now()
  WHERE id = p_alerta_id
    AND user_id = p_user_id
    AND workspace_id = p_workspace_id
    AND status = 'aplicando';

  GET DIAGNOSTICS v_alerta_rows = ROW_COUNT;

  IF v_alerta_rows <> 1 THEN
    RAISE EXCEPTION 'Falha ao atualizar status do alerta % para aplicado (linhas afetadas: %)', p_alerta_id, v_alerta_rows;
  END IF;

  -- Sucesso atômico
  RETURN jsonb_build_object(
    'success', true,
    'alerta_id', p_alerta_id,
    'novo_preco', p_novo_preco,
    'produto_eyemobile_id', v_produto_eyemobile_id
  );
END;
$$;

-- 6. Restrição de privilégios de execução (SECURITY INVOKER)
REVOKE EXECUTE ON FUNCTION public.aplicar_preco_alerta_eyemobile(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aplicar_preco_alerta_eyemobile(UUID, UUID, UUID, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.aplicar_preco_alerta_eyemobile(UUID, UUID, UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_preco_alerta_eyemobile(UUID, UUID, UUID, NUMERIC) TO service_role;
