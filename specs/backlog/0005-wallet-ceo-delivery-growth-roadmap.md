# BACKLOG NORMATIVO: WALLET CEO & DELIVERY GROWTH ROADMAP

**Identificador:** `0005-wallet-ceo-delivery-growth-roadmap`  
**Data:** 2026-10-30  
**Status:** BACKLOG REFINADO  
**Módulos:** `Wallet CEO` & `Wallet Delivery Growth`  

---

## 1. Visão Geral do Produto

Transformação do Wallet App em uma plataforma de gestão empresarial inteligente para a **Rodo Point**, integrando inteligência de diretoria (Wallet CEO) e central de operações e crescimento de delivery (Wallet Delivery Growth para iFood, 99Food e delivery direto).

---

## 2. Itens do Backlog Mapeados

### Fase 1 — Fundação e Arquitetura Unificada (Execução Imediata — PR Atual)
- [x] Fundação de dados e migrations versionadas (`wallet_growth_opportunities`, `wallet_commercial_experiments`, `delivery_channels`, `delivery_orders`, `delivery_order_items`, `delivery_catalog_items`).
- [x] Contrato canônico de conectores de marketplace (`MarketplaceConnector`, `DeliveryOrder`, `ChannelCapabilities`).
- [x] Módulo Wallet CEO com 7 departamentos (Crescimento Comercial, Operações e Perdas, Rentabilidade, Pessoas, Finanças, Clientes, Estratégia/Laboratório).
- [x] Central de Pedidos KDS (Kitchen Display System / Central do Funcionário) com suporte Mac e Android, alertas sonoros e conferência.
- [x] Proteção e isolamento estrito de permissões (Perfil Funcionário de Delivery restrito a operações sem acesso a DRE/dados financeiros).
- [x] Simulador de Margens e Preços por canal de delivery com parametrização de taxas e custos.
- [x] Laboratório de Crescimento: Hipóteses, ações, metas, acompanhamento e medição de impacto financeiro.

### Fase 2 — Integrações Reais & Conectores Homologados
- [ ] **Item 1: Integração real iFood** (OAuth2, Polling/Webhook de eventos, catálogo e disponibilidade com API oficial).
- [ ] **Item 2: Integração real 99Food** (Open Delivery v1/v2, sincronização de cardápio e gestão de pedidos).
- [ ] **Item 3: Central de pedidos em produção** (Impressão automática de comandas ESC/POS, notificações push web, sincronização em tempo real).

### Fase 3 — Inteligência de Cardápio & Preços
- [ ] **Item 4: Gestão de preços por plataforma** (Tabelas de preços diferenciadas, markups por marketplace e sincronização).
- [ ] **Item 5: Auditor de cardápio com IA** (Auditoria de qualidade de fotografias, títulos, descrições e SEO de cardápio).
- [ ] **Item 6: Otimizador de combos** (Sugestões automatizadas de combos baseadas em afinidade de cesta e margem de contribuição).

### Fase 4 — Campanhas, Reputação & Qualidade
- [ ] **Item 7: Avaliação de promoções e anúncios** (Cálculo de ROI de campanhas patrocinadas no iFood/99Food, subsídios e descontos).
- [ ] **Item 8: Reputação e Nota de Qualidade** (Monitoramento de notas, índices de cancelamento e métricas oficiais de qualidade das plataformas).

### Fase 5 — Operações, Estoque & Perdas
- [ ] **Item 9: Gestão de estoque e perdas** (Registro categorizado de quebras de salgados, vencimentos, descartes e conciliação física).
- [ ] **Item 10: Previsão de demanda** (Previsão de demanda por turno e dia com base no histórico recente e sazonalidades).

### Fase 6 — Automação, Governança & Ecossistema Rodo Point
- [ ] **Item 11: Laboratório de experimentos avançado** (Execução e encerramento automatizado de testes A/B de preços e produtos).
- [ ] **Item 12: Alertas proativos** (Gatilhos inteligentes no Telegram/WhatsApp para anomalias de faturamento e estoque).
- [ ] **Item 13: Relatórios executivos** (Briefing semanal consolidado para a diretoria da Rodo Point).
- [ ] **Item 14: Integração Eyemobile-Delivery** (Conciliação unificada de estoque e vendas físicas vs virtuais).
- [ ] **Item 15: Fidelização e delivery próprio** (Cardápio digital direto com WhatsApp e pagamento PIX sem taxas de intermediação).
- [ ] **Item 16: Integrações com Rodoviária de Betim e Câmeras** (Correlação de volume de passageiros/ônibus com picos de consumo no balcão).
