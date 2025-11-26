# Requirements Document

## Introduction

This feature addresses critical security vulnerabilities identified in the Supabase database configuration. The audit revealed tables without Row Level Security (RLS) enabled and functions with mutable search paths that could be exploited for SQL injection attacks. This document specifies the requirements for securing the database layer.

## Glossary

- **RLS (Row Level Security)**: PostgreSQL feature that restricts which rows users can access based on policies
- **Search Path**: PostgreSQL configuration that determines the order schemas are searched when resolving object names
- **Admin Role**: Users with elevated privileges (role = 'admin' in profiles table)
- **Policy**: A rule that defines which rows a user can SELECT, INSERT, UPDATE, or DELETE

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want the admin_logs table to have RLS enabled with appropriate policies, so that audit logs are protected from unauthorized access.

#### Acceptance Criteria

1. WHEN RLS is enabled on admin_logs THEN the System SHALL restrict SELECT access to users with admin role only
2. WHEN a non-admin user queries admin_logs THEN the System SHALL return zero rows
3. WHEN an admin user queries admin_logs THEN the System SHALL return all audit log entries
4. WHEN any user attempts to INSERT into admin_logs directly THEN the System SHALL deny the operation (inserts via trigger function only)

### Requirement 2

**User Story:** As a system administrator, I want the plan_limits table to have RLS enabled with appropriate policies, so that plan configuration data is protected while remaining readable for subscription checks.

#### Acceptance Criteria

1. WHEN RLS is enabled on plan_limits THEN the System SHALL allow SELECT access to all authenticated users
2. WHEN an authenticated user queries plan_limits THEN the System SHALL return all plan limit configurations
3. WHEN any user attempts to INSERT, UPDATE, or DELETE plan_limits THEN the System SHALL deny the operation unless user has admin role
4. WHEN an admin user modifies plan_limits THEN the System SHALL allow the operation

### Requirement 3

**User Story:** As a security engineer, I want all database functions to have immutable search paths, so that SQL injection attacks via search path manipulation are prevented.

#### Acceptance Criteria

1. WHEN the function log_admin_action is called THEN the System SHALL execute with search_path set to 'public'
2. WHEN the function cleanup_expired_tokens is called THEN the System SHALL execute with search_path set to 'public'
3. WHEN the function update_payment_links_updated_at is called THEN the System SHALL execute with search_path set to 'public'
4. WHEN the function update_updated_at_column is called THEN the System SHALL execute with search_path set to 'public'
5. WHEN the function update_valor_restante is called THEN the System SHALL execute with search_path set to 'public'
6. WHEN the function update_meta_status is called THEN the System SHALL execute with search_path set to 'public'
7. WHEN the function update_item_status is called THEN the System SHALL execute with search_path set to 'public'
8. WHEN the function calcular_proxima_manutencao is called THEN the System SHALL execute with search_path set to 'public'
9. WHEN the function delete_user_account is called THEN the System SHALL execute with search_path set to 'public'

### Requirement 4

**User Story:** As a security engineer, I want leaked password protection enabled, so that users cannot register with compromised passwords.

#### Acceptance Criteria

1. WHEN a user attempts to register with a password found in HaveIBeenPwned database THEN the System SHALL reject the registration
2. WHEN a user attempts to change their password to a compromised password THEN the System SHALL reject the change
