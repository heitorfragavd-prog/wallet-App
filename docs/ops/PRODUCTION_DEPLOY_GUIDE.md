# Guia Operacional de Deploy em Produção na Hostinger (Docker Swarm + Traefik)

**Versão da Release**: `1.0.49`  
**Data**: 2026-09-20  
**Ambiente**: Produção (`https://wallet.cortexx.online`)  
**Estratégia**: Zero-Downtime Rollout (Expand & Contract)

---

## 1. Pré-Requisitos na VPS Hostinger

Antes de aplicar o deploy, certifique-se de que a VPS possui os serviços essenciais operacionais:

```bash
# 1. Verificar se o Docker Swarm está ativo
docker node ls

# 2. Verificar se a rede externa do Traefik existe
docker network ls | grep network_public

# (Caso a rede network_public não exista, criá-la como overlay anexável)
# docker network create --driver=overlay --attachable network_public

# 3. Verificar status do serviço Traefik
docker service ls | grep traefik
```

---

## 2. Publicação da Imagem Docker Multi-Arquitetura

No ambiente com Docker instalado e autenticado no Docker Hub (`docker login`):

```bash
# Executar o script de empacotamento multi-arquitetura (produz linux/amd64 e linux/arm64)
./deploy-multiarch.sh

# Ou forçar uma tag específica:
# ./deploy-multiarch.sh 1.0.49
```

O script realizará:
1. `npm run build` do frontend.
2. `docker buildx build` para `linux/amd64` e `linux/arm64`.
3. Push automático para `heitor84/wallet:1.0.49` e `heitor84/wallet:latest`.

---

## 3. Aplicação do Deploy na VPS Hostinger

Conecte-se via SSH na VPS da Hostinger e execute a atualização de serviço com política `start-first` (a nova réplica sobe e valida o healthcheck antes da antiga ser desligada):

### Opção A: Atualização do Serviço Existente (Recomendado)
```bash
docker service update \
  --image heitor84/wallet:1.0.49 \
  --update-order start-first \
  --update-failure-action rollback \
  wallet-app
```

### Opção B: Implantação da Stack Completa
```bash
# No diretório onde está o docker-stack.yml:
export WALLET_IMAGE="heitor84/wallet:1.0.49"
docker stack deploy -c docker-stack.yml wallet
```

---

## 4. Verificação de Saúde e Smoke Tests (Pós-Deploy)

Após a atualização, execute os smoke tests:

```bash
# 1. Verificar status da réplica e tarefas
docker service ps wallet-app

# 2. Testar o endpoint de saúde localmente ou remotamente
curl -i https://wallet.cortexx.online/health
# Resposta esperada: HTTP/2 200 OK com corpo "ok"

# 3. Inspecionar logs da nova réplica
docker service logs --tail 50 wallet-app
```

### Checklist no Navegador:
- [ ] Acessar `https://wallet.cortexx.online/` e confirmar redirecionamento HTTPS seguro com cadeado verde.
- [ ] Efetuar login com usuário de teste.
- [ ] Navegar pelo Dashboard, Transações e Extrato.
- [ ] Acessar módulo de Investimentos e verificar solicitação de senha/biometria.
- [ ] Testar assistente de IA.

---

## 5. Ativação da Phase C no Banco Postgres (Supabase)

> [!IMPORTANT]
> **A Phase C SÓ DEVE SER APLICADA APÓS A CONFIRMAÇÃO DO NOVO FRONTEND NO AR.**
> O princípio Expand & Contract mantém as colunas permissivas até que o frontend esteja rodando sem consultar mais as colunas secretas diretamente.

Executar via conexão direta `psql` (não suportado no SQL Editor do dashboard web devido a blocos transacionais):

```bash
psql "$SUPABASE_DB_URL" -f scripts/apply-phase-c-enforcement.sql
```

A Phase C aplica:
1. Revogação de `SELECT` em colunas de chaves secretas (`divipay_config.client_secret`, `eyemobile_config.secret_key`).
2. Isolamento de `senha_investimentos` exclusivo para `service_role`.
3. RLS atômico estrito `is_investimentos_unlocked(auth.uid())` para todas as tabelas de investimentos.
4. Triggers de blindagem de auto-elevação de perfil (`profiles.role`).

---

## 6. Procedimento de Contingência / Rollback

Se qualquer anomalia for detectada durante os smoke tests:

```bash
# Rollback imediato do container para a versão anterior
docker service rollback wallet-app

# Se a Phase C já tiver sido executada no banco, rodar o script de contingência:
# psql "$SUPABASE_DB_URL" -f supabase/ops/rollback_20260908120000_safe_recovery.sql
```
