# Design Document

## Overview

Este documento descreve o design para implementar um sistema de roteamento baseado em roles que redireciona usuários administradores para um dashboard específico após o login. A solução envolve modificações no componente LoginForm para verificar o role do usuário após autenticação bem-sucedida, criação de um novo componente AdminDashboardLayout que estende o DashboardLayout existente com opções administrativas, e ajustes no componente ProtectedRoute para garantir a segurança das rotas.

## Architecture

A arquitetura segue o padrão existente da aplicação React com React Router para navegação e Supabase para autenticação e dados. O fluxo principal será:

1. **Autenticação**: LoginForm → useAuth hook → Supabase Auth
2. **Verificação de Role**: useProfile hook → Supabase profiles table
3. **Roteamento Condicional**: Baseado no role, redirecionar para /admin ou /dashboard
4. **Proteção de Rotas**: ProtectedRoute verifica role antes de renderizar componentes

```
┌─────────────┐
│  LoginForm  │
└──────┬──────┘
       │ signIn()
       ▼
┌─────────────┐
│  useAuth    │
└──────┬──────┘
       │ success
       ▼
┌─────────────┐
│ useProfile  │ ──► Fetch role from profiles
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Conditional Routing │
└──────┬──────────────┘
       │
       ├─► role === 'admin' ──► /admin (AdminDashboardLayout)
       │
       └─► role !== 'admin' ──► /dashboard (DashboardLayout)
```

## Components and Interfaces

### 1. LoginForm (Modificado)

**Responsabilidade**: Gerenciar o processo de login e redirecionar baseado no role do usuário.

**Modificações**:
- Após login bem-sucedido, aguardar o carregamento do perfil
- Verificar o role do usuário
- Redirecionar para /admin se role === 'admin', caso contrário para /dashboard

**Interface**:
```typescript
interface LoginFormProps {
  onSwitchToRegister: () => void;
  onSwitchToForgot: () => void;
}

// Fluxo interno
const handleSubmit = async (e: React.FormEvent) => {
  // 1. Fazer login
  const { error } = await signIn(email, password);
  
  // 2. Se sucesso, buscar perfil
  if (!error) {
    const profile = await fetchUserProfile();
    
    // 3. Redirecionar baseado no role
    if (profile?.role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  }
};
```

### 2. AdminDashboardLayout (Novo Componente)

**Responsabilidade**: Fornecer layout específico para administradores com opção de menu administrativa.

**Características**:
- Estende/reutiliza a lógica do DashboardLayout existente
- Adiciona item "Administrador" ao menu de navegação
- Mantém todos os itens de menu padrão
- Usa o mesmo sistema de colapso e responsividade

**Interface**:
```typescript
interface AdminDashboardLayoutProps {
  children: React.ReactNode;
}

// Menu items incluirá:
const adminMenuItems = [
  ...menuItems, // Todos os itens padrão
  { 
    icon: Shield, // ou UserCog
    label: "Administrador", 
    path: "/admin" 
  }
];
```

### 3. ProtectedRoute (Modificado)

**Responsabilidade**: Proteger rotas e garantir que apenas usuários com role apropriado acessem rotas específicas.

**Modificações Existentes** (já implementadas):
- Já verifica role === 'admin' para rotas protegidas
- Já aguarda carregamento do profile antes de redirecionar
- Já redireciona usuários não-admin para /dashboard quando tentam acessar rotas admin

**Validação Necessária**:
- Confirmar que a lógica existente está funcionando corretamente
- Garantir que não há loops de redirecionamento

### 4. AdminDashboard (Página Existente)

**Responsabilidade**: Exibir painel administrativo com lista de usuários e funcionalidades de gestão.

**Modificações**:
- Remover o componente Header (que não usa DashboardLayout)
- Envolver o conteúdo com AdminDashboardLayout
- Manter todas as funcionalidades existentes

## Data Models

### Profile (Tabela Supabase)

```typescript
interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  telefone: string | null;
  organization_name: string | null;
  avatar_url: string | null;
  role: 'admin' | 'user' | null; // Campo crítico para roteamento
  created_at: string;
  updated_at: string;
}
```

**Regras de Negócio**:
- Se `role` é null ou undefined, tratar como 'user'
- Apenas usuários com `role === 'admin'` podem acessar /admin
- O campo `role` deve ser verificado após cada login

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Admin redirection consistency

*For any* usuário com role 'admin', após login bem-sucedido, o sistema deve redirecionar para '/admin' e não para '/dashboard'

**Validates: Requirements 1.1**

### Property 2: Regular user redirection consistency

*For any* usuário sem role 'admin' (incluindo role null ou 'user'), após login bem-sucedido, o sistema deve redirecionar para '/dashboard' e não para '/admin'

**Validates: Requirements 1.2**

### Property 3: Admin route protection

*For any* tentativa de acesso direto à rota '/admin', se o usuário não tem role 'admin', o sistema deve redirecionar para '/dashboard'

**Validates: Requirements 3.2**

### Property 4: Profile loading synchronization

*For any* login bem-sucedido, o sistema deve aguardar o carregamento completo do perfil (incluindo o campo role) antes de executar qualquer redirecionamento

**Validates: Requirements 3.3**

### Property 5: Admin menu completeness

*For any* usuário com role 'admin' visualizando o dashboard admin, o menu deve conter todos os itens padrão mais o item 'Administrador'

**Validates: Requirements 2.1**

### Property 6: Regular user menu restriction

*For any* usuário sem role 'admin' visualizando o dashboard, o menu não deve conter o item 'Administrador'

**Validates: Requirements 2.2**

### Property 7: Standard menu items preservation

*For any* dashboard admin renderizado, todos os itens do menu padrão devem estar presentes no menu

**Validates: Requirements 4.2**

### Property 8: Menu collapse state persistence

*For any* navegação entre páginas, o estado de colapso do menu deve ser mantido

**Validates: Requirements 4.4**

### Property 9: Loading state cleanup

*For any* redirecionamento após login, o estado de loading deve ser limpo (definido como false)

**Validates: Requirements 5.3**

### Property 10: Subscription update correctness

*For any* concessão de acesso Pro ou Black por um administrador, a tabela 'subscriptions' deve ser atualizada com o plan_id correto e status 'active'

**Validates: Requirements 6.3**

## Error Handling

### 1. Profile Loading Errors

**Cenário**: Erro ao carregar perfil após login
**Tratamento**: 
- Tratar como usuário regular (redirecionar para /dashboard)
- Exibir toast de erro informando problema ao carregar perfil
- Permitir que usuário continue usando o sistema com funcionalidades básicas

### 2. Missing Role Field

**Cenário**: Campo role é null ou undefined
**Tratamento**:
- Tratar como usuário regular
- Não exibir erro (comportamento esperado para usuários novos)

### 3. Redirecionamento Loop

**Cenário**: Múltiplos redirecionamentos causando loop
**Tratamento**:
- Usar flag de controle para prevenir múltiplos redirecionamentos
- Verificar se já está na rota correta antes de redirecionar
- Adicionar logs para debug

### 4. Acesso Não Autorizado

**Cenário**: Usuário tenta acessar /admin sem permissão
**Tratamento**:
- ProtectedRoute redireciona automaticamente para /dashboard
- Não exibir mensagem de erro (redirecionamento silencioso)
- Log do evento para auditoria

## Testing Strategy

### Unit Tests

**LoginForm**:
- Testar redirecionamento para /admin quando role é 'admin'
- Testar redirecionamento para /dashboard quando role não é 'admin'
- Testar comportamento quando profile não carrega
- Testar que loading state é exibido durante autenticação

**AdminDashboardLayout**:
- Testar que menu contém item 'Administrador'
- Testar que todos os itens padrão estão presentes
- Testar navegação para /admin ao clicar no item

**ProtectedRoute**:
- Testar que usuários não-admin são redirecionados de /admin
- Testar que loading é exibido enquanto profile carrega
- Testar que usuários admin podem acessar /admin

### Property-Based Tests

Cada property listada na seção "Correctness Properties" deve ser implementada como um teste baseado em propriedades. Os testes devem:

- Gerar usuários aleatórios com diferentes roles
- Simular login e verificar redirecionamento correto
- Verificar que o menu exibido corresponde ao role do usuário
- Validar que rotas protegidas bloqueiam acesso não autorizado

**Configuração**:
- Usar biblioteca de property-based testing para TypeScript/React (fast-check)
- Cada teste deve executar no mínimo 100 iterações
- Cada teste deve referenciar explicitamente a property do design document

### Integration Tests

- Testar fluxo completo: login → verificação de role → redirecionamento → renderização de dashboard
- Testar navegação entre páginas mantendo contexto de autenticação
- Testar que logout limpa estado e redireciona corretamente

## Implementation Notes

### Ordem de Implementação

1. **Modificar LoginForm**: Adicionar lógica de verificação de role e redirecionamento condicional
2. **Criar AdminDashboardLayout**: Novo componente que estende DashboardLayout com item de menu adicional
3. **Atualizar AdminDashboard**: Usar AdminDashboardLayout ao invés de Header standalone
4. **Validar ProtectedRoute**: Confirmar que proteção de rotas está funcionando corretamente
5. **Testes**: Implementar testes unitários e de propriedades

### Considerações de Performance

- O carregamento do perfil já é feito pelo useProfile hook, não adicionar chamadas duplicadas
- Usar cache do React Query ou similar se múltiplas verificações de role forem necessárias
- Evitar re-renders desnecessários ao verificar role

### Considerações de UX

- Exibir loading spinner durante verificação de role
- Transição suave entre telas após login
- Não exibir mensagens de erro para redirecionamentos de segurança (silencioso)
- Manter estado de colapso do menu entre navegações

### Segurança

- Nunca confiar apenas em verificações client-side
- Garantir que APIs do Supabase também verificam role no backend
- Usar Row Level Security (RLS) no Supabase para proteger dados administrativos
- Não expor informações sensíveis em mensagens de erro
