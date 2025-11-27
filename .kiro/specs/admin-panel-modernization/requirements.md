# Requirements Document

## Introduction

Este documento especifica os requisitos para modernização do Painel Administrativo do Wallet, alinhando-o com o padrão visual moderno já utilizado no Dashboard do usuário. A modernização inclui reorganização da navegação (consolidando 9 abas em um menu lateral com submenus), aplicação de cards com gradientes, ícones coloridos, e melhor hierarquia visual. O objetivo é criar uma experiência administrativa mais intuitiva e visualmente consistente com o resto do sistema.

## Glossary

- **Admin_Panel**: Interface administrativa do sistema Wallet para gerenciamento de usuários, planos, assinaturas e configurações
- **Sidebar**: Menu lateral de navegação com ícones e submenus colapsáveis
- **Stats_Card**: Componente de card com gradiente, ícone colorido e métricas numéricas
- **Menu_Group**: Agrupamento lógico de itens de menu relacionados (ex: Financeiro, Sistema, Integrações)
- **Active_State**: Estado visual que indica o item de menu atualmente selecionado
- **Breadcrumb**: Indicador de localização hierárquica na navegação

## Requirements

### Requirement 1

**User Story:** As an administrator, I want a modern sidebar navigation with grouped menu items, so that I can quickly access different admin sections without visual clutter.

#### Acceptance Criteria

1. WHEN the administrator accesses the admin panel THEN the Admin_Panel SHALL display a Sidebar with Menu_Groups for "Visão Geral", "Usuários & Planos", "Financeiro", "Integrações" and "Sistema"
2. WHEN the administrator clicks on a Menu_Group THEN the Admin_Panel SHALL expand the group to show its child menu items with smooth animation
3. WHEN the administrator navigates to a page THEN the Admin_Panel SHALL highlight the corresponding menu item with Active_State styling using orange accent color
4. WHEN the administrator hovers over a menu item THEN the Admin_Panel SHALL display a subtle background highlight with transition effect
5. WHEN the sidebar is rendered THEN the Admin_Panel SHALL display icons from Lucide React library for each menu item

### Requirement 2

**User Story:** As an administrator, I want the dashboard to display key metrics in visually appealing cards with gradients and icons, so that I can quickly understand the system's health at a glance.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the Admin_Panel SHALL display Stats_Cards with gradient backgrounds matching the metric type (green for revenue, blue for users, purple for subscriptions, orange for conversion)
2. WHEN displaying a Stats_Card THEN the Admin_Panel SHALL show an icon with matching color inside a rounded container with 20% opacity background
3. WHEN the dashboard data is loading THEN the Admin_Panel SHALL display skeleton placeholders with the same dimensions as the final Stats_Cards
4. WHEN a Stats_Card displays currency values THEN the Admin_Panel SHALL format them using Brazilian Real (BRL) with proper locale formatting

### Requirement 3

**User Story:** As an administrator, I want consistent page headers across all admin pages, so that I can always know where I am in the system.

#### Acceptance Criteria

1. WHEN any admin page loads THEN the Admin_Panel SHALL display a page header with title, optional subtitle, and Breadcrumb navigation
2. WHEN the page header renders THEN the Admin_Panel SHALL include an icon matching the current section with colored background
3. WHEN navigating between pages THEN the Admin_Panel SHALL maintain consistent header positioning and styling

### Requirement 4

**User Story:** As an administrator, I want the admin panel to support dark mode consistently, so that I can work comfortably in any lighting condition.

#### Acceptance Criteria

1. WHEN dark mode is enabled THEN the Admin_Panel SHALL apply appropriate dark variants for all gradient backgrounds
2. WHEN dark mode is toggled THEN the Admin_Panel SHALL transition all colors smoothly without visual glitches
3. WHEN rendering Stats_Cards in dark mode THEN the Admin_Panel SHALL maintain readable contrast ratios for all text elements

### Requirement 5

**User Story:** As an administrator, I want quick action buttons on the dashboard, so that I can perform common tasks without navigating to other pages.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the Admin_Panel SHALL display quick action buttons for "Novo Usuário", "Novo Plano", and "Ver Relatórios"
2. WHEN the administrator clicks a quick action button THEN the Admin_Panel SHALL navigate to the corresponding page or open the appropriate modal
3. WHEN displaying quick action buttons THEN the Admin_Panel SHALL use consistent button styling with icons

### Requirement 6

**User Story:** As an administrator, I want to see recent activity on the dashboard, so that I can monitor system usage without checking individual pages.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the Admin_Panel SHALL display a "Atividade Recente" section showing the last 5 audit log entries
2. WHEN displaying activity items THEN the Admin_Panel SHALL show timestamp, user name, action type, and affected resource
3. WHEN no recent activity exists THEN the Admin_Panel SHALL display an empty state with appropriate messaging

### Requirement 7

**User Story:** As an administrator, I want all admin pages to use the new layout consistently, so that the experience is uniform across the entire admin panel.

#### Acceptance Criteria

1. WHEN any admin page renders THEN the Admin_Panel SHALL use the modernized AdminLayout component with Sidebar
2. WHEN the page content loads THEN the Admin_Panel SHALL apply consistent padding, spacing, and card styling
3. WHEN tables are displayed THEN the Admin_Panel SHALL use consistent table styling with hover states and proper borders

