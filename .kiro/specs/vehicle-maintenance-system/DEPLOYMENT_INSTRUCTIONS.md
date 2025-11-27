# Instruções de Deploy - Sistema de Manutenção de Veículos

## ⚠️ IMPORTANTE - LEIA ANTES DE COMEÇAR

Este é um deploy em **PRODUÇÃO**. Siga cada passo cuidadosamente.

---

## Informações do Projeto

- **Projeto**: Wallet
- **Project ID**: xjrjenniszhshrgtdjcp
- **Região**: sa-east-1 (São Paulo)
- **Status**: ACTIVE_HEALTHY
- **Organização**: dakgsmywzjxxwzbuioif

---

## Pré-requisitos ✅

Antes de começar, certifique-se de que:

- [ ] Você tem acesso ao Supabase Dashboard
- [ ] Você tem permissões de admin no projeto
- [ ] Você leu completamente este guia
- [ ] Você entende o que cada migração faz
- [ ] Você tem tempo para monitorar o deploy (30-60 minutos)

---

## Fase 1: BACKUP (CRÍTICO) 🔴

### Opção A: Via Supabase Dashboard (Recomendado)

1. Acesse: https://supabase.com/dashboard/project/xjrjenniszhshrgtdjcp
2. Vá em **Database** → **Backups**
3. Clique em **Create Backup**
4. Aguarde conclusão
5. Verifique que backup foi criado com sucesso

### Opção B: Via CLI (Alternativa)

```bash
# Instalar Supabase CLI se necessário
npm install -g supabase

# Login
supabase login

# Link ao projeto
supabase link --project-ref xjrjenniszhshrgtdjcp

# Criar backup
supabase db dump -f backup_pre_vehicle_maintenance_$(date +%Y%m%d_%H%M%S).sql

# Verificar backup
ls -lh backup_pre_vehicle_maintenance_*.sql
```

**✅ Checklist de Backup**:
- [ ] Backup criado com sucesso
- [ ] Tamanho do backup parece razoável (> 0 bytes)
- [ ] Backup armazenado em local seguro
- [ ] Você sabe como restaurar o backup se necessário

---

## Fase 2: Deploy de Migrations 📦

### Migrações a Serem Aplicadas

As seguintes migrações serão aplicadas **nesta ordem**:

1. **23.planos_manutencao_veiculo.sql** - Tabela de planos de manutenção
2. **24.manutencoes_customizadas.sql** - Tabela de manutenções customizadas
3. **25.lembretes_manutencao.sql** - Tabela de lembretes
4. **26.webhooks_manutencao.sql** - Tabela de webhooks (admin)
5. **27.logs_webhooks_manutencao.sql** - Tabela de logs de webhooks
6. **28.rls_verification_manutencao.sql** - Políticas RLS
7. **29.additional_indexes_manutencao.sql** - Índices para performance
8. **30.cron_lembretes_manutencao.sql** - Cron job diário
9. **31.migrate_existing_manutencoes.sql** - Migração de dados existentes

### Método 1: Via Supabase MCP (Recomendado)

Você pode usar o Kiro com o MCP do Supabase para aplicar as migrações:

```typescript
// Para cada migração, execute:
await mcp_supabase_apply_migration({
  project_id: "xjrjenniszhshrgtdjcp",
  name: "planos_manutencao_veiculo",
  query: "-- conteúdo do arquivo 23.planos_manutencao_veiculo.sql"
});
```

**Vantagens**:
- ✅ Rastreamento automático de migrações
- ✅ Rollback mais fácil
- ✅ Histórico completo

### Método 2: Via Supabase Dashboard (Manual)

1. Acesse: https://supabase.com/dashboard/project/xjrjenniszhshrgtdjcp/editor
2. Vá em **SQL Editor**
3. Clique em **New Query**
4. Para cada migração:
   - Copie o conteúdo do arquivo
   - Cole no editor
   - Clique em **Run**
   - Aguarde conclusão
   - Verifique se não há erros

### Método 3: Via CLI

```bash
# Aplicar todas as migrações
supabase db push

# Ou aplicar individualmente
psql "postgresql://postgres:[PASSWORD]@db.xjrjenniszhshrgtdjcp.supabase.co:5432/postgres" \
  -f supabase/migrations/23.planos_manutencao_veiculo.sql

# Repetir para cada migração (24-31)
```

---

## Fase 3: Verificação das Migrations ✅

Após aplicar cada migração, verifique:

### 3.1 Verificar Tabelas Criadas

```sql
-- Executar no SQL Editor
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name IN (
  'planos_manutencao_veiculo',
  'manutencoes_customizadas',
  'lembretes_manutencao',
  'webhooks_manutencao',
  'logs_webhooks_manutencao'
);
```

**Resultado Esperado**: 5 tabelas

### 3.2 Verificar RLS Ativado

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'planos_manutencao_veiculo',
  'manutencoes_customizadas',
  'lembretes_manutencao',
  'webhooks_manutencao',
  'logs_webhooks_manutencao'
);
```

**Resultado Esperado**: rowsecurity = true para todas

### 3.3 Verificar Índices

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN (
  'planos_manutencao_veiculo',
  'manutencoes_customizadas',
  'lembretes_manutencao'
)
ORDER BY tablename, indexname;
```

**Resultado Esperado**: Múltiplos índices criados

### 3.4 Verificar Cron Job

```sql
SELECT * FROM cron.job 
WHERE jobname = 'processar-lembretes-manutencao';
```

**Resultado Esperado**: 1 job configurado para rodar diariamente às 9h

### 3.5 Verificar Migração de Dados

```sql
-- Contar planos migrados
SELECT COUNT(*) as planos_criados 
FROM planos_manutencao_veiculo;

-- Verificar manutenções marcadas como migradas
SELECT COUNT(*) as manutencoes_migradas
FROM manutencoes 
WHERE migrado_para_novo_sistema = true;
```

**Resultado Esperado**: Números devem fazer sentido com seus dados

---

## Fase 4: Deploy da Edge Function 🚀

### 4.1 Verificar Função Existe

```bash
# Listar funções
ls -la supabase/functions/processar-lembretes-manutencao/
```

### 4.2 Deploy via MCP

```typescript
// Ler o arquivo da função
const indexContent = await readFile('supabase/functions/processar-lembretes-manutencao/index.ts');

// Deploy
await mcp_supabase_deploy_edge_function({
  project_id: "xjrjenniszhshrgtdjcp",
  name: "processar-lembretes-manutencao",
  files: [
    {
      name: "index.ts",
      content: indexContent
    }
  ],
  entrypoint_path: "index.ts"
});
```

### 4.3 Deploy via CLI

```bash
# Deploy da função
supabase functions deploy processar-lembretes-manutencao --project-ref xjrjenniszhshrgtdjcp

# Verificar deploy
supabase functions list --project-ref xjrjenniszhshrgtdjcp
```

### 4.4 Testar Edge Function

```bash
# Invocar função manualmente
curl -X POST \
  https://xjrjenniszhshrgtdjcp.supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json"
```

**Resultado Esperado**:
```json
{
  "success": true,
  "message": "Lembretes processados",
  "total_pendentes": 0,
  "para_enviar": 0,
  "processed": 0,
  "failed": 0
}
```

---

## Fase 5: Deploy do Frontend 🎨

### 5.1 Build de Produção

```bash
# Instalar dependências
npm install

# Build
npm run build

# Verificar build
ls -lh dist/
```

**✅ Checklist**:
- [ ] Build concluído sem erros
- [ ] Pasta dist/ criada
- [ ] Assets otimizados

### 5.2 Deploy

**Opção A: Vercel**
```bash
vercel --prod
```

**Opção B: Netlify**
```bash
netlify deploy --prod
```

**Opção C: Docker**
```bash
docker build -t wallet-app:latest .
docker push [registry]/wallet-app:latest
docker-compose up -d
```

---

## Fase 6: Configuração Pós-Deploy ⚙️

### 6.1 Criar Webhook de Produção (Admin)

1. Login como admin
2. Acesse: `/admin/webhooks/manutencao`
3. Clique em "Novo Webhook"
4. Configure:
   - Nome: Webhook Produção
   - URL: [sua URL de webhook]
   - Ativo: Sim
   - Tentativas: 3
   - Delay: 5s
   - Dias Antecedência: 7
5. Teste o webhook
6. Verifique logs

### 6.2 Criar Tipos de Manutenção Padrão

Execute no SQL Editor:

```sql
-- Inserir tipos de manutenção comuns
INSERT INTO tipos_manutencao (user_id, nome, sistema, intervalo_km, descricao) 
VALUES
('[admin-user-id]', 'Troca de Óleo', 'Motor', 5000, 'Troca de óleo do motor'),
('[admin-user-id]', 'Revisão Geral', 'Geral', 10000, 'Revisão completa do veículo'),
('[admin-user-id]', 'Troca de Filtro de Ar', 'Motor', 10000, 'Troca do filtro de ar'),
('[admin-user-id]', 'Troca de Velas', 'Motor', 20000, 'Troca de velas de ignição'),
('[admin-user-id]', 'Alinhamento e Balanceamento', 'Rodas', 10000, 'Alinhamento e balanceamento de rodas'),
('[admin-user-id]', 'Troca de Pastilhas de Freio', 'Freios', 30000, 'Troca de pastilhas de freio'),
('[admin-user-id]', 'Troca de Correia Dentada', 'Motor', 60000, 'Troca da correia dentada');
```

---

## Fase 7: Testes de Fumaça 🧪

### 7.1 Teste Básico de Usuário

- [ ] Login no sistema
- [ ] Acessar página de Veículos
- [ ] Expandir detalhes de um veículo
- [ ] Clicar em "Adicionar Manutenção"
- [ ] Adicionar uma manutenção do tipo existente
- [ ] Verificar que aparece na lista
- [ ] Adicionar uma manutenção customizada
- [ ] Verificar que aparece na lista
- [ ] Remover uma manutenção
- [ ] Verificar que foi removida

### 7.2 Teste de Admin

- [ ] Login como admin
- [ ] Acessar `/admin/webhooks/manutencao`
- [ ] Verificar que página carrega
- [ ] Criar um webhook de teste
- [ ] Testar webhook
- [ ] Verificar logs

### 7.3 Teste de Edge Function

- [ ] Executar função manualmente
- [ ] Verificar logs no Supabase Dashboard
- [ ] Verificar que não há erros

---

## Fase 8: Monitoramento 📊

### Primeiras 24 Horas

- [ ] Verificar logs a cada 2 horas
- [ ] Verificar se cron job executou (às 9h)
- [ ] Verificar se webhooks foram enviados
- [ ] Verificar taxa de sucesso
- [ ] Monitorar erros no Sentry/LogRocket (se configurado)

### Queries de Monitoramento

```sql
-- Lembretes processados hoje
SELECT COUNT(*) 
FROM lembretes_manutencao 
WHERE webhook_enviado_em::date = CURRENT_DATE;

-- Taxa de sucesso de webhooks (últimas 24h)
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as sucessos,
  ROUND(100.0 * SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) / COUNT(*), 2) as taxa_sucesso
FROM logs_webhooks_manutencao
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Erros recentes
SELECT *
FROM logs_webhooks_manutencao
WHERE (status_code IS NULL OR status_code >= 400)
AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

---

## Rollback (Se Necessário) 🔄

### Se algo der errado:

1. **Parar imediatamente**
2. **Não fazer mais mudanças**
3. **Avaliar o problema**

### Rollback de Frontend

```bash
# Vercel
vercel rollback [deployment-url]

# Docker
docker-compose down
docker pull [registry]/wallet-app:[versao-anterior]
docker-compose up -d
```

### Rollback de Migrations

```sql
-- Desativar cron job
SELECT cron.unschedule('processar-lembretes-manutencao');

-- Restaurar backup
-- Via Supabase Dashboard: Database → Backups → Restore
```

### Rollback de Edge Function

Via Supabase Dashboard:
1. Edge Functions → processar-lembretes-manutencao
2. Versions → Selecionar versão anterior
3. Restore

---

## Checklist Final ✅

### Pré-Deploy
- [ ] Backup criado e verificado
- [ ] Todas as migrações revisadas
- [ ] Equipe notificada
- [ ] Janela de manutenção agendada (se necessário)

### Deploy
- [ ] Migrations aplicadas (23-31)
- [ ] Edge Function deployed
- [ ] Frontend deployed
- [ ] Cron job configurado

### Pós-Deploy
- [ ] Verificações executadas
- [ ] Webhook de produção configurado
- [ ] Tipos de manutenção criados
- [ ] Testes de fumaça passaram
- [ ] Monitoramento configurado

### Documentação
- [ ] README atualizado
- [ ] CHANGELOG atualizado
- [ ] Equipe notificada do deploy
- [ ] Usuários notificados (se necessário)

---

## Contatos de Emergência 📞

**Em caso de problemas críticos**:
- Supabase Support: https://supabase.com/dashboard/support
- Documentação: https://supabase.com/docs

---

## Notas Finais 📝

- ✅ Sempre fazer backup antes de deploy
- ✅ Testar em staging antes de produção (se disponível)
- ✅ Monitorar logs nas primeiras 24 horas
- ✅ Ter plano de rollback pronto
- ✅ Documentar qualquer problema encontrado
- ✅ Comunicar status para a equipe

---

**Boa sorte com o deploy! 🚀**

**Data de Criação**: 27/11/2025  
**Projeto**: Wallet (xjrjenniszhshrgtdjcp)  
**Região**: sa-east-1
