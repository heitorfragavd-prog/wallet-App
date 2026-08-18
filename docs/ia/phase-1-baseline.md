# Wallet Finance Agent V2 — Fase 1 Baseline

Data: 17 de agosto de 2026

## Branch e worktree

- Worktree: `C:\Users\Heitor\OneDrive\Documentos\New project\wallet-comparativos`
- Git dir: `C:\Users\Heitor\OneDrive\Documentos\Dev\wallet\.git\worktrees\wallet-comparativos`
- Branch: `feat/ia-agente-financeiro-v2`
- Base comum com `develop`: `2af97c2`
- `develop...HEAD`: 0 commits exclusivos em `develop`, 6 em HEAD antes da implementação.
- `master...HEAD`: 22 commits exclusivos em `master`, 6 em HEAD; `master` não é a base mais recente das funcionalidades usadas por esta branch.
- `fix/correcoes-criticas-v1.0.45...HEAD`: 21 commits exclusivos na correção, 2 commits documentais exclusivos em HEAD no momento da comparação.

A branch da IA foi derivada de `feat/comparativo-financeiro-diario` para preservar a implementação mais recente de Comparativos, que será uma das fontes canônicas futuras. A branch de correções contém mudanças extensas de Equipe ainda não integradas e alterações pontuais em `assistente-financeiro` e `openai-proxy`; elas não serão copiadas cegamente para a Fase 1.

## Baseline de comandos

### Testes

`npm test` dentro do sandbox falhou antes de carregar o Vitest porque o esbuild tentou ler um diretório ancestral sem permissão. Fora do sandbox, o Vitest iniciou normalmente. Testes focados novos devem ser executados fora do sandbox neste worktree.

### Build

`npm run build` dentro do sandbox falhou antes da compilação pelo mesmo bloqueio do esbuild ao carregar `vite.config.ts`. O build final deve ser repetido fora do sandbox.

### TypeScript

`npx tsc -b --pretty false` não produziu diagnóstico e não finalizou no limite do baseline; o processo foi interrompido. A verificação será repetida após a implementação, com limite e registro explícitos.

### Lint

`npm run lint` finalizou com 715 ocorrências preexistentes: 404 erros e 311 avisos. Elas abrangem muitos módulos fora da IA, inclusive integrações e funções legadas. O critério desta fase é não criar novos erros nos arquivos alterados e registrar separadamente o passivo global.

## Riscos confirmados antes da implementação

1. `supabase/functions/assistente-financeiro/index.ts` aceita `userId` no body e usa service role para consultar dados, permitindo que a identidade do cliente influencie a autorização.
2. `src/domains/ia/hooks/useFinancialContext.ts` usa filtros `workspace_id.eq.<id>,workspace_id.is.null`, misturando registros sem workspace com o workspace ativo.
3. O contexto atual concatena `receitas`/`despesas` com `transacoes` sem chave canônica de deduplicação.
4. Algumas fontes consultadas pelo contexto não recebem filtro de workspace.
5. O frontend envia um grande snapshot financeiro ao modelo em vez de ferramentas server-side mínimas e rastreáveis.
6. O schema atual de workspace representa propriedade direta por `workspaces.user_id`; membros e grupos não fazem parte da Fase 1.

## Escopo da Fase 1

- proprietário autenticado e workspace próprio;
- consultas somente de leitura;
- receitas, despesas, transações, saldos, dívidas e resumo mensal;
- deduplicação canônica inicial;
- auditoria sanitizada;
- nenhum WhatsApp ou Telegram;
- nenhuma escrita financeira;
- nenhuma migração para Responses API nesta fase.
