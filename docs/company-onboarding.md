# Onboarding — empresa de agentes Wallet

## Escopo e fontes

Inspeção estática do projeto e configuração de perfis Hermes. Não é auditoria integral de cada linha, banco remoto, GitHub remoto ou ambiente implantado. Os sete arquivos de aplicação/configuração previamente alterados foram preservados. Não houve commit, push, deploy, movimentação financeira ou execução de testes contra banco.

Fontes conferidas: `package.json`, `src/App.tsx`, `src/domains/finance/hooks/usePagamentosDivida.ts`, `vite.config.ts`, `.github/workflows/ci.yml`, contextos Specsfy e inspeções paralelas de domínios, migrations, funções, testes e operação.

## Mapa de responsabilidades

O produto combina finanças PF/PJ, operação comercial, equipe/RH financeiro e assistência por IA. Usa React/TypeScript/Vite, TanStack Query e backend Supabase. Regras distribuídas entre frontend, Edge Functions, RPCs e triggers pedem coordenação explícita entre especialistas.

Equipe e fontes das identidades: `.hermes/company/team.json`, `.hermes/company/souls/<perfil>/SOUL.md` e `.hermes/company/OPERATING-MODEL.md`. Perfis operacionais residem no diretório de perfis Hermes do usuário; o CTO reaproveita `assitent-dev`.

## Pontos para investigação futura, não correções realizadas

- O comando `node node_modules/typescript/bin/tsc --noEmit --listFilesOnly` retornou saída vazia e exit code 0. O gate raiz não comprova tipagem dos projetos referenciados. Responsáveis: Alice/Rafael/Gabriel.
- O hook de pagamentos insere pagamento e atualiza dívida em chamadas distintas; o update em `usePagamentosDivida.ts` não inspeciona erro. Reconciliar com triggers e testar atomicidade/concorrência em ambiente isolado antes de propor correção. Responsáveis: Davi/Beatriz/Maya.
- Workflows locais não demonstram required checks/rulesets remotos. A publicação Docker e a bateria de segurança precisam de revisão conjunta do caminho de release. Responsáveis: Gabriel/Lucas/Maya.
- Relatórios de inspeção apontam risco de escopo PF/PJ em Divipay, semântica de aprovação de pedido PDV, DRE parcial e implementação SEFAZ incompleta. São entradas para reprodução e refinamento; não assumir incidente em produção.

## Evidência documental

Executados: `specsfy doctor --project .`, setup_context, update_stack, build_documentation e build_documentation `--check`; os comandos de reconstrução documental retornaram 0. Geradores idempotentes podem não criar diff: o monitor baseado em caminhos exige uma evidência em `docs/`, fornecida por este onboarding, sem alterar artificialmente os blocos gerados.

Revisão visual: não aplicável à aplicação; a entrega é configuração de agentes e documentação, sem mudança de UI do Wallet. Não reiniciar Vite por configuração de bots.

As configurações e testes dos bots são registrados separadamente em `.hermes/company/VERIFICATION.md`. Perfis existentes no disco não provam comunicação com o provedor, mensagens entre agentes ou automação 24/7.
