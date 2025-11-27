# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

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
