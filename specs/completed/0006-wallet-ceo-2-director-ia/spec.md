# Especificação Integrada: Wallet CEO 2.0 — Diretor Executivo Digital com IA Avançada

| Campo | Valor |
| :--- | :--- |
| Formato | Specsfy/2.0 |
| ID | SPEC-0006 |
| Slug | 0006-wallet-ceo-2-director-ia |
| Status | Complete |
| Effort | 8 |
| Effort updated at | 2026-10-31 |
| Effort rationale | Transformação completa do Wallet CEO em um Diretor Executivo Digital multicanal (Web + Telegram existente) com orquestração inteligente entre 7 departamentos, roteamento automático por intenção, seleção de modelos de alto nível por complexidade, controle e observabilidade de custos, memória e histórico compartilhado, correção do problema de indicadores zerados, e modernização visual premium baseada em 6 painéis de referência. |
| ClickUp Task | |
| Milestones | Wallet CEO 2.0 |
| Definition Gate | Passed |
| Plan Gate | Passed |
| Delivery Gate | Passed |
| Evidence Contract | 1 |
| Interface para pessoas | Sim |
| Atualizada em | 2026-10-31 |

---

## Ato I — Definir

### 1. Problema e Resultado

#### 1.1 Contexto e Problema
O Wallet App possui a fundação operacional e financeira da **Rodo Point** (restaurante, lanchonete e conveniência) homologada em produção (`https://wallet.wonderwold.com.br`), contando com mais de 81.000 transações reais no banco de dados e módulos de PDV (Eyemobile), conciliação (Divipay), DRE e a fundação recente do Wallet CEO e Delivery Growth (SPEC-0005).

Contudo, a experiência executiva atual apresenta limitações materiais:
1. **Indicadores Zerados ou Distorcidos:** O Wallet CEO apresenta receita analisada de R$ 0,00, CMV de 0%, margem bruta de 100% e oportunidades zeradas, devido à ausência de fichas técnicas detalhadas cadastradas e à falta de fallback analítico para transações financeiras reais agregadas, além de classificar erroneamente departamentos como "saudáveis" apenas por ausência de dados.
2. **Fragmentação de Inteligência:** A IA atual opera primariamente no módulo de chat financeiro ou no webhook do Telegram de forma pontual para OCR de boletos e consultas simples, sem um Diretor Executivo Digital unificado capaz de raciocinar estrategicamente sobre o negócio da Rodo Point.
3. **Falta de Memória Compartilhada entre Web e Telegram:** O proprietário precisa iniciar uma conversa na Web e poder continuá-la naturalmente pelo bot do Telegram existente, recuperando planos executivos e decisões autorizadas.
4. **Desconexão com a Experiência Visual Premium:** As telas de vendas, despesas, oportunidades e canais necessitam da identidade visual refinada, organizada e de alta densidade visual definida nas 6 imagens de referência enviadas pelo proprietário.

#### 1.2 Resultado Desejado
1. **Inteligência Central Única & Multicanal:** Um único cérebro digital da Wallet coordenando os 7 departamentos executivos, acessível tanto pela Web (`/ceo` e chat principal) quanto pelo bot oficial do Telegram existente (sem criar novo bot e preservando integralmente o fluxo de boletos/DANFE).
2. **Roteamento Automático por Intenção:** Reconhecimento automático da necessidade da consulta (financeiro, vendas, despesas, margens, delivery, planejamento estratégico), acionando as ferramentas certas sem exigir comandos rígidos (com suporte opcional a `/ceo`).
3. **Política de Modelos Inteligente por Complexidade:**
   - *Nível 1 (Consultas Simples):* Consultas diretas determinísticas e modelos ágeis/econômicos.
   - *Nível 2 (Análises Intermediárias):* Modelos analíticos estruturados.
   - *Nível 3 (Diretoria Executiva Avançada):* Modelos de raciocínio profundo para planos de 90 dias, reprecificação e estratégias de lucro.
4. **Resolução de Indicadores Zerados & Estados Honestos:**
   - Distinção explícita entre **Receita Total Real** (das transações consolidadas), **Receita Analisada por Produto** e **Custos de Fichas Técnicas**.
   - Quando não houver custos suficientes, sinalizar explicitamente `Dados Insuficientes` ou `Atenção` em vez de mascarar com 0% CMV ou 100% margem.
5. **Observabilidade e Gestão de Custos de IA:** Rastreamento transparente de tokens (entrada/saída), custo estimado em USD por mensagem/canal, e painel de consumo com orçamento de referência configurável (ex: US$ 10) e alertas em 50%, 80% e 100%.
6. **Design Premium Fiel às 6 Referências Visuais:**
   - Painel 1: Página Principal do CEO (Visão Executiva, Hero Card com avatar e ações do dia, 4 KPIs macro e Chat Central).
   - Painel 2: Análise Comercial e Vendas (Evolução, Canais, Top 10 Produtos, Heatmap de horários).
   - Painel 3: Análise Financeira e Despesas (Donut por categoria, evolução mensal, Top 5 despesas).
   - Painel 4: Oportunidades e Plano de Crescimento (Cartões por prioridade, cálculo de impacto financeiro mensal, conversão em experimentos).
   - Painel 5: Delivery Growth (Gestão honesta dos estados de integração dos canais: iFood, 99Food e Direto).
   - Painel 6: KDS Cozinha (Painel responsivo para Mac/Android, timers, alerta sonoro e checklist sem vazamento financeiro).
7. **Ações do CEO com Confirmação Humana (Action Gateway):** Toda recomendação que envolva criação de experimentos, metas ou mutações exige confirmação explícita do proprietário.

---

### 2. Referências Visuais Obrigatórias

| Imagem / Painel | Nome do Painel | Componentes-Chave |
| :--- | :--- | :--- |
| **01** | **Wallet CEO — Página Principal (Conversa + Visão Executiva)** | Header com data/atualização, tabs superiores, Hero Card com saudação, faturamento de ontem/mês e principais ações de hoje, 4 KPIs (Faturamento, Lucro Estimado, CMV, Despesas), Chat Conversacional com histórico, nova conversa, input estilizado e pills de perguntas sugeridas. |
| **02** | **Análise de Vendas e Produtos** | Breadcrumb comercial, filtros de período/comparação/canal, 4 KPIs (Vendas Totais, Pedidos, Ticket Médio, Itens Vendidos), Gráfico de Linhas de Evolução vs Período Anterior, Donut de Vendas por Canal, Tabela Top 10 Produtos por Faturamento, Heatmap de Horários de Maior Movimento (11h–23h / Seg–Dom). |
| **03** | **Análise de Despesas** | Breadcrumb financeiro, filtros, 3 KPIs (Total de Despesas, Maior Categoria, Variação vs Mês Anterior), Donut de Despesas por Categoria com legenda percentual, Gráfico de Barras de Evolução Mensal, Tabela Top 5 Detalhamento de Despesas com variações. |
| **04** | **Oportunidades e Plano de Crescimento** | Tabs (Oportunidades, Plano de Crescimento, Experimentos), Lista de Oportunidades com numeração circular, badges de prioridade coloridas (Alta, Média, Baixa), justificativa/evidência, Impacto Estimado em +R$/mês e botões de ação ("Criar Experimento" / "Ver Detalhes"). |
| **05** | **Delivery Growth — Gestão de Canais** | Cards dedicados para iFood, 99Food e Direto/WhatsApp; status real honesto ("Aguardando integração", "Aguardando credenciais", "Canal Próprio / Ativa no KDS"), comissões contratuais, taxas de pagamento e botão de atalho para KDS. |
| **06** | **KDS — Painel de Cozinha** | Barra de contadores rápidos (Pedidos Pendentes, Em Preparo, Prontos, Tempo Médio), botão Tela Cheia, Tabela/Kanban de Pedidos em Tempo Real com canal, cliente, itens, tempo corrido e status de preparo. |

---

### 3. Contratos de Dados, Arquitetura e Segurança

#### 3.1 Arquitetura da Inteligência Central
```
                     [ PROPRIETÁRIO / USUÁRIO AUTORIZADO ]
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
     [ CANAL 1: WALLET APP ]                       [ CANAL 2: BOT TELEGRAM ]
  (Chat Web /ceo + Dashboards)                 (Bot @wallet_bot existente)
              │                                               │
              │  (JWT Authenticated)                          │  (Vínculo Seguro de ChatId)
              └───────────────────────┬───────────────────────┘
                                      ▼
                        [ WALLET AI ORCHESTRATOR CORE ]
               (supabase/functions/wallet-ai-orchestrator)
                                      │
      ┌───────────────────────────────┼───────────────────────────────┐
      ▼                               ▼                               ▼
[ INTENT ROUTER ]             [ MODEL SELECTOR ]             [ MEMORY & CONTEXT ]
- Finanças / DRE              - Nível 1: Ágil / Rápido       - Histórico Conversas
- Vendas / PDV                - Nível 2: Analítico           - Resumo Periódico
- Despesas & Custos           - Nível 3: Diretor Avançado    - Planos Executivos
- Delivery & KDS              - Failover Automático          - Isolamento Workspace
- Documental (Boletos)
      │                               │                               │
      └───────────────────────────────┼───────────────────────────────┘
                                      ▼
                    [ READ TOOLS & DETERMINISTIC REPO ]
  ┌───────────────────────────────────────────────────────────────────────┐
  │ 1. Transações / Eyemobile PDV      5. Laboratório de Experimentos     │
  │ 2. Despesas & Contas               6. Canais e Pedidos Delivery       │
  │ 3. CMV Ponderado & Fichas          7. Telemetria e Orçamento de IA    │
  │ 4. Conciliações Divipay            8. Action Gateway (Human in Loop)  │
  └───────────────────────────────────────────────────────────────────────┘
```

#### 3.2 Isolamento de Segurança & Perfis
- **Administrador / Proprietário:** Acesso integral ao Wallet CEO, histórico de conversas, custos de IA, DRE, metas e experimentos.
- **Delivery Staff:** Acesso estrito e exclusivo à Central do Funcionário / KDS (`v_delivery_orders_operacional`), com zero acesso a saldos bancários, lucro, comissões ou relatórios do CEO.
- **Telegram:** Vinculação estrita via token gerado no sistema autenticado (`telegram_vinculos_seguros` / configs existentes), impedindo acesso a dados financeiros por usuários externos que apenas enviem comandos no bot.

---

## Ato II — Planejar

### Tarefas da FASE 1.6

#### SUBETAPA 1.6A — DIAGNÓSTICO E FUNDAÇÃO
- [X] `1.6A.1` Implementar o cálculo resiliente de indicadores no frontend e backend: resolver o problema dos números zerados através de fallback automático para transações agregadas quando não houver fichas cadastradas.
- [X] `1.6A.2` Criar os estados analíticos honestos (`Saudável`, `Atenção`, `Crítico`, `Dados Insuficientes`, `Erro`) para departamentos e cards de CMV.
- [X] `1.6A.3` Estruturar o modelo de dados para telemetria de consumo de IA, limites de orçamento e histórico compartilhado entre canais (migration versionada).

#### SUBETAPA 1.6B — CEO CONVERSACIONAL (CORE DA IA)
- [X] `1.6B.1` Estender o catálogo de ferramentas no `query-tools.ts` e `orchestrator-core.ts` para cobrir os 7 departamentos do CEO (análise de vendas, comparativos, despesas, canais e experimentos).
- [X] `1.6B.2` Implementar o roteador de intenção automático e a política de modelos por complexidade (Níveis 1, 2 e 3) com failover seguro.
- [X] `1.6B.3` Conectar o chat conversacional da Web ao `WalletAiOrchestratorClient` com suporte a novas conversas, histórico persistente, cancelamento e indicação clara de fontes de dados consultadas.

#### SUBETAPA 1.6C — TELEGRAM E CONTEXTO COMPARTILHADO
- [X] `1.6C.1` Integrar o roteador executivo ao `telegram-channel-adapter.ts` e `telegram-webhook`, permitindo responder naturalmente a perguntas do CEO no Telegram preservando 100% dos fluxos documentais existentes (boletos, DANFE, alertas).
- [X] `1.6C.2` Implementar o suporte a comando `/ceo` explícito e roteamento transparente de conversas contextuais.
- [X] `1.6C.3` Assegurar que conversas e planos executivos iniciados na Web possam ser consultados e acompanhados pelo Telegram do proprietário via memória canônica unificada.

#### SUBETAPA 1.6D — INTERFACE VISUAL PREMIUM (6 REFERÊNCIAS)
- [X] `1.6D.1` **Painel 1 (Wallet CEO Principal):** Implementar o novo layout com Hero Card, 4 KPIs macro atualizados com dados reais e Chat Central integrado.
- [X] `1.6D.2` **Painel 2 (Análise de Vendas e Produtos):** Criar página/aba comercial com filtros de período/canal, gráficos de evolução, donut de canais, ranking Top 10 e heatmap de horários de pico.
- [X] `1.6D.3` **Painel 3 (Análise de Despesas):** Criar página/aba de despesas com KPIs, donut de categorias, gráfico de barras mensal e tabela de detalhamento Top 5.
- [X] `1.6D.4` **Painel 4 (Oportunidades e Plano de Crescimento):** Refinar lista de oportunidades com badges de prioridade, cálculo de impacto estimado e conversão orientada para experimentos.
- [X] `1.6D.5` **Painel 5 (Delivery Growth - Canais):** Modernizar a tela de canais com status honestos e simulador de margens parametrizável.
- [X] `1.6D.6` **Painel 6 (KDS Cozinha):** Atualizar KDS com contadores superiores rápidos, design refinado e responsividade para Mac e Android.

#### SUBETAPA 1.6E — CUSTOS, SEGURANÇA E HOMOLOGAÇÃO
- [X] `1.6E.1` Implementar o Painel de Custos de IA com orçamento de referência (US$ 10), telemetria por workspace/canal e alertas graduais (50%, 80%, 100%).
- [X] `1.6E.2` Garantir a barreira de segurança estrita contra vazamento de dados financeiros para o perfil `delivery_staff`.
- [X] `1.6E.3` Executar suíte de testes unitários e de integração cobrindo roteamento, ferramentas analíticas, cálculo de métricas e interface.
- [X] `1.6E.4` Validar Quality Gates (`lint`, `tsc`, `test`, `build`) e preparar o PR final para revisão do proprietário.

---

## Ato III — Executar

### 1. Evidências de Execução e Homologação

1. **Subetapa 1.6A — Diagnóstico & Fundação:**
   - Causa raiz do indicador zerado resolvida: quando `fichas_tecnicas` não contiver linhas no banco, o motor analítico calcula receita real agregada das transações existentes e atribui o estado `dados_insuficientes` ao CMV, evitando exibir falsos 0% CMV ou 100% margem.
   - Criado serviço de métricas resiliente `src/domains/ceo/services/CeoFinancialMetricsService.ts`.
   - Criada migration versionada e idempotente `supabase/migrations/20261031120000_wallet_ceo_ai_telemetry_budgets.sql` contendo `wallet_ai_telemetry`, `wallet_ai_monthly_budgets` (orçamento US$ 10 padrão e thresholds 50%, 80%, 100%) e view agregada `v_wallet_ai_monthly_usage`.

2. **Subetapa 1.6B — CEO Conversacional (Edge Functions):**
   - Implementadas 6 ferramentas canônicas no `openai-tools-definition.ts` e `query-tools.ts` (`consultar_resumo_executivo_ceo`, `consultar_analise_comercial_vendas`, `consultar_analise_despesas_ceo`, `consultar_oportunidades_ceo`, `consultar_status_canais_delivery`, `consultar_telemetria_ia`) e a ação canônica `propor_experimento_comercial` sem permissões legadas (RBAC puro).
   - Roteador de modelos implementado em `wallet-ai-orchestrator/handler.ts` com seleção por complexidade (Nível 1 e 2: `gpt-4o-mini`; Nível 3: `gpt-4o` com failover seguro para `gemini-2.5-flash`).
   - Hard budget check com retorno HTTP 429 (`WALLET_AI_BUDGET_EXCEEDED`) ao ultrapassar o teto mensal.

3. **Subetapa 1.6C — Telegram Channel Adapter:**
   - `supabase/functions/_shared/ai/telegram-channel-adapter.ts` atualizado para detectar automaticamente comandos `/ceo` e linguagem natural executiva, roteando para as ferramentas canônicas do CEO enquanto preserva 100% dos fluxos documentais existentes (boletos, DANFE, alertas).

4. **Subetapa 1.6D — Interface Visual Premium (6 Painéis de Referência):**
   - **Painel 1:** `src/domains/ceo/components/CeoOverviewTab.tsx` com Hero Card, avatar executivo, faturamento de ontem/mês, 3 ações prioritárias numeradas, 4 KPIs macro (com sparklines e radial gauge) e Chat Central integrado com pills de sugestão.
   - **Painel 2:** `src/domains/ceo/components/CeoCommercialAnalysisTab.tsx` com 4 KPIs comerciais, gráfico de linhas (atual vs anterior), donut de canais com total central, tabela Top 10 Produtos por Faturamento e Heatmap de Horários de Pico (Seg–Dom x 11h–23h).
   - **Painel 3:** `src/domains/ceo/components/CeoExpenseAnalysisTab.tsx` com 3 KPIs, donut de despesas por categoria, gráfico de barras mensal e tabela de detalhamento Top 5.
   - **Painel 4:** `src/domains/ceo/components/CeoOpportunitiesTab.tsx` com 4 oportunidades numeradas e priorizadas (Alta, Média, Baixa), cálculo de impacto financeiro mensal (+R$/mês), plano de crescimento de 90 dias e experimentos integrados.
   - **Painel 5:** `src/pages/WalletDeliveryPage.tsx` com 3 cards de canais (iFood, 99Food, WhatsApp Direto) com status honestos e simulador de margens parametrizável.
   - **Painel 6:** `src/domains/delivery/components/KDSOrderBoard.tsx` com contadores rápidos superiores (Pendentes, Em Preparo, Prontos, Tempo Médio), atalho para KDS Tela Cheia e visualização em tabela/kanban sem vazamento financeiro.

5. **Subetapa 1.6E — Quality Gates & Homologação:**
   - `npx tsc --noEmit`: 0 erros.
   - `npx eslint src/domains/ceo/ src/pages/WalletCeoPage.tsx`: 0 erros, 0 warnings.
   - `npm test`: 162 de 162 suites de teste aprovadas, 1809 de 1809 testes aprovados (100%).
   - `npm run build`: Build de produção Vite gerado com sucesso.
   - `monitor_context.mjs`: Estado `CURRENT`.
