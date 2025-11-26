# Design Document

## Overview

This feature repositions the theme toggle component to appear on the same horizontal line as the logout button in both the AdminSidebar and DashboardLayout components. The change creates a more compact and organized footer section in the sidebar navigation.

## Architecture

The implementation follows the existing component architecture:
- **Presentation Layer**: AdminSidebar and DashboardLayout components
- **Shared Components**: ThemeToggle component (no changes needed)
- **Styling**: Tailwind CSS with flexbox for horizontal layout

## Components and Interfaces

### Affected Components

1. **AdminSidebar** (`src/domains/admin/components/AdminSidebar.tsx`)
   - Current: Theme toggle centered above logout button in vertical layout
   - New: Theme toggle and logout button in horizontal flex layout

2. **DashboardLayout** (`src/shared/components/layouts/DashboardLayout.tsx`)
   - Current: Theme toggle above logout button in vertical layout
   - New: Theme toggle and logout button in horizontal flex layout
   - Must handle both collapsed and expanded sidebar states

### ThemeToggle Component

No changes required to the ThemeToggle component itself. It already:
- Renders as a Button with icon size
- Supports className prop for custom styling
- Has proper accessibility attributes
- Includes tooltip for user guidance

## Data Models

No new data models required. This is a pure UI layout change.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Horizontal flex container structure

*For any* sidebar component (AdminSidebar or DashboardLayout), the theme toggle and logout button should be children of the same flex container with flex-direction set to row.

**Validates: Requirements 1.1**

### Property 2: Consistent spacing between elements

*For any* rendered state, the gap between the theme toggle and logout button should match the design specification (8px/gap-2).

**Validates: Requirements 1.2, 2.1**

### Property 3: Layout stability during interactions

*For any* interaction event (hover, focus, click) on either the theme toggle or logout button, the position and dimensions of both elements should remain unchanged.

**Validates: Requirements 1.3**

### Property 4: Single-line layout preservation

*For any* viewport width or sidebar state (collapsed/expanded), both the theme toggle and logout button should remain on the same horizontal line without wrapping.

**Validates: Requirements 1.4**

### Property 5: Minimum touch target dimensions

*For any* rendered state, both the theme toggle button and logout button should have width and height of at least 44 pixels.

**Validates: Requirements 1.5**

### Property 6: Visual independence during hover

*For any* hover state on one element, the CSS styles and visual appearance of the adjacent element should remain unaffected.

**Validates: Requirements 2.3**

## Error Handling

No specific error handling required for this layout change. The components already have proper error boundaries at the application level.

## Testing Strategy

### Unit Tests

1. **Component Rendering Tests**
   - Verify AdminSidebar renders theme toggle and logout button in horizontal layout
   - Verify DashboardLayout renders theme toggle and logout button in horizontal layout
   - Verify proper spacing between elements

2. **Responsive Behavior Tests**
   - Test collapsed sidebar state maintains horizontal layout
   - Test expanded sidebar state maintains horizontal layout
   - Test mobile menu state maintains horizontal layout

3. **Accessibility Tests**
   - Verify minimum touch target sizes (44x44px)
   - Verify keyboard navigation works correctly
   - Verify screen reader announcements are correct

### Property-Based Tests

Property-based testing will use **fast-check** library for TypeScript/React. Each test should run a minimum of 100 iterations.

1. **Property Test: Horizontal Layout Consistency**
   - Generate random sidebar states (collapsed/expanded)
   - Verify flex container always uses row direction
   - Verify elements maintain horizontal alignment

2. **Property Test: Touch Target Dimensions**
   - Generate random viewport sizes
   - Verify both buttons maintain >= 44px width and height
   - Verify clickable areas don't overlap

3. **Property Test: Visual Independence**
   - Generate random interaction states (hover, focus, active)
   - Verify state changes only affect targeted element
   - Verify layout doesn't shift during interactions

### Integration Tests

1. Test theme toggle functionality still works after layout change
2. Test logout functionality still works after layout change
3. Test sidebar collapse/expand doesn't break horizontal layout

## Implementation Details

### AdminSidebar Changes

Replace the current vertical layout:
```tsx
<div className="p-4 border-t border-border space-y-2">
  <div className="flex justify-center pb-2">
    <ThemeToggle />
  </div>
  <Button ... >
    <LogOut className="h-5 w-5" />
    Sair
  </Button>
</div>
```

With horizontal layout:
```tsx
<div className="p-4 border-t border-border">
  <div className="flex items-center justify-between gap-2">
    <Button ... >
      <LogOut className="h-5 w-5" />
      Sair
    </Button>
    <ThemeToggle />
  </div>
</div>
```

### DashboardLayout Changes

Replace the current vertical layout:
```tsx
<div className="p-4 border-t border-border flex-shrink-0 space-y-2">
  <div className={`flex ${isCollapsed ? "justify-center" : "justify-start px-3"}`}>
    <ThemeToggle />
  </div>
  <Button ... >
    <LogOut className="w-5 h-5 flex-shrink-0" />
    {!isCollapsed && <span className="ml-3">Sair</span>}
  </Button>
</div>
```

With horizontal layout that handles collapsed state:
```tsx
<div className="p-4 border-t border-border flex-shrink-0">
  <div className={`flex items-center gap-2 ${
    isCollapsed ? "justify-center" : "justify-between"
  }`}>
    <Button ... >
      <LogOut className="w-5 h-5 flex-shrink-0" />
      {!isCollapsed && <span className="ml-3">Sair</span>}
    </Button>
    <ThemeToggle />
  </div>
</div>
```

### Styling Considerations

- Use `flex items-center` for vertical centering
- Use `gap-2` (8px) for consistent spacing between elements
- Use `justify-between` for expanded state to push elements apart
- Use `justify-center` for collapsed state to center both icons
- Maintain existing button variants and hover states
- Preserve all accessibility attributes and aria-labels

### Responsive Behavior

- **Desktop Expanded**: Theme toggle on right, logout button on left with text
- **Desktop Collapsed**: Both icons centered horizontally with small gap
- **Mobile**: Same as desktop expanded (always shows full layout)

## Performance Considerations

No performance impact expected. This is a pure layout change using existing components and CSS flexbox.

## Accessibility Considerations

- Maintain existing ARIA labels on both components
- Ensure tab order flows naturally (logout button first, then theme toggle)
- Preserve minimum 44x44px touch targets
- Maintain sufficient color contrast for both elements
- Keep tooltip functionality on theme toggle
