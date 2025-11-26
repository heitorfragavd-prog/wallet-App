# Implementation Plan

- [x] 1. Create useUserSubscription hook
  - [x] 1.1 Create the hook file at `src/domains/auth/hooks/useUserSubscription.ts`
    - Fetch user subscription with plan data from Supabase
    - Include loading, error, and refetch states
    - Determine if user is on highest tier plan
    - Handle case when user has no active subscription (default to Essencial)
    - _Requirements: 1.1, 1.4, 4.1, 4.2_
  - [ ]* 1.2 Write property test for date formatting
    - **Property 2: Date formatting consistency**
    - **Validates: Requirements 1.3**

- [x] 2. Create UsageProgressBar component
  - [x] 2.1 Create the component file at `src/domains/auth/components/profile/UsageProgressBar.tsx`
    - Accept current usage, limit, and label props
    - Calculate percentage: Math.min(100, (current / limit) * 100)
    - Apply color classes based on thresholds (default < 80%, warning 80-99%, danger >= 100%)
    - Display "Ilimitado" text when limit is null
    - Use shadcn/ui Progress component
    - _Requirements: 2.2, 2.3, 2.4, 2.5_
  - [ ]* 2.2 Write property test for percentage calculation
    - **Property 4: Progress bar percentage calculation**
    - **Validates: Requirements 2.2**
  - [ ]* 2.3 Write property test for color thresholds
    - **Property 5: Progress bar color thresholds**
    - **Validates: Requirements 2.4, 2.5**

- [x] 3. Create UsageLimitsCard component
  - [x] 3.1 Create the component file at `src/domains/auth/components/profile/UsageLimitsCard.tsx`
    - Display all usage stats from usePlanLimits hook
    - Render UsageProgressBar for each feature
    - Include feature labels in Portuguese
    - Show skeleton loading state
    - _Requirements: 2.1, 4.1_
  - [ ]* 3.2 Write property test for usage stats completeness
    - **Property 3: Usage stats display completeness**
    - **Validates: Requirements 2.1**

- [x] 4. Create PlanInfoCard component
  - [x] 4.1 Create the component file at `src/domains/auth/components/profile/PlanInfoCard.tsx`
    - Display plan name, status, and features list
    - Show expiration date formatted in Portuguese
    - Display premium badge for paid plans
    - Include upgrade button for non-highest tier plans
    - Show "Plano Máximo" badge for highest tier
    - Handle loading and error states
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.3, 4.1, 4.2, 5.1, 5.2, 5.3_
  - [ ]* 4.2 Write property test for features display
    - **Property 1: Plan features display completeness**
    - **Validates: Requirements 1.2**
  - [ ]* 4.3 Write property test for upgrade button visibility
    - **Property 6: Upgrade button visibility**
    - **Validates: Requirements 3.1, 3.3**
  - [ ]* 4.4 Write property test for premium badge visibility
    - **Property 8: Premium badge visibility**
    - **Validates: Requirements 5.3**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Create UpgradePlanModal component 
  - [x] 6.1 Create the modal file at `src/domains/auth/components/profile/UpgradePlanModal.tsx`
    - Fetch available plans higher than current
    - Display price difference and additional features
    - Include CTA button to proceed with upgrade
    - _Requirements: 3.2, 3.4_
  - [ ]* 6.2 Write property test for price difference calculation
    - **Property 7: Price difference calculation**
    - **Validates: Requirements 3.4**

- [ ] 7. Integrate components into Perfil page
  - [ ] 7.1 Update `src/pages/Perfil.tsx` to include new components
    - Import and use useUserSubscription hook
    - Import and use usePlanLimits hook
    - Add PlanInfoCard in the grid layout
    - Add UsageLimitsCard below or beside PlanInfoCard
    - Maintain visual consistency with existing cards
    - _Requirements: 1.1, 2.1, 5.1_

- [x] 8. Create barrel export for profile components
  - [x] 8.1 Create index file at `src/domains/auth/components/profile/index.ts`
    - Export all new profile-related components
    - _Requirements: N/A (code organization)_

- [x] 9. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
