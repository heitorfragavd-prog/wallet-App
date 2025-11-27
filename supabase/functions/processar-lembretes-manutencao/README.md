# Edge Function: Processar Lembretes de Manutenção

## Visão Geral

Esta edge function processa lembretes de manutenção de veículos pendentes e envia notificações via webhook configurado no painel administrativo.

## Funcionalidades

### 1. Busca de Lembretes Pendentes
- Busca todos os lembretes com status `pendente`
- Filtra lembretes que devem ser enviados hoje (baseado em `data_prevista` e `dias_antecedencia`)
- Carrega dados relacionados (veículo, manutenção, usuário)

### 2. Envio de Webhooks
- Envia payload estruturado para todos os webhooks ativos
- Suporta autenticação via header (Bearer token)
- Timeout de 10 segundos por requisição

### 3. Retry Logic
- Tenta enviar webhook múltiplas vezes em caso de falha
- Número de tentativas configurável por webhook (`retry_attempts`)
- Delay entre tentativas configurável (`retry_delay_seconds`)

### 4. Logging Completo
- Registra todas as tentativas de envio em `logs_webhooks_manutencao`
- Armazena payload, status code, resposta e erros
- Facilita troubleshooting e auditoria

### 5. Atualização de Status
- Marca lembretes como `enviado` após sucesso
- Marca como `cancelado` se dados relacionados não forem encontrados
- Registra timestamp de envio

## Payload do Webhook

```json
{
  "tipo": "lembrete_manutencao",
  "timestamp": "2025-11-26T10:00:00.000Z",
  "veiculo": {
    "id": "uuid",
    "marca": "Yamaha",
    "modelo": "Factor 125",
    "placa": "ABC-1234",
    "quilometragem": 25000
  },
  "manutencao": {
    "tipo": "Troca de Óleo",
    "sistema": "Motor",
    "data_prevista": "2025-12-01",
    "intervalo_km": 5000
  },
  "usuario": {
    "id": "uuid",
    "nome": "João Silva",
    "telefone": "+5511999999999",
    "email": "joao@example.com"
  },
  "lembrete": {
    "id": "uuid",
    "dias_antecedencia": 7
  }
}
```

## Fluxo de Execução

```
1. Buscar webhooks ativos
   ↓
2. Buscar lembretes pendentes
   ↓
3. Filtrar lembretes para enviar hoje
   ↓
4. Para cada lembrete:
   ├─ Buscar dados do veículo
   ├─ Buscar dados da manutenção (plano ou customizada)
   ├─ Buscar dados do usuário
   ├─ Construir payload
   ├─ Enviar para todos os webhooks
   │  ├─ Tentativa 1
   │  ├─ Se falhar: aguardar e tentar novamente
   │  ├─ Tentativa 2
   │  └─ ...até retry_attempts
   ├─ Registrar logs
   └─ Atualizar status do lembrete
```

## Configuração

### 1. Variáveis de Ambiente

A function usa as seguintes variáveis de ambiente (configuradas automaticamente pelo Supabase):

- `SUPABASE_URL` - URL do projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypass RLS)

### 2. Webhooks

Configure webhooks no painel admin (`/admin/webhooks/manutencao`):

- **Nome**: Nome descritivo do webhook
- **URL**: Endpoint que receberá as notificações
- **Ativo**: Se o webhook está ativo
- **Dias de Antecedência Padrão**: Quantos dias antes da manutenção enviar
- **Retry Attempts**: Número de tentativas em caso de falha (padrão: 3)
- **Retry Delay**: Segundos entre tentativas (padrão: 300 = 5 minutos)
- **Auth Header**: Header de autenticação opcional (ex: `Bearer token123`)

### 3. Cron Job

O cron job está configurado para executar diariamente às 8h (horário do servidor).

Para alterar o horário, edite a migration `30.cron_lembretes_manutencao.sql`.

## Execução Manual

### Via curl

```bash
curl -X POST 'https://seu-projeto.supabase.co/functions/v1/processar-lembretes-manutencao' \
  -H 'Authorization: Bearer SUA_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

### Via Supabase Dashboard

1. Acesse Functions no dashboard
2. Selecione `processar-lembretes-manutencao`
3. Clique em "Invoke"

### Via SQL (trigger do cron)

```sql
SELECT
  net.http_post(
    url := 'https://seu-projeto.supabase.co/functions/v1/processar-lembretes-manutencao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SUA_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
```

## Resposta da Function

### Sucesso

```json
{
  "success": true,
  "message": "Lembretes processados",
  "total_pendentes": 10,
  "para_enviar": 5,
  "processed": 4,
  "failed": 1
}
```

### Erro

```json
{
  "success": false,
  "error": "Mensagem de erro"
}
```

## Monitoramento

### 1. Verificar Execuções do Cron

```sql
SELECT * FROM cron.job_run_details 
WHERE jobname = 'processar-lembretes-manutencao' 
ORDER BY start_time DESC 
LIMIT 10;
```

### 2. Verificar Logs de Webhooks

```sql
SELECT 
  l.*,
  w.nome as webhook_nome,
  lm.data_prevista
FROM logs_webhooks_manutencao l
JOIN webhooks_manutencao w ON w.id = l.webhook_id
JOIN lembretes_manutencao lm ON lm.id = l.lembrete_id
ORDER BY l.created_at DESC
LIMIT 20;
```

### 3. Verificar Lembretes Pendentes

```sql
SELECT 
  lm.*,
  v.marca,
  v.modelo,
  v.placa
FROM lembretes_manutencao lm
JOIN veiculos v ON v.id = lm.veiculo_id
WHERE lm.status = 'pendente'
ORDER BY lm.data_prevista;
```

### 4. Verificar Taxa de Sucesso

```sql
SELECT 
  COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as sucessos,
  COUNT(*) FILTER (WHERE status_code >= 400 OR erro IS NOT NULL) as falhas,
  COUNT(*) as total,
  ROUND(
    COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::numeric / 
    COUNT(*)::numeric * 100, 
    2
  ) as taxa_sucesso_pct
FROM logs_webhooks_manutencao
WHERE created_at >= NOW() - INTERVAL '7 days';
```

## Troubleshooting

### Problema: Nenhum lembrete sendo processado

**Possíveis causas:**
1. Nenhum webhook ativo configurado
2. Nenhum lembrete pendente
3. Data de envio ainda não chegou

**Solução:**
```sql
-- Verificar webhooks ativos
SELECT * FROM webhooks_manutencao WHERE ativo = true;

-- Verificar lembretes pendentes
SELECT * FROM lembretes_manutencao WHERE status = 'pendente';

-- Verificar cálculo de data de envio
SELECT 
  id,
  data_prevista,
  dias_antecedencia,
  data_prevista - INTERVAL '1 day' * dias_antecedencia as data_envio,
  CURRENT_DATE as hoje
FROM lembretes_manutencao
WHERE status = 'pendente';
```

### Problema: Webhooks falhando

**Possíveis causas:**
1. URL incorreta
2. Timeout (>10s)
3. Servidor de destino fora do ar
4. Autenticação incorreta

**Solução:**
```sql
-- Ver logs de falhas
SELECT * FROM logs_webhooks_manutencao 
WHERE erro IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 10;

-- Testar webhook manualmente
-- Use curl ou Postman para testar a URL do webhook
```

### Problema: Cron job não executando

**Possíveis causas:**
1. pg_cron não habilitado
2. Configurações do sistema não definidas
3. Horário incorreto (timezone)

**Solução:**
```sql
-- Verificar se pg_cron está habilitado
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Verificar jobs agendados
SELECT * FROM cron.job;

-- Verificar últimas execuções
SELECT * FROM cron.job_run_details 
WHERE jobname = 'processar-lembretes-manutencao'
ORDER BY start_time DESC;
```

## Performance

### Otimizações Implementadas

1. **Índices**: Todos os índices necessários foram criados (migration 29)
2. **Batch Processing**: Processa múltiplos lembretes em uma execução
3. **Timeout**: Limita tempo de espera por webhook (10s)
4. **Service Role**: Bypassa RLS para performance máxima

### Métricas Esperadas

- **Tempo de execução**: ~100ms para 1000 lembretes (sem envio de webhook)
- **Tempo por webhook**: ~1-2s (incluindo retry)
- **Throughput**: ~500 lembretes/minuto

## Segurança

### Medidas Implementadas

1. **Service Role**: Function usa service_role_key (não exposta ao cliente)
2. **RLS Bypass**: Necessário para acessar dados de todos os usuários
3. **CORS**: Configurado para permitir apenas origens confiáveis
4. **Autenticação**: Webhooks podem ter autenticação via header
5. **Timeout**: Previne requisições infinitas

### Dados Sensíveis

A function acessa:
- Dados de veículos (marca, modelo, placa)
- Dados de usuários (nome, telefone, email)
- Dados de manutenções

**Importante**: Certifique-se de que os webhooks de destino são confiáveis e seguros.

## Desenvolvimento

### Estrutura do Código

```typescript
// Interfaces TypeScript
interface LembreteManutencao { ... }
interface Veiculo { ... }
interface Profile { ... }
// ...

// Handler principal
serve(async (req) => {
  // 1. CORS
  // 2. Criar cliente Supabase
  // 3. Buscar webhooks ativos
  // 4. Buscar lembretes pendentes
  // 5. Filtrar lembretes para enviar
  // 6. Processar cada lembrete
  // 7. Retornar resultado
});

// Função auxiliar
async function enviarWebhook(...) {
  // 1. Loop de retry
  // 2. Enviar requisição HTTP
  // 3. Registrar log
  // 4. Retornar sucesso/falha
}
```

### Testes Locais

```bash
# Instalar Supabase CLI
npm install -g supabase

# Iniciar Supabase local
supabase start

# Servir function localmente
supabase functions serve processar-lembretes-manutencao

# Testar function
curl -X POST 'http://localhost:54321/functions/v1/processar-lembretes-manutencao' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'Content-Type: application/json'
```

## Deploy

### Via Supabase CLI

```bash
# Deploy da function
supabase functions deploy processar-lembretes-manutencao

# Verificar deploy
supabase functions list
```

### Via Dashboard

1. Acesse Functions no dashboard
2. Clique em "Deploy new function"
3. Selecione o arquivo `index.ts`
4. Clique em "Deploy"

## Changelog

### v1.0.0 (2025-11-26)
- ✅ Implementação inicial
- ✅ Busca de lembretes pendentes
- ✅ Envio de webhooks com retry
- ✅ Logging completo
- ✅ Suporte a planos e manutenções customizadas
- ✅ Configuração de cron job

## Roadmap

### Futuras Melhorias

- [ ] Suporte a múltiplos idiomas no payload
- [ ] Webhook templates personalizáveis
- [ ] Notificações via email/SMS direto
- [ ] Dashboard de monitoramento em tempo real
- [ ] Alertas automáticos em caso de falhas
- [ ] Suporte a webhooks assíncronos (queue)

---

**Autor**: Sistema de Manutenção de Veículos
**Versão**: 1.0.0
**Data**: 2025-11-26
