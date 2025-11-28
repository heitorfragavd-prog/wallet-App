# Implementation Plan

- [x] 1. Fix mobile layout in Receitas page
  - [x] 1.1 Restructure mobile card layout to stack value and date properly
    - Modify the mobile list section in `src/pages/Receitas.tsx`
    - Move value to its own line above action buttons
    - Stack category badge and date vertically
    - Ensure minimum spacing of 8px between elements
    - _Requirements: 1.1, 1.3, 1.4_
  - [ ]* 1.2 Write property test for date formatting
    - **Property 1: Date formatting consistency**
    - **Validates: Requirements 3.3**
    - Test that formatarData produces DD/MM/YYYY format for any valid date

- [x] 2. Fix mobile layout in Despesas page
  - [x] 2.1 Apply same card layout pattern as Receitas
    - Modify the mobile list section in `src/pages/Despesas.tsx`
    - Use consistent structure: icon, description, category+date stacked, value, actions
    - Ensure touch targets are minimum 44x44px
    - _Requirements: 1.1, 1.3, 1.4, 3.1, 4.1_

- [x] 3. Fix mobile layout in Transacoes page
  - [x] 3.1 Apply consistent card layout pattern
    - Modify the mobile list section in `src/pages/Transacoes.tsx`
    - Match layout structure from Receitas/Despesas
    - Ensure consistent spacing and alignment
    - _Requirements: 1.1, 1.3, 3.1, 3.2_

- [x] 4. Fix mobile layout in Veiculos page
  - [x] 4.1 Restructure vehicle card for mobile
    - Modify vehicle cards in `src/pages/Veiculos.tsx`
    - Show marca/modelo on first line
    - Show ano, placa, combustivel on second line with separators
    - Position mileage badge below vehicle info
    - Move action buttons to dedicated row at bottom
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 5. Ensure consistent touch targets and spacing
  - [x] 5.1 Review and fix action button sizes across all pages
    - Ensure all action buttons have minimum 44x44px touch target
    - Add consistent gap (8px minimum) between action buttons
    - Add hover/active states for visual feedback
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Final Checkpoint - Visual verification
  - Ensure all mobile layouts are consistent and readable
  - Test on different screen sizes (320px, 375px, 414px widths)
  - Verify no element overlap or text truncation issues
