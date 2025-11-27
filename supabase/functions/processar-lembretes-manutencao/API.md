# API de Webhooks - Sistema de Manutenção de Veículos

## Visão Geral

A API de webhooks permite que sistemas externos recebam notificações automáticas quando manutenções de veículos estão próximas de vencer. O sistema processa lembretes diariamente e envia webhooks para URLs configuradas.

## Endpoints

### Edge Function: processar-lembretes-manutencao

**URL**: `https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao`

**Método**: `POST`

**Autenticação**: Requer `Authorization: Bearer [anon-key]` ou `service_role_key`

**Descrição**: Processa lembretes pendentes e envia webhooks para URLs configuradas.

#### Request

```bash
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json"
```

Não requer body. A função busca automaticamente lembretes pendentes.

#### Response

**Sucesso (200 OK)**:
```json
{
  "success": true,
  "message": "Lembretes processados",
  "total_pendentes": 5,
  "para_enviar": 3,
  "processed": 3,
  "failed": 0
}
```

**Nenhum webhook ativo (200 OK)**:
```json
{
  "success": true,
  "message": "Nenhum webhook ativo configurado",
  "processed": 0
}
```

**Nenhum lembrete pendente (200 OK)**:
```json
{
  "success": true,
  "message": "Nenhum lembrete pendente",
  "processed": 0
}
```

**Erro (500 Internal Server Error)**:
```json
{
  "success": false,
  "error": "Mensagem de erro detalhada"
}
```

#### Campos da Response

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `success` | boolean | Indica se a operação foi bem-sucedida |
| `message` | string | Mensagem descritiva do resultado |
| `total_pendentes` | number | Total de lembretes pendentes encontrados |
| `para_enviar` | number | Lembretes que devem ser enviados hoje |
| `processed` | number | Lembretes processados com sucesso |
| `failed` | number | Lembretes que falharam ao processar |
| `error` | string | Mensagem de erro (apenas em caso de falha) |

---

## Webhook Payload

Quando um lembrete é processado, o sistema envia um POST para cada webhook ativo configurado.

### Request do Webhook

**Método**: `POST`

**Headers**:
```
Content-Type: application/json
Authorization: [auth_header configurado] (opcional)
```

**Body**:
```json
{
  "tipo": "lembrete_manutencao",
  "timestamp": "2025-11-27T14:30:00.000Z",
  "veiculo": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
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
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "nome": "João Silva",
    "telefone": "+5511999999999",
    "email": "joao@example.com"
  },
  "lembrete": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "dias_antecedencia": 7
  }
}
```

### Campos do Payload

#### Raiz

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tipo` | string | Sempre "lembrete_manutencao" |
| `timestamp` | string (ISO 8601) | Data/hora do envio do webhook |

#### `veiculo`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string (UUID) | ID único do veículo |
| `marca` | string | Marca do veículo (ex: "Yamaha", "Honda") |
| `modelo` | string | Modelo do veículo (ex: "Factor 125") |
| `placa` | string | Placa do veículo (pode ser "Sem placa") |
| `quilometragem` | number | Quilometragem atual do veículo |

#### `manutencao`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tipo` | string | Nome da manutenção (ex: "Troca de Óleo") |
| `sistema` | string | Sistema do veículo (ex: "Motor", "Freios") |
| `data_prevista` | string (YYYY-MM-DD) | Data prevista para a manutenção |
| `intervalo_km` | number \| undefined | Intervalo em km (opcional) |

#### `usuario`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string (UUID) | ID único do usuário |
| `nome` | string | Nome completo do usuário |
| `telefone` | string | Telefone do usuário (pode ser vazio) |
| `email` | string | Email do usuário |

#### `lembrete`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string (UUID) | ID único do lembrete |
| `dias_antecedencia` | number | Dias de antecedência configurados |

---

## Response Esperada do Webhook

Seu endpoint deve retornar uma resposta HTTP para indicar sucesso ou falha.

### Sucesso

**Status Code**: `200-299` (qualquer código 2xx)

**Body** (opcional):
```json
{
  "status": "received",
  "message": "Lembrete processado com sucesso"
}
```

### Falha

**Status Code**: `400-599` (qualquer código 4xx ou 5xx)

O sistema tentará reenviar o webhook de acordo com a configuração de retry.

---

## Configuração de Webhooks

### Tabela: `webhooks_manutencao`

Webhooks são configurados na tabela `webhooks_manutencao` no Supabase.

#### Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | ID único do webhook |
| `nome` | string | Sim | Nome descritivo do webhook |
| `url` | string | Sim | URL completa para receber o webhook |
| `ativo` | boolean | Sim | Se o webhook está ativo (default: true) |
| `dias_antecedencia_padrao` | number | Sim | Dias de antecedência padrão (default: 7) |
| `retry_attempts` | number | Sim | Número de tentativas em caso de falha (default: 3) |
| `retry_delay_seconds` | number | Sim | Delay entre tentativas em segundos (default: 5) |
| `auth_header` | string | Não | Header de autenticação (ex: "Bearer token123") |

#### Exemplo de Inserção

```sql
INSERT INTO webhooks_manutencao (
  nome,
  url,
  ativo,
  dias_antecedencia_padrao,
  retry_attempts,
  retry_delay_seconds,
  auth_header
) VALUES (
  'Webhook Principal',
  'https://api.example.com/webhooks/manutencao',
  true,
  7,
  3,
  5,
  'Bearer seu-token-secreto'
);
```

---

## Retry Logic

### Comportamento

Quando um webhook falha (status code >= 400 ou erro de rede), o sistema:

1. Aguarda `retry_delay_seconds` segundos
2. Tenta novamente (até `retry_attempts` vezes)
3. Registra cada tentativa em `logs_webhooks_manutencao`
4. Se todas as tentativas falharem, o lembrete permanece "pendente"

### Timeout

Cada tentativa tem timeout de **10 segundos**. Se o endpoint não responder em 10s, é considerado falha.

### Exemplo de Fluxo

```
Tentativa 1 → Falha (500) → Aguardar 5s
Tentativa 2 → Falha (500) → Aguardar 5s
Tentativa 3 → Sucesso (200) → Lembrete marcado como "enviado"
```

---

## Logs

### Tabela: `logs_webhooks_manutencao`

Cada tentativa de envio é registrada.

#### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | ID único do log |
| `webhook_id` | UUID | ID do webhook |
| `lembrete_id` | UUID | ID do lembrete |
| `payload` | JSONB | Payload enviado |
| `status_code` | number | Status HTTP retornado (null se erro de rede) |
| `response` | string | Resposta do endpoint |
| `erro` | string | Mensagem de erro (se houver) |
| `tentativa` | number | Número da tentativa (1, 2, 3...) |
| `created_at` | timestamp | Data/hora do envio |

#### Consultar Logs

```sql
-- Últimos 10 logs
SELECT 
  l.*,
  w.nome as webhook_nome,
  lm.data_prevista
FROM logs_webhooks_manutencao l
JOIN webhooks_manutencao w ON l.webhook_id = w.id
JOIN lembretes_manutencao lm ON l.lembrete_id = lm.id
ORDER BY l.created_at DESC
LIMIT 10;

-- Taxa de sucesso
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as sucessos,
  ROUND(100.0 * SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso
FROM logs_webhooks_manutencao
WHERE created_at >= NOW() - INTERVAL '7 days';
```

---

## Segurança

### Autenticação

Configure `auth_header` para proteger seu webhook:

```sql
UPDATE webhooks_manutencao
SET auth_header = 'Bearer seu-token-secreto-aqui'
WHERE id = '[webhook-id]';
```

Seu endpoint deve validar este header:

```javascript
// Node.js/Express exemplo
app.post('/webhooks/manutencao', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader !== 'Bearer seu-token-secreto-aqui') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Processar webhook
  const payload = req.body;
  console.log('Lembrete recebido:', payload);
  
  res.status(200).json({ status: 'received' });
});
```

### Validação de Payload

Sempre valide o payload recebido:

```javascript
function validarPayload(payload) {
  if (payload.tipo !== 'lembrete_manutencao') {
    throw new Error('Tipo inválido');
  }
  
  if (!payload.veiculo || !payload.veiculo.id) {
    throw new Error('Veículo inválido');
  }
  
  if (!payload.manutencao || !payload.manutencao.tipo) {
    throw new Error('Manutenção inválida');
  }
  
  if (!payload.usuario || !payload.usuario.id) {
    throw new Error('Usuário inválido');
  }
  
  return true;
}
```

### Rate Limiting

Implemente rate limiting no seu endpoint para evitar abuso:

```javascript
const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // Máximo 100 requests por 15 minutos
});

app.post('/webhooks/manutencao', webhookLimiter, (req, res) => {
  // Processar webhook
});
```

---

## Exemplos de Implementação

### Node.js/Express

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhooks/manutencao', async (req, res) => {
  try {
    // Validar autenticação
    const authHeader = req.headers.authorization;
    if (authHeader !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Processar payload
    const { veiculo, manutencao, usuario, lembrete } = req.body;
    
    console.log(`Lembrete para ${usuario.nome}:`);
    console.log(`Veículo: ${veiculo.marca} ${veiculo.modelo} (${veiculo.placa})`);
    console.log(`Manutenção: ${manutencao.tipo} - ${manutencao.sistema}`);
    console.log(`Data prevista: ${manutencao.data_prevista}`);
    
    // Enviar notificação (WhatsApp, SMS, Email, etc)
    await enviarNotificacao(usuario.telefone, {
      mensagem: `Olá ${usuario.nome}! Seu ${veiculo.marca} ${veiculo.modelo} precisa de ${manutencao.tipo} em ${manutencao.data_prevista}.`
    });
    
    // Retornar sucesso
    res.status(200).json({
      status: 'received',
      lembrete_id: lembrete.id
    });
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Webhook server rodando na porta 3000');
});
```

### Python/Flask

```python
from flask import Flask, request, jsonify
import os

app = Flask(__name__)

@app.route('/webhooks/manutencao', methods=['POST'])
def webhook_manutencao():
    try:
        # Validar autenticação
        auth_header = request.headers.get('Authorization')
        if auth_header != os.getenv('WEBHOOK_SECRET'):
            return jsonify({'error': 'Unauthorized'}), 401
        
        # Processar payload
        payload = request.json
        veiculo = payload['veiculo']
        manutencao = payload['manutencao']
        usuario = payload['usuario']
        lembrete = payload['lembrete']
        
        print(f"Lembrete para {usuario['nome']}:")
        print(f"Veículo: {veiculo['marca']} {veiculo['modelo']} ({veiculo['placa']})")
        print(f"Manutenção: {manutencao['tipo']} - {manutencao['sistema']}")
        print(f"Data prevista: {manutencao['data_prevista']}")
        
        # Enviar notificação
        enviar_notificacao(usuario['telefone'], {
            'mensagem': f"Olá {usuario['nome']}! Seu {veiculo['marca']} {veiculo['modelo']} precisa de {manutencao['tipo']} em {manutencao['data_prevista']}."
        })
        
        # Retornar sucesso
        return jsonify({
            'status': 'received',
            'lembrete_id': lembrete['id']
        }), 200
        
    except Exception as e:
        print(f"Erro ao processar webhook: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=3000)
```

---

## Troubleshooting

### Webhook não está sendo enviado

1. Verificar se o webhook está ativo:
```sql
SELECT * FROM webhooks_manutencao WHERE ativo = true;
```

2. Verificar se há lembretes pendentes:
```sql
SELECT * FROM lembretes_manutencao WHERE status = 'pendente';
```

3. Verificar se a data de envio já chegou:
```sql
SELECT 
  id,
  data_prevista,
  dias_antecedencia,
  data_prevista - INTERVAL '1 day' * dias_antecedencia as data_envio
FROM lembretes_manutencao
WHERE status = 'pendente';
```

### Webhook falhando constantemente

1. Verificar logs:
```sql
SELECT * FROM logs_webhooks_manutencao
WHERE webhook_id = '[webhook-id]'
ORDER BY created_at DESC
LIMIT 10;
```

2. Testar URL manualmente:
```bash
curl -X POST https://sua-url.com/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu-token" \
  -d '{"tipo":"lembrete_manutencao","timestamp":"2025-11-27T14:30:00Z"}'
```

3. Verificar timeout (deve responder em < 10s)

### Duplicação de webhooks

Se o mesmo lembrete está sendo enviado múltiplas vezes:

1. Verificar status do lembrete:
```sql
SELECT status, webhook_enviado_em
FROM lembretes_manutencao
WHERE id = '[lembrete-id]';
```

2. O status deve ser "enviado" após sucesso
3. Se está "pendente", o webhook não foi confirmado como sucesso

---

## Cron Job

A Edge Function é executada automaticamente via pg_cron:

```sql
-- Executar diariamente às 9h
SELECT cron.schedule(
  'processar-lembretes-manutencao',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao',
    headers := '{"Authorization": "Bearer [service-role-key]"}'::jsonb
  );
  $$
);
```

Para verificar o cron job:
```sql
SELECT * FROM cron.job WHERE jobname = 'processar-lembretes-manutencao';
```

---

## Suporte

Para problemas ou dúvidas:
1. Consulte os logs em `logs_webhooks_manutencao`
2. Verifique a documentação de testes em `TESTING.md`
3. Revise a documentação de retry em `RETRY_LOGIC_TESTS.md`
