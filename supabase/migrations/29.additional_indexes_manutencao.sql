-- Índices adicionais para otimização de consultas do sistema de manutenção
-- Esta migration adiciona índices compostos e especializados para queries comuns

-- ============================================================================
-- ANÁLISE DE ÍNDICES EXISTENTES
-- ============================================================================

-- planos_manutencao_veiculo (4 índices):
-- ✓ user_id, veiculo_id, tipo_manutencao_id, ativo

-- manutencoes_customizadas (4 índices):
-- ✓ user_id, veiculo_id, ativo, data_prevista

-- lembretes_manutencao (7 índices):
-- ✓ user_id, veiculo_id, manutencao_id, status, data_prevista, tipo_manutencao
-- ✓ Índice composto: (status, data_prevista) WHERE status = 'pendente'

-- webhooks_manutencao (1 índice):
-- ✓ ativo

-- logs_webhooks_manutencao (5 índices):
-- ✓ webhook_id, lembrete_id, created_at, status_code
-- ✓ Índice composto: (webhook_id, created_at)

-- ============================================================================
-- ÍNDICES COMPOSTOS ADICIONAIS PARA QUERIES COMUNS
-- ============================================================================

-- 1. Buscar planos ativos de um veículo específico
-- Query comum: SELECT * FROM planos_manutencao_veiculo WHERE veiculo_id = ? AND ativo = true
CREATE INDEX IF NOT EXISTS idx_planos_manutencao_veiculo_ativo 
ON public.planos_manutencao_veiculo(veiculo_id, ativo) 
WHERE ativo = true;

-- 2. Buscar manutenções customizadas ativas de um veículo
-- Query comum: SELECT * FROM manutencoes_customizadas WHERE veiculo_id = ? AND ativo = true
CREATE INDEX IF NOT EXISTS idx_manutencoes_customizadas_veiculo_ativo 
ON public.manutencoes_customizadas(veiculo_id, ativo) 
WHERE ativo = true;

-- 3. Buscar lembretes pendentes de um usuário específico
-- Query comum: SELECT * FROM lembretes_manutencao WHERE user_id = ? AND status = 'pendente'
CREATE INDEX IF NOT EXISTS idx_lembretes_manutencao_user_pendentes 
ON public.lembretes_manutencao(user_id, status) 
WHERE status = 'pendente';

-- 4. Buscar lembretes de um veículo específico ordenados por data
-- Query comum: SELECT * FROM lembretes_manutencao WHERE veiculo_id = ? ORDER BY data_prevista
CREATE INDEX IF NOT EXISTS idx_lembretes_manutencao_veiculo_data 
ON public.lembretes_manutencao(veiculo_id, data_prevista DESC);

-- 5. Buscar lembretes por tipo de manutenção e status
-- Query comum: SELECT * FROM lembretes_manutencao WHERE tipo_manutencao = ? AND status = ?
CREATE INDEX IF NOT EXISTS idx_lembretes_manutencao_tipo_status 
ON public.lembretes_manutencao(tipo_manutencao, status);

-- 6. Buscar webhooks ativos (para edge function)
-- Query comum: SELECT * FROM webhooks_manutencao WHERE ativo = true
CREATE INDEX IF NOT EXISTS idx_webhooks_manutencao_ativo_only 
ON public.webhooks_manutencao(id) 
WHERE ativo = true;

-- 7. Buscar logs recentes de um webhook específico com erro
-- Query comum: SELECT * FROM logs_webhooks_manutencao WHERE webhook_id = ? AND erro IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_logs_webhooks_manutencao_erros 
ON public.logs_webhooks_manutencao(webhook_id, created_at DESC) 
WHERE erro IS NOT NULL;

-- 8. Buscar logs por status code (para análise de falhas)
-- Query comum: SELECT * FROM logs_webhooks_manutencao WHERE status_code >= 400
CREATE INDEX IF NOT EXISTS idx_logs_webhooks_manutencao_falhas 
ON public.logs_webhooks_manutencao(status_code, created_at DESC) 
WHERE status_code >= 400;

-- ============================================================================
-- ÍNDICES PARA FOREIGN KEYS (se ainda não existirem)
-- ============================================================================

-- Verificar e criar índices em foreign keys para melhorar performance de JOINs
-- PostgreSQL não cria automaticamente índices em foreign keys

-- Já existem índices em:
-- ✓ planos_manutencao_veiculo.veiculo_id
-- ✓ planos_manutencao_veiculo.tipo_manutencao_id
-- ✓ manutencoes_customizadas.veiculo_id
-- ✓ lembretes_manutencao.veiculo_id
-- ✓ logs_webhooks_manutencao.webhook_id
-- ✓ logs_webhooks_manutencao.lembrete_id

-- ============================================================================
-- ÍNDICES PARA TABELAS RELACIONADAS (veiculos, tipos_manutencao, manutencoes)
-- ============================================================================

-- Estas tabelas foram criadas na migration 7 mas não tinham índices
-- Vamos adicionar índices essenciais para melhorar performance

-- 12. Índice em veiculos.user_id (RLS e queries por usuário)
CREATE INDEX IF NOT EXISTS idx_veiculos_user_id 
ON public.veiculos(user_id);

-- 13. Índice em tipos_manutencao.user_id (RLS e queries por usuário)
CREATE INDEX IF NOT EXISTS idx_tipos_manutencao_user_id 
ON public.tipos_manutencao(user_id);

-- 14. Índice em manutencoes.user_id (RLS e queries por usuário)
CREATE INDEX IF NOT EXISTS idx_manutencoes_user_id 
ON public.manutencoes(user_id);

-- 15. Índice em manutencoes.veiculo_id (foreign key, queries por veículo)
CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo_id 
ON public.manutencoes(veiculo_id);

-- 16. Índice em manutencoes.tipo_manutencao_id (foreign key)
CREATE INDEX IF NOT EXISTS idx_manutencoes_tipo_manutencao_id 
ON public.manutencoes(tipo_manutencao_id);

-- 17. Índice composto em manutencoes para buscar histórico de um veículo
CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo_data 
ON public.manutencoes(veiculo_id, data_realizada DESC);

-- 18. Índice em manutencoes.status para filtrar pendentes/realizadas
CREATE INDEX IF NOT EXISTS idx_manutencoes_status 
ON public.manutencoes(status);

-- ============================================================================
-- ÍNDICES PARA ORDENAÇÃO E PAGINAÇÃO
-- ============================================================================

-- 9. Ordenar planos por data de criação (para histórico)
CREATE INDEX IF NOT EXISTS idx_planos_manutencao_veiculo_created 
ON public.planos_manutencao_veiculo(created_at DESC);

-- 10. Ordenar manutenções customizadas por data de criação
CREATE INDEX IF NOT EXISTS idx_manutencoes_customizadas_created 
ON public.manutencoes_customizadas(created_at DESC);

-- 11. Ordenar lembretes por data de criação
CREATE INDEX IF NOT EXISTS idx_lembretes_manutencao_created 
ON public.lembretes_manutencao(created_at DESC);

-- ============================================================================
-- ÍNDICES PARA BUSCA DE TEXTO (se necessário no futuro)
-- ============================================================================

-- Caso seja necessário buscar manutenções customizadas por nome
-- CREATE INDEX IF NOT EXISTS idx_manutencoes_customizadas_nome_trgm 
-- ON public.manutencoes_customizadas USING gin(nome gin_trgm_ops);
-- Requer extensão: CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- ANÁLISE DE PERFORMANCE
-- ============================================================================

-- Para analisar uso dos índices:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public' AND tablename LIKE '%manutencao%'
-- ORDER BY idx_scan DESC;

-- Para identificar índices não utilizados:
-- SELECT schemaname, tablename, indexname
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public' AND tablename LIKE '%manutencao%' AND idx_scan = 0
-- ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON INDEX idx_planos_manutencao_veiculo_ativo IS 'Otimiza busca de planos ativos por veículo';
COMMENT ON INDEX idx_manutencoes_customizadas_veiculo_ativo IS 'Otimiza busca de manutenções customizadas ativas por veículo';
COMMENT ON INDEX idx_lembretes_manutencao_user_pendentes IS 'Otimiza busca de lembretes pendentes por usuário';
COMMENT ON INDEX idx_lembretes_manutencao_veiculo_data IS 'Otimiza busca de lembretes por veículo ordenados por data';
COMMENT ON INDEX idx_lembretes_manutencao_tipo_status IS 'Otimiza busca de lembretes por tipo e status';
COMMENT ON INDEX idx_webhooks_manutencao_ativo_only IS 'Otimiza busca de webhooks ativos para edge function';
COMMENT ON INDEX idx_logs_webhooks_manutencao_erros IS 'Otimiza busca de logs com erro para debugging';
COMMENT ON INDEX idx_logs_webhooks_manutencao_falhas IS 'Otimiza análise de falhas HTTP (status >= 400)';
COMMENT ON INDEX idx_planos_manutencao_veiculo_created IS 'Otimiza ordenação por data de criação';
COMMENT ON INDEX idx_manutencoes_customizadas_created IS 'Otimiza ordenação por data de criação';
COMMENT ON INDEX idx_lembretes_manutencao_created IS 'Otimiza ordenação por data de criação';
COMMENT ON INDEX idx_veiculos_user_id IS 'Otimiza RLS e queries de veículos por usuário';
COMMENT ON INDEX idx_tipos_manutencao_user_id IS 'Otimiza RLS e queries de tipos de manutenção por usuário';
COMMENT ON INDEX idx_manutencoes_user_id IS 'Otimiza RLS e queries de manutenções por usuário';
COMMENT ON INDEX idx_manutencoes_veiculo_id IS 'Otimiza foreign key e queries de manutenções por veículo';
COMMENT ON INDEX idx_manutencoes_tipo_manutencao_id IS 'Otimiza foreign key de tipo de manutenção';
COMMENT ON INDEX idx_manutencoes_veiculo_data IS 'Otimiza busca de histórico de manutenções por veículo';
COMMENT ON INDEX idx_manutencoes_status IS 'Otimiza filtro de manutenções por status';

-- ============================================================================
-- RESUMO DE ÍNDICES
-- ============================================================================

-- Total de índices após esta migration:
-- Tabelas do novo sistema:
-- - planos_manutencao_veiculo: 4 + 2 = 6 índices
-- - manutencoes_customizadas: 4 + 2 = 6 índices
-- - lembretes_manutencao: 7 + 4 = 11 índices
-- - webhooks_manutencao: 1 + 1 = 2 índices
-- - logs_webhooks_manutencao: 5 + 2 = 7 índices

-- Tabelas relacionadas (migration 7):
-- - veiculos: 0 + 1 = 1 índice
-- - tipos_manutencao: 0 + 1 = 1 índice
-- - manutencoes: 0 + 5 = 5 índices

-- TOTAL: 39 índices

-- Índices parciais (WHERE clause): 6
-- Índices compostos: 10
-- Índices simples: 23

