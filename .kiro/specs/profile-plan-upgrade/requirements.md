# Requirements Document

## Introduction

Esta funcionalidade adiciona à página de Perfil do usuário uma seção dedicada para visualização do plano atual, limites de uso e opção de upgrade. O objetivo é permitir que os usuários acompanhem seu consumo em relação aos limites do plano contratado e possam facilmente fazer upgrade para planos superiores quando necessário.

## Glossary

- **Perfil_Page**: Página de perfil do usuário localizada em `/perfil`
- **Plan**: Plano de assinatura do usuário (ex: Essencial, Profissional, Empresarial)
- **Plan_Limits**: Limites de uso definidos para cada plano (transações, veículos, metas, análises IA, etc.)
- **Usage_Stats**: Estatísticas de uso atual do usuário em relação aos limites do plano
- **Subscription**: Assinatura ativa do usuário vinculada a um plano
- **Progress_Bar**: Componente visual que mostra o progresso de uso em relação ao limite
- **Upgrade_Flow**: Fluxo de navegação para upgrade de plano

## Requirements

### Requirement 1

**User Story:** As a user, I want to see my current plan information on my profile page, so that I can understand what plan I'm subscribed to and its benefits.

#### Acceptance Criteria

1. WHEN a user visits the Perfil_Page THEN the Perfil_Page SHALL display a card showing the current Plan name and status
2. WHEN a user has an active Subscription THEN the Perfil_Page SHALL display the Plan features as a list of included benefits
3. WHEN a user has an active Subscription with an expiration date THEN the Perfil_Page SHALL display the subscription expiration date formatted in Portuguese
4. WHEN a user has no active Subscription THEN the Perfil_Page SHALL display the default "Essencial" Plan information

### Requirement 2

**User Story:** As a user, I want to see my current usage against plan limits, so that I can monitor my consumption and avoid hitting limits unexpectedly.

#### Acceptance Criteria

1. WHEN a user visits the Perfil_Page THEN the Perfil_Page SHALL display Usage_Stats for each Plan_Limits feature
2. WHEN displaying Usage_Stats THEN the Perfil_Page SHALL show a Progress_Bar indicating current usage versus the limit
3. WHEN a feature has unlimited usage (null limit) THEN the Perfil_Page SHALL display "Ilimitado" instead of a Progress_Bar
4. WHEN usage exceeds 80% of a limit THEN the Perfil_Page SHALL highlight the Progress_Bar with a warning color (yellow/orange)
5. WHEN usage reaches 100% of a limit THEN the Perfil_Page SHALL highlight the Progress_Bar with a danger color (red)

### Requirement 3

**User Story:** As a user, I want to easily upgrade my plan from my profile page, so that I can access more features when I need them.

#### Acceptance Criteria

1. WHEN a user is not on the highest tier Plan THEN the Perfil_Page SHALL display an "Upgrade" button
2. WHEN a user clicks the "Upgrade" button THEN the Perfil_Page SHALL navigate to the pricing/plans page or open a modal with available plans
3. WHEN a user is already on the highest tier Plan THEN the Perfil_Page SHALL hide the "Upgrade" button and display a "Plano Máximo" badge
4. WHEN displaying upgrade options THEN the Perfil_Page SHALL show the price difference and additional features of higher plans

### Requirement 4

**User Story:** As a user, I want the plan information to load efficiently, so that I don't experience delays when viewing my profile.

#### Acceptance Criteria

1. WHILE the Plan and Usage_Stats data is loading THEN the Perfil_Page SHALL display skeleton loading states for the plan section
2. IF an error occurs while fetching Plan or Usage_Stats data THEN the Perfil_Page SHALL display a user-friendly error message with a retry option
3. WHEN Plan or Usage_Stats data changes THEN the Perfil_Page SHALL reflect the updated information without requiring a page refresh

### Requirement 5

**User Story:** As a user, I want the plan section to be visually consistent with the rest of my profile, so that the experience feels cohesive.

#### Acceptance Criteria

1. WHEN displaying the Plan section THEN the Perfil_Page SHALL use the same Card component style as other profile sections
2. WHEN displaying Plan information THEN the Perfil_Page SHALL use appropriate icons from Lucide React to represent features
3. WHEN the user is on a premium Plan THEN the Perfil_Page SHALL display a visual indicator (badge or icon) highlighting the premium status
