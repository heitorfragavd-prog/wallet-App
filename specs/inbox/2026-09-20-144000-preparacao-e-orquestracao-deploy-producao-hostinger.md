# Captura: Preparação e Orquestração do Deploy em Produção na Hostinger

- **Data de captura**: 2026-09-20 14:40:00 -03:00
- **Origem**: Aprovação do usuário para a Opção 1 (Fase 2 de Produção) após a conclusão e homologação da SPEC-0003.
- **Contexto**: A branch `develop` foi reconciliada com os 70 commits do PR #80 e as correções da SPEC-0001 e SPEC-0002. Todos os 1503 testes da aplicação e as suítes de segurança passaram em 100% GREEN e o build do Vite foi validado com saída 0 em `dist/`. Agora a aplicação necessita ser empacotada e orquestrada para publicação segura e resiliente na VPS da Hostinger com Docker Swarm, Traefik (HTTPS / SSL automático) e governança operacional de rollout Zero-Downtime.

## Necessidade Bruta

1. Validar e alinhar a versão do release no `package.json` (1.0.49), `Dockerfile`, `docker-stack.yml` e scripts operacionais de build/deploy.
2. Garantir que as variáveis de ambiente necessárias para produção no frontend estejam mapeadas sem exposição indevida de segredos.
3. Validar a saúde do container (healthcheck HTTP em `/health` no Nginx).
4. Estruturar os comandos e scripts de empacotamento multi-arquitetura e deploy no Docker Swarm na VPS Hostinger (`wallet.cortexx.online`).
5. Definir a esteira e os smoke tests de pós-deploy em produção para posterior execução segura da Fase C no Postgres via psql.
