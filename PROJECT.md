# Projeto

## História e motivação

Descreva a origem do projeto, o problema que motivou sua criação e sua evolução.

## Finalidade

Explique para que o sistema serve e qual resultado entrega.

## Pessoas e contexto de uso

Registre quem usa o sistema e em quais situações.

## Capacidades principais

Liste as capacidades estáveis sem transformar esta descrição em inventário de
rotas, schemas ou tarefas.

## Limites

Explique o que o sistema deliberadamente não faz.

## Contexto técnico

Modelo inicial sugerido a partir de: **stack ainda não identificado**. Detalhes verificáveis
ficam em `.specsfy/STACK.md` e `.specsfy/DATABASE.md`.

Confirme os manifests e as fronteiras principais antes de completar o modelo genérico.

## Contexto observado no código — onboarding da empresa de agentes

O Wallet é uma aplicação de gestão financeira PF/PJ, com operação comercial e assistência por IA. As rotas em `src/App.tsx` abrangem receitas, despesas, transações, dívidas, contas/cartões, metas, investimentos, DRE, fluxo de caixa, conciliação e relatórios. Também existem PDV, cardápio, validades, fornecedores, centros de custo, equipe/RH financeiro, veículos e administração.

A aplicação usa React/TypeScript/Vite e Supabase. `src/domains/` separa áreas de negócio; hooks, serviços, Edge Functions e migrations compartilham regras. `src/contexts/WorkspaceContext.tsx` mantém contexto PF/PJ. A presença de rotas e código não comprova implantação nem correção em produção.

Integrações observadas: Eyemobile, Divipay, Pluggy, Telegram, WhatsApp e provedores de IA, em `supabase/functions/` e seus consumidores. Não tratar a estrutura SEFAZ como integração fiscal concluída sem comprovar consulta real.

A gestão do desenvolvimento conta com agentes Hermes persistentes: CEO coordenadora, CTO e especialistas em produto/UX, frontend, backend/dados, domínio financeiro, segurança, QA, GitHub e SRE. As identidades e o protocolo estão em `.hermes/company/`; não fazem parte dos agentes de IA do aplicativo nem alteram sua autorização.

Esta revisão preserva o código previamente modificado. A inspeção arquitetural não constitui auditoria completa, validação do banco remoto nem autorização de publicação.
