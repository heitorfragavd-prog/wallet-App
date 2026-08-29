# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [1.0.49] - 2026-09-01

### ✨ Novo
- **Observabilidade & Telemetria:**
  - Implementação completa de rastreamento e telemetria ponta-a-ponta.
  - Logs estruturados e sanitização nativa para Edge Functions (`_shared/observability`).
  - Trace end-to-end nas requisições da integração Pluggy e Proxy OpenAI.
  - Logs front-end unificados e estruturados, facilitando tracing de erros locais.
  - Adoção de `Correlation ID` garantindo a rastreabilidade completa das requisições, desde o Front-end até às chamadas a APIs de terceiros.
- **Resiliência:**
  - Melhorias no `ErrorService` e inclusão de `ErrorBoundary` para componentes da interface.

### 🔧 Corrigido & Melhorado
- Correção de falhas no linting e CI (Progressive Linting e Tipagem do Typescript).
- Remoção de comentários e regras suprimidas (`eslint-disable`) não utilizadas, aprimorando a confiabilidade do código.

### 📊 Estatísticas
- **6 commits na release 1.0.49**

---

## [1.0.47] - 2026-08-20

### ✨ Novo
- **Processamento de Imagem e OCR Avançado:**
  - Pipeline de pré-processamento para Notas Fiscais (DANFE) com auto-rotação, redimensionamento (2048px) e compressão JPEG de alta qualidade.
  - Implementação de OCR em 2 passos usando Chain-of-Thought Vision (GPT-4o) para leitura precisa de DANFE e boletos em qualquer orientação.
  - Leitura completa de todos os itens da DANFE com zoom automático na tabela de produtos.
  - Suporte a múltiplas formas de ingestão de notas fiscais: foto/OCR DANFE, arquivo XML/PDF nativo, e consulta direta no SEFAZ via chave de acesso.
- **Integração Eyemobile e Estoque:**
  - Sincronização automática contínua (cron a cada 6h) de produtos do Eyemobile, incluindo cálculo de margem real.
  - Sistema de **Alertas de Preço**: identificação de aumentos no custo líquido de compras (>10%) e notificação no Telegram.
- **Telegram Bot interativo:**
  - Inclusão de botões inline interativos (CONFIRMAR/EDITAR/IGNORAR) para gerenciar alertas de reajuste de preço no Eyemobile diretamente no Telegram.
  - Adicionado suporte a processamento de notas por áudio (Whisper).

### 🔧 Corrigido & Melhorado
- Validação OCR rigorosa anti-alucinação, rejeitando detecções errôneas e garantindo máxima fidelidade para ICMS-ST e produtos reais (SPAL, etc).
- Ajustes de prioridade absoluta para extração de DANFE sobre boletos no webhook do Telegram.
- Correção na resolução de usuário em callbacks de botões inline, suportando perfeitamente grupos e chats privados.
- Melhoria no fallback de OCR, correção no nível de confiança e filtro refinado por instituição bancária.

### 📊 Estatísticas
- **21 commits na release 1.0.47**

---

## [1.0.46] - 2026-08-18

### ✨ Novo
- **Automações e Lembretes:**
  - Sistema de **Lembretes Automáticos** implementado via Edge Function (`notificar-lembretes`) e migration (`130000_lembretes_automaticos.sql`).
  - Lembretes agora são exibidos diretamente no dashboard e na agenda (`Agenda.tsx`).
- **Telegram & IA V2:**
  - Suporte completo a aprovação de **Propostas do Agente IA** via Telegram (`120000_telegram_propostas.sql`).
  - O webhook do telegram agora pode gerenciar e executar callbacks de propostas pendentes da IA.

### 🔧 Corrigido & Melhorado
- Integrações e Webhooks: Atualizações massivas nos webhooks e API externas (`divipay-api`, `eyemobile-sync`, `openai-proxy`, `telegram-webhook`).
- **Eyemobile Dashboard:** Refinamentos nos componentes e hooks (`EyemobileDashboardView`, `useEyemobileDashboard`, `eyemobileDashboard.ts`) para melhorar o desempenho e consistência de dados.
- **Despesas e Relatórios:** Ajustes de layout nas páginas `Despesas` e componentes internos.

### 📊 Estatísticas
- **1 commit na release 1.0.46**

---

## [1.0.45] - 2026-08-18

### ✨ Novo
- **Módulo IA Agent V2:**
  - Implementação do novo orquestrador de IA (`wallet-ai-orchestrator` e `wallet-ai-query`).
  - Novos componentes de interface para o agente (`AgentV2Tab`, `AgentActionProposalCard`, `AgentVisualizationRenderer`).
  - Segurança aprimorada na comunicação via Edge Functions.
  - Novas migrations para dar suporte ao Agent V2 (`20260818010000_wallet_ai_phase1_security`, `conversations`, `action_proposals`).
- **Módulo de Equipe:**
  - Adicionado simulador de rescisão (`TerminationSimulator`) e breakdown de custos do empregado (`EmployeeCostBreakdown`).
  - Nova tabela/migration para configurações trabalhistas (`20260817140000_equipe_configuracao_trabalhista.sql`).
- **Privacidade & Segurança:**
  - Novo controle de privacidade (`PrivacyContext`, `PrivacyToggle`) que permite ocultar valores sensíveis no painel inteiro.

### 🔧 Corrigido & Melhorado
- Integração maciça de testes automatizados unitários e de componente (Vitest) cobrindo IA, Equipe, Rescisão e Componentes.
- Melhorias nos hooks de rescisão, cálculos, obrigações mensais e acertos semanais da equipe (`useEquipeResumo`, `useEquipeObrigacoesMensais`, `useEquipeAcertos`, etc.).

### 📊 Estatísticas
- **Múltiplos commits e +111 arquivos alterados na release 1.0.45**

---

## [1.0.44] - 2026-08-15

### ✨ Novo
- **Módulo de Equipe:**
  - Adicionado suporte a `EscalaFolguista` para gestão de turnos de folguistas.
  - Implementado sistema de contatos de emergência para colaboradores.
- **Faturas e Cartões:**
  - Novo modal `ImportarFaturaModal` para upload e importação de faturas de cartão de crédito.
  - Ajustes de datas de fechamento de faturas nas contas.
- **Eyemobile Cache:** Nova tabela de cache para otimizar dashboards do Eyemobile (`63_eyemobile_cache.sql`).
- **Métricas:** Novos hooks de médias mensais (`useMediaMensalDespesas`, `useMediaMensalReceitas`).
- **Banco de Dados:** Várias novas migrations (ficha técnica, contatos, escalas, faturas e cache).

### 🔧 Corrigido & Melhorado
- Atualizações em dependências (`package.json`, `package-lock.json`).
- Refatoração de múltiplos hooks de domínio financeiro e veículos (`useDividas`, `useTransacoes`, `useMetas`, `useVeiculos`).
- Melhorias nas telas `ContasCartoes`, `Despesas`, `Receitas`, e refinamentos do `AcertoSemanal` e `EquipeDetalhe`.

### 📊 Estatísticas
- **1 commit na release 1.0.44**

---

## [1.0.43] - 2026-08-13

### 🔧 Corrigido & Melhorado
- **Módulo de Equipe:**
  - Adicionado suporte a `vale_transporte_diario` no cadastro de colaboradores.
  - Ajustes no cálculo de Acerto Semanal (`useColaboradorCalculos`, `AcertoSemanal`).
  - Atualizações nos formulários de criação, edição e detalhe de equipe (`EquipeNovo`, `EquipeEditar`, `EquipeDetalhe`).
- **Banco de Dados:** Novas migrations (`58_vale_transporte_diario.sql`, `59_acerto_semanal_corrigido.sql`) para incluir novos campos e corrigir lógicas de cálculo no banco.

### 📊 Estatísticas
- **1 commit na release 1.0.43**

---

## [1.0.42] - 2026-08-13

### ✨ Novo
- **Módulo de Equipe** — Novo sistema de gestão de equipe e colaboradores, incluindo:
  - Listagem, criação e edição de colaboradores (`Equipe.tsx`, `EquipeNovo.tsx`, `EquipeEditar.tsx`).
  - Lançamento de custos, presenças e adiantamentos (`EquipeCustoNovo.tsx`, `EquipeDetalhe.tsx`).
  - Hooks especializados para cálculos complexos e gestão de estado (`useColaboradores`, `useColaboradorCustos`, `useColaboradorPresencas`, `useColaboradorCalculos`).
  - Aba de **Acerto Semanal** para consolidação de salários e pagamentos (`AcertoSemanal.tsx`).
- **Banco de Dados** — Nova migration `54.equipe.sql` para suportar a estrutura do módulo de equipe.

### 🔧 Melhorado
- **Dashboard e Layout** — Ajustes de navegação no `DashboardLayout.tsx` e melhorias nos hooks de `BurnRate`, `PontoEquilibrio` e `FluxoCaixaData`.
- **Componentes Compartilhados** — Pequenas atualizações visuais no componente `Avatar`.

### 📊 Estatísticas
- **1 commit na release 1.0.42**

---

## [1.0.41] - 2026-08-12

### ✨ Novo
- **Indicadores de Fluxo de Caixa** — Novos hooks `useBurnRate` e `usePontoEquilibrio` para cálculo de métricas de saúde financeira.

### 🔧 Melhorado
- **Dashboard e Fluxo de Caixa** — Ajustes na renderização de dados de caixa e no painel principal.
- **Cardápio** — Melhorias na exibição e layout da página de Cardápio.

### 📊 Estatísticas
- **1 commit na release 1.0.41**

---

## [1.0.40] - 2026-08-12

### Corrigido
- **wallet-public-api**: Corrige 7 bugs criticos na edge function de processamento de documentos
  - Cria tabela `ia_leitura_erros` para log de falhas de leitura da IA
  - Remove auto-pairing inseguro do Telegram (agora envia instrucoes de vinculo)
  - Corrige cabecalho EXIF (`0x0020`) para evitar corrupcao de imagens JPEG
  - Corrige formatacao Markdown (`*` em vez de `**`) para compatibilidade com Telegram
  - Adiciona filtro de `workspace_id` no comando `/confirmar`
  - Trunca mensagens do Telegram em 4096 caracteres (limite da API)
  - Adiciona `validarDadosNF()` para validar sanidade de Notas Fiscais

---

## [1.0.39] - 2026-08-12

### ✨ Novo
- **Módulo IA Unificado** — Migração e reestruturação dos recursos de Inteligência Artificial para o domínio `ia`, centralizando chat financeiro, análise e o novo `UploadInteligente` na página `/ia`.
- **API Pública Wallet** — Nova Edge Function `wallet-public-api` para integração externa com processamento de mídia.
- **Eyemobile e Divipay** — Migrações de banco (`51.eyemobile_produtos`, `52.channel_mappings`) para suporte a novos recursos e melhorias no pagamento de dívidas do Divipay.

### 🔧 Melhorado
- **Hooks e Serviços Financeiros** — Refatorações nos hooks `useDespesas`, `useDividas` e `FinanceService`.
- **Chat Financeiro** — Atualizações na Edge Function `openai-proxy` e no hook `useChatFinanceiro`.
- **PDV** — Ajustes menores no `PDVProductGrid`.

### 🗑️ Removido
- **Hooks e Páginas Antigas de IA** — Arquivos em `src/hooks/useIA*`, `src/pages/IA.tsx` e `IAChat.tsx` foram removidos e substituídos pelo novo módulo nativo.

### 📊 Estatísticas
- **1 commit na release 1.0.39**

---

## [1.0.38] - 2026-08-11

### 🔧 Melhorado
- **Módulo PDV** — Ajustes na grade de produtos (`PDVProductGrid`) e finalização de pagamentos (`PDVPaymentModal`), e na página principal (`PDVPage`).
- **Investimentos** — Refinamentos no `InvestimentosView`.
- **Despesas** — Ajustes na listagem e processamento (`useDespesas`, `Despesas.tsx`).
- **Integrações** — Atualizações no `ConciliacaoDivipayService` e `eyemobile-sync` para maior resiliência de sincronização.

### 📊 Estatísticas
- **1 commit na release 1.0.38**

---

## [1.0.37] - 2026-08-11

### ✨ Novo
- **Módulo PDV (Ponto de Venda)** — Novo PDV nativo (`/pdv`) com layout limpo e intuitivo:
  - Adição de produtos via grade de imagens e barra de pesquisa rápida.
  - Sidebar para configuração de operações e modo de venda.
  - Carrinho de compras em tempo real com hook `usePDVCart`.
  - Atalhos de teclado avançados via `usePDVHotkeys`.
  - Pagamentos e operações integradas com `pdvActionService`.

### 🔧 Melhorado
- **Investimentos e Simuladores** — Componentes e hooks otimizados, incluindo correções nos simuladores de rentabilidade e no `InvestimentosView`.
- **Eyemobile Sync** — Tratamentos adicionais no job de sincronização na Edge Function.

### 📊 Estatísticas
- **1 commit na release 1.0.37**

---

## [1.0.36] - 2026-08-07

### ✨ Novo
- **Simuladores de Investimento** — Novo `SimuladorJurosCompostosCard` e `SimuladorRentabilidadeCard` com hooks dedicados (`useSimuladorJurosCompostos`, `useSimuladorRentabilidade`) para projeção de rentabilidade e juros compostos.
- **Migração de melhorias** — Schema atualizado com migração `20250806_investimentos_melhorias.sql` para suportar novos campos e índices.

### 🔧 Melhorado
- **InvestimentosView** — Refatoração completa com novas funcionalidades de projeção e simulação.
- **Projeção de Investimentos** — Hook `useProjecaoInvestimentos` aprimorado com cálculos mais precisos.
- **Cron Alertas Investimentos** — Edge Function otimizada com melhor tratamento de erros e performance.
- **Eyemobile Sync** — Sincronização histórica aprimorada (modo HISTORY sem parâmetro `start`, maxPages 100).
- **Atualizar Cotações** — Pequenas otimizações na Edge Function.
- **Componentes** — Ajustes em `InvestimentoSenhaModal`, `InvestimentoDetalhe`, `MetaInvestimentoDetalhe`, `ContasCartoes`, `BankLogoBadge`.

### 🐛 Corrigido
- Configurações de investimentos — Correção no hook `useConfiguracoesInvestimentos`.
- Hook `useInvestimentos` — Ajustes pontuais.

### 📊 Estatísticas
- **1 commit na release 1.0.36**

---

## [1.0.35] - 2026-08-06

### ✨ Novo
- **Módulo de Investimentos Completo** — Lançamento do módulo avançado de investimentos e patrimônio (`eb224a3`), contendo:
  - Gestão de metas de investimento e depósitos vinculados.
  - Alocação e rebalanceamento automático de carteira.
  - Sugestões de depósitos inteligentes via Inteligência Artificial (`ia-deposito`).
  - Atualização diária automatizada de cotações (`atualizar-cotacoes`).
  - Alertas automatizados para variações de ativos (`cron-alertas-investimentos`).
  - Proteção por senha adicional exclusiva para área de investimentos.

### 📊 Estatísticas
- **1 commit na release 1.0.35**

---

## [1.0.34] - 2026-08-06

### ✨ Novo
- **Modais Unificados** — Criação de `NovaDespesaModal`, `NovaReceitaModal` e `TransferenciaModal` para unificar e simplificar o cadastro de lançamentos em todo o sistema (`2c1c439`)
- **Utilitários e Ícones** — Adicionado `categoriaIcons.ts` e `utils.ts` no domínio Divipay para padronização visual e lógica (`2c1c439`)

### 🔧 Melhorado
- **Dashboard e Cartões** — Refatorações visuais e lógicas no `ContasCartoesDashboardWidget`, `ContasCartoes.tsx` e `BankLogoBadge.tsx` (`2c1c439`)
- **Integrações** — Melhorias substanciais no `DivipayService`, `ConciliacaoDivipayService` e nas Edge Functions do `divipay-webhook` e `eyemobile-sync` (`2c1c439`)

### 🐛 Corrigido
- Ajustes finos nos hooks do domínio financeiro (`useDespesas`, `useReceitas`, `useFaturasCartao`, `useEyemobileDashboard`, `useComprasFatura`) (`2c1c439`)
- Correções pontuais na renderização e importação de componentes modais (`VerificarSaqueModal`, `FaturaCartaoModal`, `ImportadorExtratoModal`) (`2c1c439`)

### 📊 Estatísticas
- **1 commit na release 1.0.34**

---

## [1.0.33] - 2026-08-03

### ✨ Novo
- **Faturas de Cartão** — Infraestrutura completa para compras na fatura e gestão de faturas de cartão de crédito (hooks `useComprasFatura`, `useFaturasCartao` e schema atualizado) (`72fe051`)

### 📊 Estatísticas
- **1 commit na release 1.0.33**

---

## [1.0.32] - 2026-08-03

### ✨ Novo
- **Notificações e Alertas** — Infraestrutura completa de notificações Push e Telegram (webhook, disparos diretos e rotinas de cron) para faturas, dívidas e insumos (`1f82d6f`)
- **Importação de Extrato** — Suporte robusto para arquivos OFX e CSV, garantindo a carga correta de transações (`1f82d6f`)

### 🐛 Corrigido
- **Fatura de Cartão** — Correções pontuais e tratamentos adicionais no modal de faturas e no parser de extrato (`1f82d6f`)

### 📊 Estatísticas
- **1 commit na release 1.0.32**

---

## [1.0.31] - 2026-08-03

### ✨ Novo
- **Notificações** — Adicionadas configurações de notificações Push e integração com Telegram (`39193dc`)
- **Agenda** — Criação de compromissos manuais com título, local, data, hora, lembrete e opção de repetição (`c7e0f1c`)

### 🐛 Corrigido
- **Fatura de Cartão** — Lançamentos agora são corretamente filtrados pelo mês da fatura selecionada, sem misturar parcelas de outros meses (`1dae809`)

### 📊 Estatísticas
- **3 commits na release 1.0.31**

---

## [1.0.30] - 2026-08-02

### ✨ Novo
- **v3.1 Core Features** — Subcategorias, transferências entre contas, centros de custo, gestão de contatos, conciliação avançada, calendário financeiro (agenda) e emissão de recibos (`0e299d7`)

### 🔧 Melhorado
- **PDV Eyemobile** — Fix no ranking Top 10 e controle de estoque, com suporte a coluna de itens, modo PRODUCTS e fallback local com produtos ao vivo (`0e299d7`)
- **Assistente IA** — Respostas baseadas em dados reais consolidados usando `useReceitas` e `useDespesas` (suporte a vendas hoje/ontem/mês, despesas detalhadas, lucro líquido e saldo atual) (`560db7a`)

### 🐛 Corrigido
- **Agenda** — Receitas agora consolidadas por dia (1 linha com total) ao invés de listar cada venda individualmente (`9d831f3`)
- **Agenda** — Integração com `useReceitas` para garantir mesma consolidação da tela de Receitas (lançamentos manuais + PDV em dinheiro + Divipay líquido) (`b8c5f77`)

### 📊 Estatísticas
- **4 commits na release 1.0.30**

---

## [1.0.29] - 2026-08-02

### ✨ Novo
- **Fluxo de Caixa** — Reformulação com visão Mensal e Diária (Previsto x Realizado) (`0e068e4`)

### 🐛 Corrigido
- `eyemobile-sync` — Offset global quebrava sync incremental (`db83101`)
- `eyemobile-sync` — Aceitar `CRON_SECRET` para autenticação do cron (`6e05909`)
- Parcelas de Dívida — `parent_id` com FK quebrava o insert de parcelas (`cec9fdb`)
- Cadastro de dívidas parceladas no `FinanceService` (`createDebt`/`createTransaction`) (`529a897`)
- Relatórios — Ausência de receita digital Divipay + cobertura de despesas estendida desde 2025 (`b8d951b`)
- `Receitas.tsx` — Filtro padrão de data ajustado para 'hoje' e reordenação dos cards de métricas (`95c9534`)

### 📊 Estatísticas
- **7 commits na release 1.0.29**

---

## [1.0.28] - 2026-08-01

### ✨ Novo
- **Módulo de Cardápio e Ficha Técnica** — Gestão de produtos, receitas, insumos e margem de lucro (`/cardapio`, `/cardapio/novo`, `/cardapio/:id`)
- **Cálculo de Food Cost** — Cálculo automático do custo de produção por item e percentual de Food Cost (`useFoodCost`, `useFichaTecnica`, `useProdutosCardapio`)
- **Controle de Validades** — Monitoramento e alertas de insumos/produtos próximos do vencimento (`/validades`, `useValidadeInsumos`)
- **Hook useDRE** — Demonstrativo do Resultado do Exercício com dados reais e integração com DRE e Fluxo de Caixa
- **Migration** `20250731_ficha_tecnica_validade.sql` — Schema completo para fichas técnicas, ingredientes e controle de validades

### 🔧 Melhorado
- **DashboardLayout.tsx** — Inclusão de atalhos para Cardápio e Validades na navegação
- **App.tsx** — Rotas registradas para `/cardapio`, `/cardapio/novo`, `/cardapio/:id` e `/validades`
- **FluxoCaixaChart.tsx** & **DRE.tsx** — Projeção avançada e refinamentos visuais
- **Dockerfile** & **vite.config.ts** — Otimização de build e empacotamento

### 📊 Estatísticas
- **19 arquivos alterados** | **+2.214 inserções** | **-28 remoções**

---

## [1.0.27] - 2026-07-31

### 🔧 Melhorado
- **docker-publish.yml** — Fallbacks de credenciais no login do Docker Hub (`DOCKER_TOKEN`, `DOCKER_PASSWORD`, `DOCKERHUB_PASSWORD`); username com fallback para `heltonfraga`
- **useDivipayTransferencias.ts** — Histórico completo de saques Divipay (despesas desde 2025)
- **ConciliacaoDivipayService.ts** — Ajustes no serviço de conciliação
- **useReceitas.ts** — Receitas sem corte pelo limite de 1.000 linhas do PostgREST
- **useTransacoes.ts** — Transações sem corte pelo limite de 1.000 linhas do PostgREST
- **Dashboard.tsx** — Ajustes de exibição

### 🐛 Corrigido
- Histórico completo de saques Divipay truncado (despesas desde 2025)
- Receitas e despesas cortadas pelo limite de 1.000 linhas do PostgREST
- Pipeline CI/CD falha por `DOCKERHUB_TOKEN` não configurado como secret

### 📊 Estatísticas
- **6 arquivos alterados** | **+105 inserções** | **-64 remoções** | **4 commits**

---

## [1.0.26] - 2026-07-31

### ✨ Novo
- **ConciliacaoDivipayService.ts** — Serviço completo de conciliação Divipay em 3 camadas (523 linhas)
- **conciliacaoMatcher.ts** — Engine de matching automático de saques vs dívidas
- **conciliacaoMatcher.test.ts** — Testes unitários do matcher de conciliação
- **useDivipayConciliacao.ts** — Hook de conciliação Divipay
- **ConciliacoesPendentesCard.tsx** — Card de conciliações pendentes no painel
- **PagarDividaDivipayModal.tsx** — Modal de pagamento de dívida via Divipay
- **Migration** `55_conciliacao_divipay.sql` — Schema de conciliação
- **Migration** `56_workspace_despesas_automaticas.sql` — Despesas automáticas por workspace
- **Migration** `57_backfill_workspace_transacoes.sql` — Backfill de transações por workspace
- **Script** `investigar-saques-divipay.py` — Diagnóstico de saques Divipay

### 🔧 Melhorado
- **Dashboard.tsx** — Abre no mês vigente por padrão (saúde financeira do mês)
- **useEyemobileDashboard.ts** — Eyemobile PDV rápido e vendas PDV no workspace PJ
- **useContasUsuario.ts** — Saldo Divipay ao vivo via `/api/withdraws`
- **DivipayTransferenciasView** — Saques reais via `/api/withdraws`
- **useDivipayTransferencias.ts** — Refactoring e melhorias
- **DivipayService.ts** — Expansão do serviço
- **divipay-api (Edge Function)** — Ajustes de endpoint
- **divipay-webhook (Edge Function)** — Expansão do handler (+173 linhas)
- **eyemobile-sync (Edge Function)** — Melhorias de sincronização
- **Dividas.tsx** — Integração com conciliação Divipay
- **DashboardLayout.tsx** — Ajustes de navegação
- **supabase/types.ts** — Tipos atualizados (+78 linhas)
- **useDateRangeFilter.ts** — Melhorias no filtro de datas
- **docker-publish.yml** — Tag Docker atualizada para `heltonfraga/wallet:1.0.3`; branch gatilho corrigido para `master`

### 🐛 Corrigido
- Receitas consolidadas no Dashboard e vendas PDV no workspace PJ
- Despesas Divipay aparecem no workspace ativo
- Conciliação roda ao abrir o app sem duplicar dívidas
- 7 falhas pré-existentes em `FinanceService` e `usePagamentosDivida`

### 📊 Estatísticas
- **29 arquivos alterados** | **+2.292 inserções** | **-353 remoções** | **8 commits**

---

## [1.0.25] - 2026-07-30

### ✨ Novo
- **WorkspaceContext.tsx** — Contexto de múltiplos workspaces com persistência e troca dinâmica
- **WorkspaceSwitcher.tsx** — Componente de alternância de workspace no layout principal
- **DRETable.tsx** — Tabela de Demonstrativo de Resultados do Exercício (DRE)
- **FluxoCaixaChart.tsx** — Gráfico de Fluxo de Caixa Projetado
- **useDREData.ts** — Hook de dados para o DRE
- **useFluxoCaixaProjetado.ts** — Hook para projeção de fluxo de caixa
- **VerificarSaqueModal.tsx** — Modal detalhado de saques Divipay com tema claro
- **NotificationsPopover.tsx** — Popover de notificações do sistema
- **useNotificacoes.ts** — Hook de notificações em tempo real
- **lazyWithRetry.ts** — Utilitário para lazy loading com retry automático
- **DRE.tsx** — Nova página de DRE no menu
- **FluxoCaixa.tsx** — Nova página de Fluxo de Caixa no menu
- **GitHub Actions** `.github/workflows/docker-publish.yml` — CI/CD para build e push Docker multi-arch
- **Migration** `52_workspaces_schema.sql` — Schema de workspaces
- **Migration** `53_installment_engine_schema.sql` — Schema de parcelamentos
- **Migration** `54_notifications_schema.sql` — Schema de notificações
- **Scripts** de validação e diagnóstico Divipay (4 scripts Python)

### 🔧 Melhorado
- **EyemobileDashboardView** — Reformulação completa (+371 linhas)
- **ImportadorExtratoModal** — Melhorias de UX e fluxo de importação
- **useReceitas.ts** — Consolidação de receitas: Dinheiro Eyemobile + Entradas Digitais Divipay (Pix, Cartões, Boleto)
- **useTransacoes.ts** — Melhorias na busca e filtragem de transações
- **useDespesas.ts** — Refinamentos no hook de despesas
- **useDividas.ts** — Melhorias no hook de dívidas
- **FinanceService.ts** — Expansão do serviço financeiro
- **DashboardLayout.tsx** — Menu com DRE, Fluxo de Caixa, Notificações e WorkspaceSwitcher
- **App.tsx** — Rotas de DRE e FluxoCaixa registradas + lazy loading
- **supabase/types.ts** — Tipos atualizados (+63 linhas)
- **DivipayTransferenciasView** — Botão de visualização de saque vinculado ao modal
- **docker-stack.yml** — Stack atualizado para imagem 1.0.2
- **vite.config.ts** — Ajuste de configuração

### 🐛 Corrigido
- Receitas consolidadas: filtro refinado para movimentações Divipay (Entradas Digitais)
- Modal Verificar Saque: tema claro e prevenção de nulos
- Padrão de lazy loading com retry automático

### 📊 Estatísticas
- **36 arquivos alterados** | **+2.930 inserções** | **-316 remoções** | **14 commits**

---

## [1.0.24] - 2026-07-30

### ✨ Novo
- **DivipaySidebar.tsx** — Menu lateral retrátil estilo banco Divipay com alternância via botão de 3 riscos
- **SaquesFiltrosSheet.tsx** — Modal lateral de Filtros e paginação na tela de Saques
- Logo oficial Divipay na barra lateral e banner do dashboard
- Paginação completa por cursor com seletor de itens (20, 50, 100, 250, 500 por página)
- 80 transações de saques em 4 páginas no seletor de paginação

### 🔧 Melhorado
- **DivipayDashboardView** — Reformulação completa com UI/UX oficial (+620 linhas, filtros dinâmicos, gráfico Vendas no Mês)
- **DivipayTransferenciasView** — Redesign completo da tela de Saques idêntico ao painel oficial
- **useDivipayDashboard** — Filtros de busca e cálculo dinâmico de vendas e cobranças (+205 linhas)
- **DivipayExtratoView** — Melhorias de layout e UX
- **DivipayConfiguracoesView** — Ajustes de interface
- **useDivipayTransferencias** — Paginação e filtros avançados
- **DivipayService.ts** — Autenticação em produção corrigida
- **divipay-api (Edge Function)** — Correções de autenticação e fluxo (+127 linhas)
- **useContasUsuario.ts** — Sincronização do saldo real Divipay na tela de Contas e Cartões
- **ContasCartoes.tsx** — Exibição do saldo integrado Divipay

### 🐛 Corrigido
- Erro de sintaxe JSX no `DivipayTransferenciasView`
- Débitos técnicos e QA audit
- Formatação ISO de timestamps e contagens de meios de pagamento
- Distribuição uniforme de datas no gráfico de Vendas no Mês (01 a 30/31)
- Autenticação na Edge Function em produção
- Removido botão de Nova Transferência e submenus não utilizados (Aprovações, Em Lote, Favorecidos, Pagar com Pix)

### 📊 Estatísticas
- **17 arquivos alterados** | **+1.656 inserções** | **-290 remoções** | **21 commits**

---

## [1.0.23] - 2026-07-29

### ✨ Novo
- **Integração Divipay** — Plataforma financeira completa para gestão de cobranças PIX, transferências e extrato
- **DivipayDashboardView** — Saldo, transações recentes e métricas da conta
- **DivipayCobrancasView + NovaCobrancaPixModal** — Criação e gestão de cobranças PIX
- **DivipayTransferenciasView + NovaTransferenciaModal** — Transferências entre contas
- **DivipayExtratoView** — Extrato completo com filtros de data e categoria
- **DivipayConfiguracoesView** — Configuração de credenciais e webhooks
- **DivipayService.ts** — Serviço completo de API (283 funções, 10KB)
- **5 hooks** — useDivipayDashboard, useDivipayCobrancas, useDivipayTransferencias, useDivipayExtrato, useDivipayConfig
- **types.ts** — Tipos TypeScript para todo o domínio Divipay
- **Edge Function divipay-api** — API serverless no Supabase (359 linhas)
- **Edge Function divipay-webhook** — Handler de eventos/webhooks (313 linhas)
- **Migration 51.divipay_integration.sql** — Schema completo do banco de dados
- **Divipay.tsx** — Nova página com tabs (Dashboard, Cobranças, Transferências, Extrato, Configurações)
- Rota `/divipay` registrada no `App.tsx`

### 🔧 Melhorado
- **DashboardLayout.tsx** — Item Divipay adicionado ao menu lateral
- **supabase/types.ts** — Tipos TypeScript gerados para novas tabelas Divipay (+126 linhas)
- **lib/utils.ts** — Utilitários adicionais para formatação financeira
- **.gitignore** — Adicionado `.mcp.json` e padrão `vite.config.ts.timestamp-*.mjs`

### 🔒 Segurança
- Token PAT do Supabase removido do `.mcp.json` e adicionado ao `.gitignore`

### 📊 Estatísticas
- **26 arquivos alterados** | **+2872 inserções** | **-11 remoções**

---

## [1.0.22] - 2026-07-29

### ✨ Novo
- **Integração Eyemobile PDV** — Sincronização completa de vendas, produtos e dashboard financeiro via Eyemobile
- **EyemobileSettingsCard** — Configuração de credenciais e parâmetros da integração no painel admin
- **EyemobileDashboardView** — Componente de dashboard com métricas de vendas do PDV em tempo real
- **useEyemobileDashboard** — Hook de dados com cache, refresh automático e tratamento de erros
- **eyemobileDashboard.ts** — Serviço completo de comunicação com a API Eyemobile
- **Supabase Edge Function** `eyemobile-sync` — Sincronização serverless de transações PDV
- **EyemobilePDV.tsx** — Nova página dedicada ao PDV Eyemobile no menu principal
- **Migration** `50.eyemobile_integration.sql` — Schema de banco para dados do PDV

### 🔧 Melhorado
- **Receitas.tsx** — Integração com dados de vendas Eyemobile no fluxo de receitas
- **Dashboard.tsx** — Widget do Eyemobile PDV adicionado ao painel principal
- **ContasCartoesDashboardWidget.tsx** — Atualizado para incluir resumo PDV
- **useReceitas.ts** — Expandido para consumir dados Eyemobile junto às receitas bancárias
- **useDividas.ts** — Melhorias no hook de dívidas com contexto financeiro unificado
- **useFinancialContext.ts** — Contexto IA atualizado com dados do PDV
- **DashboardLayout.tsx** — Rota da página EyemobilePDV adicionada ao layout
- **Mercado.tsx**, **Despesas.tsx**, **Transacoes.tsx** — Ajustes de integração e contexto
- **useDateRangeFilter.ts** — Filtro de datas aprimorado para suportar sincronização PDV
- **App.tsx** — Rota `/eyemobile-pdv` registrada

### 🐛 Corrigido
- Parâmetro `start_date` na sincronização de vendas Eyemobile corrigido
- Remoção de arquivo de timestamp obsoleto (`vite.config.ts.timestamp-*.mjs`)

### 📊 Estatísticas
- **27 arquivos alterados** | **+3112 inserções** | **-113 remoções**

---

## [1.0.12] - 2024-11-28

### 🚀 Deploy
- Build e push da versão 1.0.12 para Docker Hub
- Suporte multi-arquitetura (linux/amd64, linux/arm64)

---

## [1.0.11] - 2024-11-27

### 🔧 Corrigido
- **Responsividade Mobile - Overflow Horizontal**
  - Corrigido scroll horizontal indesejado em dispositivos móveis
  - Adicionado `overflow-x-hidden` no container raiz do DashboardLayout
  - Adicionado `min-w-0` no container principal para evitar expansão de flex items
  - Wrapper com `max-w-full overflow-x-hidden` no conteúdo
  - Regras CSS globais para prevenir overflow em html, body e #root

### 🎨 Interface
- **Imagem da Homepage**
  - Atualizada imagem do hero para nova versão

---

## [1.0.10] - 2024-11-27

### 🎨 Interface
- **Responsividade da Página de Relatórios**
  - Tabs com ícones no mobile, texto completo em desktop
  - Cards principais em grid 2x2 no mobile
  - Gráficos com altura adaptativa (220px mobile / 280px desktop)
  - Tabela de transações convertida para cards no mobile
  - Fontes e espaçamentos otimizados para telas pequenas
  - Padding e margens ajustados em todos os cards

---

## [1.0.9] - 2024-11-27

### ✨ Adicionado
- **Sistema de Pagamento de Dívidas**
  - Botão "Pagar" agora funcional, abrindo modal de registro de pagamento
  - Registro automático de despesa ao pagar dívida (opcional via checkbox)
  - Atualização automática da dívida (valor_pago, valor_restante, parcelas_pagas, status)
  - Nova aba "Histórico" na página de Dívidas com todos os pagamentos realizados

### 🎨 Interface
- **Modal de Pagamento Responsivo**
  - Layout otimizado para telas menores com scroll
  - Resumo da dívida em grid compacto
  - Campos organizados em 2 colunas em telas maiores
  - Footer fixo com botões de ação

---

## [1.0.8] - 2024-11-27

### 🚀 Deploy
- Build e push da versão 1.0.8 para Docker Hub
- Suporte multi-arquitetura (linux/amd64, linux/arm64)

---

## [1.0.7] - 2024-11-26

### ✨ Adicionado
- **Sistema de Configurações de Contato Dinâmicas**
  - Migração para adicionar `contact_email` e `contact_phone` na tabela `system_settings`
  - Hook `useContactSettings` para buscar configurações públicas
  - Hook `useContactSettings` (admin) para gerenciar configurações
  - Formatação automática de números de WhatsApp e telefone
  - Card de configurações de contato no painel admin

### 🎨 Interface
- **Landing Page Premium**
  - Footer agora busca email e telefone dinamicamente do banco
  - Formatação automática de números de telefone
  - Removidos valores hardcoded de contato

### 🔧 Corrigido
- **Dark Mode**
  - FAQ agora segue corretamente as definições de dark mode
  - Background, textos e cards adaptados para dark mode
  - Melhor contraste em modo escuro

### 📊 Banco de Dados
- Tabela `system_settings` expandida com configurações de contato
- Valores padrão configurados para email e telefone

---

## [1.0.6] - 2024-11-26

### ✨ Adicionado
- **Sistema de Lembretes de Dívidas via Webhook**
  - Edge Function `process-reminders` para processar lembretes pendentes
  - Edge Function `test-webhook` para testar conectividade
  - Página de configuração de webhook no painel admin (`/admin/webhook-settings`)
  - Payload de teste com estrutura idêntica ao evento real
  - Campo `is_test: true` para identificar testes

### 🔧 Corrigido
- **Teste de Webhook**
  - Corrigido erro "Failed to fetch" causado por CORS
  - Teste agora é feito via Edge Function (server-side)
  - Payload de teste inclui dados de exemplo realistas

---

## [1.0.5] - 2024-11-26

### ✨ Adicionado
- **Theme Toggle no Layout**
  - Theme toggle e botão de logout agora na mesma linha horizontal
  - Layout adaptativo: vertical quando collapsed, horizontal quando expanded
  - Touch targets de 44x44px para melhor acessibilidade
  - ARIA labels adicionados para screen readers

- **Ícone de Carteira**
  - Substituído "M" e "W" por ícone de carteira (Wallet) do Lucide React
  - Aplicado em: DashboardLayout, Header, Footer, Login
  - Novo favicon.svg com ícone de carteira

### 🎨 Interface
- **Dark Mode Melhorado**
  - Página de login com suporte completo ao dark mode
  - Inputs com cores mais claras e melhor contraste
  - Gradientes adaptados para dark mode
  - Theme toggle fixo no canto superior direito da página de login
  - Links e textos com cores otimizadas para dark mode

### 🔧 Componentes Atualizados
- **AdminSidebar**
  - Layout horizontal no footer
  - Espaçamento otimizado (gap-2)
  - Touch targets adequados

- **DashboardLayout**
  - Layout inteligente baseado no estado do sidebar
  - Collapsed: ícones empilhados verticalmente
  - Expanded: ícones lado a lado horizontalmente
  - Mobile: sempre horizontal

- **Login Page**
  - Suporte completo ao dark mode
  - Card com fundo adaptativo
  - Theme toggle acessível
  - Ícone de carteira no logo

### 🎨 Cores e Temas
- Input background (dark): Aumentado de 17% para 24% de luminosidade
- Border (dark): Aumentado de 17% para 24% de luminosidade
- Ring (dark): Mudado para laranja (#f97316) para melhor feedback visual

### ♿ Acessibilidade
- Touch targets mínimos de 44x44px em todos os botões
- Tab order correto (logout primeiro, theme toggle depois)
- ARIA labels em botões de ação
- Tooltips preservados
- Navegação por teclado otimizada

---

## [1.0.4] - 2024-11-26

### 🔧 Corrigido
- **Dark Mode - Modal Detalhes do Veículo**
  - Corrigido labels e textos usando text-muted-foreground
  - Badges de status com cores adaptativas (opacity-based)
  - Cards de manutenção com bg-muted/50 e border-border
  - Botões de ação com cores dark mode (Excluir, Atualizar, Realizar)
  - Área vazia com cores do tema

---

## [1.0.3] - 2024-11-26

### 🔧 Corrigido
- **Dark Mode - Selects Nativos**
  - Corrigido dropdown de categoria em modais de edição
  - Selects nativos agora usam cores do tema (bg-background, text-foreground)
  - Opções de select visíveis em dark mode
  - Afetados: EditarDespesaModal, EditarReceitaModal, EditarTransacaoModal, EditarDividaModal, NovaMetaModal

---

## [1.0.2] - 2024-11-26

### ✨ Adicionado
- **Dark Mode Completo**
  - ThemeProvider com gerenciamento de estado
  - useTheme hook para acesso ao contexto
  - ThemeToggle component com ícones Sun/Moon
  - Detecção automática de preferência do sistema
  - Persistência da preferência em localStorage
  - Suporte a 3 modos: light, dark, system

### 🎨 Interface
- **Melhorias Visuais no Dark Mode**
  - Variáveis CSS otimizadas para melhor contraste
  - Sidebar com fundo diferenciado (`bg-card`)
  - Scrollbar customizada para dark mode
  - Todas as 25 páginas atualizadas
  - Botões e badges com opacidade adequada
  - Selects nativos com cores corretas
  - Tabelas admin com fundo apropriado

### 🔧 Componentes Atualizados
- **Layout**
  - DashboardLayout com suporte a dark mode
  - AdminSidebar com ThemeToggle
  - Header da landing page com ThemeToggle

- **Páginas**
  - Dashboard, Receitas, Despesas, Transações
  - Categorias, Metas, Dívidas, Mercado
  - Veículos, Perfil, Relatórios, IA
  - Todas as páginas Admin

### 📊 Cores e Temas
- Background: `224 71% 4%` (dark) / `0 0% 100%` (light)
- Card: `224 71% 6%` (dark) / `0 0% 100%` (light)
- Foreground: `213 31% 91%` (dark) / `222.2 84% 4.9%` (light)
- Border: `216 34% 17%` (dark) / `214.3 31.8% 91.4%` (light)

---

## [1.0.1] - 2025-11-21

### ✨ Adicionado
- **Sistema de Pagamento Completo**
  - Integração com gateway Pepper
  - Webhook para processar pagamentos automaticamente
  - Cadastro automático de usuários com senha aleatória
  - Envio de credenciais por email
  - Painel administrativo para configurar links de pagamento

- **Painel Administrativo Melhorado**
  - Nova aba "Pagamentos" para configuração
  - Componente AdminTabs reutilizável
  - Configuração de links de checkout por plano
  - URL do webhook com detecção automática de ambiente

- **Edge Function: payment-webhook**
  - Suporte ao formato Pepper (automático)
  - Suporte ao formato genérico
  - Conversão automática de centavos para reais
  - Criação de usuários com senha segura (12 caracteres)
  - Registro de pagamentos e assinaturas

### 🔧 Corrigido
- **Recursão Infinita nas Políticas RLS**
  - Simplificadas políticas de segurança
  - Eliminado loop infinito na verificação de admin
  - Página de login carrega sem erros

- **Sincronização de Perfis**
  - Emails sincronizados do auth.users
  - Trigger corrigido para novos usuários
  - Todos os usuários têm dados completos

- **Assinaturas Padrão**
  - Criadas assinaturas para todos os usuários
  - Plano Essencial (gratuito) como padrão
  - Dashboard mostra dados reais

### 📊 Banco de Dados
- Tabela `payment_links` - Links de checkout configuráveis
- Tabela `invite_tokens` - Tokens de convite (legacy)
- Melhorias em `webhook_logs` - Rastreamento completo
- Melhorias em `profiles` - Políticas RLS otimizadas
- Índices de performance adicionados

### 📚 Documentação
- `PAYMENT_SYSTEM_DOCUMENTATION.md` - Sistema de pagamento
- `PAYMENT_SYSTEM_V2.md` - Versão com senha direta
- `PEPPER_INTEGRATION.md` - Integração com Pepper
- `ADMIN_PANEL_ANALYSIS.md` - Análise do painel
- `RLS_RECURSION_FIX.md` - Correção de recursão
- `LOGIN_FIX.md` - Correção de login
- `USEFUL_QUERIES.sql` - Queries úteis

### 🚀 Deploy
- Script `deploy-multiarch.sh` para build multi-arquitetura
- Suporte para linux/amd64 e linux/arm64
- Versionamento automático

---

## [1.0.1] - 2025-11-25

### 🏗️ Reestruturação e Segurança

#### ✨ Infraestrutura
- **Módulo de Configuração**
  - Variáveis de ambiente centralizadas
  - Validação de configuração no startup
  - Remoção de credenciais hardcoded
  - Arquivo `.env.example` documentado

- **Sistema de Logging**
  - Logging estruturado em JSON
  - Sanitização automática de dados sensíveis (senhas, tokens, cartões)
  - Filtragem por nível de log baseada no ambiente
  - Logs com contexto e timestamp

- **Sistema de Erros**
  - Categorização automática de erros
  - Mensagens user-friendly sem detalhes técnicos
  - ErrorBoundary React component
  - Integração com logging

#### 🔒 Segurança
- **ProtectedRoute Melhorado**
  - Autorização completa antes de renderizar
  - Verificação de role server-side
  - Tratamento robusto de erros de perfil
  - Logging de decisões de autorização

- **Validação de Webhooks**
  - Validação de token obrigatória
  - Sanitização de payload (XSS, SQL injection, DoS)
  - Validação de campos obrigatórios
  - Logging de falhas de validação

#### 📁 Organização por Domínios
- **Estrutura Modular**
  - `domains/auth/` - Autenticação e autorização
  - `domains/finance/` - Gestão financeira
  - `domains/vehicles/` - Gestão de veículos
  - `domains/market/` - Lista de compras
  - `domains/admin/` - Painel administrativo
  - `shared/` - Componentes compartilhados
  - `core/` - Infraestrutura (logging, errors, config)

- **Separação de Responsabilidades**
  - Components: Apresentação
  - Hooks: Adaptadores React
  - Services: Lógica de negócio (sem React)
  - Types: Definições TypeScript

#### 📚 Documentação
- **AI-GUIDANCE.md**
  - Arquitetura de 4 camadas
  - Mapa completo de módulos
  - Guidelines de segurança
  - Convenções de código
  - Padrões e exemplos

- **Exports Centralizados**
  - `src/types/index.ts` com todos os tipos
  - Imports simplificados

### 🔧 Melhorias Técnicas
- Arquitetura limpa e testável
- Services independentes do React
- Logging estruturado em produção
- Tratamento de erros consistente
- Código organizado por domínio de negócio

### 🚀 Build e Deploy
- Build multi-arquitetura (amd64, arm64)
- Sem erros TypeScript
- Todos os imports atualizados

---

## [1.0.0] - 2025-11-19

### ✨ Inicial
- Sistema de gestão financeira pessoal
- Dashboard com visão geral
- Gestão de receitas e despesas
- Gestão de dívidas
- Metas financeiras
- Controle de estoque (mercado)
- Gestão de veículos
- Análise com IA
- Autenticação com Supabase
- Interface responsiva com Tailwind CSS

---

## Formato

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

### Tipos de Mudanças
- `Adicionado` para novas funcionalidades
- `Modificado` para mudanças em funcionalidades existentes
- `Descontinuado` para funcionalidades que serão removidas
- `Removido` para funcionalidades removidas
- `Corrigido` para correções de bugs
- `Segurança` para vulnerabilidades corrigidas
