# Requirements Document

## Introduction

Este documento especifica os requisitos para melhorias abrangentes no módulo financeiro do sistema Wallet. As funcionalidades incluem: método de pagamento, conta de origem, transações recorrentes, anexos/comprovantes, tags personalizadas, notas/observações e histórico de pagamentos de dívidas.

## Glossary

- **Sistema Wallet**: Plataforma de gestão financeira pessoal e empresarial
- **Método de Pagamento**: Forma utilizada para realizar uma transação (PIX, Cartão, Boleto, Dinheiro, Transferência)
- **Conta de Origem**: Conta ou carteira de onde o dinheiro saiu ou entrou (Conta Corrente, Poupança, Carteira, Cartão de Crédito)
- **Pagamento Parcial**: Pagamento de parte do valor de uma dívida
- **Histórico de Pagamentos**: Registro de todos os pagamentos realizados para uma dívida
- **Transação Recorrente**: Transação que se repete automaticamente em intervalos definidos (diário, semanal, mensal, anual)
- **Anexo/Comprovante**: Arquivo (imagem ou PDF) associado a uma transação como prova de pagamento
- **Tag**: Etiqueta personalizada para categorização adicional de transações
- **Observação**: Campo de texto livre para anotações sobre uma transação

## Requirements

### Requirement 1

**User Story:** As a user, I want to register the payment method for my expenses and income, so that I can track how my money flows.

#### Acceptance Criteria

1. WHEN a user creates a new expense THEN the System Wallet SHALL display a payment method selector with options: PIX, Cartão de Crédito, Cartão de Débito, Boleto, Dinheiro, Transferência
2. WHEN a user creates a new income THEN the System Wallet SHALL display a payment method selector with the same options
3. WHEN a user edits an existing transaction THEN the System Wallet SHALL allow modification of the payment method
4. WHEN displaying transaction lists THEN the System Wallet SHALL show the payment method as a badge or icon for each transaction
5. WHEN filtering transactions THEN the System Wallet SHALL allow filtering by payment method

### Requirement 2

**User Story:** As a user, I want to specify the account or wallet origin for my transactions, so that I can track which accounts my money comes from and goes to.

#### Acceptance Criteria

1. WHEN a user creates a transaction THEN the System Wallet SHALL display an account selector with predefined options: Conta Corrente, Poupança, Carteira, Cartão de Crédito, Outro
2. WHEN a user wants to add a custom account THEN the System Wallet SHALL allow creating new account names
3. WHEN displaying transaction details THEN the System Wallet SHALL show the account origin
4. WHEN filtering transactions THEN the System Wallet SHALL allow filtering by account origin

### Requirement 3

**User Story:** As a user, I want to register partial payments for my debts, so that I can track my payment progress over time.

#### Acceptance Criteria

1. WHEN a user views a debt THEN the System Wallet SHALL display a button to register a payment
2. WHEN a user registers a debt payment THEN the System Wallet SHALL require: payment amount, payment date, and payment method
3. WHEN a debt payment is registered THEN the System Wallet SHALL automatically update the paid amount and remaining balance
4. WHEN viewing a debt THEN the System Wallet SHALL display a payment history showing all registered payments
5. WHEN a debt payment exceeds the remaining balance THEN the System Wallet SHALL prevent the payment and display an error message
6. WHEN all installments are paid THEN the System Wallet SHALL automatically update the debt status to "quitada"

### Requirement 4

**User Story:** As a user, I want to see payment method statistics, so that I can understand my spending patterns by payment type.

#### Acceptance Criteria

1. WHEN viewing the dashboard THEN the System Wallet SHALL display a breakdown of expenses by payment method
2. WHEN viewing transaction reports THEN the System Wallet SHALL include payment method distribution charts
3. WHEN exporting transaction data THEN the System Wallet SHALL include payment method and account information

### Requirement 5

**User Story:** As a user, I want the payment method field to be optional, so that I can quickly add transactions without specifying payment details.

#### Acceptance Criteria

1. WHEN a user creates a transaction without selecting a payment method THEN the System Wallet SHALL save the transaction with payment method as null
2. WHEN displaying transactions without payment method THEN the System Wallet SHALL show "Não informado" as the payment method
3. WHEN filtering by payment method THEN the System Wallet SHALL include an option to filter transactions without payment method specified

### Requirement 6

**User Story:** As a user, I want to add notes to my debt payments, so that I can record additional context about each payment.

#### Acceptance Criteria

1. WHEN registering a debt payment THEN the System Wallet SHALL display an optional notes field
2. WHEN viewing payment history THEN the System Wallet SHALL display any notes associated with each payment
3. WHEN the notes field is empty THEN the System Wallet SHALL save the payment without notes

### Requirement 7

**User Story:** As a user, I want to create recurring transactions, so that I can automate the registration of regular income and expenses.

#### Acceptance Criteria

1. WHEN a user creates a new transaction THEN the System Wallet SHALL display a recurrence option with values: Única, Diária, Semanal, Mensal, Anual
2. WHEN a user selects a recurrence other than "Única" THEN the System Wallet SHALL request an optional end date for the recurrence
3. WHEN a recurring transaction is due THEN the System Wallet SHALL automatically create a new transaction instance
4. WHEN viewing a recurring transaction THEN the System Wallet SHALL display a recurrence indicator badge
5. WHEN a user edits a recurring transaction THEN the System Wallet SHALL ask whether to apply changes to this instance only or all future instances
6. WHEN a user deletes a recurring transaction THEN the System Wallet SHALL ask whether to delete this instance only or all future instances

### Requirement 8

**User Story:** As a user, I want to attach receipts and proof of payment to my transactions, so that I can keep documentation organized.

#### Acceptance Criteria

1. WHEN a user creates or edits a transaction THEN the System Wallet SHALL display an option to attach files
2. WHEN a user uploads an attachment THEN the System Wallet SHALL accept image files (JPG, PNG) and PDF documents up to 5MB
3. WHEN a user uploads an invalid file type or size THEN the System Wallet SHALL display an error message and reject the upload
4. WHEN viewing a transaction with attachments THEN the System Wallet SHALL display thumbnail previews and allow download
5. WHEN a user deletes an attachment THEN the System Wallet SHALL remove the file from storage after confirmation

### Requirement 9

**User Story:** As a user, I want to add custom tags to my transactions, so that I can organize and filter them beyond categories.

#### Acceptance Criteria

1. WHEN a user creates or edits a transaction THEN the System Wallet SHALL display a tags input field
2. WHEN a user types a new tag THEN the System Wallet SHALL allow creating the tag by pressing Enter or comma
3. WHEN a user types an existing tag THEN the System Wallet SHALL suggest matching tags from previous entries
4. WHEN filtering transactions THEN the System Wallet SHALL allow filtering by one or multiple tags
5. WHEN viewing a transaction THEN the System Wallet SHALL display all associated tags as badges

### Requirement 10

**User Story:** As a user, I want to add notes and observations to my transactions, so that I can record additional context and details.

#### Acceptance Criteria

1. WHEN a user creates or edits a transaction THEN the System Wallet SHALL display an optional observations text field
2. WHEN viewing transaction details THEN the System Wallet SHALL display the observations if present
3. WHEN searching transactions THEN the System Wallet SHALL include observations content in the search scope
4. WHEN the observations field exceeds 500 characters THEN the System Wallet SHALL prevent additional input and display a character counter

