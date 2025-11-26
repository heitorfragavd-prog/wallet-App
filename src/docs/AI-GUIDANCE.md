# AI Guidance Documentation

## Project Overview

**Wallet - Consultoria Financeira Inteligente** is a comprehensive financial management application built with React 18, TypeScript, and Supabase. The application helps users manage personal and business finances, including income, expenses, debts, goals, vehicles, and shopping lists.

## Architecture

### 4-Layer Architecture

The application follows a clean, layered architecture pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │  Pages  │ │ Layouts │ │  Modals │ │   UI    │           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       │           │           │           │                 │
│       └───────────┴───────────┴───────────┘                 │
│                         │                                   │
├─────────────────────────┼───────────────────────────────────┤
│                    ADAPTER LAYER                            │
│                         │                                   │
│  ┌──────────────────────┴──────────────────────┐           │
│  │              Custom Hooks                    │           │
│  │  (useAuth, useFinance, useVehicles, etc.)   │           │
│  └──────────────────────┬──────────────────────┘           │
│                         │                                   │
├─────────────────────────┼───────────────────────────────────┤
│                   SERVICE LAYER                             │
│                         │                                   │
│  ┌──────────┐ ┌─────────┴─────────┐ ┌──────────┐           │
│  │  Auth    │ │     Finance       │ │ Vehicles │           │
│  │ Service  │ │     Service       │ │ Service  │           │
│  └────┬─────┘ └─────────┬─────────┘ └────┬─────┘           │
│       │                 │                 │                 │
├───────┴─────────────────┴─────────────────┴─────────────────┤
│                  INFRASTRUCTURE LAYER                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Supabase │ │  Config  │ │  Logger  │ │  Error   │       │
│  │  Client  │ │  Module  │ │ Service  │ │ Handler  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### 1. Presentation Layer (`src/pages`, `src/domains/*/components`, `src/shared/components`)
- **Responsibility**: Render UI and handle user interactions
- **Rules**:
  - Components should be pure and focused on presentation
  - Use hooks from the Adapter Layer for data and logic
  - No direct Supabase calls
  - No business logic

#### 2. Adapter Layer (`src/domains/*/hooks`, `src/shared/hooks`)
- **Responsibility**: Bridge between React components and services
- **Rules**:
  - Custom hooks that manage React state
  - Call service layer methods
  - Handle React-specific concerns (useEffect, useState, etc.)
  - Transform service responses for UI consumption

#### 3. Service Layer (`src/domains/*/services`)
- **Responsibility**: Business logic and data operations
- **Rules**:
  - **No React dependencies** (no hooks, no JSX)
  - Pure TypeScript/JavaScript
  - Testable without rendering components
  - Use infrastructure layer for external operations

#### 4. Infrastructure Layer (`src/core`, `src/integrations`)
- **Responsibility**: External integrations and cross-cutting concerns
- **Components**:
  - **Config Module** (`src/config/env.ts`): Environment variable management
  - **Logger Service** (`src/core/logging`): Structured logging with sanitization
  - **Error Service** (`src/core/errors`): Centralized error handling
  - **Supabase Client** (`src/integrations/supabase`): Database and auth

### Data Flow

```
User Action → Component → Hook → Service → Infrastructure → Database
                  ↓         ↓       ↓           ↓
                State   React    Business   Logging/
                Update  State    Logic      Error Handling
```

## Module Map

### Domain Modules

#### `src/domains/auth/`
**Purpose**: Authentication and authorization

- **Components**:
  - `ProtectedRoute.tsx`: Route guard with role-based access
  - `auth/LoginForm.tsx`: User login
  - `auth/RegisterForm.tsx`: User registration
  - `auth/ForgotPasswordForm.tsx`: Password reset request
  - `auth/ResetPasswordForm.tsx`: Password reset
  - `auth/ChangePasswordModal.tsx`: Change password
  - `auth/DeleteAccountModal.tsx`: Account deletion

- **Hooks**:
  - `useAuth.ts`: Authentication state and operations
  - `useProfile.ts`: User profile management

- **Services**:
  - `AuthService.ts`: Authentication business logic (signUp, signIn, signOut, resetPassword)

- **Types**: `AuthUser`, `UserProfile`, `AuthState`

#### `src/domains/finance/`
**Purpose**: Financial management (income, expenses, transactions, debts, goals, budgets)

- **Components**:
  - `EditarDespesaModal.tsx`: Edit expense
  - `EditarReceitaModal.tsx`: Edit income
  - `EditarTransacaoModal.tsx`: Edit transaction
  - `EditarCategoriaModal.tsx`: Edit category
  - `NovaCategoriaModal.tsx`: New category
  - `EditarDividaModal.tsx`: Edit debt
  - `EditarOrcamentoModal.tsx`: Edit budget
  - `EditarMetaModal.tsx`: Edit goal
  - `NovaMetaModal.tsx`: New goal

- **Hooks**:
  - `useDespesas.ts`: Expense management
  - `useReceitas.ts`: Income management
  - `useTransacoes.ts`: Transaction management
  - `useCategorias.ts`: Category management
  - `useDividas.ts`: Debt management
  - `useMetas.ts`: Goal management
  - `useOrcamentosMercado.ts`: Budget management
  - `useCategoriasMetas.ts`: Goal categories

- **Services**:
  - `FinanceService.ts`: Financial calculations and summaries

- **Types**: `Transaction`, `Category`, `Receita`, `Despesa`, `Divida`, `Meta`, `Orcamento`

#### `src/domains/vehicles/`
**Purpose**: Vehicle and maintenance management

- **Components**:
  - `NovoVeiculoModal.tsx`: Add vehicle
  - `EditarVeiculoModal.tsx`: Edit vehicle
  - `DetalhesVeiculoModal.tsx`: Vehicle details
  - `AtualizarQuilometragemModal.tsx`: Update mileage
  - `GerenciarTiposManutencaoModal.tsx`: Manage maintenance types
  - `NovoTipoManutencaoModal.tsx`: New maintenance type
  - `EditarTipoManutencaoModal.tsx`: Edit maintenance type

- **Hooks**:
  - `useVeiculos.ts`: Vehicle management
  - `useTiposManutencao.ts`: Maintenance type management
  - `useManutencoesPendentes.ts`: Pending maintenance tracking

- **Types**: `Veiculo`, `TipoManutencao`, `Manutencao`, `ManutencaoPendente`

#### `src/domains/market/`
**Purpose**: Shopping list and market management

- **Components**:
  - `NovoItemMercadoModal.tsx`: Add shopping item
  - `EditarItemMercadoModal.tsx`: Edit shopping item

- **Hooks**:
  - `useItensMercado.ts`: Shopping item management
  - `useCategoriasMercado.ts`: Shopping category management

- **Types**: `ItemMercado`, `CategoriaMercado`

#### `src/domains/admin/`
**Purpose**: Administrative functions (user management, plans, subscriptions, audit logs)

- **Components**:
  - `AdminDashboardLayout.tsx`: Admin dashboard layout
  - `AdminLayout.tsx`: Admin page layout
  - `AdminSidebar.tsx`: Admin navigation sidebar
  - `AdminTabs.tsx`: Admin tab navigation

- **Hooks**:
  - `useAuditLog.ts`: Audit log management
  - `usePlanLimits.ts`: Plan limit management

- **Types**: `Plan`, `PlanLimits`, `Subscription`, `AuditLog`

### Core Infrastructure

#### `src/core/logging/`
**Purpose**: Structured logging with sensitive data sanitization

- **Files**:
  - `LoggerService.ts`: Singleton logger with JSON output
  - `types.ts`: `LogLevel`, `LogEntry`

- **Features**:
  - Structured JSON output
  - Log level filtering (DEBUG filtered in production)
  - Automatic sanitization of passwords, tokens, credit cards
  - Component-based logging

- **Usage**:
```typescript
import { logger } from '@/core/logging/LoggerService';

logger.info('ComponentName', 'Operation completed', { userId: '123' });
logger.error('ComponentName', 'Operation failed', { error: err.message });
```

#### `src/core/errors/`
**Purpose**: Centralized error handling

- **Files**:
  - `ErrorService.ts`: Error categorization and handling
  - `ErrorBoundary.tsx`: React error boundary component
  - `types.ts`: `ErrorCategory`, `AppError`

- **Features**:
  - Automatic error categorization (AUTHENTICATION, VALIDATION, NETWORK, SERVER, UNKNOWN)
  - User-friendly error messages (no technical details exposed)
  - Integration with logging service
  - Context wrapping for debugging

- **Usage**:
```typescript
import { errorService } from '@/core/errors/ErrorService';

try {
  // operation
} catch (error) {
  const appError = errorService.handle(error, { operation: 'signIn' });
  const userMessage = errorService.getUserMessage(appError);
  // Show userMessage to user
}
```

#### `src/config/`
**Purpose**: Environment configuration management

- **Files**:
  - `env.ts`: Environment variable loading and validation

- **Features**:
  - Type-safe configuration access
  - Startup validation
  - Descriptive error messages for missing variables
  - Environment-specific settings

- **Usage**:
```typescript
import { getConfigInstance } from '@/config/env';

const config = getConfigInstance();
console.log(config.supabase.url);
```

### Shared Components

#### `src/shared/components/ui/`
**Purpose**: shadcn/ui component library

All UI primitives (Button, Card, Dialog, Input, etc.)

#### `src/shared/components/layouts/`
**Purpose**: Reusable layout components

- `DashboardLayout.tsx`: Main dashboard layout

#### `src/shared/hooks/`
**Purpose**: Shared React hooks

- `use-toast.ts`: Toast notifications
- `use-mobile.tsx`: Mobile detection

### Pages

#### `src/pages/`
**Purpose**: Route entry points

Each page corresponds to a route and composes components from domain modules.

## Security Guidelines

### Authentication Flow

1. User submits credentials via `LoginForm`
2. `useAuth` hook calls `AuthService.signIn()`
3. `AuthService` calls Supabase auth
4. On success, Supabase sets session cookie
5. `useAuth` updates React state
6. User is redirected to dashboard

### Authorization Pattern

**ProtectedRoute Component** (`src/domains/auth/components/ProtectedRoute.tsx`)

```typescript
<ProtectedRoute requiredRole="admin">
  <AdminDashboard />
</ProtectedRoute>
```

**Features**:
- Blocks rendering until authorization check completes
- Verifies user authentication
- Checks role from server-side profile data
- Handles profile loading errors as unauthenticated
- Redirects appropriately based on role
- Logs all authorization decisions

**Never render protected content before authorization is confirmed!**

### Webhook Security

**Location**: `supabase/functions/_shared/validation.ts`

All webhook endpoints MUST:
1. Validate webhook token before processing
2. Sanitize payload to prevent XSS and SQL injection
3. Validate required fields
4. Return 401 on authentication failure
5. Return 400 on validation failure
6. Log all validation failures

**Usage**:
```typescript
import { validateWebhookToken, sanitizePayload } from '../_shared/validation.ts';

// Validate token
if (!validateWebhookToken(token, secret)) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}

// Sanitize payload
const sanitized = sanitizePayload(rawPayload);
```

### Row Level Security (RLS)

All Supabase tables use RLS policies to ensure users can only access their own data. The `user_id` column is used for filtering.

**Never bypass RLS in client code!** Use `service_role` key only in Edge Functions when necessary.

## Coding Conventions

### Naming Conventions

- **Files**: PascalCase for components (`UserProfile.tsx`), camelCase for utilities (`formatDate.ts`)
- **Components**: PascalCase (`UserProfile`)
- **Functions**: camelCase (`getUserProfile`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Interfaces/Types**: PascalCase (`UserProfile`)
- **Hooks**: camelCase with `use` prefix (`useAuth`)

### File Organization

```
src/domains/{domain}/
├── components/       # React components
├── hooks/           # Custom React hooks
├── services/        # Business logic (no React)
└── types.ts         # TypeScript types
```

### Import Order

1. React and external libraries
2. Internal absolute imports (`@/...`)
3. Relative imports (`./...`)
4. Types (if separate)

```typescript
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { useAuth } from '@/domains/auth/hooks/useAuth';
import { formatDate } from './utils';
import type { User } from './types';
```

### TypeScript Guidelines

- **Always use TypeScript** - no `.js` or `.jsx` files
- **Explicit return types** for functions
- **Interface over type** for object shapes
- **Avoid `any`** - use `unknown` if type is truly unknown
- **Use strict mode** settings

### Component Patterns

**Functional Components with TypeScript**:
```typescript
interface UserCardProps {
  user: User;
  onEdit: (id: string) => void;
}

export function UserCard({ user, onEdit }: UserCardProps) {
  return (
    <Card>
      <CardHeader>{user.name}</CardHeader>
      <Button onClick={() => onEdit(user.id)}>Edit</Button>
    </Card>
  );
}
```

**Custom Hooks**:
```typescript
export function useUserData(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Fetch user data
  }, [userId]);

  return { user, loading, error };
}
```

**Services** (No React):
```typescript
class UserService {
  async getUser(id: string): Promise<User> {
    // Business logic
  }
}

export const userService = new UserService();
```

### Testing Patterns

- **Unit tests**: Test services without React
- **Component tests**: Test UI behavior
- **Integration tests**: Test full user flows
- **Property-based tests**: Test universal properties (when specified in design)

### Error Handling

**Always use ErrorService**:
```typescript
try {
  await operation();
} catch (error) {
  const appError = errorService.handle(error, { context: 'value' });
  toast({
    title: 'Error',
    description: errorService.getUserMessage(appError),
    variant: 'destructive',
  });
}
```

### Logging

**Use structured logging**:
```typescript
logger.info('ComponentName', 'User logged in', { userId: user.id });
logger.error('ComponentName', 'Login failed', { error: err.message });
```

**Never log sensitive data** - the logger automatically sanitizes passwords, tokens, and credit cards.

## Common Patterns

### CRUD Operations

1. Create hook in appropriate domain (`src/domains/{domain}/hooks/`)
2. Hook calls service method
3. Service performs business logic
4. Service calls Supabase
5. Hook updates React state
6. Component renders updated data

### Modal Pattern

```typescript
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* Form content */}
  </DialogContent>
</Dialog>
```

### Form Handling

Use `react-hook-form` with `zod` validation:
```typescript
const form = useForm<FormData>({
  resolver: zodResolver(schema),
});

const onSubmit = async (data: FormData) => {
  // Handle submission
};
```

## Environment Variables

All environment variables must be prefixed with `VITE_` and defined in `.env`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_NAME=Wallet
VITE_APP_URL=http://localhost:5173
VITE_APP_ENVIRONMENT=development
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG_LOGS=true
```

See `.env.example` for complete list.

## Key Principles

1. **Separation of Concerns**: Keep presentation, logic, and infrastructure separate
2. **Type Safety**: Use TypeScript strictly
3. **Security First**: Always validate, sanitize, and authorize
4. **Testability**: Services should be testable without React
5. **Logging**: Log important operations with context
6. **Error Handling**: Use centralized error service
7. **No Hardcoded Values**: Use configuration module
8. **Domain-Driven**: Organize by business domain, not technical layer

## Getting Started

1. Read this document thoroughly
2. Explore the domain modules to understand the structure
3. Check existing patterns before creating new ones
4. Use the infrastructure services (logger, error handler, config)
5. Follow the 4-layer architecture
6. Write tests for services
7. Keep components focused on presentation

## Questions?

When in doubt:
- Check existing similar code in the same domain
- Follow the 4-layer architecture
- Use infrastructure services
- Keep it simple and maintainable
