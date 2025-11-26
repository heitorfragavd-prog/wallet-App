# Project Structure

## Architecture

4-layer architecture: Presentation → Adapter (Hooks) → Service → Infrastructure

```
User Action → Component → Hook → Service → Supabase
```

## Directory Layout

```
src/
├── pages/                    # Route entry points
├── domains/                  # Feature modules (domain-driven)
│   ├── auth/                 # Authentication & authorization
│   ├── finance/              # Income, expenses, debts, goals
│   ├── vehicles/             # Vehicle & maintenance management
│   ├── market/               # Shopping list management
│   └── admin/                # Admin panel features
├── shared/
│   ├── components/ui/        # shadcn/ui components
│   ├── components/layouts/   # Layout components
│   └── hooks/                # Shared React hooks
├── core/
│   ├── errors/               # Error handling (ErrorService, ErrorBoundary)
│   └── logging/              # Logging service
├── config/                   # Environment configuration
├── integrations/supabase/    # Supabase client & types
├── hooks/                    # App-level hooks (IA analysis)
├── components/               # Landing page components
├── lib/                      # Utilities (cn helper)
└── types/                    # Shared type definitions

supabase/
├── migrations/               # Database migrations
├── functions/                # Edge Functions
└── templates/                # Email templates
```

## Domain Module Structure

Each domain follows this pattern:

```
src/domains/{domain}/
├── components/     # React components (modals, forms)
├── hooks/          # Custom React hooks (data fetching, state)
├── services/       # Business logic (no React dependencies)
└── types.ts        # TypeScript interfaces
```

## Layer Rules

1. **Pages**: Compose domain components, use hooks for data
2. **Components**: Presentation only, no direct Supabase calls
3. **Hooks**: Bridge React state with services, handle side effects
4. **Services**: Pure business logic, testable without React
5. **Infrastructure**: Supabase client, logging, error handling, config

## Naming Conventions

- Components/Pages: `PascalCase.tsx`
- Hooks: `use{Name}.ts` (camelCase)
- Services: `{Name}Service.ts` (PascalCase)
- Types: `types.ts` per domain
- UI text: Portuguese (Brazilian)
