# Requirements Document

## Introduction

Este documento especifica os requisitos para corrigir o sistema de cadastro de usuários do Wallet. O sistema atual apresenta problemas de sincronização entre as tabelas `auth.users`, `profiles`, `subscriptions` e `plan_limits`, resultando em dados incompletos e APIs quebradas.

## Glossary

- **Profile**: Registro na tabela `profiles` contendo dados do usuário (nome, telefone, email, etc.)
- **Subscription**: Registro na tabela `subscriptions` que vincula um usuário a um plano
- **Plan**: Plano de assinatura (Essencial/Gratuito, Pro, Black) com limites específicos
- **Plan Limits**: Limites de uso por funcionalidade para cada plano
- **auth.users**: Tabela do Supabase Auth que armazena credenciais de autenticação
- **RPC Function**: Função PostgreSQL exposta via API REST do Supabase
- **Trigger**: Função executada automaticamente em resposta a eventos no banco de dados

## Requirements

### Requirement 1

**User Story:** As a new user, I want my profile to be automatically created with all my registration data, so that my information is complete and accessible throughout the system.

#### Acceptance Criteria

1. WHEN a new user registers THEN the System SHALL create a profile record with name, organization_name, telefone, AND email from auth.users
2. WHEN a new user registers THEN the System SHALL create a subscription record with the free plan (Essencial) and active status
3. WHEN a profile is created without email THEN the System SHALL sync the email from auth.users automatically
4. IF the profile creation fails THEN the System SHALL log the error and maintain data integrity

### Requirement 2

**User Story:** As an admin, I want to search for users by phone number via API, so that I can integrate with external systems like WhatsApp bots.

#### Acceptance Criteria

1. WHEN an admin calls get_user_profile_by_phone with a valid phone number THEN the System SHALL return complete user data including profile, subscription, plan, limits, and usage
2. WHEN an admin calls get_user_profile_by_phone with a non-existent phone number THEN the System SHALL return null without errors
3. WHEN the user_profile_complete view is queried THEN the System SHALL return all required columns for the RPC function
4. IF the phone number format varies (with/without country code) THEN the System SHALL normalize and match correctly

### Requirement 3

**User Story:** As an admin, I want to see all user information in the admin panel, so that I can manage users effectively.

#### Acceptance Criteria

1. WHEN the admin views the users list THEN the System SHALL display name, email, role, and plan for each user
2. WHEN a user has no subscription THEN the System SHALL display "Gratuito" as the plan name
3. WHEN the admin searches by email THEN the System SHALL find users even if email is stored in auth.users only

### Requirement 4

**User Story:** As a system administrator, I want existing users without email in profiles to be fixed, so that all data is consistent.

#### Acceptance Criteria

1. WHEN a migration runs THEN the System SHALL update all profiles with null email to sync from auth.users
2. WHEN a migration runs THEN the System SHALL create subscriptions for users without one, assigning the free plan
3. WHEN the migration completes THEN the System SHALL report the number of records updated
