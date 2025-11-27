# Documentação do Payload do Webhook

## Visão Geral

Este documento detalha a estrutura completa do payload enviado pelos webhooks de lembretes de manutenção.

## Estrutura Completa

```typescript
interface WebhookPayload {
  tipo: "lembrete_manutencao";
  timestamp: string; // ISO 8601
  veiculo: {
    id: string; // UUID
    marca: string;
    modelo: string;
    placa: string;
    quilometragem: number;
  };
  manutencao: {
    tipo: string;
    sistema: string;
    data_prevista: string; // YYYY-MM-DD
    intervalo_km?: number;
  };
  usuario: {
    id: string; // UUID
    nome: string;
    telefone: string;
    email: string;
  };
  lembrete: {
    id: string; // UUID
    dias_antecedencia: number;
  };
}
```

## Exemplo Completo

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

## Detalhamento dos Campos

### Campo: `tipo`

- **Tipo**: `string`
- **Valor**: Sempre `"lembrete_manutencao"`
- **Obrigatório**: Sim
- **Descrição**: Identifica o tipo de webhook. Útil se você receber múltiplos tipos de webhooks no mesmo endpoint.

**Exemplo**:
```json
"tipo": "lembrete_manutencao"
```

---

### Campo: `timestamp`

- **Tipo**: `string` (ISO 8601)
- **Formato**: `YYYY-MM-DDTHH:mm:ss.sssZ`
- **Obrigatório**: Sim
- **Descrição**: Data e hora exata em que o webhook foi enviado (UTC).

**Exemplo**:
```json
"timestamp": "2025-11-27T14:30:00.000Z"
```

**Uso**:
```javascript
const timestamp = new Date(payload.timestamp);
console.log(timestamp.toLocaleString('pt-BR')); // "27/11/2025 11:30:00"
```

---

### Objeto: `veiculo`

Informações completas sobre o veículo que precisa de manutenção.

#### `veiculo.id`

- **Tipo**: `string` (UUID v4)
- **Obrigatório**: Sim
- **Descrição**: Identificador único do veículo no sistema.

**Exemplo**:
```json
"id": "550e8400-e29b-41d4-a716-446655440000"
```

#### `veiculo.marca`

- **Tipo**: `string`
- **Obrigatório**: Sim
- **Descrição**: Marca do veículo.

**Exemplos**:
- `"Yamaha"`
- `"Honda"`
- `"Toyota"`
- `"Volkswagen"`

#### `veiculo.modelo`

- **Tipo**: `string`
- **Obrigatório**: Sim
- **Descrição**: Modelo do veículo.

**Exemplos**:
- `"Factor 125"`
- `"CG 160"`
- `"Corolla"`
- `"Gol"`

#### `veiculo.placa`

- **Tipo**: `string`
- **Obrigatório**: Sim
- **Descrição**: Placa do veículo. Pode ser `"Sem placa"` se não cadastrada.

**Exemplos**:
- `"ABC-1234"` (formato antigo)
- `"ABC1D23"` (formato Mercosul)
- `"Sem placa"`

#### `veiculo.quilometragem`

- **Tipo**: `number` (inteiro)
- **Obrigatório**: Sim
- **Descrição**: Quilometragem atual do veículo em km.

**Exemplo**:
```json
"quilometragem": 10000
```

---

### Objeto: `manutencao`

Informações sobre a manutenção que está próxima de vencer.

#### `manutencao.tipo`

- **Tipo**: `string`
- **Obrigatório**: Sim
- **Descrição**: Nome/tipo da manutenção.

**Exemplos**:
- `"Troca de Óleo"`
- `"Revisão Geral"`
- `"Troca de Filtro de Ar"`
- `"Alinhamento e Balanceamento"`
- `"Inspeção Anual"` (customizada)

#### `manutencao.sistema`

- **Tipo**: `string`
- **Obrigatório**: Sim
- **Descrição**: Sistema do veículo relacionado à manutenção.

**Exemplos**:
- `"Motor"`
- `"Freios"`
- `"Suspensão"`
- `"Elétrica"`
- `"Transmissão"`
- `"Rodas"`
- `"Geral"`
- `"Não especificado"` (para customizadas sem sistema)

#### `manutencao.data_prevista`

- **Tipo**: `string` (YYYY-MM-DD)
- **Obrigatório**: Sim
- **Descrição**: Data prevista para realizar a manutenção.

**Exemplo**:
```json
"data_prevista": "2025-12-04"
```

**Uso**:
```javascript
const dataPrevista = new Date(payload.manutencao.data_prevista);
const diasRestantes = Math.ceil((dataPrevista - new Date()) / (1000 * 60 * 60 * 24));
console.log(`Faltam ${diasRestantes} dias`);
```

#### `manutencao.intervalo_km`

- **Tipo**: `number` (inteiro) ou `undefined`
- **Obrigatório**: Não
- **Descrição**: Intervalo em quilômetros para esta manutenção. Pode ser `undefined` para manutenções baseadas apenas em data.

**Exemplos**:
```json
"intervalo_km": 5000  // Troca de óleo a cada 5000 km
"intervalo_km": 10000 // Revisão a cada 10000 km
"intervalo_km": undefined // Inspeção anual (sem intervalo de km)
```

---

### Objeto: `usuario`

Informações do proprietário do veículo.

#### `usuario.id`

- **Tipo**: `string` (UUID v4)
- **Obrigatório**: Sim
- **Descrição**: Identificador único do usuário no sistema.

**Exemplo**:
```json
"id": "660e8400-e29b-41d4-a716-446655440001"
```

#### `usuario.nome`

- **Tipo**: `string`
- **Obrigatório**: Sim
- **Descrição**: Nome completo do usuário.

**Exemplo**:
```json
"nome": "João Silva"
```

#### `usuario.telefone`

- **Tipo**: `string`
- **Obrigatório**: Sim (pode ser vazio)
- **Descrição**: Telefone do usuário no formato internacional. Pode ser string vazia se não cadastrado.

**Exemplos**:
```json
"telefone": "+5511999999999"
"telefone": "+55 (11) 99999-9999"
"telefone": ""
```

**Validação**:
```javascript
if (payload.usuario.telefone && payload.usuario.telefone.length > 0) {
  // Enviar SMS/WhatsApp
}
```

#### `usuario.email`

- **Tipo**: `string`
- **Obrigatório**: Sim
- **Descrição**: Email do usuário.

**Exemplo**:
```json
"email": "joao@example.com"
```

---

### Objeto: `lembrete`

Informações sobre o lembrete que gerou este webhook.

#### `lembrete.id`

- **Tipo**: `string` (UUID v4)
- **Obrigatório**: Sim
- **Descrição**: Identificador único do lembrete. Útil para rastreamento e logs.

**Exemplo**:
```json
"id": "770e8400-e29b-41d4-a716-446655440002"
```

#### `lembrete.dias_antecedencia`

- **Tipo**: `number` (inteiro)
- **Obrigatório**: Sim
- **Descrição**: Quantos dias antes da data prevista o lembrete foi configurado para ser enviado.

**Exemplo**:
```json
"dias_antecedencia": 7
```

**Cálculo**:
```javascript
// Se data_prevista = 2025-12-04 e dias_antecedencia = 7
// Então o webhook foi enviado em 2025-11-27
const dataEnvio = new Date(payload.manutencao.data_prevista);
dataEnvio.setDate(dataEnvio.getDate() - payload.lembrete.dias_antecedencia);
```

---

## Variações do Payload

### Manutenção de Plano (baseada em tipo existente)

```json
{
  "tipo": "lembrete_manutencao",
  "timestamp": "2025-11-27T14:30:00.000Z",
  "veiculo": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "marca": "Honda",
    "modelo": "CG 160",
    "placa": "XYZ-5678",
    "quilometragem": 15000
  },
  "manutencao": {
    "tipo": "Revisão Geral",
    "sistema": "Geral",
    "data_prevista": "2025-12-10",
    "intervalo_km": 10000
  },
  "usuario": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "nome": "Maria Santos",
    "telefone": "+5521988888888",
    "email": "maria@example.com"
  },
  "lembrete": {
    "id": "770e8400-e29b-41d4-a716-446655440003",
    "dias_antecedencia": 10
  }
}
```

### Manutenção Customizada (sem intervalo de km)

```json
{
  "tipo": "lembrete_manutencao",
  "timestamp": "2025-11-27T14:30:00.000Z",
  "veiculo": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "marca": "Toyota",
    "modelo": "Corolla",
    "placa": "DEF-9012",
    "quilometragem": 50000
  },
  "manutencao": {
    "tipo": "Inspeção Veicular Anual",
    "sistema": "Geral",
    "data_prevista": "2025-12-15",
    "intervalo_km": undefined
  },
  "usuario": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "nome": "Carlos Oliveira",
    "telefone": "+5511977777777",
    "email": "carlos@example.com"
  },
  "lembrete": {
    "id": "770e8400-e29b-41d4-a716-446655440004",
    "dias_antecedencia": 15
  }
}
```

### Veículo sem Placa

```json
{
  "tipo": "lembrete_manutencao",
  "timestamp": "2025-11-27T14:30:00.000Z",
  "veiculo": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "marca": "Yamaha",
    "modelo": "XTZ 250",
    "placa": "Sem placa",
    "quilometragem": 5000
  },
  "manutencao": {
    "tipo": "Primeira Revisão",
    "sistema": "Geral",
    "data_prevista": "2025-12-01",
    "intervalo_km": 1000
  },
  "usuario": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "nome": "Pedro Costa",
    "telefone": "+5511966666666",
    "email": "pedro@example.com"
  },
  "lembrete": {
    "id": "770e8400-e29b-41d4-a716-446655440005",
    "dias_antecedencia": 3
  }
}
```

---

## Validação do Payload

### Schema JSON

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["tipo", "timestamp", "veiculo", "manutencao", "usuario", "lembrete"],
  "properties": {
    "tipo": {
      "type": "string",
      "enum": ["lembrete_manutencao"]
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "veiculo": {
      "type": "object",
      "required": ["id", "marca", "modelo", "placa", "quilometragem"],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "marca": {
          "type": "string",
          "minLength": 1
        },
        "modelo": {
          "type": "string",
          "minLength": 1
        },
        "placa": {
          "type": "string"
        },
        "quilometragem": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "manutencao": {
      "type": "object",
      "required": ["tipo", "sistema", "data_prevista"],
      "properties": {
        "tipo": {
          "type": "string",
          "minLength": 1
        },
        "sistema": {
          "type": "string",
          "minLength": 1
        },
        "data_prevista": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        },
        "intervalo_km": {
          "type": ["integer", "null"],
          "minimum": 0
        }
      }
    },
    "usuario": {
      "type": "object",
      "required": ["id", "nome", "telefone", "email"],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "nome": {
          "type": "string",
          "minLength": 1
        },
        "telefone": {
          "type": "string"
        },
        "email": {
          "type": "string",
          "format": "email"
        }
      }
    },
    "lembrete": {
      "type": "object",
      "required": ["id", "dias_antecedencia"],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "dias_antecedencia": {
          "type": "integer",
          "minimum": 0
        }
      }
    }
  }
}
```

### Exemplo de Validação (JavaScript)

```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv();
addFormats(ajv);

const schema = { /* schema acima */ };
const validate = ajv.compile(schema);

function validarPayload(payload) {
  const valid = validate(payload);
  
  if (!valid) {
    console.error('Payload inválido:', validate.errors);
    return false;
  }
  
  return true;
}

// Uso
app.post('/webhooks/manutencao', (req, res) => {
  if (!validarPayload(req.body)) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
  
  // Processar webhook
});
```

---

## Casos de Uso

### 1. Enviar WhatsApp

```javascript
async function enviarWhatsApp(payload) {
  const { veiculo, manutencao, usuario } = payload;
  
  const mensagem = `
Olá ${usuario.nome}! 👋

Seu veículo *${veiculo.marca} ${veiculo.modelo}* (${veiculo.placa}) precisa de manutenção:

🔧 *${manutencao.tipo}*
📅 Data prevista: ${formatarData(manutencao.data_prevista)}
🚗 Quilometragem atual: ${veiculo.quilometragem.toLocaleString()} km

Não esqueça de agendar! 😊
  `.trim();
  
  await whatsappAPI.send({
    to: usuario.telefone,
    message: mensagem
  });
}
```

### 2. Enviar Email

```javascript
async function enviarEmail(payload) {
  const { veiculo, manutencao, usuario } = payload;
  
  await emailService.send({
    to: usuario.email,
    subject: `Lembrete: ${manutencao.tipo} - ${veiculo.marca} ${veiculo.modelo}`,
    html: `
      <h2>Olá ${usuario.nome}!</h2>
      <p>Seu veículo precisa de manutenção:</p>
      <ul>
        <li><strong>Veículo:</strong> ${veiculo.marca} ${veiculo.modelo} (${veiculo.placa})</li>
        <li><strong>Manutenção:</strong> ${manutencao.tipo}</li>
        <li><strong>Sistema:</strong> ${manutencao.sistema}</li>
        <li><strong>Data prevista:</strong> ${formatarData(manutencao.data_prevista)}</li>
        <li><strong>Quilometragem atual:</strong> ${veiculo.quilometragem.toLocaleString()} km</li>
      </ul>
      <p>Não esqueça de agendar!</p>
    `
  });
}
```

### 3. Criar Tarefa no CRM

```javascript
async function criarTarefaCRM(payload) {
  const { veiculo, manutencao, usuario, lembrete } = payload;
  
  await crmAPI.createTask({
    title: `${manutencao.tipo} - ${veiculo.marca} ${veiculo.modelo}`,
    description: `Lembrete de manutenção para ${usuario.nome}`,
    dueDate: manutencao.data_prevista,
    customerId: usuario.id,
    metadata: {
      veiculo_id: veiculo.id,
      lembrete_id: lembrete.id,
      placa: veiculo.placa,
      quilometragem: veiculo.quilometragem
    }
  });
}
```

---

## Changelog

### v1.0.0 (2025-11-27)
- Versão inicial do payload
- Campos: tipo, timestamp, veiculo, manutencao, usuario, lembrete
