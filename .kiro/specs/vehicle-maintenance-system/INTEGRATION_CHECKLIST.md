# Checklist de Integração - Sistema de Manutenção de Veículos

## Visão Geral

Este documento contém todos os testes e validações necessários antes do deploy em produção.

---

## 1. Testes End-to-End

### 1.1 Fluxo Completo do Usuário

#### Cenário 1: Novo Usuário - Primeiro Veículo

**Pré-condições**: Usuário logado, sem veículos cadastrados

**Passos**:
1. [ ] Acessar página "Veículos"
2. [ ] Clicar em "Adicionar Veículo"
3. [ ] Preencher formulário:
   - Marca: Yamaha
   - Modelo: Factor 125
   - Ano: 2023
   - Placa: ABC-1234
   - Quilometragem: 5000
4. [ ] Salvar veículo
5. [ ] Verificar que veículo aparece na lista
6. [ ] Expandir detalhes do veículo
7. [ ] Clicar em "Adicionar Manutenção"
8. [ ] Na aba "Tipo Existente", selecionar "Troca de Óleo"
9. [ ] Configurar:
   - Intervalo: 3000 km
   - Ativar Lembrete: Sim
   - Dias de Antecedência: 7
10. [ ] Salvar manutenção
11. [ ] Verificar que manutenção aparece na lista
12. [ ] Verificar status (deve ser "Em dia")
13. [ ] Verificar ícone de lembrete (🔔)

**Resultado Esperado**: 
- ✅ Veículo cadastrado
- ✅ Manutenção adicionada
- ✅ Lembrete criado
- ✅ Status calculado corretamente

---

#### Cenário 2: Adicionar Manutenção Customizada

**Pré-condições**: Veículo já cadastrado

**Passos**:
1. [ ] Expandir detalhes do veículo
2. [ ] Clicar em "Adicionar Manutenção"
3. [ ] Na aba "Customizada", preencher:
   - Nome: Troca de Pneus
   - Sistema: Rodas
   - Intervalo: 40000 km
   - Ativar Lembrete: Sim
   - Dias de Antecedência: 15
4. [ ] Salvar manutenção
5. [ ] Verificar que aparece na lista
6. [ ] Verificar indicador "Customizada"

**Resultado Esperado**:
- ✅ Manutenção customizada criada
- ✅ Diferenciada visualmente das manutenções de plano

---

#### Cenário 3: Atualizar Quilometragem

**Pré-condições**: Veículo com manutenções cadastradas

**Passos**:
1. [ ] Clicar em "Atualizar Quilometragem"
2. [ ] Inserir nova quilometragem: 7500 km
3. [ ] Salvar
4. [ ] Verificar que quilometragem foi atualizada
5. [ ] Verificar que status das manutenções foi recalculado
6. [ ] Verificar que "Próxima em" foi atualizado

**Resultado Esperado**:
- ✅ Quilometragem atualizada
- ✅ Cálculos refeitos automaticamente

---

#### Cenário 4: Realizar Manutenção

**Pré-condições**: Manutenção próxima ou atrasada

**Passos**:
1. [ ] Clicar em "Realizar" na manutenção
2. [ ] Confirmar ação
3. [ ] Verificar que manutenção foi registrada
4. [ ] Verificar que próxima data foi calculada
5. [ ] Verificar que novo lembrete foi criado
6. [ ] Verificar que status voltou para "Em dia"

**Resultado Esperado**:
- ✅ Manutenção registrada no histórico
- ✅ Próxima manutenção calculada
- ✅ Novo lembrete criado

---

### 1.2 Fluxo Completo do Admin

#### Cenário 5: Configurar Webhook

**Pré-condições**: Admin logado

**Passos**:
1. [ ] Acessar "Admin" → "Webhooks de Manutenção"
2. [ ] Clicar em "Novo Webhook"
3. [ ] Preencher:
   - Nome: Webhook Teste
   - URL: https://webhook.site/[seu-id]
   - Ativo: Sim
   - Tentativas: 3
   - Delay: 5s
   - Dias Antecedência: 7
   - Auth Header: Bearer test-token-123
4. [ ] Salvar webhook
5. [ ] Verificar que aparece na lista
6. [ ] Clicar em "Testar"
7. [ ] Verificar em webhook.site que recebeu o payload
8. [ ] Verificar que log foi criado
9. [ ] Verificar status do log (deve ser sucesso)

**Resultado Esperado**:
- ✅ Webhook configurado
- ✅ Teste bem-sucedido
- ✅ Log registrado

---

#### Cenário 6: Processar Lembretes

**Pré-condições**: Webhook configurado, lembrete pendente

**Passos**:
1. [ ] Executar Edge Function manualmente (via Supabase Dashboard)
2. [ ] Verificar logs da função
3. [ ] Verificar que webhook foi enviado
4. [ ] Verificar em webhook.site que recebeu o payload real
5. [ ] Verificar que lembrete foi marcado como "enviado"
6. [ ] Verificar que log foi criado em `logs_webhooks_manutencao`

**Resultado Esperado**:
- ✅ Função executada com sucesso
- ✅ Webhook enviado
- ✅ Lembrete marcado como enviado

---

#### Cenário 7: Visualizar Logs e Estatísticas

**Pré-condições**: Webhooks já enviados

**Passos**:
1. [ ] Acessar aba "Logs"
2. [ ] Verificar lista de logs
3. [ ] Clicar em "Detalhes" em um log
4. [ ] Verificar payload, resposta, status
5. [ ] Acessar aba "Estatísticas"
6. [ ] Verificar métricas:
   - Total de envios
   - Sucessos
   - Erros
   - Taxa de sucesso
   - Últimos 7 dias

**Resultado Esperado**:
- ✅ Logs exibidos corretamente
- ✅ Estatísticas calculadas

---

## 2. Validação de RLS (Row Level Security)

### 2.1 Tabela: planos_manutencao_veiculo

**Testes**:

```sql
-- Como usuário A
SET request.jwt.claim.sub = '[user-a-id]';

-- Deve retornar apenas planos do usuário A
SELECT * FROM planos_manutencao_veiculo;

-- Deve permitir inserir plano para veículo do usuário A
INSERT INTO planos_manutencao_veiculo (user_id, veiculo_id, tipo_manutencao_id, intervalo_km)
VALUES ('[user-a-id]', '[veiculo-a-id]', '[tipo-id]', 5000);

-- Deve NEGAR inserir plano para veículo de outro usuário
INSERT INTO planos_manutencao_veiculo (user_id, veiculo_id, tipo_manutencao_id, intervalo_km)
VALUES ('[user-b-id]', '[veiculo-b-id]', '[tipo-id]', 5000);
-- Esperado: Erro de permissão

-- Deve permitir atualizar próprio plano
UPDATE planos_manutencao_veiculo SET intervalo_km = 7000 WHERE id = '[plano-a-id]';

-- Deve NEGAR atualizar plano de outro usuário
UPDATE planos_manutencao_veiculo SET intervalo_km = 7000 WHERE id = '[plano-b-id]';
-- Esperado: 0 rows affected

-- Deve permitir deletar próprio plano
DELETE FROM planos_manutencao_veiculo WHERE id = '[plano-a-id]';

-- Deve NEGAR deletar plano de outro usuário
DELETE FROM planos_manutencao_veiculo WHERE id = '[plano-b-id]';
-- Esperado: 0 rows affected
```

**Checklist**:
- [ ] SELECT: Retorna apenas dados do usuário
- [ ] INSERT: Permite apenas para próprios veículos
- [ ] UPDATE: Permite apenas próprios planos
- [ ] DELETE: Permite apenas próprios planos

---

### 2.2 Tabela: manutencoes_customizadas

**Testes**: (Mesma estrutura que planos_manutencao_veiculo)

**Checklist**:
- [ ] SELECT: Retorna apenas dados do usuário
- [ ] INSERT: Permite apenas para próprios veículos
- [ ] UPDATE: Permite apenas próprias customizadas
- [ ] DELETE: Permite apenas próprias customizadas

---

### 2.3 Tabela: lembretes_manutencao

**Testes**: (Mesma estrutura)

**Checklist**:
- [ ] SELECT: Retorna apenas dados do usuário
- [ ] INSERT: Permite apenas para próprios veículos
- [ ] UPDATE: Permite apenas próprios lembretes
- [ ] DELETE: Permite apenas próprios lembretes

---

### 2.4 Tabelas Admin (webhooks_manutencao, logs_webhooks_manutencao)

**Testes**:

```sql
-- Como usuário normal (não admin)
SET request.jwt.claim.sub = '[user-normal-id]';

-- Deve NEGAR acesso a webhooks
SELECT * FROM webhooks_manutencao;
-- Esperado: 0 rows ou erro

-- Como admin
SET request.jwt.claim.sub = '[admin-id]';

-- Deve permitir acesso a webhooks
SELECT * FROM webhooks_manutencao;
-- Esperado: Todos os webhooks

-- Deve permitir CRUD completo
INSERT INTO webhooks_manutencao (...) VALUES (...);
UPDATE webhooks_manutencao SET ... WHERE id = ...;
DELETE FROM webhooks_manutencao WHERE id = ...;
```

**Checklist**:
- [ ] Usuários normais NÃO têm acesso
- [ ] Admins têm acesso completo (CRUD)

---

## 3. Validação de Performance

### 3.1 Queries Críticas

#### Query 1: Buscar planos de um veículo

```sql
EXPLAIN ANALYZE
SELECT *
FROM planos_manutencao_veiculo
WHERE veiculo_id = '[veiculo-id]'
AND ativo = true;
```

**Checklist**:
- [ ] Usa índice `idx_planos_manutencao_veiculo_veiculo_id`
- [ ] Tempo de execução < 50ms
- [ ] Sem sequential scan

---

#### Query 2: Buscar lembretes pendentes

```sql
EXPLAIN ANALYZE
SELECT *
FROM lembretes_manutencao
WHERE status = 'pendente'
AND data_prevista <= CURRENT_DATE + INTERVAL '7 days';
```

**Checklist**:
- [ ] Usa índice apropriado
- [ ] Tempo de execução < 100ms
- [ ] Eficiente mesmo com muitos registros

---

#### Query 3: Buscar logs de webhook

```sql
EXPLAIN ANALYZE
SELECT *
FROM logs_webhooks_manutencao
WHERE webhook_id = '[webhook-id]'
ORDER BY created_at DESC
LIMIT 10;
```

**Checklist**:
- [ ] Usa índice
- [ ] Tempo de execução < 50ms
- [ ] LIMIT aplicado eficientemente

---

### 3.2 Testes de Carga

**Cenário**: 100 veículos, 500 planos, 1000 lembretes

**Testes**:
1. [ ] Carregar página de veículos: < 2s
2. [ ] Expandir detalhes de veículo: < 1s
3. [ ] Adicionar manutenção: < 1s
4. [ ] Processar lembretes (Edge Function): < 30s
5. [ ] Carregar logs (100 registros): < 2s

---

## 4. Validação de UI/UX

### 4.1 Responsividade

**Dispositivos para testar**:
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)

**Páginas**:
- [ ] Página de Veículos
- [ ] Modal Adicionar Manutenção
- [ ] Página Admin Webhooks

---

### 4.2 Acessibilidade

**Checklist**:
- [ ] Todos os botões têm labels descritivos
- [ ] Formulários têm labels associados
- [ ] Cores têm contraste adequado (WCAG AA)
- [ ] Navegação por teclado funciona
- [ ] Screen readers conseguem ler conteúdo

---

### 4.3 Feedback Visual

**Checklist**:
- [ ] Loading states em todas as operações assíncronas
- [ ] Toasts de sucesso/erro aparecem
- [ ] Estados vazios têm mensagens claras
- [ ] Erros de validação são claros
- [ ] Confirmações para ações destrutivas

---

## 5. Validação de Dados

### 5.1 Integridade Referencial

```sql
-- Verificar planos órfãos (sem veículo)
SELECT COUNT(*)
FROM planos_manutencao_veiculo p
LEFT JOIN veiculos v ON p.veiculo_id = v.id
WHERE v.id IS NULL;
-- Esperado: 0

-- Verificar lembretes órfãos (sem veículo)
SELECT COUNT(*)
FROM lembretes_manutencao l
LEFT JOIN veiculos v ON l.veiculo_id = v.id
WHERE v.id IS NULL;
-- Esperado: 0

-- Verificar logs órfãos (sem webhook)
SELECT COUNT(*)
FROM logs_webhooks_manutencao l
LEFT JOIN webhooks_manutencao w ON l.webhook_id = w.id
WHERE w.id IS NULL;
-- Esperado: 0
```

**Checklist**:
- [ ] Sem registros órfãos
- [ ] Foreign keys funcionando
- [ ] Cascade deletes funcionando

---

### 5.2 Consistência de Dados

```sql
-- Verificar lembretes com status inválido
SELECT COUNT(*)
FROM lembretes_manutencao
WHERE status NOT IN ('pendente', 'enviado', 'cancelado');
-- Esperado: 0

-- Verificar planos com intervalo inválido
SELECT COUNT(*)
FROM planos_manutencao_veiculo
WHERE intervalo_km <= 0;
-- Esperado: 0

-- Verificar veículos com quilometragem negativa
SELECT COUNT(*)
FROM veiculos
WHERE quilometragem < 0;
-- Esperado: 0
```

**Checklist**:
- [ ] Sem dados inválidos
- [ ] Constraints funcionando
- [ ] Validações no backend funcionando

---

## 6. Testes de Segurança

### 6.1 Autenticação

**Checklist**:
- [ ] Páginas protegidas redirecionam para login
- [ ] Token JWT é validado
- [ ] Sessão expira corretamente
- [ ] Logout funciona

---

### 6.2 Autorização

**Checklist**:
- [ ] Usuários não acessam dados de outros usuários
- [ ] Apenas admins acessam painel admin
- [ ] RLS impede acesso não autorizado
- [ ] Edge Function valida permissões

---

### 6.3 Validação de Input

**Checklist**:
- [ ] SQL Injection: Protegido (usando Supabase client)
- [ ] XSS: Protegido (React escapa automaticamente)
- [ ] CSRF: Protegido (tokens JWT)
- [ ] Validação de formulários no frontend
- [ ] Validação de dados no backend

---

## 7. Testes de Edge Cases

### 7.1 Dados Extremos

**Cenários**:
- [ ] Veículo com quilometragem muito alta (999999 km)
- [ ] Manutenção com intervalo muito pequeno (100 km)
- [ ] Manutenção com intervalo muito grande (100000 km)
- [ ] Nome de manutenção muito longo (255 caracteres)
- [ ] Webhook com URL muito longa

---

### 7.2 Condições de Erro

**Cenários**:
- [ ] Webhook com URL inválida
- [ ] Webhook que retorna timeout
- [ ] Webhook que retorna 500
- [ ] Lembrete sem veículo (deletado)
- [ ] Plano sem tipo de manutenção (deletado)

---

## 8. Compatibilidade

### 8.1 Navegadores

**Testar em**:
- [ ] Chrome (última versão)
- [ ] Firefox (última versão)
- [ ] Safari (última versão)
- [ ] Edge (última versão)

---

### 8.2 Sistemas Operacionais

**Testar em**:
- [ ] Windows
- [ ] macOS
- [ ] Linux
- [ ] iOS
- [ ] Android

---

## 9. Documentação

**Checklist**:
- [x] API documentada (API.md)
- [x] Payload documentado (PAYLOAD.md)
- [x] Guia do usuário criado
- [x] Guia do admin criado
- [x] Testes documentados (TESTING.md, RETRY_LOGIC_TESTS.md)
- [x] Migração documentada (MIGRATION_GUIDE.md)
- [ ] README atualizado
- [ ] CHANGELOG atualizado

---

## 10. Preparação para Deploy

**Checklist**:
- [ ] Variáveis de ambiente configuradas
- [ ] Secrets configurados no Supabase
- [ ] Cron job configurado
- [ ] Backup do banco de dados
- [ ] Plano de rollback definido
- [ ] Monitoramento configurado
- [ ] Alertas configurados

---

## Resumo de Aprovação

### Critérios Mínimos para Deploy

- [ ] Todos os testes end-to-end passando
- [ ] RLS validado em todas as tabelas
- [ ] Performance aceitável (< 2s para operações principais)
- [ ] UI/UX responsiva e acessível
- [ ] Sem dados órfãos ou inconsistentes
- [ ] Segurança validada (autenticação, autorização, validação)
- [ ] Edge cases tratados
- [ ] Compatibilidade testada em principais navegadores
- [ ] Documentação completa

### Aprovação Final

**Data**: ___/___/_____  
**Aprovado por**: _________________  
**Observações**: _________________

---

## Notas

- Este checklist deve ser revisado antes de cada deploy
- Itens críticos devem ser testados em staging antes de produção
- Manter este documento atualizado conforme o sistema evolui
