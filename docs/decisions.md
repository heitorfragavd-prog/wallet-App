# Decisões técnicas

<!-- specsfy:documentator:start -->
## Política

Decisões explícitas em `PROJECT.md` e `.specsfy/` prevalecem sobre inferências deste documento.
<!-- specsfy:documentator:end -->

## Decisões Recentes

### PR #108 — Fechamento de Segurança e Integridade Financeira (Wallet CEO 2.0)
- **Remoção de Fallback no Frontend:** Autorizações de propostas passam exclusivamente pelo gateway backend (`WalletAiOrchestratorClient`), eliminando mutações diretas em tabelas via navegador sob falhas de rede ou HTTP 500.
- **Descarte com RBAC no Servidor:** `cancelProposalAtomically` valida papel do usuário, titularidade, isolamento de workspace e bloqueia descarte de propostas já executadas.
- **Barramento Operacional (`delivery_staff`):** Funcionários operacionais são proibidos de consultar faturamento, lucro, despesas, saldos, DRE, margens e custos no orquestrador e na Edge Function direta (`wallet-ai-query`).
- **Orçamento de IA Fail-Closed:** Falhas na leitura da configuração de orçamento acionam política conservadora fail-closed (`hardLimitExceeded: true`), protegendo contra custos descontrolados.
- **Fontes Financeiras Separadas:** Faturamento Eyemobile PDV, receitas financeiras disponíveis e repasses líquidos são reportados de forma independente, sem aplicação de `Math.max` ou falsos zeros sob erro.
- **Governança de Schema do Orquestrador e Homologação E2E:** A verificação de orçamento de IA trata ausência de tabela/view (ex: ambiente com migração pendente, 42P01/PGRST205) com fallback seguro para novo workspace, enquanto erros operacionais/conexão acionam fail-closed; o baseline de teste E2E em tests/setup-e2e-real-schema.sql foi sincronizado com as tabelas de telemetria e orçamentos.
