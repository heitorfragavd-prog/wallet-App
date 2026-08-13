-- Migration 59: Acerto Semanal Corrigido e Novos Tipos de Transporte
ALTER TABLE public.colaborador_custos 
DROP CONSTRAINT IF EXISTS colaborador_custos_tipo_check;

ALTER TABLE public.colaborador_custos 
ADD CONSTRAINT colaborador_custos_tipo_check 
CHECK (tipo IN (
  'salario', 'folguista', 'adiantamento', 'hora_extra', 
  'comissao', 'premio', 'vale', 'desconto', 'outro',
  'acerto_transporte', 'uber_semanal', 'passagem_semanal', 'transporte_diferenca'
));
