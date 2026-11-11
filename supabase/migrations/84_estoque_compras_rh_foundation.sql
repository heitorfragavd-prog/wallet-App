-- Migration: 84_estoque_compras_rh_foundation.sql
-- Etapa 07 — Especialistas de Estoque e Compras + Pessoal e RH
-- Adiciona suporte a estoque mínimo, estoque ideal, embalagens e múltiplos de compra em produtos_eyemobile.

ALTER TABLE IF EXISTS public.produtos_eyemobile
  ADD COLUMN IF NOT EXISTS estoque_minimo DECIMAL(10,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_ideal DECIMAL(10,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidade_medida TEXT DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS multiplo_compra DECIMAL(10,3) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fornecedor_padrao TEXT;

-- Índices de consulta rápida para o Agente de Estoque
CREATE INDEX IF NOT EXISTS idx_produtos_eyemobile_ws_estoque 
  ON public.produtos_eyemobile(workspace_id, estoque_atual);

CREATE INDEX IF NOT EXISTS idx_produtos_eyemobile_ws_categoria 
  ON public.produtos_eyemobile(workspace_id, categoria);
