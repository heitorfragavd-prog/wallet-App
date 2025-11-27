-- Script de validação pós-migração
-- Execute este script DEPOIS da migração para verificar se tudo foi migrado corretamente

-- 1. Verificar quantos planos foram criados
SELECT 
  'Planos de manutenção criados' as descricao,
  COUNT(*) as total
FROM public.planos_manutencao_veiculo;

-- 2. Verificar quantas manutenções foram marcadas como migradas
SELECT 
  'Manutenções marcadas como migradas' as descricao,
  COUNT(*) as total
FROM public.manutencoes
WHERE migrado_para_novo_sistema = true;

-- 3. Verificar manutenções não migradas (se houver)
SELECT * FROM public.verificar_manutencoes_nao_migradas();

-- 4. Comparar: manutenções realizadas vs planos criados
SELECT 
  'Comparação: Manutenções realizadas' as tipo,
  COUNT(DISTINCT (veiculo_id, tipo_manutencao_id)) as total
FROM public.manutencoes
WHERE status = 'realizada'
UNION ALL
SELECT 
  'Comparação: Planos criados' as tipo,
  COUNT(*) as total
FROM public.planos_manutencao_veiculo;

-- 5. Verificar integridade: todos os planos têm veículo e tipo válidos
SELECT 
  'Planos com referências inválidas' as descricao,
  COUNT(*) as total
FROM public.planos_manutencao_veiculo pmv
WHERE NOT EXISTS (SELECT 1 FROM public.veiculos v WHERE v.id = pmv.veiculo_id)
   OR NOT EXISTS (SELECT 1 FROM public.tipos_manutencao tm WHERE tm.id = pmv.tipo_manutencao_id);

-- 6. Verificar view de histórico
SELECT 
  'Registros na view de histórico' as descricao,
  COUNT(*) as total
FROM public.historico_manutencoes_completo;

-- 7. Listar veículos com seus planos migrados
SELECT 
  v.marca,
  v.modelo,
  v.placa,
  COUNT(pmv.id) as total_planos,
  STRING_AGG(tm.nome, ', ' ORDER BY tm.nome) as tipos_manutencao
FROM public.veiculos v
LEFT JOIN public.planos_manutencao_veiculo pmv ON v.id = pmv.veiculo_id
LEFT JOIN public.tipos_manutencao tm ON pmv.tipo_manutencao_id = tm.id
WHERE pmv.id IS NOT NULL
GROUP BY v.id, v.marca, v.modelo, v.placa
ORDER BY total_planos DESC;

-- 8. Verificar índices criados
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'manutencoes'
AND indexname LIKE 'idx_manutencoes%'
ORDER BY indexname;

-- 9. Verificar se a função de verificação funciona
SELECT 
  'Função de verificação está funcionando' as descricao,
  CASE 
    WHEN COUNT(*) >= 0 THEN 'OK'
    ELSE 'ERRO'
  END as status
FROM public.verificar_manutencoes_nao_migradas();

-- 10. Resumo final
SELECT 
  'RESUMO DA MIGRAÇÃO' as titulo,
  (SELECT COUNT(*) FROM public.manutencoes WHERE status = 'realizada') as manutencoes_realizadas,
  (SELECT COUNT(*) FROM public.planos_manutencao_veiculo) as planos_criados,
  (SELECT COUNT(*) FROM public.manutencoes WHERE migrado_para_novo_sistema = true) as manutencoes_migradas,
  (SELECT COUNT(*) FROM public.verificar_manutencoes_nao_migradas()) as manutencoes_nao_migradas;
