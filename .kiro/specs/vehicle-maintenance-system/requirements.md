# Sistema de Manutenção de Veículos - Requisitos

## Visão Geral
Reestruturar o sistema de manutenção de veículos para ser mais flexível, permitindo personalização por veículo e integração com sistema de lembretes via webhook.

## Problema Atual
- Tipos de manutenção são aplicados automaticamente a TODOS os veículos
- Não há personalização por veículo (moto vs carro vs caminhão)
- Não há como desativar manutenções específicas
- Falta integração com sistema de lembretes

## Objetivos

### 1. Sistema Híbrido de Manutenções
- Manter tipos globais como "templates/biblioteca"
- Permitir que cada veículo tenha seu próprio plano de manutenção
- Usuário escolhe quais tipos aplicar ao veículo
- Permitir personalizar intervalos por veículo
- Permitir adicionar manutenções customizadas (não baseadas em tipos)

### 2. Sistema de Lembretes
- Calcular data prevista da próxima manutenção
- Integrar com sistema de webhooks existente
- Criar webhook específico para lembretes de manutenção
- Enviar notificações quando manutenção estiver próxima

### 3. Gestão no Admin
- Painel separado para webhooks de manutenção
- Configurar antecedência dos lembretes (ex: 7 dias antes)
- Visualizar histórico de lembretes enviados

## Requisitos Funcionais

### RF01 - Plano de Manutenção por Veículo
- Ao cadastrar/editar veículo, permitir selecionar tipos de manutenção
- Permitir personalizar intervalo (km) por tipo
- Permitir adicionar manutenções customizadas

### RF02 - Adicionar Manutenção ao Veículo
- Botão "Adicionar Manutenção" na seção expandida
- Modal com opções:
  - Escolher de tipo existente
  - Criar manutenção customizada
- Campos:
  - Nome/Tipo
  - Sistema (Motor, Freios, Suspensão, etc)
  - Intervalo em KM
  - Data prevista (opcional)
  - Lembrete (sim/não)
  - Antecedência do lembrete (dias)

### RF03 - Cálculo de Data Prevista
- Baseado em:
  - KM atual do veículo
  - KM da próxima manutenção
  - Média de KM rodados por mês (calculado do histórico)
- Fórmula: `data_prevista = hoje + ((km_faltante / media_km_mes) * 30)`

### RF04 - Sistema de Lembretes
- Criar tabela `lembretes_manutencao`
- Campos:
  - veiculo_id
  - manutencao_id
  - data_prevista
  - dias_antecedencia
  - status (pendente, enviado, cancelado)
  - webhook_enviado_em
- Job diário verifica lembretes pendentes
- Envia webhook quando `data_prevista - dias_antecedencia <= hoje`

### RF05 - Webhook de Manutenção
- Endpoint separado no admin: `/admin/webhooks/manutencao`
- Payload do webhook:
```json
{
  "tipo": "lembrete_manutencao",
  "veiculo": {
    "id": "uuid",
    "marca": "Yamaha",
    "modelo": "Factor 125",
    "placa": "ABC-1234"
  },
  "manutencao": {
    "tipo": "Troca de Óleo",
    "sistema": "Motor",
    "data_prevista": "2025-12-01",
    "km_prevista": 30000
  },
  "usuario": {
    "id": "uuid",
    "nome": "João Silva",
    "telefone": "+5511999999999"
  }
}
```

### RF06 - Gestão de Webhooks no Admin
- Nova seção "Webhooks de Manutenção"
- Configurações:
  - URL do webhook
  - Ativo/Inativo
  - Dias de antecedência padrão
  - Retry em caso de falha
- Logs de webhooks enviados
- Teste de webhook

## Requisitos Não Funcionais

### RNF01 - Performance
- Cálculo de manutenções deve ser eficiente
- Job de lembretes deve rodar em horário de baixo uso

### RNF02 - Usabilidade
- Interface intuitiva para adicionar manutenções
- Feedback claro sobre próximas manutenções
- Fácil atualização de quilometragem

### RNF03 - Segurança
- Webhooks devem ter autenticação
- Dados sensíveis não devem ser expostos
- RLS aplicado em todas as tabelas

## Critérios de Aceitação

### CA01 - Personalização por Veículo
- ✅ Usuário pode escolher quais manutenções aplicar ao veículo
- ✅ Usuário pode personalizar intervalos
- ✅ Usuário pode adicionar manutenções customizadas

### CA02 - Lembretes Funcionais
- ✅ Sistema calcula data prevista automaticamente
- ✅ Webhook é enviado na data correta
- ✅ Usuário recebe notificação

### CA03 - Gestão no Admin
- ✅ Admin pode configurar webhooks de manutenção
- ✅ Admin pode visualizar logs
- ✅ Admin pode testar webhooks

## Fora do Escopo (v1)
- Integração direta com WhatsApp (usar webhook)
- Histórico detalhado de manutenções realizadas
- Relatórios de custos de manutenção
- Agendamento de manutenções em oficinas

## Dependências
- Sistema de webhooks existente (dívidas)
- Tabela de veículos
- Tabela de tipos de manutenção
- Sistema de autenticação

## Riscos
- Cálculo de data prevista pode ser impreciso se usuário não atualizar KM
- Webhook pode falhar (precisa retry)
- Usuário pode não configurar manutenções ao cadastrar veículo
