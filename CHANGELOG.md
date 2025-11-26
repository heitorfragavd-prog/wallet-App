# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

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
