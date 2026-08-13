-- Migration 58: Vale Transporte Diario e Tipos de Custos
ALTER TABLE public.colaboradores 
ADD COLUMN IF NOT EXISTS vale_transporte_diario NUMERIC(10,2) DEFAULT 0;

ALTER TABLE public.colaborador_custos 
DROP CONSTRAINT IF EXISTS colaborador_custos_tipo_check;

ALTER TABLE public.colaborador_custos 
ADD CONSTRAINT colaborador_custos_tipo_check 
CHECK (tipo IN ('salario', 'folguista', 'adiantamento', 'hora_extra', 'comissao', 'premio', 'vale', 'desconto', 'outro', 'acerto_transporte', 'transporte_diferenca'));
