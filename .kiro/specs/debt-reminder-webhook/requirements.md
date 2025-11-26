# Requirements Document

## Introduction

This feature adds a debt reminder system with webhook integration to the Wallet application. Users can configure reminders for their debts (dívidas) specifying how many hours before the due date they want to be notified. When a reminder is triggered, the system sends debt and user information to a configurable webhook URL. Administrators can configure the webhook endpoint through the admin panel.

## Glossary

- **Debt (Dívida)**: A financial obligation with a due date, creditor, and amount that a user tracks in the system
- **Reminder (Lembrete)**: A scheduled notification configured by the user to alert them before a debt's due date
- **Webhook**: An HTTP callback endpoint that receives debt reminder data when triggered
- **Admin**: A user with administrative privileges who can configure system-wide settings
- **Due Date (Data de Vencimento)**: The date by which a debt payment is expected

## Requirements

### Requirement 1

**User Story:** As a user, I want to add a reminder to my debt, so that I can be notified before the due date.

#### Acceptance Criteria

1. WHEN a user creates or edits a debt THEN the System SHALL display an optional reminder configuration field
2. WHEN a user configures a reminder THEN the System SHALL allow selection of reminder time in hours before due date (e.g., 24, 48, 72 hours)
3. WHEN a user saves a debt with a reminder THEN the System SHALL persist the reminder configuration alongside the debt data
4. WHEN a user views their debts THEN the System SHALL display the configured reminder time for each debt that has one

### Requirement 2

**User Story:** As a system administrator, I want to configure the webhook URL for debt reminders, so that reminder notifications can be sent to external services.

#### Acceptance Criteria

1. WHEN an admin accesses the admin panel THEN the System SHALL display a webhook configuration section
2. WHEN an admin enters a webhook URL THEN the System SHALL validate the URL format before saving
3. WHEN an admin saves the webhook configuration THEN the System SHALL persist the webhook URL in system settings
4. WHEN an admin views the webhook configuration THEN the System SHALL display the currently configured webhook URL

### Requirement 3

**User Story:** As a system, I want to trigger webhooks for debt reminders at the configured time, so that users receive timely notifications.

#### Acceptance Criteria

1. WHEN the current time matches a debt's reminder time (due date minus configured hours) THEN the System SHALL trigger the configured webhook
2. WHEN the webhook is triggered THEN the System SHALL send a POST request containing user information (name, phone), debt information (description, creditor, total amount, remaining amount, due date), and reminder metadata
3. WHEN the webhook request completes THEN the System SHALL log the result (success or failure) for audit purposes
4. IF the webhook URL is not configured THEN the System SHALL skip webhook triggering and log a warning

### Requirement 4

**User Story:** As a user, I want my reminder to only trigger once, so that I don't receive duplicate notifications.

#### Acceptance Criteria

1. WHEN a reminder webhook is successfully triggered THEN the System SHALL mark the reminder as sent
2. WHEN processing reminders THEN the System SHALL skip reminders that have already been sent
3. WHEN a user updates the reminder time for a debt THEN the System SHALL reset the sent status to allow re-triggering

### Requirement 5

**User Story:** As a user, I want to access a dedicated reminders panel, so that I can view and manage all my debt reminders in one place.

#### Acceptance Criteria

1. WHEN a user accesses the main navigation menu THEN the System SHALL display a "Lembretes" (Reminders) menu option
2. WHEN a user clicks on the Reminders menu option THEN the System SHALL navigate to a dedicated reminders page
3. WHEN a user views the reminders page THEN the System SHALL display a list of all their configured reminders with debt information
4. WHEN displaying reminders THEN the System SHALL show for each: debt description, creditor, due date, reminder time, and status (pending, sent, failed)
5. WHEN a user views the reminders page THEN the System SHALL allow filtering by status (all, pending, sent, failed)

### Requirement 6

**User Story:** As a user, I want to see the status of my debt reminders, so that I know if notifications were sent.

#### Acceptance Criteria

1. WHEN a user views a debt with a reminder THEN the System SHALL display the reminder status (pending, sent, failed)
2. WHEN a reminder fails to send THEN the System SHALL display an error indicator on the debt
3. WHEN a user views a sent reminder THEN the System SHALL display the date and time when the reminder was sent

