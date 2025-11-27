# Index Analysis - Vehicle Maintenance System

## Overview
This document provides a comprehensive analysis of all indexes created for the vehicle maintenance system, including their purpose, usage patterns, and performance considerations.

## Index Summary

### Total Indexes: 32
- **Migration 23-27**: 21 indexes (base implementation)
- **Migration 29**: 11 additional indexes (optimization)

## Indexes by Table

### 1. planos_manutencao_veiculo (6 indexes)

#### Base Indexes (Migration 23)
1. `idx_planos_manutencao_veiculo_user_id`
   - Column: `user_id`
   - Purpose: RLS policy enforcement, user-specific queries
   - Query: `SELECT * FROM planos_manutencao_veiculo WHERE user_id = ?`

2. `idx_planos_manutencao_veiculo_veiculo_id`
   - Column: `veiculo_id`
   - Purpose: Foreign key, vehicle-specific queries
   - Query: `SELECT * FROM planos_manutencao_veiculo WHERE veiculo_id = ?`

3. `idx_planos_manutencao_veiculo_tipo_manutencao_id`
   - Column: `tipo_manutencao_id`
   - Purpose: Foreign key, maintenance type queries
   - Query: `SELECT * FROM planos_manutencao_veiculo WHERE tipo_manutencao_id = ?`

4. `idx_planos_manutencao_veiculo_ativo`
   - Column: `ativo`
   - Purpose: Filter active/inactive plans
   - Query: `SELECT * FROM planos_manutencao_veiculo WHERE ativo = true`

#### Additional Indexes (Migration 29)
5. `idx_planos_manutencao_veiculo_ativo` (Partial, Composite)
   - Columns: `(veiculo_id, ativo) WHERE ativo = true`
   - Purpose: Optimize active plans lookup per vehicle
   - Query: `SELECT * FROM planos_manutencao_veiculo WHERE veiculo_id = ? AND ativo = true`
   - **Benefit**: Smaller index size, faster lookups for active plans

6. `idx_planos_manutencao_veiculo_created`
   - Column: `created_at DESC`
   - Purpose: Chronological ordering, pagination
   - Query: `SELECT * FROM planos_manutencao_veiculo ORDER BY created_at DESC`

### 2. manutencoes_customizadas (6 indexes)

#### Base Indexes (Migration 24)
1. `idx_manutencoes_customizadas_user_id`
   - Column: `user_id`
   - Purpose: RLS policy enforcement, user-specific queries

2. `idx_manutencoes_customizadas_veiculo_id`
   - Column: `veiculo_id`
   - Purpose: Foreign key, vehicle-specific queries

3. `idx_manutencoes_customizadas_ativo`
   - Column: `ativo`
   - Purpose: Filter active/inactive custom maintenances

4. `idx_manutencoes_customizadas_data_prevista`
   - Column: `data_prevista`
   - Purpose: Date-based queries, upcoming maintenances

#### Additional Indexes (Migration 29)
5. `idx_manutencoes_customizadas_veiculo_ativo` (Partial, Composite)
   - Columns: `(veiculo_id, ativo) WHERE ativo = true`
   - Purpose: Optimize active custom maintenances per vehicle
   - **Benefit**: Faster lookups for active custom maintenances

6. `idx_manutencoes_customizadas_created`
   - Column: `created_at DESC`
   - Purpose: Chronological ordering, pagination

### 3. lembretes_manutencao (11 indexes) ⭐ Most Critical

#### Base Indexes (Migration 25)
1. `idx_lembretes_manutencao_user_id`
   - Column: `user_id`
   - Purpose: RLS policy enforcement

2. `idx_lembretes_manutencao_veiculo_id`
   - Column: `veiculo_id`
   - Purpose: Foreign key, vehicle-specific reminders

3. `idx_lembretes_manutencao_manutencao_id`
   - Column: `manutencao_id`
   - Purpose: Link to maintenance plan or custom maintenance

4. `idx_lembretes_manutencao_status`
   - Column: `status`
   - Purpose: Filter by status (pendente, enviado, cancelado)

5. `idx_lembretes_manutencao_data_prevista`
   - Column: `data_prevista`
   - Purpose: Date-based queries, upcoming reminders

6. `idx_lembretes_manutencao_tipo`
   - Column: `tipo_manutencao`
   - Purpose: Filter by type (plano, customizada)

7. `idx_lembretes_manutencao_pendentes` (Partial, Composite) ⭐ **CRITICAL**
   - Columns: `(status, data_prevista) WHERE status = 'pendente'`
   - Purpose: **Edge function optimization** - find pending reminders to process
   - Query: `SELECT * FROM lembretes_manutencao WHERE status = 'pendente' AND data_prevista <= ?`
   - **Impact**: This is the most important index for the reminder processing job

#### Additional Indexes (Migration 29)
8. `idx_lembretes_manutencao_user_pendentes` (Partial, Composite)
   - Columns: `(user_id, status) WHERE status = 'pendente'`
   - Purpose: User-specific pending reminders
   - Query: `SELECT * FROM lembretes_manutencao WHERE user_id = ? AND status = 'pendente'`

9. `idx_lembretes_manutencao_veiculo_data` (Composite)
   - Columns: `(veiculo_id, data_prevista DESC)`
   - Purpose: Vehicle reminders ordered by date
   - Query: `SELECT * FROM lembretes_manutencao WHERE veiculo_id = ? ORDER BY data_prevista DESC`

10. `idx_lembretes_manutencao_tipo_status` (Composite)
    - Columns: `(tipo_manutencao, status)`
    - Purpose: Filter by maintenance type and status
    - Query: `SELECT * FROM lembretes_manutencao WHERE tipo_manutencao = ? AND status = ?`

11. `idx_lembretes_manutencao_created`
    - Column: `created_at DESC`
    - Purpose: Chronological ordering, audit trail

### 4. webhooks_manutencao (2 indexes)

#### Base Indexes (Migration 26)
1. `idx_webhooks_manutencao_ativo`
   - Column: `ativo`
   - Purpose: Filter active webhooks

#### Additional Indexes (Migration 29)
2. `idx_webhooks_manutencao_ativo_only` (Partial) ⭐ **CRITICAL**
   - Column: `id WHERE ativo = true`
   - Purpose: **Edge function optimization** - quickly find active webhooks
   - Query: `SELECT * FROM webhooks_manutencao WHERE ativo = true`
   - **Impact**: Critical for reminder processing performance
   - **Benefit**: Much smaller index (only active webhooks)

### 5. logs_webhooks_manutencao (7 indexes)

#### Base Indexes (Migration 27)
1. `idx_logs_webhooks_manutencao_webhook_id`
   - Column: `webhook_id`
   - Purpose: Foreign key, webhook-specific logs

2. `idx_logs_webhooks_manutencao_lembrete_id`
   - Column: `lembrete_id`
   - Purpose: Foreign key, reminder-specific logs

3. `idx_logs_webhooks_manutencao_created_at`
   - Column: `created_at DESC`
   - Purpose: Chronological ordering, recent logs

4. `idx_logs_webhooks_manutencao_status_code`
   - Column: `status_code`
   - Purpose: Filter by HTTP status code

5. `idx_logs_webhooks_manutencao_webhook_date` (Composite)
   - Columns: `(webhook_id, created_at DESC)`
   - Purpose: Webhook-specific logs ordered by date

#### Additional Indexes (Migration 29)
6. `idx_logs_webhooks_manutencao_erros` (Partial, Composite)
   - Columns: `(webhook_id, created_at DESC) WHERE erro IS NOT NULL`
   - Purpose: Quickly find failed webhook attempts for debugging
   - Query: `SELECT * FROM logs_webhooks_manutencao WHERE webhook_id = ? AND erro IS NOT NULL`
   - **Benefit**: Smaller index, faster error analysis

7. `idx_logs_webhooks_manutencao_falhas` (Partial, Composite)
   - Columns: `(status_code, created_at DESC) WHERE status_code >= 400`
   - Purpose: Analyze HTTP failures (4xx, 5xx errors)
   - Query: `SELECT * FROM logs_webhooks_manutencao WHERE status_code >= 400`
   - **Benefit**: Quick failure rate analysis

## Index Types

### Simple Indexes (18)
Single column indexes for basic filtering and foreign key optimization.

### Composite Indexes (8)
Multi-column indexes for complex queries:
- `(veiculo_id, ativo)`
- `(user_id, status)`
- `(veiculo_id, data_prevista)`
- `(tipo_manutencao, status)`
- `(status, data_prevista)`
- `(webhook_id, created_at)`
- `(status_code, created_at)`

### Partial Indexes (6) ⭐ **High Performance**
Indexes with WHERE clause for smaller size and faster lookups:
- Active plans only
- Active custom maintenances only
- Pending reminders only
- Active webhooks only
- Logs with errors only
- Failed HTTP requests only

**Benefit**: Partial indexes are typically 10-100x smaller than full indexes, resulting in:
- Faster lookups
- Less memory usage
- Faster updates
- Better cache hit rates

## Performance Considerations

### Critical Paths (Edge Function)

The reminder processing edge function has these critical queries:

1. **Find pending reminders** ⭐ MOST CRITICAL
   ```sql
   SELECT * FROM lembretes_manutencao 
   WHERE status = 'pendente' 
   AND data_prevista <= CURRENT_DATE + dias_antecedencia
   ```
   - Uses: `idx_lembretes_manutencao_pendentes`
   - Expected rows: 0-1000 per day
   - Frequency: Once per day (cron job)

2. **Find active webhooks** ⭐ CRITICAL
   ```sql
   SELECT * FROM webhooks_manutencao WHERE ativo = true
   ```
   - Uses: `idx_webhooks_manutencao_ativo_only`
   - Expected rows: 1-10
   - Frequency: Once per reminder batch

3. **Insert webhook logs**
   ```sql
   INSERT INTO logs_webhooks_manutencao (...)
   ```
   - Uses: All foreign key indexes
   - Expected rows: Same as pending reminders
   - Frequency: Once per reminder

### User-Facing Queries

1. **View vehicle maintenances**
   ```sql
   SELECT * FROM planos_manutencao_veiculo 
   WHERE veiculo_id = ? AND ativo = true
   ```
   - Uses: `idx_planos_manutencao_veiculo_ativo`
   - Expected rows: 5-20 per vehicle
   - Frequency: High (every vehicle detail view)

2. **View upcoming reminders**
   ```sql
   SELECT * FROM lembretes_manutencao 
   WHERE veiculo_id = ? 
   ORDER BY data_prevista DESC
   ```
   - Uses: `idx_lembretes_manutencao_veiculo_data`
   - Expected rows: 5-20 per vehicle
   - Frequency: High (every vehicle detail view)

### Admin Queries

1. **View webhook logs**
   ```sql
   SELECT * FROM logs_webhooks_manutencao 
   WHERE webhook_id = ? 
   ORDER BY created_at DESC 
   LIMIT 100
   ```
   - Uses: `idx_logs_webhooks_manutencao_webhook_date`
   - Expected rows: 100-10000 per webhook
   - Frequency: Medium (admin dashboard)

2. **Analyze failures**
   ```sql
   SELECT * FROM logs_webhooks_manutencao 
   WHERE status_code >= 400 
   ORDER BY created_at DESC
   ```
   - Uses: `idx_logs_webhooks_manutencao_falhas`
   - Expected rows: 0-1000
   - Frequency: Low (troubleshooting)

## Maintenance Recommendations

### Monitor Index Usage
```sql
-- Check index usage statistics
SELECT 
  schemaname, 
  tablename, 
  indexname, 
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
  AND tablename LIKE '%manutencao%'
ORDER BY idx_scan DESC;
```

### Identify Unused Indexes
```sql
-- Find indexes that are never used
SELECT 
  schemaname, 
  tablename, 
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
  AND tablename LIKE '%manutencao%' 
  AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Vacuum and Analyze
```sql
-- Regular maintenance (run weekly)
VACUUM ANALYZE public.planos_manutencao_veiculo;
VACUUM ANALYZE public.manutencoes_customizadas;
VACUUM ANALYZE public.lembretes_manutencao;
VACUUM ANALYZE public.webhooks_manutencao;
VACUUM ANALYZE public.logs_webhooks_manutencao;
```

## Future Optimizations

### If Full-Text Search is Needed
```sql
-- Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index for custom maintenance names
CREATE INDEX idx_manutencoes_customizadas_nome_trgm 
ON public.manutencoes_customizadas 
USING gin(nome gin_trgm_ops);
```

### If Logs Table Grows Too Large
Consider partitioning by date:
```sql
-- Partition logs by month
CREATE TABLE logs_webhooks_manutencao_2025_01 
PARTITION OF logs_webhooks_manutencao
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

## Conclusion

✅ **32 indexes created** covering all common query patterns
✅ **6 partial indexes** for optimal performance on filtered queries
✅ **8 composite indexes** for complex multi-column queries
✅ **Critical paths optimized** for edge function performance
✅ **User queries optimized** for fast UI response times
✅ **Admin queries optimized** for dashboard and troubleshooting

The index strategy balances:
- Query performance (fast lookups)
- Write performance (not too many indexes)
- Storage efficiency (partial indexes where possible)
- Maintenance overhead (reasonable number of indexes)

---
**Last Updated**: 2025-11-26
**Migrations**: 23-29
**Total Indexes**: 32
