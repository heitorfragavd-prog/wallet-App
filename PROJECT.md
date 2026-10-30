# Projeto — Wallet App (Rodo Point)

## História e motivação

O Wallet App nasceu como um sistema integrado de gestão financeira, fiscal e operacional para a **Rodo Point** (restaurante, lanchonete e conveniência). Inicialmente focado em controle de fluxo de caixa, conciliação bancária, PDV (Eyemobile), cartões de crédito e automação via IA/Telegram com auditoria rigorosa de documentos fiscais (DANFE e boletos bancários).

Com a consolidação da esteira operacional, o Wallet App evoluiu para uma plataforma de gestão empresarial inteligente, incorporando uma diretoria executiva digital (**Wallet CEO**) e uma central de vendas e expedição multicanal (**Wallet Delivery Growth**).

## Finalidade

O sistema proporciona:
1. **Governança Financeira & Fiscal:** Gestão de receitas, despesas, conciliação bancária, DRE simplificada, contas a pagar com OCR de boletos auditado e regras de barramento para divergências materiais.
2. **Wallet CEO (Diretoria Executiva Digital):** Motor determinístico que calcula o CMV ponderado por volume vendido (eliminando distorções de custos médios de catálogo), monitora 7 departamentos, detecta oportunidades comerciais (combos, reprecificação) e conduz um laboratório de experimentos científicos.
3. **Wallet Delivery Growth (Central Multicanal & KDS):** Hub unificado de entrega para iFood, 99Food e WhatsApp/Delivery Direto, com simulador inteligente de margem para evitar sangria em taxas de marketplace e um KDS (Kitchen Display System) em tempo real otimizado para Mac, tablets e smartphones Android.
4. **Isolamento de Segurança e Perfis Operacionais:** Operadores de cozinha e expedição utilizam o KDS sob o perfil `delivery_staff` com bloqueio integral a relatórios confidenciais, DRE e saldos bancários.

## Pessoas e contexto de uso

- **Proprietário / Gestores Executivos:** Acompanham metas, DRE, fluxo de caixa, oportunidades do Wallet CEO e o laboratório de crescimento comercial.
- **Financeiro / Administrativo:** Opera conciliação bancária, gestão de compras, cadastros de fornecedores e controle de contas a pagar.
- **Cozinha & Expedição (Delivery Staff):** Opera o KDS na bancada da cozinha ou área de embalagem, atualizando o ciclo de preparo dos pedidos e realizando checklist item a item antes da entrega aos motoboys.
- **Atendimento de Salão / Frente de Caixa:** Registra vendas no PDV, recebe clientes presenciais e adiciona pedidos rápidos no terminal.

## Capacidades principais

- **Gestão de CMV Ponderado:** Cálculo de CMV real baseado no histórico de vendas e custos unitários de fichas técnicas.
- **Laboratório de Experimentos do CEO:** Criação, monitoramento e validação de hipóteses comerciais com métricas antes/depois.
- **Conectores de Marketplace:** Contratos com declaração explícita de capacidades para iFood, 99Food e canais diretos.
- **Simulador de Margem & Markup:** Cálculo exato de comissão da plataforma, tarifas de pagamento online e embalagem, indicando o preço ideal para preservar o lucro nominal.
- **KDS Operacional em Tempo Real:** Visualização tipo Kanban (Novos, Em Preparo, Prontos, Despachados) com cronômetro de atraso, alerta sonoro via Web Audio API e modal de checklist de conferência.
- **Isolamento de Papéis (`delivery_staff`):** Proteção estrutural de rotas financeiras via `DeliveryRoleGuard`.

## Limites

- O sistema não executa transações bancárias arbitrárias sem autorização humana expressa.
- Não realiza deduções ou julgamentos pejorativos sobre perdas de caixa sem comprovação física documental.
- Não substitui as plataformas de entrega como canal consumidor final; integra-se a elas como hub de gestão e expedição.

## Contexto técnico

- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite.
- **Backend & Dados:** Supabase, PostgreSQL com Row Level Security (RLS), Edge Functions em Deno.
- **Metodologia:** Specsfy/2.0 com TDD/BDD e Quality Gates automatizados no GitHub Actions.
