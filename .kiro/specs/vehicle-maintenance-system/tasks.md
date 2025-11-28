# Sistema de Manutenção de Veículos - Tarefas

## Fase 1: Estrutura de Dados (Backend)

### Task 1.1: Criar Tabelas
- [x] Criar migration para `planos_manutencao_veiculo`
- [x] Criar migration para `manutencoes_customizadas`
- [x] Criar migration para `lembretes_manutencao`
- [x] Criar migration para `webhooks_manutencao`
- [x] Criar migration para `logs_webhooks_manutencao`
- [x] Aplicar RLS em todas as tabelas
- [x] Criar índices necessários

### Task 1.2: Edge Function - Processar Lembretes
- [x] Criar função `processar-lembretes-manutencao`
- [x] Implementar busca de lembretes pendentes
- [x] Implementar envio de webhooks
- [x] Implementar retry logic
- [x] Implementar logging
- [x] Configurar cron job (diário)

## Fase 2: Hooks e Services (Frontend)

### Task 2.1: Hook usePlanosManutencao
- [x] Criar hook `usePlanosManutencao.ts`
- [x] Implementar `fetchPlanos`
- [x] Implementar `adicionarPlano`
- [x] Implementar `removerPlano`
- [x] Implementar `atualizarPlano`

### Task 2.2: Hook useManutencoesCustomizadas
- [x] Criar hook `useManutencoesCustomizadas.ts`
- [x] Implementar `fetchCustomizadas`
- [x] Implementar `adicionarCustomizada`
- [x] Implementar `removerCustomizada`
- [x] Implementar `atualizarCustomizada`

### Task 2.3: Hook useLembretesManutencao
- [x] Criar hook `useLembretesManutencao.ts`
- [x] Implementar `fetchLembretes`
- [x] Implementar `criarLembrete`
- [x] Implementar `cancelarLembrete`
- [x] Implementar cálculo de data prevista

### Task 2.4: Service - Cálculo de Data Prevista
- [x] Criar `ManutencaoService.ts`
- [x] Implementar `calcularMediaKmMes`
- [x] Implementar `calcularDataPrevista`
- [x] Implementar `calcularProximaManutencao`

## Fase 3: Componentes de Usuário

### Task 3.1: Modal AdicionarManutencaoModal
- [x] Criar componente `AdicionarManutencaoModal.tsx`
- [x] Implementar Tab "Tipo Existente"
- [x] Implementar Tab "Customizada"
- [x] Implementar form de intervalo KM
- [x] Implementar toggle de lembrete
- [x] Implementar campo dias de antecedência
- [x] Integrar com hooks

### Task 3.2: Atualizar Página de Veículos
- [x] Adicionar botão "Adicionar Manutenção"
- [x] Integrar modal
- [x] Atualizar lista de manutenções para mostrar planos + customizadas
- [x] Adicionar indicador de lembrete ativo
- [x] Adicionar botão para remover manutenção

### Task 3.3: Componente ListaManutencoes
- [x] Criar componente `ListaManutencoes.tsx`
- [x] Mostrar manutenções do plano
- [x] Mostrar manutenções customizadas
- [x] Indicador visual de tipo (plano vs custom)
- [x] Botão "Remover" (funcional)
- [x] Botão "Realizar" (funcional)
- [x] Botão "Editar" (funcional)

### Task 3.4: Modal Editar Manutenção
- [x] Criar componente `EditarManutencaoModal.tsx`
- [x] Implementar edição de planos (intervalo_km, ativo)
- [x] Implementar edição de customizadas (nome, sistema, intervalo_km, data_prevista, ativo)
- [x] Gerenciar lembretes (ativar/desativar, dias de antecedência)
- [x] Integrar com ListaManutencoes

### Task 3.5: Modal Realizar Manutenção
- [x] Criar componente `RealizarManutencaoModal.tsx`
- [x] Implementar form (data, quilometragem, observações, custo)
- [x] Registrar manutenção no histórico (tabela `manutencoes`)
- [x] Cancelar lembrete antigo
- [x] Calcular próxima data prevista
- [x] Criar novo lembrete
- [x] Atualizar quilometragem do veículo
- [x] Integrar com ListaManutencoes

## Fase 4: Admin - Webhooks de Manutenção

### Task 4.1: Hooks Admin
- [x] Criar hook `useWebhooksManutencao.ts`
- [x] Implementar CRUD de webhooks
- [x] Criar hook `useLogsWebhooksManutencao.ts`
- [x] Implementar busca de logs

### Task 4.2: Página Admin - Webhooks
- [x] Criar página `/admin/webhooks/manutencao`
- [x] Seção: Lista de Webhooks
- [x] Seção: Adicionar/Editar Webhook
- [x] Seção: Testar Webhook
- [x] Seção: Logs de Envios
- [x] Seção: Estatísticas

### Task 4.3: Componentes Admin
- [x] Criar `WebhookManutencaoCard.tsx`
- [x] Criar `NovoWebhookManutencaoModal.tsx`
- [x] Criar `EditarWebhookManutencaoModal.tsx`
- [x] Criar `TestarWebhookModal.tsx`
- [x] Criar `LogsWebhooksTable.tsx`

## Fase 5: Melhorias e Testes

### Task 5.1: Refatorar Sistema Atual
- [x] Atualizar `useManutencoesPendentes` para usar novos planos
- [x] Remover lógica de aplicar todos os tipos a todos os veículos
- [x] Manter compatibilidade com dados existentes (migração)

### Task 5.2: Testes
- [x] Testar cálculo de data prevista
- [x] Testar envio de webhooks
- [x] Testar retry logic
- [x] Testar criação de planos
- [x] Testar manutenções customizadas

### Task 5.3: Documentação
- [x] Documentar API de webhooks
- [x] Documentar payload do webhook
- [x] Criar guia de uso para usuários
- [x] Criar guia de configuração para admins

## Fase 6: Integração e Deploy

### Task 6.1: Integração
- [x] Testar fluxo completo end-to-end
- [x] Validar RLS
- [x] Validar performance
- [x] Ajustar UI/UX baseado em feedback

### Task 6.2: Deploy
- [x] Deploy de migrations usar o mcp do supabase
- [x] Deploy de edge functions usar o mcp do supabase
- [ ] Deploy de frontend 
- [x] Configurar cron job
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
