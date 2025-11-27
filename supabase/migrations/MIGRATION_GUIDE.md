# Guia de Migração - Sistema de Manutenção de Veículos

## Visão Geral

Este documento descreve a estratégia de migração do sistema antigo de manutenções para o novo sistema baseado em planos personalizados por veículo.

## Mudanças Arquiteturais

### Sistema Antigo
- **Tabela `manutencoes`**: Armazenava todas as manutenções (realizadas e pendentes)
- **Lógica**: Todos os tipos de manutenção eram aplicados automaticamente a todos os veículos
- **Limitações**: Sem personalização por veículo, sem controle de quais manutenções aplicar

### Sistema Novo
- **Tabela `planos_manutencao_veiculo`**: Planos personalizados por veículo baseados em tipos existentes
- **Tabela `manutencoes_customizadas`**: Manutenções personalizadas não baseadas em tipos
- **Tabela `lembretes_manutencao`**: Sistema de lembretes com webhooks
- **Lógica**: Usuário escolhe quais manutenções aplicar a cada veículo

## Estratégia de Migração

### 1. Preservação de Dados Históricos

A tabela `manutencoes` **NÃO será excluída**. Ela será mantida como tabela de histórico para:
- Preservar registros de manutenções realizadas
- Manter auditoria completa
- Permitir consultas históricas
- Evitar perda de dados

### 2. Criação de Planos Baseados em Histórico

A migração `31.migrate_existing_manutencoes.sql` realiza:

```sql
-- Para cada combinação única (veículo, tipo_manutenção) com manutenções realizadas,
-- criar um plano de manutenção ativo
INSERT INTO planos_manutencao_veiculo (...)
SELECT DISTINCT veiculo_id, tipo_manutencao_id, ...
FROM manutencoes
WHERE status = 'realizada'
```

**Lógica**: Se um veículo já realizou uma manutenção de determinado tipo, assumimos que o usuário quer continuar fazendo esse tipo de manutenção.

### 3. Compatibilidade no Frontend

O hook `useManutencoesPendentes` foi atualizado para:
- Buscar planos de `planos_manutencao_veiculo`
- Buscar customizadas de `manutencoes_customizadas`
- Consultar histórico em `manutencoes` para calcular próximas datas
- Manter compatibilidade total com código existente

### 4. Marcação de Dados Migrados

```sql
ALTER TABLE manutencoes ADD COLUMN migrado_para_novo_sistema BOOLEAN;
```

Esta coluna permite:
- Rastrear quais manutenções foram migradas
- Identificar dados não migrados
- Facilitar troubleshooting

### 5. View de Histórico Consolidado

```sql
CREATE VIEW historico_manutencoes_completo AS ...
```

Facilita consultas ao histórico completo de manutenções realizadas.

## Impacto nos Usuários

### Usuários Existentes

**Antes da migração:**
- Todos os tipos de manutenção aplicados a todos os veículos automaticamente

**Depois da migração:**
- Apenas tipos de manutenção já realizados serão mantidos como planos ativos
- Usuário pode adicionar novos tipos ou customizadas via interface
- Histórico de manutenções realizadas permanece intacto

### Novos Usuários

- Começam com planos vazios
- Adicionam manutenções manualmente via modal "Adicionar Manutenção"
- Sem impacto, sistema funciona normalmente

## Rollback

Se necessário reverter a migração:

```sql
-- Remover planos criados pela migração
DELETE FROM planos_manutencao_veiculo
WHERE created_at >= '2025-11-27'; -- Data da migração

-- Remover coluna de marcação
ALTER TABLE manutencoes DROP COLUMN IF EXISTS migrado_para_novo_sistema;

-- Remover view
DROP VIEW IF EXISTS historico_manutencoes_completo;

-- Remover função
DROP FUNCTION IF EXISTS verificar_manutencoes_nao_migradas();
```

## Verificação Pós-Migração

### Scripts de Teste e Validação

Três scripts SQL foram criados para facilitar o processo de migração:

1. **`31.migrate_existing_manutencoes_test.sql`** - Execute ANTES da migração
   - Mostra quantas manutenções serão migradas
   - Lista veículos que terão planos criados
   - Identifica possíveis conflitos ou dados órfãos
   - Preview dos planos que serão criados

2. **`31.migrate_existing_manutencoes.sql`** - Script principal de migração
   - Cria planos baseados em manutenções realizadas
   - Adiciona índices e views
   - Marca dados migrados

3. **`31.migrate_existing_manutencoes_validate.sql`** - Execute DEPOIS da migração
   - Verifica quantos planos foram criados
   - Identifica manutenções não migradas
   - Valida integridade das referências
   - Gera resumo completo da migração

### 1. Verificar Dados Migrados

```bash
# Executar script de validação completo
psql $DATABASE_URL -f supabase/migrations/31.migrate_existing_manutencoes_validate.sql
```

Ou verificações rápidas:

```sql
-- Contar planos criados
SELECT COUNT(*) FROM planos_manutencao_veiculo;

-- Verificar manutenções não migradas
SELECT * FROM verificar_manutencoes_nao_migradas();
```

### 2. Validar Integridade

```sql
-- Verificar se todos os veículos com histórico têm planos
SELECT v.id, v.marca, v.modelo, COUNT(pmv.id) as total_planos
FROM veiculos v
LEFT JOIN planos_manutencao_veiculo pmv ON v.id = pmv.veiculo_id
WHERE EXISTS (
  SELECT 1 FROM manutencoes m 
  WHERE m.veiculo_id = v.id AND m.status = 'realizada'
)
GROUP BY v.id, v.marca, v.modelo;
```

### 3. Testar Frontend

- [ ] Página de veículos carrega corretamente
- [ ] Manutenções pendentes são calculadas
- [ ] Modal "Adicionar Manutenção" funciona
- [ ] Realizar manutenção cria registro correto
- [ ] Histórico é exibido corretamente

## Considerações Importantes

### 1. Dados Órfãos

Se houver manutenções com `tipo_manutencao_id` ou `veiculo_id` que não existem mais:
- A migração ignora esses registros (INNER JOIN)
- Não causa erro
- Dados permanecem na tabela `manutencoes` para auditoria

### 2. Performance

- Índices criados para otimizar consultas históricas
- View usa `security_invoker` para RLS
- Migração é idempotente (pode ser executada múltiplas vezes)

### 3. Intervalos Personalizados

A migração usa o intervalo padrão do tipo (`tipos_manutencao.intervalo_km`). Se usuários tinham intervalos personalizados no sistema antigo, eles precisarão ajustar manualmente via interface.

## Próximos Passos

### Pré-Migração
1. ✅ Executar script de teste: `31.migrate_existing_manutencoes_test.sql`
2. ✅ Revisar o que será migrado
3. ✅ Fazer backup do banco de dados

### Migração
4. ✅ Executar migração: `31.migrate_existing_manutencoes.sql`
5. ✅ Executar script de validação: `31.migrate_existing_manutencoes_validate.sql`
6. ✅ Verificar se há manutenções não migradas

### Pós-Migração
7. ✅ Testar frontend
8. ⏳ Monitorar logs de erro
9. ⏳ Coletar feedback de usuários
10. ⏳ Ajustar conforme necessário

## Suporte

Em caso de problemas:
1. Verificar logs do Supabase
2. Executar função `verificar_manutencoes_nao_migradas()`
3. Consultar view `historico_manutencoes_completo`
4. Revisar este documento
