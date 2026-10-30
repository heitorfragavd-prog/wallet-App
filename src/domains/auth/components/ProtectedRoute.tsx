import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { useProfile } from "@/domains/auth/hooks/useProfile";
import { logger } from "@/core/logging/LoggerService";
import {
  isDeliveryStaffRole,
  isRouteAllowedForDeliveryStaff,
} from "@/domains/delivery/delivery-permissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user' | 'delivery_staff';
  fallbackPath?: string;
}

/**
 * ProtectedRoute Component
 * 
 * Ensures that:
 * 1. User is authenticated before rendering children
 * 2. User has required role if specified
 * 3. Shows loading state during auth check
 * 4. Redirects appropriately on auth failure
 * 5. No content is rendered before authorization is confirmed
 * 6. Enforces delivery staff routing isolation (cannot access financial / non-delivery routes)
 */
export const ProtectedRoute = ({ 
  children, 
  requiredRole, 
  fallbackPath = "/login" 
}: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Track if authorization check is complete
  const [authorizationComplete, setAuthorizationComplete] = useState(false);

  // Determine if we're still loading
  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    // Don't perform checks while still loading
    if (isLoading) {
      setAuthorizationComplete(false);
      return;
    }

    // Handle profile loading errors - treat as unauthenticated
    if (profileError) {
      logger.warn('ProtectedRoute', 'Profile loading error, treating as unauthenticated', {
        error: profileError,
      });
      setAuthorizationComplete(false);
      navigate(fallbackPath, { replace: true });
      return;
    }

    // Check if user is authenticated
    if (!user) {
      logger.info('ProtectedRoute', 'User not authenticated, redirecting to login');
      setAuthorizationComplete(false);
      navigate(fallbackPath, { replace: true });
      return;
    }

    // Delivery staff isolation guard: delivery staff can only access operational routes
    const isStaff = isDeliveryStaffRole(profile?.role);
    if (isStaff && !isRouteAllowedForDeliveryStaff(location.pathname)) {
      logger.warn('ProtectedRoute', 'delivery_staff attempted to access non-delivery route, redirecting to /delivery/kds', {
        pathname: location.pathname,
        role: profile?.role,
      });
      setAuthorizationComplete(false);
      navigate('/delivery/kds', { replace: true });
      return;
    }

    // If role is required, verify it
    if (requiredRole) {
      // Profile must be loaded to check role
      if (!profile) {
        logger.warn('ProtectedRoute', 'Profile not loaded but role check required');
        setAuthorizationComplete(false);
        return;
      }

      const roleMatches =
        requiredRole === 'delivery_staff'
          ? isStaff
          : profile.role === requiredRole;

      // Check if user has required role
      if (!roleMatches) {
        logger.warn('ProtectedRoute', 'User does not have required role', {
          requiredRole,
          userRole: profile.role,
        });
        setAuthorizationComplete(false);
        
        // Redirect based on role
        if (isStaff) {
          navigate("/delivery/kds", { replace: true });
        } else if (requiredRole === 'admin') {
          // Non-admin trying to access admin route
          navigate("/dashboard", { replace: true });
        } else {
          // Fallback to login
          navigate(fallbackPath, { replace: true });
        }
        return;
      }
    }

    // All checks passed - authorization complete
    logger.debug('ProtectedRoute', 'Authorization successful', {
      userId: user.id,
      requiredRole,
      userRole: profile?.role,
    });
    setAuthorizationComplete(true);
  }, [user, profile, requiredRole, isLoading, profileError, navigate, fallbackPath, location.pathname]);

  // Show loading state while checking authorization
  if (isLoading || !authorizationComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  // Only render children after authorization is confirmed
  return <>{children}</>;
};
