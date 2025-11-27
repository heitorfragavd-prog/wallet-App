# Implementation Plan

## Phase 1: Database Schema & Core Types

- [x] 1. Create database migration for new tables and columns
  - [x] 1.1 Create migration file for contas_usuario table
    - Create table with id, user_id, nome, tipo columns
    - Add RLS policies for user data isolation
    - _Requirements: 2.1, 2.2_
  - [x] 1.2 Create migration file for pagamentos_dividas table
    - Create table with id, divida_id, user_id, valor, data_pagamento, metodo_pagamento, conta_id, observacoes columns
    - Add foreign key constraints and RLS policies
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 1.3 Create migration file for tags and tag relationship tables
    - Create tags table with id, user_id, nome, cor columns
    - Create despesa_tags and receita_tags junction tables
    - Add RLS policies
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 1.4 Create migration file for anexos_transacoes table
    - Create table with id, user_id, transacao_tipo, transacao_id, nome, storage_path, tipo_arquivo, tamanho columns
    - Add file size constraint (max 5MB)
    - Add RLS policies
    - _Requirements: 8.1, 8.2_
  - [x] 1.5 Create migration file for transacoes_recorrentes table
    - Create table with recurrence configuration columns
    - Add RLS policies
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 1.6 Create migration to add new columns to existing tables
    - Add metodo_pagamento, conta_id, observacoes, recorrencia_id to despesas table
    - Add metodo_pagamento, conta_id, observacoes, recorrencia_id to receitas table
    - Add metodo_pagamento, conta_id, observacoes to transacoes table
    - _Requirements: 1.1, 1.2, 2.1, 10.1_

- [x] 2. Update TypeScript types and interfaces
  - [x] 2.1 Add PaymentMethod type and update finance types
    - Create PaymentMethod union type
    - Update Despesa, Receita interfaces with new fields
    - Create PagamentoDivida, ContaUsuario, Tag, TransacaoRecorrente, AnexoTransacao interfaces
    - _Requirements: 1.1, 2.1, 3.2, 7.1, 8.1, 9.1, 10.1_
  - [ ]* 2.2 Write property test for payment method filter consistency
    - **Property 1: Payment Method Filter Consistency**
    - **Validates: Requirements 1.5**
  - [ ]* 2.3 Write property test for account filter consistency
    - **Property 2: Account Filter Consistency**
    - **Validates: Requirements 2.4**

## Phase 2: Payment Method & Account Components

- [x] 3. Create PaymentMethodSelector component
  - [x] 3.1 Implement PaymentMethodSelector UI component
    - Create reusable select component with PIX, Cartão de Crédito, Cartão de Débito, Boleto, Dinheiro, Transferência options
    - Support null value for optional selection
    - Display icons for each payment method
    - _Requirements: 1.1, 1.2, 5.1_
  - [ ]* 3.2 Write unit tests for PaymentMethodSelector
    - Test all options render correctly
    - Test onChange callback
    - Test disabled state
    - _Requirements: 1.1_

- [x] 4. Create AccountSelector component
  - [x] 4.1 Implement useContasUsuario hook
    - Fetch user accounts from contas_usuario table
    - CRUD operations for custom accounts
    - _Requirements: 2.1, 2.2_
  - [x] 4.2 Implement AccountSelector UI component
    - Create select with predefined options: Conta Corrente, Poupança, Carteira, Cartão de Crédito, Outro
    - Support creating custom accounts inline
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ]* 4.3 Write unit tests for AccountSelector
    - Test predefined options render
    - Test custom account creation
    - _Requirements: 2.1, 2.2_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Integrate Payment Method into Transactions

- [x] 6. Update Despesas module with payment method
  - [x] 6.1 Update useDespesas hook
    - Add metodo_pagamento, conta_id, observacoes to create/update operations
    - Add filter functions for payment method and account
    - _Requirements: 1.1, 1.3, 1.5, 2.4, 5.1_
  - [x] 6.2 Update Despesas page and forms
    - Add PaymentMethodSelector to create/edit forms
    - Add AccountSelector to create/edit forms
    - Add ObservationsField to forms
    - Display payment method badge in transaction list
    - Add payment method filter to list view
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.1, 2.3, 5.2, 10.1, 10.2_
  - [x] 6.3 Update EditarDespesaModal with new fields
    - Add PaymentMethodSelector, AccountSelector, ObservationsField
    - _Requirements: 1.3, 2.1, 10.1_
  - [ ]* 6.4 Write property test for optional fields persistence
    - **Property 7: Optional Fields Persistence**
    - **Validates: Requirements 5.1, 6.3, 10.1**
  - [ ]* 6.5 Write property test for null payment method filter
    - **Property 8: Null Payment Method Filter**
    - **Validates: Requirements 5.3**

- [x] 7. Update Receitas module with payment method
  - [x] 7.1 Update useReceitas hook
    - Add metodo_pagamento, conta_id, observacoes to create/update operations
    - Add filter functions for payment method and account
    - _Requirements: 1.2, 1.3, 1.5, 2.4, 5.1_
  - [x] 7.2 Update Receitas page and forms
    - Add PaymentMethodSelector to create/edit forms
    - Add AccountSelector to create/edit forms
    - Add ObservationsField to forms
    - Display payment method badge in transaction list
    - Add payment method filter to list view
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 5.2, 10.1, 10.2_
  - [x] 7.3 Update EditarReceitaModal with new fields
    - Add PaymentMethodSelector, AccountSelector, ObservationsField
    - _Requirements: 1.3, 2.1, 10.1_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: Debt Payment History

- [x] 9. Implement debt payment registration
  - [x] 9.1 Create usePagamentosDivida hook
    - Fetch payment history for a debt
    - Create payment with validation (amount <= remaining balance)
    - Auto-update debt valor_pago, valor_restante, and status
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_
  - [ ]* 9.2 Write property test for debt payment balance calculation
    - **Property 3: Debt Payment Balance Calculation**
    - **Validates: Requirements 3.3**
  - [ ]* 9.3 Write property test for debt payment validation
    - **Property 4: Debt Payment Validation**
    - **Validates: Requirements 3.5**
  - [ ]* 9.4 Write property test for debt status auto-update
    - **Property 5: Debt Status Auto-Update**
    - **Validates: Requirements 3.6**
  - [ ]* 9.5 Write property test for required fields validation
    - **Property 9: Required Fields Validation for Debt Payments**
    - **Validates: Requirements 3.2**

- [x] 10. Create debt payment UI components
  - [x] 10.1 Create RegistrarPagamentoModal component
    - Form with valor, data_pagamento, metodo_pagamento (required), conta_id, observacoes (optional)
    - Validate payment amount against remaining balance
    - Display error when payment exceeds remaining
    - _Requirements: 3.1, 3.2, 3.5, 6.1, 6.3_
  - [x] 10.2 Create HistoricoPagamentos component
    - Display list of all payments for a debt
    - Show payment date, amount, method, and notes
    - _Requirements: 3.4, 6.2_
  - [x] 10.3 Integrate payment components into Dividas page
    - Add "Registrar Pagamento" button to debt cards/rows
    - Display payment history in debt details
    - _Requirements: 3.1, 3.4_
  - [ ]* 10.4 Write unit tests for RegistrarPagamentoModal
    - Test form validation
    - Test payment amount validation
    - _Requirements: 3.2, 3.5_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: Observations Field

- [x] 12. Create ObservationsField component
  - [x] 12.1 Implement ObservationsField UI component
    - Textarea with character counter
    - Enforce 500 character limit
    - Show visual feedback when approaching/at limit
    - _Requirements: 10.1, 10.4_
  - [ ]* 12.2 Write property test for observations character limit
    - **Property 13: Observations Character Limit**
    - **Validates: Requirements 10.4**
  - [ ]* 12.3 Write unit tests for ObservationsField
    - Test character counter display
    - Test input prevention at limit
    - _Requirements: 10.4_

- [x] 13. Add search functionality for observations
  - [x] 13.1 Update transaction search to include observations
    - Modify useDespesas and useReceitas search functions
    - Include observations content in search scope
    - _Requirements: 10.3_
  - [ ]* 13.2 Write property test for search includes observations
    - **Property 14: Search Includes Observations**
    - **Validates: Requirements 10.3**

## Phase 6: Tags System

- [x] 14. Implement tags functionality
  - [x] 14.1 Create useTags hook
    - Fetch user tags
    - Create new tags
    - Get tag suggestions based on input prefix
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 14.2 Create TagsInput component
    - Multi-select input with autocomplete
    - Create new tags on Enter or comma
    - Display tags as removable badges
    - _Requirements: 9.1, 9.2, 9.3, 9.5_
  - [ ]* 14.3 Write property test for tag suggestions consistency
    - **Property 15: Tag Suggestions Consistency**
    - **Validates: Requirements 9.3**
  - [ ]* 14.4 Write property test for tag filter consistency
    - **Property 12: Tag Filter Consistency**
    - **Validates: Requirements 9.4**

- [x] 15. Integrate tags into transactions
  - [x] 15.1 Add TagsInput to Despesas forms
    - Integrate in create and edit forms
    - Save tag relationships to despesa_tags table
    - _Requirements: 9.1, 9.5_
  - [x] 15.2 Add TagsInput to Receitas forms
    - Integrate in create and edit forms
    - Save tag relationships to receita_tags table
    - _Requirements: 9.1, 9.5_
  - [x] 15.3 Add tag filter to transaction lists
    - Allow filtering by one or multiple tags
    - _Requirements: 9.4_

- [x] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 7: Attachments System

- [x] 17. Set up Supabase Storage for attachments
  - [x] 17.1 Create storage bucket configuration
    - Create anexos-transacoes bucket
    - Configure file size limit (5MB)
    - Configure allowed MIME types (image/jpeg, image/png, application/pdf)
    - Set up RLS policies for storage
    - _Requirements: 8.2, 8.3_

- [x] 18. Implement attachments functionality
  - [x] 18.1 Create useAttachments hook
    - Upload file to storage and create record
    - Delete attachment and remove from storage
    - Fetch attachments for a transaction
    - Validate file type and size before upload
    - _Requirements: 8.1, 8.2, 8.3, 8.5_
  - [ ]* 18.2 Write property test for attachment file validation
    - **Property 11: Attachment File Validation**
    - **Validates: Requirements 8.2, 8.3**
  - [x] 18.3 Create AttachmentUploader component
    - File input with drag-and-drop support
    - Display upload progress
    - Show error messages for invalid files
    - Display thumbnail previews for images
    - Allow download and delete of attachments
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 18.4 Write unit tests for AttachmentUploader
    - Test file type validation
    - Test file size validation
    - Test upload and delete callbacks
    - _Requirements: 8.2, 8.3, 8.5_

- [x] 19. Integrate attachments into transactions
  - [x] 19.1 Add AttachmentUploader to Despesas forms
    - Integrate in create and edit modals
    - _Requirements: 8.1, 8.4_
  - [x] 19.2 Add AttachmentUploader to Receitas forms
    - Integrate in create and edit modals
    - _Requirements: 8.1, 8.4_

- [x] 20. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 8: Recurring Transactions

- [x] 21. Implement recurring transactions
  - [x] 21.1 Create useRecurringTransactions hook
    - CRUD operations for recurring transaction templates
    - _Requirements: 7.1, 7.2_
  - [x] 21.2 Create RecurrenceSelector component
    - Select recurrence type: Única, Diária, Semanal, Mensal, Anual
    - Optional end date picker for non-única recurrence
    - _Requirements: 7.1, 7.2_
  - [x] 21.3 Integrate RecurrenceSelector into transaction forms
    - Add to Despesas create form
    - Add to Receitas create form
    - Display recurrence badge in transaction lists
    - _Requirements: 7.1, 7.4_
  - [ ]* 21.4 Write unit tests for RecurrenceSelector
    - Test recurrence type selection
    - Test end date visibility logic
    - _Requirements: 7.1, 7.2_

- [x] 22. Create recurring transaction processing
  - [x] 22.1 Create Edge Function for processing recurring transactions
    - Check for due recurring transactions
    - Create new transaction instances
    - Update ultima_execucao timestamp
    - _Requirements: 7.3_
  - [ ]* 22.2 Write property test for recurring transaction generation
    - **Property 10: Recurring Transaction Generation**
    - **Validates: Requirements 7.3**
  - [x] 22.3 Implement edit/delete options for recurring transactions
    - Ask user to apply to single instance or all future instances
    - _Requirements: 7.5, 7.6_

- [x] 23. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 9: Statistics & Reports

- [x] 24. Add payment method statistics
  - [x] 24.1 Create payment method breakdown component
    - Calculate expenses by payment method
    - Display as chart or breakdown list
    - _Requirements: 4.1, 4.2_
  - [ ]* 24.2 Write property test for payment method statistics consistency
    - **Property 6: Payment Method Statistics Consistency**
    - **Validates: Requirements 4.1**
  - [x] 24.3 Integrate statistics into Dashboard
    - Add payment method breakdown card
    - _Requirements: 4.1_
  - [x] 24.4 Update transaction export to include new fields
    - Include payment method and account in exports
    - _Requirements: 4.3_

- [x] 25. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
