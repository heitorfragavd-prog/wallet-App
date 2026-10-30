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
1. `public.wallet_growth_opportunities`: Registro estruturado de oportunidades identificadas pelo Wallet CEO com departamento, hipótese, evidências JSONB, impacto financeiro estimado, score de confiança e status (`identificada`, `em_experimento`, `implantada`, `descartada`).
2. `public.wallet_commercial_experiments`: Experimentos comerciais com data de início/fim, métricas alvo, resultado observado e decisão (`manter`, `ampliar`, `ajustar`, `interromper`).
3. `public.delivery_channels`: Configuração dos canais de venda (iFood, 99Food, Direto) com taxas contratuais, status de homologação e credenciais parametrizadas.
4. `public.delivery_orders`: Fila canônica unificada de pedidos de delivery com estados operacionais (`novo`, `preparando`, `pronto`, `entregue`, `cancelado`), dados do cliente, canal de origem e carimbos de tempo.
5. `public.delivery_order_items`: Itens dos pedidos com quantidades, complementos, observações e status de conferência.
6. `public.delivery_catalog_items`: Mapeamento de catálogo do produto interno com IDs externos das plataformas, preços específicos por canal e flag de disponibilidade.

---

## Ato II — Planejar

### 3. Decomposição de Tarefas

1. `[MIGRATION]` Criar migration versionada `20261030010000_wallet_ceo_delivery_foundation.sql` estruturando as tabelas, índices e políticas de RLS multi-tenant com perfil `delivery_staff`.
2. `[CORE-CEO]` Implementar domínio `src/domains/ceo/`: tipos canônicos, contratos de departamentos e motor determinístico de detecção de oportunidades de crescimento (`growth-engine.ts`, `metrics-service.ts`).
3. `[CORE-DELIVERY]` Implementar domínio `src/domains/delivery/`: tipos canônicos, contratos e adaptadores de integração iFood/99Food (`types.ts`, `connectors/ifood-connector.ts`, `connectors/ninety-nine-connector.ts`, `pricing-simulator.ts`).
4. `[UI-COMPONENTS]` Implementar componentes reutilizáveis: KDS da Central do Funcionário (`KDSOrderBoard.tsx`, `KDSOrderCard.tsx`, `ItemChecklistDialog.tsx`), Simulador de Margens (`DeliveryMarginSimulator.tsx`) e Laboratório de Experimentos (`GrowthExperimentCard.tsx`).
5. `[PAGES-ROUTING]` Integrar rotas no `App.tsx` e navegação no `DashboardLayout.tsx`:
   - `/ceo`: Dashboard executivo com departamentos e Laboratório de Crescimento.
   - `/delivery`: Gestão de canais, catálogo e simulador de preços.
   - `/delivery/kds`: Central de Pedidos do Funcionário (otimizada para Mac e Android).
6. `[PERMISSIONS]` Implementar guarda de autorização e controle de visualização (`DeliveryRoleGuard.tsx`) para impedir que `delivery_staff` acerte telas ou APIs financeiras confidenciais.
7. `[TESTS]` Implementar suíte completa de testes:
   - `src/domains/ceo/growth-engine.test.ts`
   - `src/domains/delivery/pricing-simulator.test.ts`
   - `src/domains/delivery/connectors.test.ts`
   - `src/domains/delivery/permissions.test.ts`
8. `[EVIDENCE & BUILD]` Validar typecheck (`tsc`), lint (`eslint`), testes (`vitest`) e build de produção (`vite build`).

---

## Ato III — Executar

*(As tarefas serão executadas conforme o planejamento vertical).*
