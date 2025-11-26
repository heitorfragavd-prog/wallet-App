import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { useProfile } from "@/domains/auth/hooks/useProfile";
import { logger } from "@/core/logging/LoggerService";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
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
 */
export const ProtectedRoute = ({ 
  children, 
  requiredRole, 
  fallbackPath = "/login" 
}: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, error: profileError } = useProfile();
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

    // If role is required, verify it
    if (requiredRole) {
      // Profile must be loaded to check role
      if (!profile) {
        logger.warn('ProtectedRoute', 'Profile not loaded but role check required');
        setAuthorizationComplete(false);
        return;
      }

      // Check if user has required role
      if (profile.role !== requiredRole) {
        logger.warn('ProtectedRoute', 'User does not have required role', {
          requiredRole,
          userRole: profile.role,
        });
        setAuthorizationComplete(false);
        
        // Redirect based on role
        if (requiredRole === 'admin') {
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
  }, [user, profile, requiredRole, isLoading, profileError, navigate, fallbackPath]);

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