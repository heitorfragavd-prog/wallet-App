# Backlog 0004: Preparação e Orquestração do Deploy em Produção na Hostinger

| Campo | Valor |
| --- | --- |
| ID | 0004 |
| Slug | 0004-preparacao-e-orquestracao-deploy-producao-hostinger |
| Status | Pronto para especificação |
| Prioridade | P1 (Alta) |
| Origem | specs/inbox/2026-09-20-144000-preparacao-e-orquestracao-deploy-producao-hostinger.md |
| Data | 2026-09-20 |

## 1. Contexto e Justificativa

Com a reconciliação e unificação da branch `develop` (SPEC-0003), a base de código do Wallet App reúne todas as defesas de segurança, correções críticas e melhorias funcionais aprovadas.

O objetivo desta fatia é preparar todos os artefatos de entrega para produção na Hostinger VPS:
- Configuração do Docker Swarm (`docker-stack.yml`), Nginx (`nginx.conf`) e Dockerfile multi-stage.
- Alinhamento determinístico da versão da imagem (`1.0.49`).
- Validação estática de rotas do Traefik com terminação TLS/SSL automática para `wallet.cortexx.online`.
- Preflight e testes de release (healthcheck, variáveis de build e políticas de rollback).
- Procedimento guiado para implantação com zero downtime (Expand & Contract) antes do acionamento da Phase C no Supabase.

## 2. Escopo

### Incluído
- Atualização e harmonização do script de build/deploy (`deploy-multiarch.sh`) para a versão canônica `1.0.49` do `package.json`.
- Criação de suíte de testes automatizados de prontidão de release e validação de container em `tests/release/`.
- Verificação do manifesto de orquestração `docker-stack.yml` garantindo labels do Traefik, política de atualização `start-first` e limites de réplica.
- Verificação de integridade do `nginx.conf` e endpoint `/health`.
- Elaboração do guia operacional de comando de deploy remoto para execução na VPS Hostinger.

### Fora de escopo
- Modificação de features da interface visual.
- Execução direta da Fase C no Postgres antes da implantação do frontend (regra Expand & Contract).

## 3. Critérios de Aceite em Alto Nível
- Script de build parametrizado lendo versão dinâmica ou canônica sem hardcode desatualizado.
- Manifesto `docker-stack.yml` verificado contra os contratos de roteamento do Traefik.
- Endpoint `/health` no container Nginx testado e validado.
- Suíte de testes TDD cobrindo todos os cenários de release passando em 100% GREEN.
