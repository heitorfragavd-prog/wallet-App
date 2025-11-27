# Guia do Administrador - Webhooks de Manutenção

## Visão Geral

Este guia é para administradores que precisam configurar e gerenciar webhooks de lembretes de manutenção de veículos.

## Pré-requisitos

- Acesso ao painel administrativo
- Permissão de administrador no sistema
- Endpoint configurado para receber webhooks (opcional)

---

## Acessando o Painel de Webhooks

1. Faça login como administrador
2. No menu lateral, clique em **"Admin"**
3. Clique em **"Webhooks de Manutenção"**

Você verá 3 abas:
- **Webhooks**: Gerenciar webhooks
- **Logs**: Histórico de envios
- **Estatísticas**: Métricas e análises

---

## Configurando Webhooks

### Criar Novo Webhook

1. Na aba **"Webhooks"**, clique em **"Novo Webhook"**
2. Preencha o formulário:

#### Campos Obrigatórios

**Nome**
- Descrição: Nome descritivo para identificar o webhook
- Exemplo: "Webhook Principal", "WhatsApp Notifications"
- Dica: Use nomes que indiquem o propósito

**URL**
- Descrição: Endpoint completo que receberá os webhooks
- Exemplo: `https://api.example.com/webhooks/manutencao`
- Formato: Deve começar com `https://` (recomendado) ou `http://`
- Validação: O sistema verifica se a URL é válida

**Ativo**
- Descrição: Se o webhook está ativo ou não
- Padrão: Marcado (ativo)
- Dica: Desmarque para desativar temporariamente sem excluir

#### Configurações de Retry

**Tentativas de Retry**
- Descrição: Quantas vezes tentar reenviar em caso de falha
- Padrão: 3
- Recomendado: 2-5
- Mínimo: 1
- Máximo: 10

**Delay entre Tentativas (segundos)**
- Descrição: Tempo de espera entre tentativas
- Padrão: 5 segundos
- Recomendado: 2-10 segundos
- Mínimo: 1 segundo
- Máximo: 60 segundos

#### Configurações de Lembrete

**Dias de Antecedência Padrão**
- Descrição: Quantos dias antes da manutenção enviar o lembrete
- Padrão: 7 dias
- Recomendado: 3-15 dias
- Nota: Usuários podem personalizar por lembrete

#### Segurança (Opcional)

**Header de Autenticação**
- Descrição: Token ou chave para autenticar o webhook
- Exemplo: `Bearer seu-token-secreto-123`
- Formato: Qualquer string (será enviada no header `Authorization`)
- Dica: Use tokens longos e aleatórios para segurança

3. Clique em **"Salvar"**

✅ Webhook criado com sucesso!

---

### Editar Webhook

1. Na lista de webhooks, clique em **"Editar"**
2. Modifique os campos desejados
3. Clique em **"Salvar"**

**Nota**: Mudanças afetam apenas novos envios, não os já processados.

---

### Testar Webhook

Antes de ativar, teste se seu endpoint está funcionando:

1. Clique em **"Testar"** no webhook
2. O sistema enviará um payload de teste
3. Verifique se seu endpoint recebeu corretamente
4. Confira os logs para ver a resposta

**Payload de Teste**:
```json
{
  "tipo": "lembrete_manutencao",
  "timestamp": "2025-11-27T14:30:00.000Z",
  "veiculo": {
    "id": "test-veiculo-id",
    "marca": "Teste",
    "modelo": "Teste",
    "placa": "TEST-123",
    "quilometragem": 10000
  },
  "manutencao": {
    "tipo": "Teste",
    "sistema": "Teste",
    "data_prevista": "2025-12-04",
    "intervalo_km": 5000
  },
  "usuario": {
    "id": "test-user-id",
    "nome": "Usuário Teste",
    "telefone": "+5511999999999",
    "email": "teste@example.com"
  },
  "lembrete": {
    "id": "test-lembrete-id",
    "dias_antecedencia": 7
  }
}
```

---

### Desativar Webhook

Para desativar temporariamente sem excluir:

1. Clique em **"Editar"**
2. Desmarque **"Ativo"**
3. Clique em **"Salvar"**

O webhook não receberá mais lembretes até ser reativado.

---

### Excluir Webhook

⚠️ **Atenção**: Esta ação não pode ser desfeita!

1. Clique em **"Excluir"**
2. Confirme a exclusão
3. O webhook e seus logs serão removidos

---

## Monitorando Webhooks

### Visualizar Logs

Na aba **"Logs"**, você verá:

- **Status**: Sucesso (verde) ou Falha (vermelho)
- **Data/Hora**: Quando foi enviado
- **Tentativa**: Qual tentativa (1ª, 2ª, 3ª...)
- **Ações**: Botão "Detalhes"

#### Ver Detalhes de um Log

Clique em **"Detalhes"** para ver:

- **Status HTTP**: Código retornado (200, 500, etc)
- **Payload Enviado**: JSON completo
- **Resposta**: O que o endpoint retornou
- **Erro**: Mensagem de erro (se houver)
- **IDs**: Webhook ID, Lembrete ID

---

### Estatísticas

Na aba **"Estatísticas"**, você encontra:

#### Resumo Geral

- **Total de Envios**: Todos os webhooks enviados
- **Sucessos**: Webhooks entregues com sucesso
- **Erros**: Webhooks que falharam
- **Taxa de Sucesso**: Porcentagem de sucesso

#### Últimos 7 Dias

- Gráfico de envios diários
- Tendências de sucesso/falha

---

## Configuração do Endpoint

### Requisitos do Endpoint

Seu endpoint deve:

1. **Aceitar POST**: Método HTTP POST
2. **Aceitar JSON**: Content-Type: application/json
3. **Responder Rápido**: Timeout de 10 segundos
4. **Retornar Status Correto**:
   - 200-299: Sucesso
   - 400-599: Falha (será feito retry)

### Exemplo de Implementação

#### Node.js/Express

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhooks/manutencao', async (req, res) => {
  try {
    // 1. Validar autenticação
    const authHeader = req.headers.authorization;
    if (authHeader !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // 2. Extrair dados
    const { veiculo, manutencao, usuario } = req.body;
    
    // 3. Processar (enviar WhatsApp, email, etc)
    await enviarNotificacao(usuario.telefone, {
      mensagem: `Olá ${usuario.nome}! Seu ${veiculo.marca} ${veiculo.modelo} precisa de ${manutencao.tipo} em ${manutencao.data_prevista}.`
    });
    
    // 4. Retornar sucesso
    res.status(200).json({ status: 'received' });
    
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

#### Python/Flask

```python
from flask import Flask, request, jsonify
import os

app = Flask(__name__)

@app.route('/webhooks/manutencao', methods=['POST'])
def webhook_manutencao():
    try:
        # 1. Validar autenticação
        auth_header = request.headers.get('Authorization')
        if auth_header != os.getenv('WEBHOOK_SECRET'):
            return jsonify({'error': 'Unauthorized'}), 401
        
        # 2. Extrair dados
        payload = request.json
        veiculo = payload['veiculo']
        manutencao = payload['manutencao']
        usuario = payload['usuario']
        
        # 3. Processar
        enviar_notificacao(usuario['telefone'], {
            'mensagem': f"Olá {usuario['nome']}! Seu {veiculo['marca']} {veiculo['modelo']} precisa de {manutencao['tipo']} em {manutencao['data_prevista']}."
        })
        
        # 4. Retornar sucesso
        return jsonify({'status': 'received'}), 200
        
    except Exception as e:
        print(f"Erro: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=3000)
```

---

## Boas Práticas

### Segurança

1. **Use HTTPS**: Sempre que possível
2. **Configure Autenticação**: Use o campo `auth_header`
3. **Valide Payload**: Verifique se os dados estão corretos
4. **Rate Limiting**: Implemente limite de requisições
5. **Logs**: Registre todos os webhooks recebidos

### Performance

1. **Responda Rápido**: Processe assincronamente se necessário
2. **Timeout**: Garanta resposta em < 10 segundos
3. **Idempotência**: Trate webhooks duplicados
4. **Retry**: Configure retry adequado (2-5 tentativas)

### Monitoramento

1. **Verifique Logs Diariamente**: Identifique problemas cedo
2. **Configure Alertas**: Para falhas consecutivas
3. **Analise Estatísticas**: Monitore taxa de sucesso
4. **Teste Regularmente**: Use a função "Testar"

---

## Troubleshooting

### Webhook não está sendo enviado

**Possíveis causas**:

1. **Webhook inativo**
   - Solução: Verifique se está marcado como "Ativo"

2. **Nenhum lembrete pendente**
   - Solução: Verifique se há lembretes configurados

3. **Data de envio ainda não chegou**
   - Solução: Lembretes são enviados X dias antes da data prevista

4. **Cron job não está rodando**
   - Solução: Verifique configuração do pg_cron no Supabase

**Como verificar**:

```sql
-- Ver webhooks ativos
SELECT * FROM webhooks_manutencao WHERE ativo = true;

-- Ver lembretes pendentes
SELECT * FROM lembretes_manutencao WHERE status = 'pendente';

-- Ver quando lembretes devem ser enviados
SELECT 
  id,
  data_prevista,
  dias_antecedencia,
  data_prevista - INTERVAL '1 day' * dias_antecedencia as data_envio
FROM lembretes_manutencao
WHERE status = 'pendente';
```

---

### Webhook falhando constantemente

**Possíveis causas**:

1. **URL incorreta**
   - Solução: Verifique se a URL está correta e acessível

2. **Endpoint retornando erro**
   - Solução: Verifique logs do seu servidor

3. **Timeout (>10s)**
   - Solução: Otimize seu endpoint para responder mais rápido

4. **Autenticação falhando**
   - Solução: Verifique se o `auth_header` está correto

**Como verificar**:

1. Vá em **"Logs"**
2. Clique em **"Detalhes"** no log com falha
3. Veja o **Status Code** e **Erro**
4. Teste manualmente com curl:

```bash
curl -X POST https://sua-url.com/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu-token" \
  -d '{"tipo":"lembrete_manutencao"}'
```

---

### Webhooks duplicados

**Possíveis causas**:

1. **Endpoint não retornando 200**
   - Solução: Garanta que retorna status 200-299

2. **Timeout no endpoint**
   - Solução: Responda em < 10 segundos

3. **Lembrete não sendo marcado como enviado**
   - Solução: Verifique logs do Supabase

**Como prevenir**:

Implemente idempotência no seu endpoint:

```javascript
const processedLembretes = new Set();

app.post('/webhooks/manutencao', (req, res) => {
  const lembreteId = req.body.lembrete.id;
  
  // Verificar se já processou
  if (processedLembretes.has(lembreteId)) {
    console.log('Lembrete já processado, ignorando');
    return res.status(200).json({ status: 'already_processed' });
  }
  
  // Processar
  processarLembrete(req.body);
  
  // Marcar como processado
  processedLembretes.add(lembreteId);
  
  res.status(200).json({ status: 'received' });
});
```

---

## Configurações Avançadas

### Múltiplos Webhooks

Você pode ter vários webhooks ativos simultaneamente. Cada lembrete será enviado para todos os webhooks ativos.

**Casos de uso**:
- Webhook 1: WhatsApp
- Webhook 2: Email
- Webhook 3: SMS
- Webhook 4: CRM

### Configuração por Ambiente

Recomendamos webhooks diferentes para cada ambiente:

- **Desenvolvimento**: `https://dev.api.example.com/webhooks`
- **Staging**: `https://staging.api.example.com/webhooks`
- **Produção**: `https://api.example.com/webhooks`

### Webhook de Teste

Crie um webhook de teste para desenvolvimento:

- Nome: "Webhook de Teste"
- URL: `https://webhook.site/[seu-id]`
- Ativo: Sim
- Retry: 1 tentativa
- Delay: 1 segundo

Use [webhook.site](https://webhook.site) para ver os payloads em tempo real.

---

## Manutenção

### Limpeza de Logs

Logs antigos podem ser removidos para economizar espaço:

```sql
-- Remover logs com mais de 30 dias
DELETE FROM logs_webhooks_manutencao
WHERE created_at < NOW() - INTERVAL '30 days';
```

Recomendamos manter logs por 30-90 dias.

### Backup de Configurações

Faça backup das configurações de webhooks:

```sql
-- Exportar webhooks
SELECT * FROM webhooks_manutencao;
```

Salve o resultado em um arquivo seguro.

---

## Métricas e KPIs

### Métricas Importantes

1. **Taxa de Sucesso**: Deve ser > 95%
2. **Tempo de Resposta**: Deve ser < 5 segundos
3. **Tentativas Médias**: Deve ser próximo de 1
4. **Falhas Consecutivas**: Deve ser 0

### Queries Úteis

```sql
-- Taxa de sucesso últimos 7 dias
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as sucessos,
  ROUND(100.0 * SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso
FROM logs_webhooks_manutencao
WHERE created_at >= NOW() - INTERVAL '7 days';

-- Webhooks com mais falhas
SELECT 
  w.nome,
  COUNT(*) as total_falhas
FROM logs_webhooks_manutencao l
JOIN webhooks_manutencao w ON l.webhook_id = w.id
WHERE l.status_code IS NULL OR l.status_code >= 400
AND l.created_at >= NOW() - INTERVAL '7 days'
GROUP BY w.id, w.nome
ORDER BY total_falhas DESC;

-- Tempo médio de resposta
SELECT 
  AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY lembrete_id ORDER BY tentativa)))) as tempo_medio_segundos
FROM logs_webhooks_manutencao
WHERE tentativa > 1;
```

---

## Checklist de Configuração

Antes de colocar em produção:

- [ ] Webhook criado e configurado
- [ ] URL testada e funcionando
- [ ] Autenticação configurada
- [ ] Retry configurado (2-5 tentativas)
- [ ] Delay configurado (2-10 segundos)
- [ ] Webhook testado com botão "Testar"
- [ ] Logs verificados
- [ ] Endpoint responde em < 10 segundos
- [ ] Endpoint retorna status 200 em caso de sucesso
- [ ] Idempotência implementada
- [ ] Monitoramento configurado
- [ ] Alertas configurados (opcional)
- [ ] Documentação do endpoint criada

---

## Suporte

Para problemas técnicos:

1. Consulte a documentação da API: `API.md`
2. Consulte a documentação do payload: `PAYLOAD.md`
3. Consulte os testes: `TESTING.md`
4. Entre em contato com o suporte técnico

---

## Atualizações

Este guia é atualizado regularmente.

**Última atualização**: 27/11/2025  
**Versão**: 1.0.0
