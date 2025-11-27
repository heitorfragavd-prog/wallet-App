# Sistema de Manutenção de Veículos - Tarefas

## Fase 1: Estrutura de Dados (Backend)

### Task 1.1: Criar Tabelas
- [ ] Criar migration para `planos_manutencao_veiculo`
- [ ] Criar migration para `manutencoes_customizadas`
- [ ] Criar migration para `lembretes_manutencao`
- [ ] Criar migration para `webhooks_manutencao`
- [ ] Criar migration para `logs_webhooks_manutencao`
- [ ] Aplicar RLS em todas as tabelas
- [ ] Criar índices necessários

### Task 1.2: Edge Function - Processar Lembretes
- [ ] Criar função `processar-lembretes-manutencao`
- [ ] Implementar busca de lembretes pendentes
- [ ] Implementar envio de webhooks
- [ ] Implementar retry logic
- [ ] Implementar logging
- [ ] Configurar cron job (diário)

## Fase 2: Hooks e Services (Frontend)

### Task 2.1: Hook usePlanosManutencao
- [ ] Criar hook `usePlanosManutencao.ts`
- [ ] Implementar `fetchPlanos`
- [ ] Implementar `adicionarPlano`
- [ ] Implementar `removerPlano`
- [ ] Implementar `atualizarPlano`

### Task 2.2: Hook useManutencoesCustomizadas
- [ ] Criar hook `useManutencoesCustomizadas.ts`
- [ ] Implementar `fetchCustomizadas`
- [ ] Implementar `adicionarCustomizada`
- [ ] Implementar `removerCustomizada`
- [ ] Implementar `atualizarCustomizada`

### Task 2.3: Hook useLembretesManutencao
- [ ] Criar hook `useLembretesManutencao.ts`
- [ ] Implementar `fetchLembretes`
- [ ] Implementar `criarLembrete`
- [ ] Implementar `cancelarLembrete`
- [ ] Implementar cálculo de data prevista

### Task 2.4: Service - Cálculo de Data Prevista
- [ ] Criar `ManutencaoService.ts`
- [ ] Implementar `calcularMediaKmMes`
- [ ] Implementar `calcularDataPrevista`
- [ ] Implementar `calcularProximaManutencao`

## Fase 3: Componentes de Usuário

### Task 3.1: Modal AdicionarManutencaoModal
- [ ] Criar componente `AdicionarManutencaoModal.tsx`
- [ ] Implementar Tab "Tipo Existente"
- [ ] Implementar Tab "Customizada"
- [ ] Implementar form de intervalo KM
- [ ] Implementar toggle de lembrete
- [ ] Implementar campo dias de antecedência
- [ ] Integrar com hooks

### Task 3.2: Atualizar Página de Veículos
- [ ] Adicionar botão "Adicionar Manutenção"
- [ ] Integrar modal
- [ ] Atualizar lista de manutenções para mostrar planos + customizadas
- [ ] Adicionar indicador de lembrete ativo
- [ ] Adicionar botão para remover manutenção

### Task 3.3: Componente ListaManutencoes
- [ ] Criar componente `ListaManutencoes.tsx`
- [ ] Mostrar manutenções do plano
- [ ] Mostrar manutenções customizadas
- [ ] Indicador visual de tipo (plano vs custom)
- [ ] Botão "Realizar"
- [ ] Botão "Remover"
- [ ] Botão "Editar"

## Fase 4: Admin - Webhooks de Manutenção

### Task 4.1: Hooks Admin
- [ ] Criar hook `useWebhooksManutencao.ts`
- [ ] Implementar CRUD de webhooks
- [ ] Criar hook `useLogsWebhooksManutencao.ts`
- [ ] Implementar busca de logs

### Task 4.2: Página Admin - Webhooks
- [ ] Criar página `/admin/webhooks/manutencao`
- [ ] Seção: Lista de Webhooks
- [ ] Seção: Adicionar/Editar Webhook
- [ ] Seção: Testar Webhook
- [ ] Seção: Logs de Envios
- [ ] Seção: Estatísticas

### Task 4.3: Componentes Admin
- [ ] Criar `WebhookManutencaoCard.tsx`
- [ ] Criar `NovoWebhookManutencaoModal.tsx`
- [ ] Criar `EditarWebhookManutencaoModal.tsx`
- [ ] Criar `TestarWebhookModal.tsx`
- [ ] Criar `LogsWebhooksTable.tsx`

## Fase 5: Melhorias e Testes

### Task 5.1: Refatorar Sistema Atual
- [ ] Atualizar `useManutencoesPendentes` para usar novos planos
- [ ] Remover lógica de aplicar todos os tipos a todos os veículos
- [ ] Manter compatibilidade com dados existentes (migração)

### Task 5.2: Testes
- [ ] Testar cálculo de data prevista
- [ ] Testar envio de webhooks
- [ ] Testar retry logic
- [ ] Testar criação de planos
- [ ] Testar manutenções customizadas

### Task 5.3: Documentação
- [ ] Documentar API de webhooks
- [ ] Documentar payload do webhook
- [ ] Criar guia de uso para usuários
- [ ] Criar guia de configuração para admins

## Fase 6: Integração e Deploy

### Task 6.1: Integração
- [ ] Testar fluxo completo end-to-end
- [ ] Validar RLS
- [ ] Validar performance
- [ ] Ajustar UI/UX baseado em feedback

### Task 6.2: Deploy
- [ ] Deploy de migrations
- [ ] Deploy de edge functions
- [ ] Deploy de frontend
- [ ] Configurar cron job
- [ ] Monitorar logs

## Priorização

### Sprint 1 (Essencial)
- Fase 1: Estrutura de Dados
- Task 2.1, 2.2: Hooks básicos
- Task 3.1, 3.2: Modal e integração

### Sprint 2 (Importante)
- Task 2.3, 2.4: Lembretes e cálculos
- Fase 2: Edge Function
- Task 5.1: Refatorar sistema atual

### Sprint 3 (Desejável)
- Fase 4: Admin Webhooks
- Task 5.2, 5.3: Testes e documentação

## Notas
- Manter compatibilidade com sistema atual durante transição
- Criar migração de dados para converter manutenções atuais em planos
- Considerar feature flag para ativar novo sistema gradualmente
