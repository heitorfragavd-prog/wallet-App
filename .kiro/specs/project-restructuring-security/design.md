# Design Document: Project Restructuring & Security

## Overview

Este documento descreve o design para a reorganização do projeto Wallet, focando em três pilares principais:

1. **Segurança**: Remoção de credenciais hardcoded, validação de webhooks, proteção de rotas
2. **Arquitetura**: Reorganização por domínios, separação de concerns, centralização de configurações
3. **Documentação para IA**: Criação de documentação técnica estruturada para orientar agentes de IA

O projeto atual é uma aplicação React 18 + TypeScript + Vite com backend Supabase. A reestruturação manterá a stack tecnológica existente, focando em melhorias organizacionais e de segurança.

## Architecture

### Current State Analysis

```
┌─────────────────────────────────────────────────────────────┐
│                    PROBLEMAS IDENTIFICADOS                   │
├─────────────────────────────────────────────────────────────┤
│ 🔴 Credenciais Supabase hardcoded em client.ts              │
│ 🔴 Componentes misturados sem organização por domínio       │
│ 🔴 Hooks sem agrupamento lógico                             │
│ 🔴 Ausência de documentação para IA                         │
│ 🟡 Tratamento de erros inconsistente                        │
│ 🟡 Logging não estruturado (console.log)                    │
│ 🟡 Webhooks com validação básica                            │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                      │
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

### Directory Structure (Target)

```
src/
├── config/                      # Configurações centralizadas
│   ├── index.ts                 # Exportação principal
│   ├── env.ts                   # Variáveis de ambiente
│   └── constants.ts             # Constantes da aplicação
│
├── core/                        # Infraestrutura compartilhada
│   ├── errors/                  # Tratamento de erros
│   │   ├── ErrorService.ts
│   │   ├── ErrorBoundary.tsx
│   │   └── types.ts
│   ├── logging/                 # Sistema de logging
│   │   ├── LoggerService.ts
│   │   └── types.ts
│   └── supabase/                # Cliente Supabase
│       ├── client.ts
│       └── types.ts
│
├── domains/                     # Módulos por domínio
│   ├── auth/                    # Autenticação
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types.ts
│   ├── finance/                 # Finanças (receitas, despesas, etc.)
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types.ts
│   ├── vehicles/                # Veículos
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types.ts
│   ├── market/                  # Mercado/Lista de compras
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types.ts
│   └── admin/                   # Administração
│       ├── components/
│       ├── hooks/
│       ├── services/
│       └── types.ts
│
├── shared/                      # Componentes compartilhados
│   ├── components/
│   │   ├── layouts/
│   │   └── ui/                  # shadcn/ui components
│   ├── hooks/
│   └── utils/
│
├── pages/                       # Páginas (entry points)
│
├── types/                       # Tipos globais
│   └── index.ts
│
└── docs/                        # Documentação para IA
    └── AI-GUIDANCE.md
```

## Components and Interfaces

### Configuration Module

```typescript
// src/config/env.ts
interface EnvironmentConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  app: {
    name: string;
    url: string;
    environment: 'development' | 'staging' | 'production';
  };
  features: {
    enableAnalytics: boolean;
    enableDebugLogs: boolean;
  };
}

// Validation function
function validateConfig(config: Partial<EnvironmentConfig>): EnvironmentConfig;
function getConfig(): EnvironmentConfig;
```

### Error Handling Service

```typescript
// src/core/errors/ErrorService.ts
enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  NETWORK = 'network',
  SERVER = 'server',
  UNKNOWN = 'unknown'
}

interface AppError {
  code: string;
  message: string;
  category: ErrorCategory;
  context?: Record<string, unknown>;
  originalError?: Error;
}

interface ErrorService {
  handle(error: unknown, context?: Record<string, unknown>): AppError;
  getUserMessage(error: AppError): string;
  log(error: AppError): void;
  notify(error: AppError): Promise<void>;
}
```

### Logging Service

```typescript
// src/core/logging/LoggerService.ts
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

interface LoggerService {
  debug(component: string, message: string, data?: Record<string, unknown>): void;
  info(component: string, message: string, data?: Record<string, unknown>): void;
  warn(component: string, message: string, data?: Record<string, unknown>): void;
  error(component: string, message: string, data?: Record<string, unknown>): void;
}
```

### Protected Route Component

```typescript
// src/domains/auth/components/ProtectedRoute.tsx
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'admin';
  fallbackPath?: string;
}

// Component ensures:
// 1. User is authenticated before rendering children
// 2. User has required role if specified
// 3. Shows loading state during auth check
// 4. Redirects appropriately on auth failure
```

### Webhook Validation

```typescript
// supabase/functions/_shared/validation.ts
interface WebhookValidationResult {
  isValid: boolean;
  error?: string;
}

interface PayloadValidator<T> {
  validate(payload: unknown): { isValid: boolean; data?: T; errors?: string[] };
}

function validateWebhookToken(token: string, secret: string): boolean;
function sanitizePayload<T>(payload: unknown, schema: PayloadValidator<T>): T;
```

## Data Models

### Domain Entities

```typescript
// src/types/index.ts

/** Perfil do usuário no sistema */
interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  telefone?: string;
  endereco?: string;
  avatar_url?: string;
  organization_name?: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

/** Transação financeira (receita ou despesa) */
interface Transaction {
  id: string;
  user_id: string;
  type: 'receita' | 'despesa';
  amount: number;
  description: string;
  category_id: string;
  date: string;
  created_at: string;
}

/** Categoria de transação */
interface Category {
  id: string;
  user_id: string;
  name: string;
  type: 'receita' | 'despesa';
  color?: string;
  icon?: string;
}

/** Veículo do usuário */
interface Vehicle {
  id: string;
  user_id: string;
  marca: string;
  modelo: string;
  ano: number;
  placa: string;
  quilometragem: number;
  created_at: string;
}

/** Plano de assinatura */
interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
  limits: PlanLimits;
}

/** Limites do plano */
interface PlanLimits {
  max_transactions: number;
  max_vehicles: number;
  max_goals: number;
  ai_queries_per_month: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following correctness properties have been identified:

### Property 1: Configuration Loading from Environment

*For any* application initialization, the configuration module SHALL return Supabase URL and anon key values that match the corresponding environment variables, never hardcoded values.

**Validates: Requirements 1.1, 1.2**

### Property 2: Missing Configuration Error Messages

*For any* missing required environment variable, the configuration validation SHALL produce an error message that contains the name of the missing variable.

**Validates: Requirements 1.3**

### Property 3: Unauthenticated Route Protection

*For any* protected route and any unauthenticated user state, the ProtectedRoute component SHALL redirect to the login page without rendering the protected content.

**Validates: Requirements 4.1**

### Property 4: Role-Based Route Protection

*For any* admin-only route and any user with role !== 'admin', the ProtectedRoute component SHALL redirect to the user dashboard without rendering the admin content.

**Validates: Requirements 4.2**

### Property 5: Authorization Before Render

*For any* protected route, the component SHALL not render children until the authorization check has completed successfully.

**Validates: Requirements 4.5**

### Property 6: Webhook Token Validation

*For any* webhook request, the Edge Function SHALL validate the request token/signature before processing the payload.

**Validates: Requirements 5.1**

### Property 7: Webhook Payload Sanitization

*For any* webhook payload containing potentially malicious data (SQL injection patterns, XSS patterns, oversized fields), the sanitization function SHALL neutralize or reject the dangerous content.

**Validates: Requirements 5.3**

### Property 8: Configuration Validation at Startup

*For any* configuration state, the validation function SHALL check all required fields and return a complete list of validation errors.

**Validates: Requirements 6.3**

### Property 9: Environment-Specific Configuration

*For any* environment (development, staging, production), the configuration module SHALL return appropriate values for that environment.

**Validates: Requirements 6.5**

### Property 10: Error Logging with Context

*For any* API error processed by the error service, the resulting log entry SHALL contain the error message, category, and any provided context information.

**Validates: Requirements 7.2**

### Property 11: User-Friendly Error Messages

*For any* error displayed to users, the message SHALL not contain stack traces, internal file paths, or technical implementation details.

**Validates: Requirements 7.3**

### Property 12: Error Categorization

*For any* error processed by the error service, the error SHALL be assigned exactly one category from the defined set (authentication, validation, network, server, unknown).

**Validates: Requirements 7.4**

### Property 13: Structured JSON Logging

*For any* log entry produced by the logging service, the output SHALL be valid JSON containing timestamp, level, component, and message fields.

**Validates: Requirements 8.1, 8.2**

### Property 14: Production Log Filtering

*For any* debug-level log call when environment is 'production', the logging service SHALL not output the log entry.

**Validates: Requirements 8.4**

### Property 15: Sensitive Data Sanitization in Logs

*For any* log entry containing patterns matching sensitive data (passwords, tokens, credit card numbers), the logging service SHALL mask or remove the sensitive values before output.

**Validates: Requirements 8.5**

### Property 16: Service Layer Independence

*For any* service class in the service layer, the class SHALL not import from 'react', 'react-dom', or any React-specific packages, ensuring testability without React rendering.

**Validates: Requirements 10.2, 10.5**

## Error Handling

### Error Categories and Handling Strategy

| Category | Examples | User Message | Action |
|----------|----------|--------------|--------|
| AUTHENTICATION | Invalid token, session expired | "Sua sessão expirou. Faça login novamente." | Redirect to login |
| VALIDATION | Invalid input, missing fields | "Por favor, verifique os dados informados." | Show field errors |
| NETWORK | Connection timeout, offline | "Erro de conexão. Verifique sua internet." | Retry option |
| SERVER | 500 errors, database errors | "Erro no servidor. Tente novamente em instantes." | Log and notify |
| UNKNOWN | Unexpected errors | "Ocorreu um erro inesperado." | Log and notify |

### Error Boundary Strategy

```typescript
// Wrap major sections with ErrorBoundary
<ErrorBoundary fallback={<ErrorFallback />} onError={logError}>
  <DashboardContent />
</ErrorBoundary>
```

## Testing Strategy

### Dual Testing Approach

O projeto utilizará duas abordagens complementares de teste:

1. **Unit Tests**: Verificam exemplos específicos e casos de borda
2. **Property-Based Tests**: Verificam propriedades universais que devem valer para todas as entradas

### Property-Based Testing Framework

- **Framework**: [fast-check](https://github.com/dubzzz/fast-check) para TypeScript
- **Minimum iterations**: 100 por propriedade
- **Annotation format**: `**Feature: project-restructuring-security, Property {number}: {property_text}**`

### Test Organization

```
src/
├── config/
│   └── __tests__/
│       ├── env.test.ts           # Unit tests
│       └── env.property.test.ts  # Property tests (Properties 1, 2, 8, 9)
├── core/
│   ├── errors/
│   │   └── __tests__/
│   │       ├── ErrorService.test.ts
│   │       └── ErrorService.property.test.ts  # Properties 10, 11, 12
│   └── logging/
│       └── __tests__/
│           ├── LoggerService.test.ts
│           └── LoggerService.property.test.ts  # Properties 13, 14, 15
├── domains/
│   └── auth/
│       └── __tests__/
│           ├── ProtectedRoute.test.tsx
│           └── ProtectedRoute.property.test.tsx  # Properties 3, 4, 5
└── supabase/
    └── functions/
        └── __tests__/
            └── webhook-validation.property.test.ts  # Properties 6, 7
```

### Unit Test Coverage

- Configuration module initialization
- Error service categorization
- Logger output format
- Protected route rendering states
- Webhook payload parsing

### Property Test Coverage

Each correctness property from the design document will have a corresponding property-based test that:
1. Generates random valid inputs using fast-check arbitraries
2. Verifies the property holds for all generated inputs
3. Reports counterexamples when properties fail
