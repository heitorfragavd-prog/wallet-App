# Testes de Retry Logic - Edge Function

## Visão Geral

A Edge Function `processar-lembretes-manutencao` implementa retry logic robusto para garantir que webhooks sejam entregues mesmo em caso de falhas temporárias.

## Comportamento do Retry

### Configuração
- **retry_attempts**: Número máximo de tentativas (configurável por webhook)
- **retry_delay_seconds**: Delay entre tentativas em segundos (configurável por webhook)
- **timeout**: 10 segundos fixos por tentativa

### Fluxo de Retry
```
Tentativa 1 → Falha → Aguardar delay → Tentativa 2 → Falha → Aguardar delay → Tentativa 3 → Falha → Desistir
```

### Condições de Retry
O sistema tenta novamente quando:
- ✅ Status HTTP >= 400 (erro do cliente ou servidor)
- ✅ Timeout (>10 segundos)
- ✅ Erro de rede (DNS, conexão recusada, etc)
- ✅ Erro de parsing de resposta

O sistema NÃO tenta novamente quando:
- ❌ Status HTTP 2xx (sucesso)
- ❌ Todas as tentativas foram esgotadas

## Cenários de Teste

### 1. ✅ Teste: Retry com sucesso na 2ª tentativa

**Objetivo**: Verificar que o sistema tenta novamente e tem sucesso

**Setup**:
```sql
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Retry', 'https://httpstat.us/500,200', true, 3, 2);
-- URL retorna 500 na 1ª chamada, 200 na 2ª
```

**Resultado Esperado**:
- 2 logs criados em `logs_webhooks_manutencao`
- Log 1: `tentativa = 1`, `status_code = 500`
- Log 2: `tentativa = 2`, `status_code = 200`
- Lembrete marcado como "enviado"

---

### 2. ✅ Teste: Retry com falha em todas as tentativas

**Objetivo**: Verificar que o sistema desiste após esgotar tentativas

**Setup**:
```sql
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Falha Total', 'https://httpstat.us/500', true, 3, 1);
```

**Resultado Esperado**:
- 3 logs criados
- Todos com `status_code = 500`
- `tentativa` = 1, 2, 3
- Lembrete permanece "pendente"
- Tempo total ≈ 2 segundos de delay (1s + 1s entre tentativas)

---

### 3. ✅ Teste: Retry com diferentes status codes

**Objetivo**: Verificar comportamento com diferentes erros HTTP

**Cenários**:

| Status Code | Descrição | Deve Retry? |
|-------------|-----------|-------------|
| 200 | OK | ❌ Não |
| 201 | Created | ❌ Não |
| 400 | Bad Request | ✅ Sim |
| 401 | Unauthorized | ✅ Sim |
| 403 | Forbidden | ✅ Sim |
| 404 | Not Found | ✅ Sim |
| 429 | Too Many Requests | ✅ Sim |
| 500 | Internal Server Error | ✅ Sim |
| 502 | Bad Gateway | ✅ Sim |
| 503 | Service Unavailable | ✅ Sim |
| 504 | Gateway Timeout | ✅ Sim |

**Setup para cada status**:
```sql
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste 400', 'https://httpstat.us/400', true, 2, 1);
```

**Validação**:
```sql
SELECT 
  status_code,
  COUNT(*) as total_tentativas,
  MAX(tentativa) as max_tentativa
FROM logs_webhooks_manutencao
WHERE webhook_id = '[webhook-id]'
GROUP BY status_code;
```

---

### 4. ✅ Teste: Retry com timeout

**Objetivo**: Verificar que timeouts são tratados como falhas

**Setup**:
```sql
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Timeout', 'https://httpstat.us/200?sleep=15000', true, 3, 1);
-- Sleep de 15s > timeout de 10s
```

**Resultado Esperado**:
- 3 logs criados
- Todos com `status_code = null`
- `erro` = "Timeout ao enviar webhook (>10s)"
- `tentativa` = 1, 2, 3
- Tempo total ≈ 32 segundos (10s timeout + 1s delay) × 3 + delays

---

### 5. ✅ Teste: Retry com erro de rede

**Objetivo**: Verificar tratamento de erros de conexão

**Setup**:
```sql
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Rede', 'https://url-que-nao-existe-12345.com', true, 3, 1);
```

**Resultado Esperado**:
- 3 logs criados
- `status_code = null`
- `erro` contém mensagem de erro de DNS/conexão
- `tentativa` = 1, 2, 3

---

### 6. ✅ Teste: Delay entre tentativas

**Objetivo**: Verificar que o delay é respeitado

**Setup**:
```sql
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Delay', 'https://httpstat.us/500', true, 3, 5);
-- Delay de 5 segundos
```

**Medição**:
```sql
SELECT 
  tentativa,
  created_at,
  LAG(created_at) OVER (ORDER BY tentativa) as tentativa_anterior,
  EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY tentativa))) as segundos_entre_tentativas
FROM logs_webhooks_manutencao
WHERE webhook_id = '[webhook-id]'
ORDER BY tentativa;
```

**Resultado Esperado**:
- Tentativa 1 → Tentativa 2: ≈ 5 segundos
- Tentativa 2 → Tentativa 3: ≈ 5 segundos

---

### 7. ✅ Teste: Retry com múltiplos webhooks

**Objetivo**: Verificar que retry é independente por webhook

**Setup**:
```sql
-- Webhook 1: Falha sempre
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Webhook Falha', 'https://httpstat.us/500', true, 2, 1);

-- Webhook 2: Sucesso sempre
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Webhook Sucesso', 'https://httpstat.us/200', true, 2, 1);

-- Criar 1 lembrete
INSERT INTO lembretes_manutencao (...) VALUES (...);
```

**Resultado Esperado**:
- Webhook 1: 2 logs com falha
- Webhook 2: 1 log com sucesso
- Lembrete marcado como "enviado" (pelo menos 1 webhook teve sucesso)

---

### 8. ✅ Teste: Configuração de retry por webhook

**Objetivo**: Verificar que cada webhook pode ter configuração diferente

**Setup**:
```sql
-- Webhook 1: 2 tentativas, delay 1s
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Webhook A', 'https://httpstat.us/500', true, 2, 1);

-- Webhook 2: 5 tentativas, delay 3s
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Webhook B', 'https://httpstat.us/500', true, 5, 3);
```

**Resultado Esperado**:
- Webhook A: 2 logs
- Webhook B: 5 logs
- Delays diferentes entre tentativas

---

### 9. ✅ Teste: Retry não ocorre em caso de sucesso

**Objetivo**: Verificar que sucesso na 1ª tentativa não gera retries

**Setup**:
```sql
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Sucesso', 'https://httpstat.us/200', true, 5, 2);
```

**Resultado Esperado**:
- Apenas 1 log criado
- `tentativa = 1`
- `status_code = 200`
- Tempo total < 1 segundo

---

### 10. ✅ Teste: Retry com resposta parcial

**Objetivo**: Verificar tratamento de respostas incompletas

**Setup**:
```sql
-- Simular servidor que fecha conexão no meio da resposta
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Parcial', 'https://httpstat.us/200?sleep=5000', true, 3, 1);
```

**Nota**: Difícil simular sem servidor customizado

---

## Testes Automatizados

### Executar testes Deno

```bash
# Todos os testes
deno test --allow-env --allow-net supabase/functions/processar-lembretes-manutencao/

# Apenas testes de retry
deno test --allow-env --allow-net --filter "retry" supabase/functions/processar-lembretes-manutencao/
```

### Testes unitários existentes

1. ✅ `enviarWebhook - deve fazer retry em caso de falha`
   - Verifica 3 tentativas
   - Confirma que todas falham
   - Valida contador de tentativas

2. ✅ `enviarWebhook - deve enviar webhook com sucesso`
   - Verifica sucesso na 1ª tentativa
   - Confirma que não há retries desnecessários

## Métricas de Retry

### Queries úteis para análise

```sql
-- Taxa de sucesso por tentativa
SELECT 
  tentativa,
  COUNT(*) as total,
  SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as sucessos,
  ROUND(100.0 * SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso
FROM logs_webhooks_manutencao
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY tentativa
ORDER BY tentativa;

-- Webhooks que mais precisam de retry
SELECT 
  w.nome,
  w.url,
  COUNT(*) as total_tentativas,
  COUNT(DISTINCT l.lembrete_id) as lembretes_unicos,
  AVG(l.tentativa) as media_tentativas,
  MAX(l.tentativa) as max_tentativas
FROM logs_webhooks_manutencao l
JOIN webhooks_manutencao w ON l.webhook_id = w.id
WHERE l.created_at >= NOW() - INTERVAL '7 days'
GROUP BY w.id, w.nome, w.url
HAVING AVG(l.tentativa) > 1
ORDER BY media_tentativas DESC;

-- Tempo médio entre tentativas
SELECT 
  webhook_id,
  AVG(segundos_entre_tentativas) as media_delay_segundos
FROM (
  SELECT 
    webhook_id,
    tentativa,
    EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY webhook_id, lembrete_id ORDER BY tentativa))) as segundos_entre_tentativas
  FROM logs_webhooks_manutencao
  WHERE tentativa > 1
) sub
GROUP BY webhook_id;

-- Erros mais comuns
SELECT 
  COALESCE(erro, 'HTTP ' || status_code::text) as tipo_erro,
  COUNT(*) as ocorrencias,
  COUNT(DISTINCT webhook_id) as webhooks_afetados
FROM logs_webhooks_manutencao
WHERE status_code IS NULL OR status_code >= 400
GROUP BY tipo_erro
ORDER BY ocorrencias DESC
LIMIT 10;
```

## Recomendações

### Configuração Ideal de Retry

| Tipo de Webhook | retry_attempts | retry_delay_seconds | Justificativa |
|-----------------|----------------|---------------------|---------------|
| Crítico | 5 | 10 | Máxima resiliência |
| Normal | 3 | 5 | Balanceado |
| Não-crítico | 2 | 2 | Rápido fail-fast |
| Teste/Debug | 1 | 0 | Sem retry |

### Boas Práticas

1. **Monitorar taxa de retry**: Se > 50% dos webhooks precisam de retry, investigar
2. **Ajustar delays**: Aumentar delay se servidor destino tem rate limiting
3. **Alertar falhas**: Configurar alerta se webhook falha 3+ vezes consecutivas
4. **Limpar logs antigos**: Manter apenas últimos 30 dias
5. **Timeout adequado**: 10s é razoável, mas pode ser ajustado se necessário

### Melhorias Futuras

- [ ] Exponential backoff (delay crescente: 1s, 2s, 4s, 8s...)
- [ ] Circuit breaker (parar de tentar se webhook está consistentemente falhando)
- [ ] Webhook queue (processar assincronamente)
- [ ] Priorização (webhooks críticos primeiro)
- [ ] Notificação de falhas persistentes

## Checklist de Testes

- [x] Retry com sucesso na 2ª tentativa
- [x] Retry com falha em todas as tentativas
- [x] Diferentes status codes (4xx, 5xx)
- [x] Timeout (>10s)
- [x] Erro de rede/DNS
- [x] Delay entre tentativas respeitado
- [x] Retry independente por webhook
- [x] Configuração diferente por webhook
- [x] Sem retry em caso de sucesso
- [ ] Resposta parcial/incompleta

## Conclusão

O retry logic está implementado de forma robusta e configurável. Os testes cobrem os principais cenários de falha e garantem que o sistema tenta reenviar webhooks de forma inteligente, respeitando os limites configurados.
