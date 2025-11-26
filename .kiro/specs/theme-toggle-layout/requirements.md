# Requirements Document

## Introduction

This feature repositions the theme toggle icon (dark/light mode) to appear on the same line as the logout button ("Sair"), creating a more compact and organized layout in the sidebar or navigation area.

## Glossary

- **Theme Toggle**: The UI control that switches between dark mode and light mode, typically represented by a moon/sun icon
- **Logout Button**: The "Sair" button that allows users to log out of the application
- **Sidebar**: The navigation panel where the theme toggle and logout button are displayed

## Requirements

### Requirement 1

**User Story:** As a user, I want the theme toggle icon to be positioned next to the logout button on the same line, so that the interface is more compact and organized.

#### Acceptance Criteria

1. WHEN the user views the sidebar or navigation area THEN the system SHALL display the theme toggle icon and logout button on the same horizontal line
2. WHEN the theme toggle icon is displayed THEN the system SHALL position it immediately adjacent to the logout button with appropriate spacing
3. WHEN the user interacts with either the theme toggle or logout button THEN the system SHALL maintain the horizontal alignment without layout shifts
4. WHEN the viewport is resized THEN the system SHALL preserve the horizontal layout of both elements on the same line
5. WHEN both elements are displayed THEN the system SHALL ensure adequate touch targets for mobile users (minimum 44x44px)

### Requirement 2

**User Story:** As a user, I want the theme toggle to remain visually distinct and accessible, so that I can easily identify and use it alongside the logout button.

#### Acceptance Criteria

1. WHEN both elements are on the same line THEN the system SHALL maintain sufficient spacing between the theme toggle icon and logout button to prevent accidental clicks
2. WHEN the theme toggle is positioned THEN the system SHALL preserve its visual styling and icon appearance
3. WHEN the user hovers over either element THEN the system SHALL provide appropriate visual feedback without affecting the other element
4. WHEN both elements are displayed THEN the system SHALL ensure the theme toggle icon remains clearly visible and recognizable
