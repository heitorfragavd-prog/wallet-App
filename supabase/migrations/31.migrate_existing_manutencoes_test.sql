-- Script de teste para validar a migração
-- Execute este script ANTES da migração para verificar o que será migrado

-- 1. Verificar quantas manutenções realizadas existem
SELECT 
  'Total de manutenções realizadas' as descricao,
  COUNT(*) as total
FROM public.manutencoes
WHERE status = 'realizada';

-- 2. Verificar combinações únicas de veículo + tipo que serão migradas
SELECT 
  'Combinações únicas (veículo + tipo) a migrar' as descricao,
  COUNT(DISTINCT (veiculo_id, tipo_manutencao_id)) as total
FROM public.manutencoes m
INNER JOIN public.tipos_manutencao tm ON m.tipo_manutencao_id = tm.id
WHERE m.status = 'realizada';

-- 3. Listar veículos que terão planos criados
SELECT 
  v.id,
  v.marca,
  v.modelo,
  v.placa,
  COUNT(DISTINCT m.tipo_manutencao_id) as tipos_manutencao_a_migrar
FROM public.veiculos v
INNER JOIN public.manutencoes m ON v.id = m.veiculo_id
INNER JOIN public.tipos_manutencao tm ON m.tipo_manutencao_id = tm.id
WHERE m.status = 'realizada'
GROUP BY v.id, v.marca, v.modelo, v.placa
ORDER BY tipos_manutencao_a_migrar DESC;

-- 4. Verificar se há planos já existentes que podem causar conflito
SELECT 
  'Planos já existentes (possíveis conflitos)' as descricao,
  COUNT(*) as total
FROM public.planos_manutencao_veiculo pmv
WHERE EXISTS (
  SELECT 1 
  FROM public.manutencoes m
  WHERE m.veiculo_id = pmv.veiculo_id
  AND m.tipo_manutencao_id = pmv.tipo_manutencao_id
  AND m.status = 'realizada'
);

-- 5. Verificar manutenções órfãs (sem veículo ou tipo válido)
SELECT 
  'Manutenções órfãs (não serão migradas)' as descricao,
  COUNT(*) as total
FROM public.manutencoes m
WHERE m.status = 'realizada'
AND (
  NOT EXISTS (SELECT 1 FROM public.veiculos v WHERE v.id = m.veiculo_id)
  OR NOT EXISTS (SELECT 1 FROM public.tipos_manutencao tm WHERE tm.id = m.tipo_manutencao_id)
);

-- 6. Preview dos planos que serão criados (primeiros 10)
SELECT 
  v.marca,
  v.modelo,
  v.placa,
  tm.nome as tipo_manutencao,
  tm.sistema,
  tm.intervalo_km,
  COUNT(m.id) as vezes_realizada
FROM public.manutencoes m
INNER JOIN public.veiculos v ON m.veiculo_id = v.id
INNER JOIN public.tipos_manutencao tm ON m.tipo_manutencao_id = tm.id
WHERE m.status = 'realizada'
GROUP BY v.marca, v.modelo, v.placa, tm.nome, tm.sistema, tm.intervalo_km
ORDER BY vezes_realizada DESC
LIMIT 10;
