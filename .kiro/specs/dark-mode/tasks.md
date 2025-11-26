# Implementation Plan

- [x] 1. Create ThemeProvider context and useTheme hook
  - [x] 1.1 Create ThemeProvider component with context
    - Create `src/shared/components/ThemeProvider.tsx`
    - Implement theme state management with useState
    - Handle localStorage read/write for persistence
    - Detect system preference via matchMedia API
    - Apply theme class to document.documentElement
    - _Requirements: 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_
  - [x] 1.2 Create useTheme hook
    - Create `src/shared/hooks/use-theme.ts`
    - Export hook that consumes ThemeProvider context
    - Throw error if used outside provider
    - _Requirements: 1.1, 1.2_
  - [ ]* 1.3 Write property tests for theme state management
    - **Property 1: Theme toggle round-trip**
    - **Property 2: Theme persistence round-trip**
    - **Property 3: System preference detection**
    - **Property 4: Manual override precedence**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4**

- [x] 2. Create ThemeToggle component
  - [x] 2.1 Create ThemeToggle UI component
    - Create `src/shared/components/ThemeToggle.tsx`
    - Use Sun and Moon icons from lucide-react
    - Add tooltip with Portuguese text ("Mudar para modo escuro/claro")
    - Style with Tailwind classes
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 2.2 Write property test for icon state
    - **Property 5: Theme icon state consistency**
    - **Validates: Requirements 4.2**

- [x] 3. Integrate ThemeProvider into application
  - [x] 3.1 Wrap App with ThemeProvider
    - Update `src/main.tsx` to include ThemeProvider
    - Set default theme to 'system'
    - _Requirements: 2.1_
  - [x] 3.2 Add ThemeToggle to Header component
    - Update `src/components/Header.tsx` to include ThemeToggle
    - Position toggle in header navigation area
    - _Requirements: 4.1_
  - [x] 3.3 Add ThemeToggle to AdminSidebar
    - Update `src/domains/admin/components/AdminSidebar.tsx`
    - Add toggle to sidebar footer or header
    - _Requirements: 4.1_

- [x] 4. Update dark mode CSS for scrollbar
  - [x] 4.1 Add dark mode scrollbar styles
    - Update `src/index.css` with dark mode scrollbar colors
    - Ensure scrollbar matches dark theme aesthetic
    - _Requirements: 3.1_

- [x] 5. Checkpoint - Verify dark mode functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Final verification and polish
  - [x] 6.1 Test dark mode across all pages
    - Verify Dashboard, Categorias, Despesas, Receitas pages
    - Verify Admin pages render correctly in dark mode
    - Check charts and data visualizations
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 6.2 Fix native select elements in modals
    - Update EditarDespesaModal, EditarReceitaModal, EditarTransacaoModal
    - Update EditarDividaModal, NovaMetaModal
    - Replace hardcoded colors with theme variables (bg-background, text-foreground)
    - Add option styling with [&>option] selector
    - _Requirements: 3.1, 3.2_
