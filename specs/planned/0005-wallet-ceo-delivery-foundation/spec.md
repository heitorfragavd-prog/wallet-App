# Especificação integrada: Wallet CEO e Delivery Growth Foundation

| Campo | Valor |
| --- | --- |
| Formato | Specsfy/2.0 |
| ID | SPEC-0005 |
| Slug | 0005-wallet-ceo-delivery-foundation |
| Status | In-Progress |
| Effort | 5 |
| Effort updated at | 2026-10-30 |
| Effort rationale | Implementação vertical completa de dois novos subsistemas integrados (Wallet CEO com 7 departamentos analíticos e Laboratório de Crescimento; e Wallet Delivery Growth com KDS do funcionário para Mac/Android, simulador de margens, central de pedidos e conectores iFood/99Food) com migrations versionadas, RLS, testes e contratos tipados. |
| ClickUp Task | |
| Milestones | Growth & Delivery 1.0 |
| Definition Gate | Passed |
| Plan Gate | Passed |
| Delivery Gate | Pending |
| Evidence Contract | 1 |
| Interface para pessoas | Sim |
| Atualizada em | 2026-10-30 |

## Ato I — Definir

### 1. Problema e resultado

#### Problema
A Rodo Point necessita de uma plataforma de gestão empresarial inteligente capaz de ir além de um painel passivo, transformando dados operacionais (Eyemobile, Divipay, estoque, despesas, faturamento) em oportunidades acionáveis de crescimento, redução de perdas e aumento de lucratividade (Wallet CEO). Adicionalmente, a operação de delivery (iFood, 99Food e delivery próprio) carece de uma central unificada e eficiente (KDS) acessível no Mac e em dispositivos Android, com regras claras de precificação por canal, controle de disponibilidade e blindagem de segurança para que funcionários operacionais não acessem dados financeiros confidenciais ou DRE da empresa.

#### Resultado desejado
Uma fundação vertical completa e funcional contendo:
1. **Wallet CEO**: Página centralizada com 7 departamentos (Crescimento Comercial, Operações e Perdas, Rentabilidade, Pessoas, Finanças, Clientes, Estratégia), motor determinístico de identificação de oportunidades de melhoria e Laboratório de Crescimento para registro e acompanhamento de experimentos comerciais com evidências e cálculo de impacto financeiro.
2. **Wallet Delivery Growth**: Módulo dedicado no menu do sistema, KDS (Central do Funcionário) responsivo para Mac e Android com estados de pedidos, alertas sonoros e conferência, isolamento estrito de permissões (perfil `delivery_staff` sem acesso a finanças/DRE), contratos tipados e seguros para iFood e 99Food (Open Delivery), catálogo interno de canais e simulador avançado de preços e margens de contribuição considerando comissões dos marketplaces.
3. **Persistência & Segurança**: Migrations versionadas estruturando oportunidades, experimentos, canais, pedidos e itens de delivery, protegidas por RLS multi-tenant por workspace.

#### Métricas de sucesso
- 100% de isolamento multi-tenant garantido por RLS em todas as tabelas novas.
- 0 dados financeiros confidenciais (DRE, faturamento total, saldo bancário) expostos a usuários com perfil operacional de funcionário de delivery.
- Motor de cálculo de margem de contribuição de delivery ponderando comissão percentual, taxas fixas, custo de mercadoria (CMV) e embalagem.
- Cobertura de testes unitários e de integração cobrindo os conectores, permissões, simulador de preços e gerador de oportunidades.
- Quality Gates de CI/CD (lint, typecheck, tests, build) 100% aprovados.

---

### 2. Contratos & Modelo de Dados

#### Novas Tabelas Versionadas
1. `public.wallet_growth_opportunities`: Registro estruturado de oportunidades identificadas pelo Wallet CEO com departamento, hipótese, evidências JSONB, impacto financeiro estimado, score de confiança e status (`identificada`, `em_experimento`, `implantada`, `descartada`). Acesso exclusivo de leitura e escrita para administradores.
2. `public.wallet_commercial_experiments`: Experimentos comerciais com data de início/fim, métricas alvo, resultado observado, decisão (`manter`, `ampliar`, `ajustar`, `interromper`, `pendente`) e `decision_rationale`. Acesso exclusivo de leitura e escrita para administradores.
3. `public.delivery_channels`: Configuração dos canais de venda (iFood, 99Food, Direto) com taxas contratuais, status de homologação e credenciais confidenciais (`config`). Tabela base protegida com SELECT exclusivo para administradores.
4. `public.delivery_orders`: Fila canônica unificada de pedidos de delivery com estados operacionais (`received`, `confirmed`, `preparing`, `ready`, `dispatched`, `delivered`, `cancelled`), dados do cliente, canal de origem, carimbos de tempo, `kds_notes` e `is_demo`. Tabela base com SELECT e DELETE exclusivos para administradores; UPDATE operacional protegido por trigger contra mutação de valores financeiros.
5. `public.delivery_order_items`: Itens dos pedidos com quantidades, complementos, observações, status de conferência (`is_verified_in_kds`), operador (`verified_by_user_id`) e carimbo de conferência (`verified_at`). Tabela base com SELECT exclusivo para administradores; UPDATE operacional protegido por trigger contra alteração de preços ou custos unitários.
6. `public.delivery_catalog_items`: Mapeamento de catálogo do produto interno com IDs externos das plataformas, preços específicos por canal, `unit_cost_cmv`, `packaging_cost`, `target_margin_percent` e flag de disponibilidade. Tabela base exclusiva para administradores.

#### Views Operacionais Dedicadas (Security Barrier — Zero Vazamento Financeiro)
1. `public.v_delivery_orders_operacional`: Expõe exclusivamente campos operacionais do pedido (ID, canal, display_id, cliente, endereço, status, tempos de preparo, notas e kds_notes), omitindo integralmente subtotal, comissões, taxas, repasses e payloads.
2. `public.v_delivery_order_items_operacional`: Expõe exclusivamente campos operacionais dos itens (produto, quantidade, opções, observações e status de conferência), omitindo preços unitários, totais e custos de CMV.
3. `public.v_delivery_channels_operacional`: Expõe estado e nome dos canais, omitindo tokens, credenciais e taxas contratuais.
4. `public.v_delivery_catalog_operacional`: Expõe disponibilidade de itens, omitindo custos e margens de produto.

#### RPCs Atômicas e Seguras (Security Definer)
1. `public.rpc_listar_pedidos_kds(p_workspace_id uuid)`: Retorna lista de pedidos ativos e itens conferidos sem vazamento financeiro.
2. `public.rpc_criar_delivery_order_atomico(p_order jsonb, p_items jsonb)`: Inserção atômica de pedido e itens com idempotência por `(workspace_id, channel_name, external_order_id)`.
3. `public.rpc_conferir_item_delivery(p_item_id uuid, p_is_verified boolean)`: Registra a conferência do item pelo operador autenticado (`auth.uid()`) com timestamp auditável.
4. `public.rpc_atualizar_status_delivery_order(p_order_id uuid, p_novo_status text, p_kds_notes text)`: Executa transições de estado do KDS, com bloqueio obrigatório de despacho caso existam itens pendentes de conferência na cozinha.
5. `public.rpc_despachar_pedido_kds(p_order_id uuid)`: Helper seguro para liberação de entrega motoboy.

---

## Ato II — Planejar

### 3. Decomposição de Tarefas

1. `[MIGRATION]` Criar migration versionada `20261030010000_wallet_ceo_delivery_foundation.sql` estruturando tabelas base, views operacionais security barrier, RPCs atômicas, triggers de integridade cross-workspace e políticas de RLS restritas para administradores e equipe operacional.
2. `[CORE-CEO]` Implementar domínio `src/domains/ceo/`: tipos canônicos, contratos de departamentos, motor determinístico com cálculo de cobertura ponderada de CMV (`growth-engine.ts`) e repositório com persistência prévia e UUID canônico (`CeoRepository.ts`).
3. `[CORE-DELIVERY]` Implementar domínio `src/domains/delivery/`: tipos canônicos, contratos e adaptadores honestos de integração iFood/99Food (`types.ts`, `connectors/ifood-connector.ts`, `connectors/ninety-nine-connector.ts`), simulador de margens (`pricing-simulator.ts`) e repositório operacional com fallback para views (`DeliveryOrderRepository.ts`).
4. `[UI-COMPONENTS]` Implementar componentes operacionais: KDS (`KDSOrderBoard.tsx`, `KDSOrderCard.tsx`, `ItemChecklistDialog.tsx`), Simulador de Margens (`DeliveryMarginSimulator.tsx`) e Laboratório de Experimentos (`GrowthExperimentCard.tsx`), com eliminação de pedidos falsos em produção, isolamento efêmero do modo demo e reversão de estado em caso de erro na persistência.
5. `[PAGES-ROUTING]` Integrar rotas no `App.tsx` e navegação no `DashboardLayout.tsx`:
   - `/ceo`: Dashboard executivo com departamentos e Laboratório de Crescimento.
   - `/delivery`: Gestão administrativa de canais, catálogo e simulador de preços (restrito a admin).
   - `/delivery/kds`: Central de Pedidos do Funcionário (operacional para Mac e Android).
6. `[PERMISSIONS]` Implementar isolamento estrito de rotas e perfis (`delivery-permissions.ts`, `DeliveryRoleGuard.tsx`, `ProtectedRoute.tsx`) checando papéis no workspace (`workspace_members`) para restringir colaboradores operacionais estritamente ao KDS.
7. `[TESTS-UNIT]` Implementar suíte completa de testes unitários:
   - `src/domains/ceo/growth-engine.test.ts`
   - `src/domains/delivery/pricing-simulator.test.ts`
   - `src/domains/delivery/connectors.test.ts`
   - `src/domains/delivery/DeliveryRoleGuard.test.tsx`
   - `src/domains/delivery/tests/delivery-ceo-fase11.test.ts`
   - `src/domains/delivery/tests/delivery-ceo-fase12.test.ts`
8. `[HOMOLOGATION-PG]` Criar bateria de homologação em PostgreSQL real isolado (`scripts/test-ceo-delivery-foundation.sql`) cobrindo 16 cenários de concorrência, RLS, column security, triggers e rollback limpo.
9. `[EVIDENCE & BUILD]` Validar typecheck (`tsc`), lint (`eslint`), testes (`vitest`) e build de produção (`vite build`).

---

## Ato III — Executar

*(As tarefas serão executadas conforme o planejamento vertical).*
