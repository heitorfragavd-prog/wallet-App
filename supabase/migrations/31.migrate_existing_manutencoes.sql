-- Migração de dados existentes do sistema antigo para o novo sistema de manutenção
-- Esta migração converte manutenções realizadas em planos de manutenção por veículo

-- Passo 1: Criar planos de manutenção baseados em manutenções realizadas
-- Para cada combinação única de (veiculo_id, tipo_manutencao_id) nas manutenções realizadas,
-- criar um plano de manutenção usando o intervalo padrão do tipo
INSERT INTO public.planos_manutencao_veiculo (
  user_id,
  veiculo_id,
  tipo_manutencao_id,
  intervalo_km,
  ativo,
  created_at,
  updated_at
)
SELECT DISTINCT
  m.user_id,
  m.veiculo_id,
  m.tipo_manutencao_id,
  tm.intervalo_km, -- Usar intervalo padrão do tipo
  true, -- Ativo por padrão
  NOW(),
  NOW()
FROM public.manutencoes m
INNER JOIN public.tipos_manutencao tm ON m.tipo_manutencao_id = tm.id
WHERE m.status = 'realizada'
ON CONFLICT (veiculo_id, tipo_manutencao_id) DO NOTHING; -- Evitar duplicatas se já existir

-- Passo 2: Adicionar comentário explicativo na tabela de manutenções antigas
COMMENT ON TABLE public.manutencoes IS 'Tabela legada de manutenções. Mantida para histórico de manutenções realizadas. Novos planos devem usar planos_manutencao_veiculo e manutencoes_customizadas.';

-- Passo 3: Criar índice para melhorar performance de consultas históricas
CREATE INDEX IF NOT EXISTS idx_manutencoes_status_data ON public.manutencoes(status, data_realizada DESC);
CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo_tipo ON public.manutencoes(veiculo_id, tipo_manutencao_id);

-- Passo 4: Adicionar coluna para marcar manutenções migradas (opcional, para auditoria)
ALTER TABLE public.manutencoes ADD COLUMN IF NOT EXISTS migrado_para_novo_sistema BOOLEAN DEFAULT false;

-- Passo 5: Marcar as manutenções que foram migradas
UPDATE public.manutencoes
SET migrado_para_novo_sistema = true
WHERE status = 'realizada'
AND EXISTS (
  SELECT 1 
  FROM public.planos_manutencao_veiculo pmv
  WHERE pmv.veiculo_id = manutencoes.veiculo_id
  AND pmv.tipo_manutencao_id = manutencoes.tipo_manutencao_id
);

-- Passo 6: Criar view para facilitar consulta de histórico completo
CREATE OR REPLACE VIEW public.historico_manutencoes_completo AS
SELECT 
  m.id,
  m.user_id,
  m.veiculo_id,
  m.tipo_manutencao_id,
  m.quilometragem_realizada as quilometragem,
  m.data_realizada as data,
  m.status,
  m.observacoes,
  v.marca,
  v.modelo,
  v.placa,
  tm.nome as tipo_manutencao,
  tm.sistema,
  'realizada' as origem
FROM public.manutencoes m
INNER JOIN public.veiculos v ON m.veiculo_id = v.id
INNER JOIN public.tipos_manutencao tm ON m.tipo_manutencao_id = tm.id
WHERE m.status = 'realizada';

-- Adicionar RLS na view
ALTER VIEW public.historico_manutencoes_completo SET (security_invoker = true);

-- Comentários para documentação
COMMENT ON VIEW public.historico_manutencoes_completo IS 'View que consolida o histórico de manutenções realizadas do sistema antigo';
COMMENT ON COLUMN public.manutencoes.migrado_para_novo_sistema IS 'Indica se esta manutenção foi migrada para o novo sistema de planos';

-- Passo 7: Criar função para verificar se há dados não migrados
CREATE OR REPLACE FUNCTION public.verificar_manutencoes_nao_migradas()
RETURNS TABLE (
  veiculo_id UUID,
  tipo_manutencao_id UUID,
  total_manutencoes BIGINT,
  marca TEXT,
  modelo TEXT,
  tipo_nome TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.veiculo_id,
    m.tipo_manutencao_id,
    COUNT(*) as total_manutencoes,
    v.marca,
    v.modelo,
    tm.nome as tipo_nome
  FROM public.manutencoes m
  INNER JOIN public.veiculos v ON m.veiculo_id = v.id
  INNER JOIN public.tipos_manutencao tm ON m.tipo_manutencao_id = tm.id
  WHERE m.status = 'realizada'
  AND m.migrado_para_novo_sistema = false
  GROUP BY m.veiculo_id, m.tipo_manutencao_id, v.marca, v.modelo, tm.nome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário na função
COMMENT ON FUNCTION public.verificar_manutencoes_nao_migradas() IS 'Retorna manutenções realizadas que ainda não foram migradas para o novo sistema';
