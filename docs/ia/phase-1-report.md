# Wallet Finance Agent V2 — Relatório da Fase 1

Data: 17 de agosto de 2026

## Resultado

A Fase 1 entrega uma rota server-side de consultas financeiras autenticadas, isoladas por workspace e limitada a ferramentas de leitura. Nenhuma integração com grupos, nenhuma escrita financeira e nenhuma migração para a Responses API foram incluídas.

## Implementado

- Autenticação por Bearer token validado no Supabase Auth.
- Identidade derivada no servidor; `user_id` do body é rejeitado.
- Validação de propriedade do workspace antes do uso de service role.
- Contexto de execução imutável com usuário e workspace autenticados.
- Repositório que aplica simultaneamente `user_id` e `workspace_id` em todas as fontes prioritárias.
- Camada canônica inicial para receita, despesa, transferência, saldo e resultado de caixa.
- Deduplicação por chave canônica e falha fechada para registros fora do escopo.
- Ferramentas `buscar_receitas`, `buscar_despesas`, `buscar_transacoes`, `consultar_saldos`, `consultar_dividas` e `consultar_resumo_mensal`.
- Edge Function `wallet-ai-query` com allowlist, CORS, erros sanitizados e auditoria.
- Cliente frontend mínimo que não envia identidade do usuário.
- Remoção do fallback `workspace_id IS NULL` no contexto legado.
- Endurecimento da função legada `assistente-financeiro`, que deixou de confiar em `userId` do body.
- Migration com escopo de workspace para contas, chaves de deduplicação e auditoria sanitizada.
- Rollback explícito limitado aos objetos criados pela migration.

## Migration

Arquivo: `supabase/migrations/20260818010000_wallet_ai_phase1_security.sql`

Efeitos:

- adiciona e preenche `contas_usuario.workspace_id`;
- interrompe a migration se existir conta sem workspace válido;
- adiciona `deduplication_key` a receitas, despesas e transações;
- cria índices únicos de deduplicação por workspace;
- cria `wallet_ai_audit_events` com RLS e sem acesso direto para `anon` ou `authenticated`.

Rollback: `supabase/migrations/rollback/20260818010000_wallet_ai_phase1_security.down.sql`.

A migration não foi aplicada a produção nesta fase.

## Evidências de teste

### Testes focados

Comando:

```text
npx vitest --run --pool=threads --maxWorkers=1 src/domains/ia/agent-core src/domains/ia/services/WalletAiQueryClient.test.ts
```

Resultado: 11 arquivos, 38 testes, 38 aprovados, 0 falhas.

Cobertura comportamental:

- tokens ausentes, malformados e inválidos;
- workspace inexistente ou pertencente a outro usuário;
- ordem autorização antes de ferramenta;
- rejeição de identidade controlada pelo cliente;
- allowlist de ferramentas somente de leitura;
- períodos inválidos;
- deduplicação e separação de transferências;
- saldo separado de resultado de caixa;
- filtros simultâneos de usuário e workspace;
- vazamento de erros internos;
- metadados de auditoria sanitizados;
- migration e rollback;
- cliente frontend;
- remoção dos dois caminhos legados inseguros.

### Lint focado

Resultado: aprovado, 0 erros e 0 avisos nos arquivos da Fase 1 e no contexto legado alterado.

O lint global do baseline permanece com 404 erros e 311 avisos preexistentes fora do escopo desta fase.

### Build

`npm run build`: aprovado em 2 minutos e 47 segundos.

Avisos preexistentes observados: uma regra CSS inválida (`-3: BRT`), base Browserslist desatualizada e chunks acima de 500 kB. Nenhum deles impediu o build.

### TypeScript

`npx tsc -b --pretty false` e `npx tsc -p tsconfig.app.json --noEmit --pretty false --incremental false` foram executados, mas permaneceram sem saída por vários minutos no worktree do OneDrive e precisaram ser interrompidos. Uma tentativa posterior de checagem focada foi bloqueada pelo limite de execuções elevadas do ambiente. O build Vite e o lint focado passaram, mas uma execução completa do TypeScript continua pendente como evidência operacional.

## Arquivos funcionais

- `supabase/functions/_shared/ai/auth.ts`
- `supabase/functions/_shared/ai/financial-types.ts`
- `supabase/functions/_shared/ai/financial-core.ts`
- `supabase/functions/_shared/ai/financial-repository.ts`
- `supabase/functions/_shared/ai/query-tools.ts`
- `supabase/functions/wallet-ai-query/handler.ts`
- `supabase/functions/wallet-ai-query/supabase-adapter.ts`
- `supabase/functions/wallet-ai-query/index.ts`
- `src/domains/ia/services/WalletAiQueryClient.ts`
- `src/domains/ia/hooks/useFinancialContext.ts`
- `supabase/functions/assistente-financeiro/index.ts`

## Pendências explícitas

- aplicar e validar a migration em Supabase local ou ambiente de homologação;
- executar o TypeScript completo em ambiente sem o bloqueio observado;
- conectar o novo cliente ao chat por feature flag na fase de orquestração;
- definir chaves de deduplicação compartilhadas nos fluxos de ingestão PDV, Eyemobile e Divipay;
- migrar os demais módulos para a camada canônica;
- implementar streaming, Responses API, gráficos, documentos e ações nas fases posteriores;
- implementar grupos WhatsApp/Telegram somente na fase final prevista.

## Parecer

A fundação da Fase 1 está implementada e testada no código, mas ainda não está pronta para produção. A liberação exige migration validada em homologação, TypeScript completo aprovado e implantação da nova Edge Function com smoke test autenticado.
