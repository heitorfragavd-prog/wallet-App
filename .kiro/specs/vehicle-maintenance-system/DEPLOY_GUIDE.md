# Guia de Deploy - Sistema de Manutenção de Veículos

## Visão Geral

Este guia descreve o processo completo de deploy do sistema de manutenção de veículos em produção.

---

## Pré-requisitos

- [ ] Acesso ao Supabase Dashboard (projeto de produção)
- [ ] Acesso ao repositório Git
- [ ] Backup do banco de dados atual
- [ ] Checklist de integração completo
- [ ] Aprovação para deploy

---

## Fase 1: Preparação

### 1.1 Backup

```bash
# Fazer backup do banco de dados
pg_dump $DATABASE_URL > backup_pre_deploy_$(date +%Y%m%d_%H%M%S).sql

# Verificar backup
ls -lh backup_pre_deploy_*.sql
```

**Checklist**:
- [ ] Backup criado
- [ ] Backup verificado
- [ ] Backup armazenado em local seguro

---

### 1.2 Verificar Ambiente

```bash
# Verificar variáveis de ambiente
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
# Não exibir SERVICE_ROLE_KEY por segurança

# Verificar versão do Node.js
node --version  # Deve ser >= 18

# Verificar dependências
npm list
```

**Checklist**:
- [ ] Variáveis de ambiente configuradas
- [ ] Node.js na versão correta
- [ ] Dependências instaladas

---

## Fase 2: Deploy de Migrations

### 2.1 Executar Migrations

**Ordem de execução**:

```bash
# 1. Planos de manutenção por veículo
psql $DATABASE_URL -f supabase/migrations/23.planos_manutencao_veiculo.sql

# 2. Manutenções customizadas
psql $DATABASE_URL -f supabase/migrations/24.manutencoes_customizadas.sql

# 3. Lembretes de manutenção
psql $DATABASE_URL -f supabase/migrations/25.lembretes_manutencao.sql

# 4. Webhooks de manutenção
psql $DATABASE_URL -f supabase/migrations/26.webhooks_manutencao.sql

# 5. Logs de webhooks
psql $DATABASE_URL -f supabase/migrations/27.logs_webhooks_manutencao.sql

# 6. Verificação de RLS
psql $DATABASE_URL -f supabase/migrations/28.rls_verification_manutencao.sql

# 7. Índices adicionais
psql $DATABASE_URL -f supabase/migrations/29.additional_indexes_manutencao.sql

# 8. Cron job para lembretes
psql $DATABASE_URL -f supabase/migrations/30.cron_lembretes_manutencao.sql

# 9. Migração de dados existentes
psql $DATABASE_URL -f supabase/migrations/31.migrate_existing_manutencoes.sql
```

**Checklist**:
- [ ] Migration 23 executada
- [ ] Migration 24 executada
- [ ] Migration 25 executada
- [ ] Migration 26 executada
- [ ] Migration 27 executada
- [ ] Migration 28 executada
- [ ] Migration 29 executada
- [ ] Migration 30 executada
- [ ] Migration 31 executada

---

### 2.2 Verificar Migrations

```sql
-- Verificar tabelas criadas
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
-- Esperado: 5 tabelas

-- Verificar RLS ativado
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
-- Esperado: rowsecurity = true para todas

-- Verificar índices criados
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN (
  'planos_manutencao_veiculo',
  'manutencoes_customizadas',
  'lembretes_manutencao'
);
-- Esperado: Múltiplos índices

-- Verificar dados migrados
SELECT COUNT(*) FROM planos_manutencao_veiculo;
-- Esperado: > 0 se havia manutenções antigas
```

**Checklist**:
- [ ] Todas as tabelas criadas
- [ ] RLS ativado em todas as tabelas
- [ ] Índices criados
- [ ] Dados migrados (se aplicável)

---

## Fase 3: Deploy de Edge Functions

### 3.1 Deploy da Edge Function

```bash
# Navegar para o diretório da função
cd supabase/functions/processar-lembretes-manutencao

# Deploy via Supabase CLI
supabase functions deploy processar-lembretes-manutencao

# Ou via Supabase Dashboard:
# 1. Acessar "Edge Functions"
# 2. Clicar em "New Function"
# 3. Nome: processar-lembretes-manutencao
# 4. Copiar código de index.ts
# 5. Deploy
```

**Checklist**:
- [ ] Edge Function deployed
- [ ] Função aparece no dashboard
- [ ] Logs da função acessíveis

---

### 3.2 Testar Edge Function

```bash
# Testar via curl
curl -X POST https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json"

# Ou via Supabase Dashboard:
# 1. Acessar "Edge Functions"
# 2. Selecionar "processar-lembretes-manutencao"
# 3. Clicar em "Invoke"
# 4. Verificar resposta e logs
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

**Checklist**:
- [ ] Função executada com sucesso
- [ ] Resposta correta
- [ ] Sem erros nos logs

---

## Fase 4: Configurar Cron Job

### 4.1 Verificar Cron Job

```sql
-- Verificar se cron job foi criado
SELECT * FROM cron.job 
WHERE jobname = 'processar-lembretes-manutencao';

-- Se não existir, criar:
SELECT cron.schedule(
  'processar-lembretes-manutencao',
  '0 9 * * *', -- Diariamente às 9h
  $$
  SELECT net.http_post(
    url := 'https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao',
    headers := '{"Authorization": "Bearer [service-role-key]", "Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

**Checklist**:
- [ ] Cron job criado
- [ ] Horário configurado (9h diariamente)
- [ ] URL correta
- [ ] Service role key configurada

---

### 4.2 Testar Cron Job

```sql
-- Executar manualmente para testar
SELECT cron.unschedule('processar-lembretes-manutencao');
SELECT cron.schedule(
  'processar-lembretes-manutencao-test',
  '* * * * *', -- A cada minuto (apenas para teste)
  $$
  SELECT net.http_post(
    url := 'https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao',
    headers := '{"Authorization": "Bearer [service-role-key]", "Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Aguardar 1-2 minutos e verificar logs
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'processar-lembretes-manutencao-test')
ORDER BY start_time DESC
LIMIT 5;

-- Remover teste e restaurar original
SELECT cron.unschedule('processar-lembretes-manutencao-test');
SELECT cron.schedule(
  'processar-lembretes-manutencao',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://[seu-projeto].supabase.co/functions/v1/processar-lembretes-manutencao',
    headers := '{"Authorization": "Bearer [service-role-key]", "Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

**Checklist**:
- [ ] Cron job executado
- [ ] Logs mostram sucesso
- [ ] Configuração final restaurada

---

## Fase 5: Deploy de Frontend

### 5.1 Build de Produção

```bash
# Instalar dependências
npm install

# Build
npm run build

# Verificar build
ls -lh dist/
```

**Checklist**:
- [ ] Build concluído sem erros
- [ ] Pasta dist/ criada
- [ ] Assets otimizados

---

### 5.2 Deploy

**Opção A: Vercel/Netlify**

```bash
# Vercel
vercel --prod

# Netlify
netlify deploy --prod
```

**Opção B: Docker**

```bash
# Build da imagem
docker build -t wallet-app:latest .

# Push para registry
docker push [registry]/wallet-app:latest

# Deploy
docker-compose up -d
```

**Checklist**:
- [ ] Deploy concluído
- [ ] URL de produção acessível
- [ ] Assets carregando corretamente

---

### 5.3 Verificar Frontend

**Testes Manuais**:
1. [ ] Acessar URL de produção
2. [ ] Fazer login
3. [ ] Acessar página de Veículos
4. [ ] Adicionar um veículo
5. [ ] Adicionar uma manutenção
6. [ ] Verificar que tudo funciona

**Checklist**:
- [ ] Aplicação carregando
- [ ] Login funcionando
- [ ] Funcionalidades básicas OK
- [ ] Sem erros no console

---

## Fase 6: Configuração Inicial

### 6.1 Criar Webhook de Produção

1. [ ] Login como admin
2. [ ] Acessar "Admin" → "Webhooks de Manutenção"
3. [ ] Criar webhook:
   - Nome: Webhook Produção
   - URL: [URL do seu endpoint]
   - Ativo: Sim
   - Tentativas: 3
   - Delay: 5s
   - Dias Antecedência: 7
   - Auth Header: [seu token]
4. [ ] Testar webhook
5. [ ] Verificar logs

---

### 6.2 Criar Tipos de Manutenção Padrão

```sql
-- Inserir tipos de manutenção comuns
INSERT INTO tipos_manutencao (user_id, nome, sistema, intervalo_km, descricao) VALUES
('[admin-user-id]', 'Troca de Óleo', 'Motor', 5000, 'Troca de óleo do motor'),
('[admin-user-id]', 'Revisão Geral', 'Geral', 10000, 'Revisão completa do veículo'),
('[admin-user-id]', 'Troca de Filtro de Ar', 'Motor', 10000, 'Troca do filtro de ar'),
('[admin-user-id]', 'Troca de Velas', 'Motor', 20000, 'Troca de velas de ignição'),
('[admin-user-id]', 'Alinhamento e Balanceamento', 'Rodas', 10000, 'Alinhamento e balanceamento de rodas'),
('[admin-user-id]', 'Troca de Pastilhas de Freio', 'Freios', 30000, 'Troca de pastilhas de freio'),
('[admin-user-id]', 'Troca de Correia Dentada', 'Motor', 60000, 'Troca da correia dentada');
```

**Checklist**:
- [ ] Tipos de manutenção criados
- [ ] Disponíveis para todos os usuários

---

## Fase 7: Monitoramento

### 7.1 Configurar Monitoramento

**Supabase Dashboard**:
1. [ ] Acessar "Logs"
2. [ ] Configurar filtros para Edge Functions
3. [ ] Configurar alertas (se disponível)

**Queries de Monitoramento**:

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

**Checklist**:
- [ ] Monitoramento configurado
- [ ] Queries de verificação salvas
- [ ] Alertas configurados (opcional)

---

### 7.2 Verificar Logs

**Primeiras 24 horas**:
- [ ] Verificar logs a cada 2 horas
- [ ] Verificar se cron job executou
- [ ] Verificar se webhooks foram enviados
- [ ] Verificar taxa de sucesso

**Primeira semana**:
- [ ] Verificar logs diariamente
- [ ] Monitorar performance
- [ ] Coletar feedback de usuários

---

## Fase 8: Rollback (Se Necessário)

### 8.1 Rollback de Frontend

```bash
# Vercel
vercel rollback [deployment-url]

# Docker
docker-compose down
docker pull [registry]/wallet-app:[versao-anterior]
docker-compose up -d
```

---

### 8.2 Rollback de Migrations

```sql
-- Desativar cron job
SELECT cron.unschedule('processar-lembretes-manutencao');

-- Remover tabelas (CUIDADO!)
DROP TABLE IF EXISTS logs_webhooks_manutencao CASCADE;
DROP TABLE IF EXISTS webhooks_manutencao CASCADE;
DROP TABLE IF EXISTS lembretes_manutencao CASCADE;
DROP TABLE IF EXISTS manutencoes_customizadas CASCADE;
DROP TABLE IF EXISTS planos_manutencao_veiculo CASCADE;

-- Restaurar backup
psql $DATABASE_URL < backup_pre_deploy_[timestamp].sql
```

---

### 8.3 Rollback de Edge Function

```bash
# Via Supabase Dashboard:
# 1. Acessar "Edge Functions"
# 2. Selecionar função
# 3. Clicar em "Versions"
# 4. Selecionar versão anterior
# 5. Clicar em "Restore"

# Ou deletar função
supabase functions delete processar-lembretes-manutencao
```

---

## Checklist Final de Deploy

### Pré-Deploy
- [ ] Backup criado
- [ ] Ambiente verificado
- [ ] Checklist de integração completo
- [ ] Aprovação obtida

### Deploy
- [ ] Migrations executadas
- [ ] Edge Function deployed
- [ ] Cron job configurado
- [ ] Frontend deployed

### Pós-Deploy
- [ ] Webhook de produção configurado
- [ ] Tipos de manutenção criados
- [ ] Monitoramento configurado
- [ ] Testes manuais realizados
- [ ] Logs verificados

### Documentação
- [ ] README atualizado
- [ ] CHANGELOG atualizado
- [ ] Equipe notificada
- [ ] Usuários notificados (se necessário)

---

## Contatos de Emergência

**Em caso de problemas críticos**:
- Suporte Supabase: [link]
- Equipe de desenvolvimento: [contato]
- Responsável pelo projeto: [contato]

---

## Notas

- Sempre fazer backup antes de deploy
- Testar em staging antes de produção
- Monitorar logs nas primeiras 24 horas
- Ter plano de rollback pronto
- Documentar qualquer problema encontrado

---

**Data do Deploy**: ___/___/_____  
**Responsável**: _________________  
**Status**: _________________  
**Observações**: _________________
