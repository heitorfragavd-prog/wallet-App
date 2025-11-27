# Process Recurring Transactions Edge Function

## Overview
This Edge Function processes recurring transactions (receitas and despesas) and automatically creates new transaction instances based on their recurrence schedule.

## Execution Schedule
- **Frequency**: Daily at 00:05 (5 minutes after midnight)
- **Trigger**: pg_cron job configured in migration `39.cron_recurring_transactions.sql`

## Functionality

### What it does:
1. Fetches all active recurring transactions (`ativo = true`)
2. Checks if each transaction should execute today based on:
   - Recurrence type (diária, semanal, mensal, anual)
   - Last execution date (`ultima_execucao`)
   - Start date (`data_inicio`)
   - End date (`data_fim`, if set)
3. Creates new transaction instances in `receitas` or `despesas` tables
4. Updates `ultima_execucao` timestamp for processed transactions

### Recurrence Logic:

#### Diária (Daily)
- Executes if last execution was yesterday or earlier
- Creates one transaction per day

#### Semanal (Weekly)
- Executes on the configured day of week (`dia_semana`: 0-6, where 0 = Sunday)
- Only if at least 7 days have passed since last execution

#### Mensal (Monthly)
- Executes on the configured day of month (`dia_execucao`: 1-31)
- Only if at least 1 month has passed since last execution

#### Anual (Yearly)
- Executes on the same day/month as `data_inicio`
- Only if at least 1 year has passed since last execution

## Request/Response

### Request
```bash
POST /functions/v1/process-recurring-transactions
Content-Type: application/json
Authorization: Bearer <service-role-key>

{}
```

### Response (Success)
```json
{
  "success": true,
  "message": "Transações recorrentes processadas",
  "processed": 5,
  "skipped": 3,
  "failed": 0
}
```

### Response (Error)
```json
{
  "success": false,
  "error": "Error message"
}
```

## Database Tables

### Input: `transacoes_recorrentes`
```sql
- id: UUID
- user_id: UUID
- tipo_transacao: 'receita' | 'despesa'
- descricao: TEXT
- valor: DECIMAL
- categoria_id: UUID (nullable)
- metodo_pagamento: VARCHAR (nullable)
- conta_id: UUID (nullable)
- recorrencia: 'diaria' | 'semanal' | 'mensal' | 'anual'
- dia_execucao: INTEGER (1-31, for monthly)
- dia_semana: INTEGER (0-6, for weekly)
- data_inicio: DATE
- data_fim: DATE (nullable)
- ativo: BOOLEAN
- ultima_execucao: DATE (nullable)
```

### Output: `receitas` or `despesas`
```sql
- user_id: UUID
- descricao: TEXT
- valor: DECIMAL
- data: DATE (today's date)
- categoria_id: UUID (nullable)
- metodo_pagamento: VARCHAR (nullable)
- conta_id: UUID (nullable)
- recorrencia_id: UUID (reference to transacoes_recorrentes)
```

## Manual Execution

You can manually trigger the function for testing:

```bash
curl -X POST \
  'https://your-project.supabase.co/functions/v1/process-recurring-transactions' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

## Monitoring

### Check cron job status:
```sql
SELECT * FROM cron.job WHERE jobname = 'process-recurring-transactions';
```

### View cron job history:
```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-recurring-transactions')
ORDER BY start_time DESC 
LIMIT 10;
```

### Check recent executions:
```sql
SELECT 
  id,
  descricao,
  tipo_transacao,
  recorrencia,
  ultima_execucao,
  ativo
FROM transacoes_recorrentes
WHERE ativo = true
ORDER BY ultima_execucao DESC;
```

## Error Handling

- **Transaction creation fails**: Logged and counted in `failed` counter
- **Update ultima_execucao fails**: Logged but doesn't stop processing
- **Invalid recurrence config**: Transaction is skipped
- **Past end date**: Transaction is skipped (filtered in query)

## Configuration

### Required Environment Variables:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (bypasses RLS)

### Database Configuration:
```sql
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
```

## Testing

### Create a test recurring transaction:
```sql
INSERT INTO transacoes_recorrentes (
  user_id,
  tipo_transacao,
  descricao,
  valor,
  recorrencia,
  data_inicio,
  ativo
) VALUES (
  'your-user-id',
  'despesa',
  'Teste Recorrente Diário',
  100.00,
  'diaria',
  CURRENT_DATE,
  true
);
```

### Manually trigger the function and check results:
```bash
# Trigger function
curl -X POST 'https://your-project.supabase.co/functions/v1/process-recurring-transactions' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY'

# Check created transactions
SELECT * FROM despesas WHERE recorrencia_id IS NOT NULL ORDER BY created_at DESC LIMIT 5;
```

## Troubleshooting

### Function not executing:
1. Check if cron job is scheduled: `SELECT * FROM cron.job;`
2. Check cron job logs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC;`
3. Verify database configuration settings are set

### Transactions not being created:
1. Check if recurring transactions are active: `SELECT * FROM transacoes_recorrentes WHERE ativo = true;`
2. Verify `data_inicio` is not in the future
3. Check if `data_fim` has not passed
4. Review function logs in Supabase dashboard

### Duplicate transactions:
1. Check `ultima_execucao` is being updated correctly
2. Verify cron job is not running multiple times
3. Review recurrence logic for the specific type
