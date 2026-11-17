-- =============================================================================
-- Migration 107: Arquitetura e Calendário de Compras Automáticas (Etapa 4 - Rodo Point)
-- =============================================================================

-- 1. Tabela: compras_fornecedores_calendario
CREATE TABLE IF NOT EXISTS public.compras_fornecedores_calendario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  fornecedor_nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Geral',
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  horario_disparo TIME NOT NULL DEFAULT '09:00:00',
  periodicidade TEXT NOT NULL DEFAULT 'semanal' CHECK (periodicidade IN ('semanal', 'quinzenal')),
  quinzena_data_base DATE DEFAULT '2026-11-13',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem_exibicao INTEGER NOT NULL DEFAULT 1,
  formato_lista TEXT NOT NULL DEFAULT 'padrao' CHECK (formato_lista IN ('padrao', 'salgados_soma', 'bebidas_sem_ref', 'ceasa_categorias')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_compras_calendario_lookup 
  ON public.compras_fornecedores_calendario(workspace_id, dia_semana, ativo);

-- 2. Tabela: compras_produtos_referencia
CREATE TABLE IF NOT EXISTS public.compras_produtos_referencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  fornecedor_id UUID REFERENCES public.compras_fornecedores_calendario(id) ON DELETE SET NULL,
  fornecedor_nome TEXT NOT NULL,
  produto_nome TEXT NOT NULL,
  unidade_medida TEXT NOT NULL DEFAULT 'unidade',
  quantidade_referencia NUMERIC(10, 2) NOT NULL DEFAULT 0,
  categoria TEXT DEFAULT 'Geral',
  limite_max_sugerido NUMERIC(10, 2) DEFAULT 50,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uk_compras_prod_ref UNIQUE (workspace_id, fornecedor_nome, produto_nome)
);

CREATE INDEX IF NOT EXISTS idx_compras_prod_ref_forn 
  ON public.compras_produtos_referencia(workspace_id, fornecedor_nome, ativo);

-- 3. Tabela: compras_config
CREATE TABLE IF NOT EXISTS public.compras_config (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  grupo_conversas_loja_chat_id TEXT,
  simulacao_modo BOOLEAN NOT NULL DEFAULT TRUE,
  aumento_temporario_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  notificacoes_ativas BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. Tabela: compras_pedidos
CREATE TABLE IF NOT EXISTS public.compras_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  fornecedor_id UUID REFERENCES public.compras_fornecedores_calendario(id) ON DELETE SET NULL,
  fornecedor_nome TEXT NOT NULL,
  data_pedido DATE NOT NULL DEFAULT CURRENT_DATE,
  dia_semana SMALLINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sugerido' CHECK (status IN ('sugerido', 'revisado', 'enviado', 'cancelado')),
  aumento_temporario_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  texto_pedido_formatado TEXT,
  simulacao BOOLEAN NOT NULL DEFAULT TRUE,
  enviado_em TIMESTAMPTZ,
  enviado_para_chat_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_compras_pedidos_lookup 
  ON public.compras_pedidos(workspace_id, data_pedido, fornecedor_nome);

-- 5. Tabela: compras_pedidos_itens
CREATE TABLE IF NOT EXISTS public.compras_pedidos_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.compras_pedidos(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  produto_referencia_id UUID REFERENCES public.compras_produtos_referencia(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL,
  categoria TEXT,
  unidade_medida TEXT NOT NULL DEFAULT 'unidade',
  quantidade_referencia NUMERIC(10, 2) NOT NULL DEFAULT 0,
  estoque_atual NUMERIC(10, 2) NOT NULL DEFAULT 0,
  quantidade_sugerida NUMERIC(10, 2) NOT NULL DEFAULT 0,
  quantidade_ajustada NUMERIC(10, 2) NOT NULL DEFAULT 0,
  limite_aplicado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_compras_itens_pedido 
  ON public.compras_pedidos_itens(pedido_id);

-- 6. Função de checagem da quinzena (Elma Chips)
CREATE OR REPLACE FUNCTION public.is_quinzena_compras_ativa(p_data_base DATE, p_data_atual DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_data_base IS NULL OR p_data_atual IS NULL THEN
    RETURN TRUE;
  END IF;
  RETURN (FLOOR((p_data_atual - p_data_base) / 7.0)::integer % 2 = 0);
END;
$$;

-- 7. Políticas de Segurança RLS
ALTER TABLE public.compras_fornecedores_calendario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_produtos_referencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_pedidos_itens ENABLE ROW LEVEL SECURITY;

-- Service role bypass total
CREATE POLICY compras_calendario_service ON public.compras_fornecedores_calendario
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY compras_prod_ref_service ON public.compras_produtos_referencia
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY compras_config_service ON public.compras_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY compras_pedidos_service ON public.compras_pedidos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY compras_itens_service ON public.compras_pedidos_itens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated: acesso estrito ao workspace pertencente
CREATE POLICY compras_calendario_auth ON public.compras_fornecedores_calendario
  FOR ALL TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  );

CREATE POLICY compras_prod_ref_auth ON public.compras_produtos_referencia
  FOR ALL TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  );

CREATE POLICY compras_config_auth ON public.compras_config
  FOR ALL TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  );

CREATE POLICY compras_pedidos_auth ON public.compras_pedidos
  FOR ALL TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  );

CREATE POLICY compras_itens_auth ON public.compras_pedidos_itens
  FOR ALL TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid()) OR
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
  );

-- 8. Seed inicial do Calendário Operacional da Rodo Point para workspaces existentes
DO $$
DECLARE
  v_ws RECORD;
BEGIN
  FOR v_ws IN SELECT id FROM public.workspaces LOOP
    -- Inserir Configuração Padrão em Modo Simulação
    INSERT INTO public.compras_config (workspace_id, simulacao_modo, aumento_temporario_pct, notificacoes_ativas)
    VALUES (v_ws.id, TRUE, 0, TRUE)
    ON CONFLICT (workspace_id) DO NOTHING;

    -- Terça-feira (2): Salgados e Coca-Cola Extra
    INSERT INTO public.compras_fornecedores_calendario (workspace_id, fornecedor_nome, categoria, dia_semana, formato_lista, ordem_exibicao)
    VALUES 
      (v_ws.id, 'Salgados', 'Alimentos', 2, 'salgados_soma', 1),
      (v_ws.id, 'Coca-Cola (Extra)', 'Bebidas', 2, 'bebidas_sem_ref', 2)
    ON CONFLICT DO NOTHING;

    -- Quarta-feira (3): Sellpack, Café 3 Corações, Cigarros, Ceasa
    INSERT INTO public.compras_fornecedores_calendario (workspace_id, fornecedor_nome, categoria, dia_semana, formato_lista, ordem_exibicao)
    VALUES 
      (v_ws.id, 'Sellpack', 'Embalagens e Descartáveis', 3, 'padrao', 1),
      (v_ws.id, 'Café 3 Corações', 'Cafeteria', 3, 'padrao', 2),
      (v_ws.id, 'Cigarros', 'Tabacaria', 3, 'padrao', 3),
      (v_ws.id, 'Ceasa', 'Hortifruti', 3, 'ceasa_categorias', 4)
    ON CONFLICT DO NOTHING;

    -- Quinta-feira (4): Coca-Cola, Ambev, Pão de queijo
    INSERT INTO public.compras_fornecedores_calendario (workspace_id, fornecedor_nome, categoria, dia_semana, formato_lista, ordem_exibicao)
    VALUES 
      (v_ws.id, 'Coca-Cola', 'Bebidas', 4, 'bebidas_sem_ref', 1),
      (v_ws.id, 'Ambev', 'Bebidas', 4, 'bebidas_sem_ref', 2),
      (v_ws.id, 'Pão de Queijo', 'Alimentos', 4, 'padrao', 3)
    ON CONFLICT DO NOTHING;

    -- Sexta-feira quinzenal (5): Elma Chips
    INSERT INTO public.compras_fornecedores_calendario (workspace_id, fornecedor_nome, categoria, dia_semana, periodicidade, quinzena_data_base, formato_lista, ordem_exibicao)
    VALUES 
      (v_ws.id, 'Elma Chips', 'Snacks', 5, 'quinzenal', '2026-11-13', 'padrao', 1)
    ON CONFLICT DO NOTHING;

    -- Segunda-feira (1): Ceasa
    INSERT INTO public.compras_fornecedores_calendario (workspace_id, fornecedor_nome, categoria, dia_semana, formato_lista, ordem_exibicao)
    VALUES 
      (v_ws.id, 'Ceasa', 'Hortifruti', 1, 'ceasa_categorias', 1)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
