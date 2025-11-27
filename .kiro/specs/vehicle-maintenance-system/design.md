# Sistema de Manutenção de Veículos - Design

## Arquitetura

### Modelo de Dados

#### Tabela: `planos_manutencao_veiculo`
```sql
CREATE TABLE planos_manutencao_veiculo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES veiculos(id) ON DELETE CASCADE,
  tipo_manutencao_id UUID REFERENCES tipos_manutencao(id) ON DELETE CASCADE,
  intervalo_km INTEGER NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(veiculo_id, tipo_manutencao_id)
);
```

#### Tabela: `manutencoes_customizadas`
```sql
CREATE TABLE manutencoes_customizadas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES veiculos(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  sistema VARCHAR(100),
  intervalo_km INTEGER,
  data_prevista DATE,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Tabela: `lembretes_manutencao`
```sql
CREATE TABLE lembretes_manutencao (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES veiculos(id) ON DELETE CASCADE,
  manutencao_id UUID, -- pode ser plano ou customizada
  tipo_manutencao VARCHAR(50), -- 'plano' ou 'customizada'
  data_prevista DATE NOT NULL,
  dias_antecedencia INTEGER DEFAULT 7,
  status VARCHAR(20) DEFAULT 'pendente', -- pendente, enviado, cancelado
  webhook_enviado_em TIMESTAMP,
  webhook_response TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Tabela: `webhooks_manutencao` (Admin)
```sql
CREATE TABLE webhooks_manutencao (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  dias_antecedencia_padrao INTEGER DEFAULT 7,
  retry_attempts INTEGER DEFAULT 3,
  retry_delay_seconds INTEGER DEFAULT 300,
  auth_header TEXT, -- opcional para autenticação
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Tabela: `logs_webhooks_manutencao`
```sql
CREATE TABLE logs_webhooks_manutencao (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID REFERENCES webhooks_manutencao(id) ON DELETE CASCADE,
  lembrete_id UUID REFERENCES lembretes_manutencao(id) ON DELETE CASCADE,
  payload JSONB,
  status_code INTEGER,
  response TEXT,
  erro TEXT,
  tentativa INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Fluxo de Dados

#### 1. Cadastro de Plano de Manutenção
```
Usuário → Seleciona Veículo → Modal "Adicionar Manutenção"
  ↓
Escolhe: Tipo Existente OU Customizada
  ↓
Define: Intervalo KM, Lembrete (sim/não), Antecedência
  ↓
Sistema cria registro em planos_manutencao_veiculo OU manutencoes_customizadas
  ↓
Se lembrete = sim: Calcula data_prevista e cria lembrete_manutencao
```

#### 2. Cálculo de Data Prevista
```typescript
function calcularDataPrevista(
  veiculoId: string,
  kmAtual: number,
  kmProxima: number
): Date {
  // 1. Buscar histórico de manutenções realizadas
  const historico = getHistoricoManutencoes(veiculoId);
  
  // 2. Calcular média de KM por mês
  const mediaKmMes = calcularMediaKmMes(historico, kmAtual);
  
  // 3. Calcular KM faltante
  const kmFaltante = kmProxima - kmAtual;
  
  // 4. Estimar meses até próxima manutenção
  const mesesAteProxima = kmFaltante / mediaKmMes;
  
  // 5. Calcular data prevista
  const hoje = new Date();
  const dataPrevista = addMonths(hoje, mesesAteProxima);
  
  return dataPrevista;
}

function calcularMediaKmMes(
  historico: Manutencao[],
  kmAtual: number
): number {
  if (historico.length === 0) {
    return 1000; // Padrão: 1000 km/mês
  }
  
  // Pegar última manutenção
  const ultima = historico[0];
  const diasDesdeUltima = daysBetween(ultima.data, new Date());
  const kmRodados = kmAtual - ultima.quilometragem;
  
  // Calcular média
  const mediaKmDia = kmRodados / diasDesdeUltima;
  const mediaKmMes = mediaKmDia * 30;
  
  return mediaKmMes;
}
```

#### 3. Job de Lembretes (Edge Function)
```typescript
// supabase/functions/processar-lembretes-manutencao/index.ts

Deno.serve(async (req) => {
  // 1. Buscar lembretes pendentes
  const lembretes = await supabase
    .from('lembretes_manutencao')
    .select(`
      *,
      veiculos(*),
      users:user_id(*)
    `)
    .eq('status', 'pendente')
    .lte('data_prevista', addDays(new Date(), 'dias_antecedencia'));
  
  // 2. Buscar webhooks ativos
  const webhooks = await supabase
    .from('webhooks_manutencao')
    .select('*')
    .eq('ativo', true);
  
  // 3. Para cada lembrete, enviar webhook
  for (const lembrete of lembretes) {
    for (const webhook of webhooks) {
      await enviarWebhook(webhook, lembrete);
    }
  }
});

async function enviarWebhook(webhook, lembrete) {
  const payload = {
    tipo: 'lembrete_manutencao',
    veiculo: {
      id: lembrete.veiculos.id,
      marca: lembrete.veiculos.marca,
      modelo: lembrete.veiculos.modelo,
      placa: lembrete.veiculos.placa
    },
    manutencao: {
      tipo: lembrete.tipo_manutencao,
      data_prevista: lembrete.data_prevista
    },
    usuario: {
      id: lembrete.users.id,
      nome: lembrete.users.name,
      telefone: lembrete.users.phone
    }
  };
  
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': webhook.auth_header || ''
      },
      body: JSON.stringify(payload)
    });
    
    // Log sucesso
    await logWebhook(webhook.id, lembrete.id, payload, response);
    
    // Atualizar status do lembrete
    await supabase
      .from('lembretes_manutencao')
      .update({ 
        status: 'enviado',
        webhook_enviado_em: new Date()
      })
      .eq('id', lembrete.id);
      
  } catch (error) {
    // Log erro
    await logWebhook(webhook.id, lembrete.id, payload, null, error);
    
    // Retry logic aqui
  }
}
```

### Componentes Frontend

#### 1. Modal: AdicionarManutencaoModal
```typescript
interface Props {
  veiculo: Veiculo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Tabs:
// - "Tipo Existente" (lista tipos_manutencao)
// - "Customizada" (form livre)

// Campos comuns:
// - Intervalo KM
// - Ativar Lembrete (toggle)
// - Dias de Antecedência (se lembrete ativo)
```

#### 2. Hook: usePlanosManutencao
```typescript
export const usePlanosManutencao = (veiculoId: string) => {
  const [planos, setPlanos] = useState([]);
  
  const adicionarPlano = async (dados) => {
    // Criar plano
    // Calcular data prevista
    // Criar lembrete se necessário
  };
  
  const removerPlano = async (id) => {
    // Remover plano
    // Cancelar lembretes associados
  };
  
  return { planos, adicionarPlano, removerPlano };
};
```

#### 3. Página Admin: WebhooksManutencao
```
/admin/webhooks/manutencao

Seções:
- Configuração de Webhooks
  - Lista de webhooks
  - Adicionar/Editar/Excluir
  - Testar webhook
  
- Logs de Envios
  - Tabela com histórico
  - Filtros (data, status, veículo)
  - Detalhes do payload/response
  
- Estatísticas
  - Total enviados
  - Taxa de sucesso
  - Últimos envios
```

## Fluxo de Usuário

### Adicionar Manutenção ao Veículo
1. Usuário expande detalhes do veículo
2. Clica em "Adicionar Manutenção"
3. Modal abre com 2 tabs
4. **Tab "Tipo Existente"**:
   - Lista tipos disponíveis
   - Seleciona tipo
   - Define intervalo (pré-preenchido com padrão)
   - Toggle "Ativar Lembrete"
   - Se ativo: campo "Dias de Antecedência"
5. **Tab "Customizada"**:
   - Campo "Nome"
   - Select "Sistema"
   - Campo "Intervalo KM"
   - Toggle "Ativar Lembrete"
   - Se ativo: campo "Dias de Antecedência"
6. Clica "Salvar"
7. Sistema:
   - Cria registro
   - Calcula data prevista
   - Cria lembrete se necessário
   - Atualiza lista de manutenções

### Realizar Manutenção
1. Usuário clica "Realizar" em manutenção
2. Sistema:
   - Registra manutenção realizada
   - Cancela lembrete antigo
   - Calcula próxima data prevista
   - Cria novo lembrete

## Considerações Técnicas

### Performance
- Índices em: veiculo_id, user_id, data_prevista, status
- Job de lembretes roda 1x por dia (madrugada)
- Cache de cálculos de data prevista

### Segurança
- RLS em todas as tabelas
- Webhooks apenas para admins
- Validação de URLs de webhook
- Rate limiting em webhooks

### Escalabilidade
- Job de lembretes processa em lotes
- Retry com backoff exponencial
- Queue para webhooks (futuro)
