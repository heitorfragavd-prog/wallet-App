# Implementation Plan

- [x] 1. Fix existing data with migration
  - [x] 1.1 Create migration to sync email from auth.users to profiles
    - Update all profiles where email IS NULL to get email from auth.users
    - Use JOIN on user_id to match records
    - _Requirements: 4.1_
  - [x] 1.2 Create migration to add missing subscriptions
    - Find all profiles without a subscription
    - Create subscription with Essencial plan (free) for each
    - _Requirements: 4.2_
  - [ ]* 1.3 Write property test for email sync
    - **Property 1: Profile email sync**
    - **Validates: Requirements 1.1, 1.3**

- [x] 2. Update handle_new_user trigger
  - [x] 2.1 Modify trigger to include email field
    - Add NEW.email to the INSERT statement for profiles
    - _Requirements: 1.1_
  - [x] 2.2 Add subscription creation to trigger
    - Get Essencial plan ID
    - Insert subscription record after profile creation
    - _Requirements: 1.2_
  - [ ]* 2.3 Write property test for subscription existence
    - **Property 2: Subscription existence**
    - **Validates: Requirements 1.2, 4.2**

- [x] 3. Recreate user_profile_complete view
  - [x] 3.1 Drop and recreate view with all required columns
    - Include profile_id, profile_created_at aliases
    - Include subscription_id, subscription_created_at, subscription_expired, days_until_expiration
    - Include plan_price, plan_features, plan_checkout_link
    - Include all limit columns from plan_limits
    - Include all usage count subqueries
    - Include financial summary calculations
    - _Requirements: 2.3_
  - [ ]* 3.2 Write property test for view column completeness
    - **Property 4: View column completeness**
    - **Validates: Requirements 2.3**

- [x] 4. Fix get_user_profile_by_phone function
  - [x] 4.1 Update function to use correct column names from view
    - Replace profile_id with id
    - Replace profile_created_at with created_at
    - Ensure all column references match the view
    - _Requirements: 2.1_
  - [ ]* 4.2 Write property test for RPC function completeness
    - **Property 3: RPC function completeness**
    - **Validates: Requirements 2.1, 2.3**

- [x] 5. Checkpoint - Verify database changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update AdminUsers component
  - [x] 6.1 Update query to handle missing email in profiles
    - Use COALESCE or fallback to display email correctly
    - Ensure "Gratuito" is shown for users without subscription
    - _Requirements: 3.1, 3.2_
  - [ ]* 6.2 Write property test for admin user list completeness
    - **Property 5: Admin user list completeness**
    - **Validates: Requirements 3.1, 3.2**

- [x] 7. Final Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.
