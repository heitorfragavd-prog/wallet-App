# Implementation Plan

## Phase 1: Infrastructure Foundation

- [x] 1. Create configuration module with environment variable loading
  - [x] 1.1 Create `src/config/env.ts` with EnvironmentConfig interface and validation
    - Define interface for all environment variables (Supabase URL, anon key, app settings)
    - Implement `validateConfig()` function that checks required fields
    - Implement `getConfig()` function that loads from `import.meta.env`
    - Throw descriptive errors for missing variables
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3_
  - [ ]* 1.2 Write property tests for configuration module
    - **Property 1: Configuration Loading from Environment**
    - **Property 2: Missing Configuration Error Messages**
    - **Property 8: Configuration Validation at Startup**
    - **Property 9: Environment-Specific Configuration**
    - **Validates: Requirements 1.1, 1.2, 1.3, 6.3, 6.5**
  - [x] 1.3 Create `.env.example` file documenting all required variables
    - List all VITE_ prefixed variables with descriptions
    - Include example values (non-sensitive)
    - _Requirements: 1.5_
  - [x] 1.4 Update `src/integrations/supabase/client.ts` to use config module
    - Remove hardcoded Supabase URL and anon key
    - Import configuration from new config module
    - _Requirements: 1.1, 1.2_

- [x] 2. Checkpoint - Ensure configuration module works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement logging service
  - [x] 3.1 Create `src/core/logging/types.ts` with LogLevel and LogEntry interfaces
    - Define LogLevel enum (DEBUG, INFO, WARN, ERROR)
    - Define LogEntry interface with timestamp, level, component, message, data
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 3.2 Create `src/core/logging/LoggerService.ts`
    - Implement structured JSON output
    - Implement log level filtering based on environment
    - Implement sensitive data sanitization (mask passwords, tokens, card numbers)
    - Export singleton instance
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 3.3 Write property tests for logging service
    - **Property 13: Structured JSON Logging**
    - **Property 14: Production Log Filtering**
    - **Property 15: Sensitive Data Sanitization in Logs**
    - **Validates: Requirements 8.1, 8.2, 8.4, 8.5**

- [x] 4. Implement error handling service
  - [x] 4.1 Create `src/core/errors/types.ts` with ErrorCategory and AppError interfaces
    - Define ErrorCategory enum (AUTHENTICATION, VALIDATION, NETWORK, SERVER, UNKNOWN)
    - Define AppError interface with code, message, category, context
    - _Requirements: 7.1, 7.4_
  - [x] 4.2 Create `src/core/errors/ErrorService.ts`
    - Implement error categorization logic
    - Implement `getUserMessage()` that returns safe messages without technical details
    - Implement `handle()` that wraps errors with context
    - Integrate with LoggerService for error logging
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ]* 4.3 Write property tests for error service
    - **Property 10: Error Logging with Context**
    - **Property 11: User-Friendly Error Messages**
    - **Property 12: Error Categorization**
    - **Validates: Requirements 7.2, 7.3, 7.4**
  - [x] 4.4 Create `src/core/errors/ErrorBoundary.tsx` React component
    - Wrap children with error boundary
    - Display fallback UI on error
    - Log errors via ErrorService
    - _Requirements: 7.1_

- [x] 5. Checkpoint - Ensure core infrastructure works
  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: Security Improvements

- [x] 6. Improve Protected Route component
  - [x] 6.1 Refactor `src/components/ProtectedRoute.tsx`
    - Ensure no content renders before auth check completes
    - Add explicit loading state that blocks rendering
    - Improve role verification logic
    - Handle profile loading errors as unauthenticated
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 6.2 Write property tests for ProtectedRoute
    - **Property 3: Unauthenticated Route Protection**
    - **Property 4: Role-Based Route Protection**
    - **Property 5: Authorization Before Render**
    - **Validates: Requirements 4.1, 4.2, 4.5**

- [x] 7. Implement webhook validation utilities
  - [x] 7.1 Create `supabase/functions/_shared/validation.ts`
    - Implement `validateWebhookToken()` function
    - Implement `sanitizePayload()` function with XSS/SQL injection protection
    - Implement payload schema validation
    - _Requirements: 5.1, 5.3_
  - [ ]* 7.2 Write property tests for webhook validation
    - **Property 6: Webhook Token Validation**
    - **Property 7: Webhook Payload Sanitization**
    - **Validates: Requirements 5.1, 5.3**
  - [x] 7.3 Update `supabase/functions/payment-webhook/index.ts` to use validation utilities
    - Import and use validateWebhookToken
    - Import and use sanitizePayload
    - Return 401 on validation failure with logging
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 7.4 Update `supabase/functions/pepper-webhook/index.ts` to use validation utilities
    - Import and use shared validation functions
    - Improve error handling and logging
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 8. Checkpoint - Ensure security improvements work
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Domain Reorganization

- [x] 9. Create domain structure for auth module
  - [x] 9.1 Create `src/domains/auth/` directory structure
    - Create components/, hooks/, services/, types.ts
    - _Requirements: 3.1, 3.3_
  - [x] 9.2 Move auth components to `src/domains/auth/components/`
    - Move ProtectedRoute.tsx
    - Move auth/ folder contents (LoginForm, RegisterForm, etc.)
    - Update imports in moved files
    - _Requirements: 3.1, 3.2_
  - [x] 9.3 Move auth hooks to `src/domains/auth/hooks/`
    - Move useAuth.ts
    - Move useProfile.ts
    - Update imports
    - _Requirements: 3.3_
  - [x] 9.4 Create `src/domains/auth/services/AuthService.ts`
    - Extract business logic from useAuth hook
    - Implement signUp, signIn, signOut, resetPassword methods
    - Service should not depend on React
    - _Requirements: 10.1, 10.2, 10.3_
  - [ ]* 9.5 Write property test for AuthService independence
    - **Property 16: Service Layer Independence**
    - **Validates: Requirements 10.2, 10.5**

- [x] 10. Create domain structure for finance module
  - [x] 10.1 Create `src/domains/finance/` directory structure
    - Create components/, hooks/, services/, types.ts
    - _Requirements: 3.1, 3.3_
  - [x] 10.2 Move finance components to `src/domains/finance/components/`
    - Move EditarDespesaModal, EditarReceitaModal, EditarTransacaoModal
    - Move EditarCategoriaModal, NovaCategoriaModal
    - Move EditarDividaModal, EditarOrcamentoModal
    - Move EditarMetaModal, NovaMetaModal
    - Update imports
    - _Requirements: 3.1, 3.2_
  - [x] 10.3 Move finance hooks to `src/domains/finance/hooks/`
    - Move useDespesas, useReceitas, useTransacoes
    - Move useCategorias, useDividas, useMetas
    - Move useOrcamentosMercado
    - Update imports
    - _Requirements: 3.3_
  - [x] 10.4 Create `src/domains/finance/services/FinanceService.ts`
    - Extract CRUD operations for transactions
    - Implement calculation methods (totals, balances)
    - _Requirements: 10.1, 10.2_

- [x] 11. Create domain structure for vehicles module
  - [x] 11.1 Create `src/domains/vehicles/` directory structure
    - Create components/, hooks/, services/, types.ts
    - _Requirements: 3.1, 3.3_
  - [x] 11.2 Move vehicle components to `src/domains/vehicles/components/`
    - Move NovoVeiculoModal, EditarVeiculoModal
    - Move DetalhesVeiculoModal, AtualizarQuilometragemModal
    - Move GerenciarTiposManutencaoModal, NovoTipoManutencaoModal, EditarTipoManutencaoModal
    - Update imports
    - _Requirements: 3.1, 3.2_
  - [x] 11.3 Move vehicle hooks to `src/domains/vehicles/hooks/`
    - Move useVeiculos
    - Move useTiposManutencao
    - Move useManutencoesPendentes
    - Update imports
    - _Requirements: 3.3_

- [x] 12. Create domain structure for market module
  - [x] 12.1 Create `src/domains/market/` directory structure
    - Create components/, hooks/, services/, types.ts
    - _Requirements: 3.1, 3.3_
  - [x] 12.2 Move market components to `src/domains/market/components/`
    - Move NovoItemMercadoModal, EditarItemMercadoModal
    - Update imports
    - _Requirements: 3.1, 3.2_
  - [x] 12.3 Move market hooks to `src/domains/market/hooks/`
    - Move useItensMercado
    - Move useCategoriasMercado
    - Update imports
    - _Requirements: 3.3_

- [x] 13. Create domain structure for admin module
  - [x] 13.1 Create `src/domains/admin/` directory structure
    - Create components/, hooks/, services/, types.ts
    - _Requirements: 3.1, 3.3_
  - [x] 13.2 Move admin components to `src/domains/admin/components/`
    - Move AdminDashboardLayout, AdminLayout, AdminSidebar, AdminTabs
    - Update imports
    - _Requirements: 3.1, 3.2_
  - [x] 13.3 Move admin hooks to `src/domains/admin/hooks/`
    - Move useAuditLog
    - Move usePlanLimits
    - Update imports
    - _Requirements: 3.3_

- [x] 14. Organize shared components
  - [x] 14.1 Create `src/shared/components/layouts/` directory
    - Move DashboardLayout.tsx
    - Update imports
    - _Requirements: 3.2_
  - [x] 14.2 Move UI components to `src/shared/components/ui/`
    - Move entire ui/ folder
    - Update imports across project
    - _Requirements: 3.2_
  - [x] 14.3 Move shared hooks to `src/shared/hooks/`
    - Move use-mobile.tsx, use-toast.ts
    - Update imports
    - _Requirements: 3.3_

- [x] 15. Checkpoint - Ensure domain reorganization works
  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: Documentation

- [x] 16. Create AI Guidance Documentation
  - [x] 16.1 Create `src/docs/AI-GUIDANCE.md` with architecture overview
    - Document 4-layer architecture (Presentation, Adapter, Service, Infrastructure)
    - Include architecture diagram
    - Explain data flow between layers
    - _Requirements: 2.1, 2.3_
  - [x] 16.2 Add module map section to AI-GUIDANCE.md
    - Document purpose of each domain module
    - Document purpose of core infrastructure modules
    - Document purpose of shared components
    - _Requirements: 2.2_
  - [x] 16.3 Add security guidelines section to AI-GUIDANCE.md
    - Document authentication flow
    - Document authorization patterns (ProtectedRoute)
    - Document webhook security requirements
    - _Requirements: 2.4_
  - [x] 16.4 Add coding conventions section to AI-GUIDANCE.md
    - Document naming conventions
    - Document file organization patterns
    - Document TypeScript usage guidelines
    - Document testing patterns
    - _Requirements: 2.5_

- [x] 17. Create centralized type exports
  - [x] 17.1 Create `src/types/index.ts` with all domain entity types
    - Export Profile, Transaction, Category, Vehicle, Plan types
    - Add JSDoc comments to all interfaces
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 18. Update App.tsx imports
  - [x] 18.1 Update all import paths in App.tsx to use new structure
    - Update page imports
    - Update component imports
    - Verify application still runs correctly
    - _Requirements: 3.1_

- [x] 19. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
