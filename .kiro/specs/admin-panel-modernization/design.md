# Design Document: Admin Panel Modernization

## Overview

Este documento descreve o design para modernização do Painel Administrativo do Wallet, transformando a navegação atual baseada em tabs horizontais (9 abas) em um sidebar moderno com menus agrupados e colapsáveis. O design segue o padrão visual já estabelecido no Dashboard do usuário, utilizando cards com gradientes, ícones coloridos, e suporte completo a dark mode.

## Architecture

A modernização segue a arquitetura de 4 camadas existente:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │  AdminSidebar   │  │         Page Content              │ │
│  │  (Navigation)   │  │  ┌────────────────────────────┐  │ │
│  │                 │  │  │     AdminPageHeader        │  │ │
│  │  ┌───────────┐  │  │  └────────────────────────────┘  │ │
│  │  │MenuGroup  │  │  │  ┌────────────────────────────┐  │ │
│  │  │ MenuItem  │  │  │  │     Stats Cards            │  │ │
│  │  │ MenuItem  │  │  │  └────────────────────────────┘  │ │
│  │  └───────────┘  │  │  ┌────────────────────────────┐  │ │
│  │  ┌───────────┐  │  │  │     Content Area           │  │ │
│  │  │MenuGroup  │  │  │  └────────────────────────────┘  │ │
│  │  └───────────┘  │  │                                  │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Menu Structure

```
Visão Geral
  └── Dashboard

Usuários & Planos
  ├── Usuários
  ├── Planos
  └── Limites de Planos

Financeiro
  ├── Assinaturas
  └── Pagamentos

Integrações
  └── Webhooks

Sistema
  ├── Relatórios
  └── Auditoria
```

## Components and Interfaces

### 1. AdminSidebarModern

Novo componente de sidebar com suporte a menus colapsáveis.

```typescript
interface MenuGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: MenuItem[];
}

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface AdminSidebarModernProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}
```

### 2. AdminPageHeader

Componente de header padronizado para todas as páginas admin.

```typescript
interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: string; // Tailwind color class
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

interface BreadcrumbItem {
  label: string;
  path?: string;
}
```

### 3. AdminStatsCard

Card de estatísticas com gradiente e ícone.

```typescript
interface AdminStatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  gradient: 'green' | 'blue' | 'purple' | 'orange' | 'red';
  loading?: boolean;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}
```

### 4. AdminLayoutModern

Layout wrapper que substitui o AdminLayout atual.

```typescript
interface AdminLayoutModernProps {
  children: React.ReactNode;
}
```

### 5. RecentActivityCard

Card para exibir atividade recente no dashboard.

```typescript
interface ActivityItem {
  id: string;
  timestamp: string;
  userName: string;
  action: string;
  resource: string;
  resourceType: 'user' | 'plan' | 'subscription' | 'webhook' | 'system';
}

interface RecentActivityCardProps {
  activities: ActivityItem[];
  loading?: boolean;
  onViewAll?: () => void;
}
```

## Data Models

### Menu Configuration

```typescript
const ADMIN_MENU_GROUPS: MenuGroup[] = [
  {
    id: 'overview',
    label: 'Visão Geral',
    icon: LayoutDashboard,
    items: [
      { path: '/admin', label: 'Dashboard', icon: Home }
    ]
  },
  {
    id: 'users-plans',
    label: 'Usuários & Planos',
    icon: Users,
    items: [
      { path: '/admin/users', label: 'Usuários', icon: Users },
      { path: '/admin/plans', label: 'Planos', icon: CreditCard },
      { path: '/admin/limits', label: 'Limites', icon: Gauge }
    ]
  },
  {
    id: 'financial',
    label: 'Financeiro',
    icon: DollarSign,
    items: [
      { path: '/admin/subscriptions', label: 'Assinaturas', icon: Receipt },
      { path: '/admin/payment-settings', label: 'Pagamentos', icon: Wallet }
    ]
  },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: Plug,
    items: [
      { path: '/admin/webhooks/manutencao', label: 'Webhooks', icon: Webhook }
    ]
  },
  {
    id: 'system',
    label: 'Sistema',
    icon: Settings,
    items: [
      { path: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
      { path: '/admin/audit', label: 'Auditoria', icon: FileText }
    ]
  }
];
```

### Gradient Mappings

```typescript
const GRADIENT_CLASSES = {
  green: {
    card: 'from-green-500/10 to-green-500/5',
    icon: 'bg-green-500/20 text-green-500',
    darkCard: 'dark:from-green-500/20 dark:to-green-500/10'
  },
  blue: {
    card: 'from-blue-500/10 to-blue-500/5',
    icon: 'bg-blue-500/20 text-blue-500',
    darkCard: 'dark:from-blue-500/20 dark:to-blue-500/10'
  },
  purple: {
    card: 'from-purple-500/10 to-purple-500/5',
    icon: 'bg-purple-500/20 text-purple-500',
    darkCard: 'dark:from-purple-500/20 dark:to-purple-500/10'
  },
  orange: {
    card: 'from-orange-500/10 to-orange-500/5',
    icon: 'bg-orange-500/20 text-orange-500',
    darkCard: 'dark:from-orange-500/20 dark:to-orange-500/10'
  },
  red: {
    card: 'from-red-500/10 to-red-500/5',
    icon: 'bg-red-500/20 text-red-500',
    darkCard: 'dark:from-red-500/20 dark:to-red-500/10'
  }
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Menu group expansion state consistency
*For any* menu group, when clicked to expand, the group's expanded state SHALL be true, and when clicked again, the state SHALL be false (toggle behavior).
**Validates: Requirements 1.2**

### Property 2: Active menu item highlighting
*For any* navigation path in the admin panel, exactly one menu item SHALL have the active state styling at any given time.
**Validates: Requirements 1.3**

### Property 3: Stats card gradient mapping
*For any* AdminStatsCard with a specified gradient type, the rendered card SHALL contain the corresponding gradient CSS classes from GRADIENT_CLASSES.
**Validates: Requirements 2.1, 2.2**

### Property 4: Currency formatting consistency
*For any* numeric value displayed as currency in Stats_Cards, the formatted output SHALL match the Brazilian Real (BRL) locale format with 2 decimal places.
**Validates: Requirements 2.4**

### Property 5: Dark mode class application
*For any* theme toggle action, when dark mode is enabled, the document root SHALL contain the 'dark' class, and when disabled, it SHALL not contain the 'dark' class.
**Validates: Requirements 4.1, 4.2**

### Property 6: Page header breadcrumb rendering
*For any* AdminPageHeader with breadcrumbs provided, the rendered output SHALL contain all breadcrumb labels in the correct hierarchical order.
**Validates: Requirements 3.1**

## Error Handling

### Navigation Errors
- Invalid routes redirect to admin dashboard with toast notification
- Failed data fetches display error state with retry button

### State Management Errors
- Sidebar collapse state persisted to localStorage with fallback to expanded
- Menu group expansion state managed locally with no persistence required

### Loading States
- All data-dependent components display skeleton loaders
- Minimum skeleton display time of 300ms to prevent flashing

## Testing Strategy

### Unit Testing Framework
- Vitest for unit tests
- React Testing Library for component tests
- @testing-library/user-event for interaction simulation

### Property-Based Testing Framework
- fast-check for property-based testing
- Minimum 100 iterations per property test
- Tests tagged with format: `**Feature: admin-panel-modernization, Property {number}: {property_text}**`

### Test Categories

1. **Component Unit Tests**
   - AdminSidebarModern renders all menu groups
   - AdminStatsCard displays correct gradient classes
   - AdminPageHeader renders breadcrumbs correctly

2. **Property-Based Tests**
   - Menu toggle state consistency
   - Active menu item uniqueness
   - Gradient class mapping correctness
   - Currency formatting consistency
   - Dark mode class application
   - Breadcrumb ordering

3. **Integration Tests**
   - Navigation between admin pages maintains layout
   - Theme toggle affects all admin components
   - Sidebar collapse state persists across page navigation

