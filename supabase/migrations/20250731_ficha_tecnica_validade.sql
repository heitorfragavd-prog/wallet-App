-- ============================================================
-- WALLET APP v2.0 — Ficha Técnica, Validade e Cardápio
-- Migration: 20250731_ficha_tecnica_validade.sql
-- ============================================================

-- ─── 1. Tabela: produtos_cardapio ────────────────────────────
CREATE TABLE IF NOT EXISTS public.produtos_cardapio (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id   UUID,
  nome           TEXT NOT NULL,
  descricao      TEXT,
  preco_venda    NUMERIC(10,2) NOT NULL DEFAULT 0,
  eyemobile_product_id TEXT,
  categoria      TEXT NOT NULL DEFAULT 'outros'
    CHECK (categoria IN ('lanches','bebidas','sobremesas','cafes','porcoes','outros')),
  imagem_url     TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produtos_cardapio_updated_at ON public.produtos_cardapio;
CREATE TRIGGER trg_produtos_cardapio_updated_at
  BEFORE UPDATE ON public.produtos_cardapio
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.produtos_cardapio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_veem_proprios_produtos" ON public.produtos_cardapio;
CREATE POLICY "usuarios_veem_proprios_produtos" ON public.produtos_cardapio
  FOR ALL USING (auth.uid() = user_id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_produtos_cardapio_user_id    ON public.produtos_cardapio(user_id);
CREATE INDEX IF NOT EXISTS idx_produtos_cardapio_workspace  ON public.produtos_cardapio(workspace_id);
CREATE INDEX IF NOT EXISTS idx_produtos_cardapio_categoria  ON public.produtos_cardapio(categoria);


-- ─── 2. Tabela: fichas_tecnicas ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.fichas_tecnicas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    UUID,
  produto_id      UUID NOT NULL REFERENCES public.produtos_cardapio(id) ON DELETE CASCADE,
  insumo_nome     TEXT NOT NULL,
  insumo_id       UUID,   -- FK opcional para itens_mercado
  quantidade      NUMERIC(10,4) NOT NULL DEFAULT 1,
  unidade_medida  TEXT NOT NULL DEFAULT 'un',
  custo_unitario  NUMERIC(10,4) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_fichas_tecnicas_updated_at ON public.fichas_tecnicas;
CREATE TRIGGER trg_fichas_tecnicas_updated_at
  BEFORE UPDATE ON public.fichas_tecnicas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.fichas_tecnicas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_veem_proprias_fichas" ON public.fichas_tecnicas;
CREATE POLICY "usuarios_veem_proprias_fichas" ON public.fichas_tecnicas
  FOR ALL USING (auth.uid() = user_id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fichas_tecnicas_produto_id ON public.fichas_tecnicas(produto_id);
CREATE INDEX IF NOT EXISTS idx_fichas_tecnicas_user_id    ON public.fichas_tecnicas(user_id);


-- ─── 3. View: v_produtos_custo ───────────────────────────────
CREATE OR REPLACE VIEW public.v_produtos_custo AS
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


-- ─── 4. Colunas e trigger em itens_mercado (validades) ───────
ALTER TABLE public.itens_mercado
  ADD COLUMN IF NOT EXISTS data_validade     DATE,
  ADD COLUMN IF NOT EXISTS alerta_dias       INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS quantidade_estoque NUMERIC(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_validade   TEXT NOT NULL DEFAULT 'ok'
    CHECK (status_validade IN ('ok','proximo','vencido'));

-- Função trigger para atualizar status_validade automaticamente
CREATE OR REPLACE FUNCTION public.atualizar_status_validade()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data_validade IS NULL THEN
    NEW.status_validade := 'ok';
  ELSIF NEW.data_validade < CURRENT_DATE THEN
    NEW.status_validade := 'vencido';
  ELSIF NEW.data_validade <= CURRENT_DATE + (NEW.alerta_dias || ' days')::INTERVAL THEN
    NEW.status_validade := 'proximo';
  ELSE
    NEW.status_validade := 'ok';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_itens_mercado_validade ON public.itens_mercado;
CREATE TRIGGER trg_itens_mercado_validade
  BEFORE INSERT OR UPDATE ON public.itens_mercado
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_status_validade();

-- Atualizar registros existentes
UPDATE public.itens_mercado SET status_validade = 'ok' WHERE status_validade IS NULL;


-- ─── 5. Tabela: fornecedores ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fornecedores (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id          UUID,
  nome                  TEXT NOT NULL,
  cnpj                  TEXT,
  telefone              TEXT,
  email                 TEXT,
  contato_nome          TEXT,
  prazo_pagamento_dias  INTEGER DEFAULT 30,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_fornecedores_updated_at ON public.fornecedores;
CREATE TRIGGER trg_fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_veem_proprios_fornecedores" ON public.fornecedores;
CREATE POLICY "usuarios_veem_proprios_fornecedores" ON public.fornecedores
  FOR ALL USING (auth.uid() = user_id);

-- FK fornecedor_id em despesas
ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fornecedores_user_id   ON public.fornecedores(user_id);
CREATE INDEX IF NOT EXISTS idx_despesas_fornecedor_id ON public.despesas(fornecedor_id);
