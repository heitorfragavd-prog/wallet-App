# Testes - Edge Function: processar-lembretes-manutencao

## Visão Geral

Esta Edge Function processa lembretes de manutenção de veículos e envia webhooks para URLs configuradas. Os testes cobrem os principais cenários de uso e casos de erro.

## Cenários de Teste

### 1. ✅ Teste: Nenhum webhook ativo configurado

**Objetivo**: Verificar que a função retorna sucesso quando não há webhooks ativos

**Setup**:
```sql
-- Desativar todos os webhooks
UPDATE webhooks_manutencao SET ativo = false;
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Resultado Esperado**:
```json
{
  "success": true,
  "message": "Nenhum webhook ativo configurado",
  "processed": 0
}
```

**Status**: HTTP 200

---

### 2. ✅ Teste: Nenhum lembrete pendente

**Objetivo**: Verificar que a função retorna sucesso quando não há lembretes para processar

**Setup**:
```sql
-- Ativar pelo menos um webhook
UPDATE webhooks_manutencao SET ativo = true LIMIT 1;

-- Garantir que não há lembretes pendentes
UPDATE lembretes_manutencao SET status = 'enviado' WHERE status = 'pendente';
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Resultado Esperado**:
```json
{
  "success": true,
  "message": "Nenhum lembrete pendente",
  "processed": 0
}
```

**Status**: HTTP 200

---

### 3. ✅ Teste: Envio bem-sucedido de webhook

**Objetivo**: Verificar que webhooks são enviados corretamente para lembretes válidos

**Setup**:
```sql
-- Criar webhook de teste (usar webhook.site ou similar)
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste', 'https://webhook.site/[seu-id]', true, 3, 5);

-- Criar lembrete pendente que deve ser enviado hoje
INSERT INTO lembretes_manutencao (
  user_id,
  veiculo_id,
  manutencao_id,
  tipo_manutencao,
  data_prevista,
  dias_antecedencia,
  status
) VALUES (
  '[user-id]',
  '[veiculo-id]',
  '[manutencao-id]',
  'plano',
  CURRENT_DATE + INTERVAL '7 days', -- Data prevista daqui a 7 dias
  7, -- Enviar 7 dias antes (ou seja, hoje!)
  'pendente'
);
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Resultado Esperado**:
```json
{
  "success": true,
  "message": "Lembretes processados",
  "total_pendentes": 1,
  "para_enviar": 1,
  "processed": 1,
  "failed": 0
}
```

**Validações**:
- ✅ Webhook recebido em webhook.site
- ✅ Payload contém todos os campos esperados
- ✅ Status do lembrete atualizado para "enviado"
- ✅ Log criado em `logs_webhooks_manutencao`

**Payload Esperado**:
```json
{
  "tipo": "lembrete_manutencao",
  "timestamp": "2025-11-27T...",
  "veiculo": {
    "id": "...",
    "marca": "Yamaha",
    "modelo": "Factor 125",
    "placa": "ABC-1234",
    "quilometragem": 10000
  },
  "manutencao": {
    "tipo": "Troca de Óleo",
    "sistema": "Motor",
    "data_prevista": "2025-12-04",
    "intervalo_km": 5000
  },
  "usuario": {
    "id": "...",
    "nome": "João Silva",
    "telefone": "+5511999999999",
    "email": "joao@example.com"
  },
  "lembrete": {
    "id": "...",
    "dias_antecedencia": 7
  }
}
```

---

### 4. ✅ Teste: Retry logic em caso de falha

**Objetivo**: Verificar que a função tenta reenviar webhooks em caso de falha

**Setup**:
```sql
-- Criar webhook com URL inválida
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Falha', 'https://url-invalida-que-nao-existe.com', true, 3, 2);

-- Criar lembrete pendente
INSERT INTO lembretes_manutencao (...)
VALUES (...);
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Resultado Esperado**:
```json
{
  "success": true,
  "message": "Lembretes processados",
  "total_pendentes": 1,
  "para_enviar": 1,
  "processed": 0,
  "failed": 1
}
```

**Validações**:
- ✅ 3 tentativas de envio registradas em `logs_webhooks_manutencao`
- ✅ Cada tentativa tem `tentativa` = 1, 2, 3
- ✅ Campo `erro` preenchido com mensagem de erro
- ✅ Status do lembrete permanece "pendente" (não foi enviado)

---

### 5. ✅ Teste: Timeout de webhook

**Objetivo**: Verificar que webhooks com timeout são tratados corretamente

**Setup**:
```sql
-- Criar webhook com URL que demora mais de 10 segundos
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES ('Teste Timeout', 'https://httpstat.us/200?sleep=15000', true, 2, 1);
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Validações**:
- ✅ Log registra erro "Timeout ao enviar webhook (>10s)"
- ✅ 2 tentativas realizadas
- ✅ Status do lembrete permanece "pendente"

---

### 6. ✅ Teste: Webhook com autenticação

**Objetivo**: Verificar que header de autenticação é enviado corretamente

**Setup**:
```sql
-- Criar webhook com auth_header
INSERT INTO webhooks_manutencao (
  nome, 
  url, 
  ativo, 
  retry_attempts, 
  retry_delay_seconds,
  auth_header
) VALUES (
  'Teste Auth', 
  'https://webhook.site/[seu-id]', 
  true, 
  3, 
  5,
  'Bearer meu-token-secreto'
);
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Validações**:
- ✅ Webhook recebido com header `Authorization: Bearer meu-token-secreto`
- ✅ Payload enviado corretamente

---

### 7. ✅ Teste: Lembrete com veículo não encontrado

**Objetivo**: Verificar tratamento de erro quando veículo não existe

**Setup**:
```sql
-- Criar lembrete com veiculo_id inválido
INSERT INTO lembretes_manutencao (
  user_id,
  veiculo_id,
  manutencao_id,
  tipo_manutencao,
  data_prevista,
  dias_antecedencia,
  status
) VALUES (
  '[user-id]',
  '00000000-0000-0000-0000-000000000000', -- ID inválido
  '[manutencao-id]',
  'plano',
  CURRENT_DATE,
  0,
  'pendente'
);
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Validações**:
- ✅ Lembrete marcado como "cancelado"
- ✅ Campo `webhook_response` = "Veículo não encontrado"
- ✅ Nenhum webhook enviado

---

### 8. ✅ Teste: Múltiplos webhooks ativos

**Objetivo**: Verificar que todos os webhooks ativos recebem o lembrete

**Setup**:
```sql
-- Criar 3 webhooks ativos
INSERT INTO webhooks_manutencao (nome, url, ativo, retry_attempts, retry_delay_seconds)
VALUES 
  ('Webhook 1', 'https://webhook.site/[id-1]', true, 3, 5),
  ('Webhook 2', 'https://webhook.site/[id-2]', true, 3, 5),
  ('Webhook 3', 'https://webhook.site/[id-3]', true, 3, 5);

-- Criar 1 lembrete pendente
INSERT INTO lembretes_manutencao (...) VALUES (...);
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Validações**:
- ✅ 3 logs criados em `logs_webhooks_manutencao` (um para cada webhook)
- ✅ Todos os 3 webhooks receberam o payload
- ✅ Lembrete marcado como "enviado"

---

### 9. ✅ Teste: Filtro de data de envio

**Objetivo**: Verificar que apenas lembretes com data de envio <= hoje são processados

**Setup**:
```sql
-- Criar 3 lembretes:
-- 1. Deve ser enviado hoje (data_prevista - dias_antecedencia = hoje)
INSERT INTO lembretes_manutencao (...)
VALUES (..., CURRENT_DATE + INTERVAL '7 days', 7, 'pendente');

-- 2. Deve ser enviado amanhã (data_prevista - dias_antecedencia = amanhã)
INSERT INTO lembretes_manutencao (...)
VALUES (..., CURRENT_DATE + INTERVAL '8 days', 7, 'pendente');

-- 3. Já passou da data (data_prevista - dias_antecedencia < hoje)
INSERT INTO lembretes_manutencao (...)
VALUES (..., CURRENT_DATE - INTERVAL '1 day', 7, 'pendente');
```

**Execução**:
```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]"
```

**Resultado Esperado**:
```json
{
  "success": true,
  "message": "Lembretes processados",
  "total_pendentes": 3,
  "para_enviar": 2, // Apenas lembretes 1 e 3
  "processed": 2,
  "failed": 0
}
```

---

## Testes Manuais via Supabase Dashboard

### Executar função manualmente

1. Acesse o Supabase Dashboard
2. Vá em "Edge Functions"
3. Selecione "processar-lembretes-manutencao"
4. Clique em "Invoke"
5. Verifique os logs

### Verificar logs

```sql
-- Ver logs de webhooks enviados
SELECT 
  l.*,
  w.nome as webhook_nome,
  lm.data_prevista
FROM logs_webhooks_manutencao l
JOIN webhooks_manutencao w ON l.webhook_id = w.id
JOIN lembretes_manutencao lm ON l.lembrete_id = lm.id
ORDER BY l.created_at DESC
LIMIT 10;

-- Ver lembretes processados
SELECT 
  id,
  status,
  webhook_enviado_em,
  webhook_response,
  data_prevista,
  dias_antecedencia
FROM lembretes_manutencao
WHERE status IN ('enviado', 'cancelado')
ORDER BY webhook_enviado_em DESC
LIMIT 10;
```

## Ferramentas Úteis

### Webhook.site
- URL: https://webhook.site
- Gera URLs temporárias para receber webhooks
- Mostra payload, headers e response

### HTTPStat.us
- URL: https://httpstat.us
- Simula diferentes status codes
- Permite adicionar delay: `https://httpstat.us/200?sleep=5000`

### RequestBin
- URL: https://requestbin.com
- Similar ao webhook.site
- Permite criar bins privados

## Checklist de Testes

- [ ] Nenhum webhook ativo configurado
- [ ] Nenhum lembrete pendente
- [ ] Envio bem-sucedido de webhook
- [ ] Retry logic em caso de falha
- [ ] Timeout de webhook
- [ ] Webhook com autenticação
- [ ] Lembrete com veículo não encontrado
- [ ] Múltiplos webhooks ativos
- [ ] Filtro de data de envio correto
- [ ] Manutenção customizada (não apenas plano)
- [ ] Perfil de usuário não encontrado
- [ ] Plano de manutenção não encontrado

## Notas

- A função usa `SUPABASE_SERVICE_ROLE_KEY` para bypass RLS
- Timeout de webhook é fixo em 10 segundos
- Logs são criados para cada tentativa de envio
- Lembretes cancelados não são reprocessados
- A função é idempotente (pode ser executada múltiplas vezes)

## Próximos Passos

1. Implementar testes automatizados com Deno Test
2. Adicionar métricas de performance
3. Implementar alertas para falhas consecutivas
4. Adicionar suporte a webhooks assíncronos (queue)
