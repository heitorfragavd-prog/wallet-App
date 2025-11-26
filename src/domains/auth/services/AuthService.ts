/**
 * Auth Service
 * 
 * Business logic for authentication operations.
 * This service is independent of React and can be tested without rendering components.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import { errorService } from "@/core/errors/ErrorService";

export interface SignUpParams {
  email: string;
  password: string;
  name: string;
  organizationName: string;
  telefone: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Auth Service Class
 * 
 * Handles all authentication operations without React dependencies
 */
class AuthService {
  /**
   * Sign up a new user
   */
  async signUp(params: SignUpParams): Promise<AuthResult> {
    try {
      logger.info('AuthService', 'Attempting user sign up', { email: params.email });

      const redirectUrl = `${window.location.origin}/login`;

      const { error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            name: params.name,
            organization_name: params.organizationName,
            telefone: params.telefone,
          },
        },
      });

      if (error) {
        logger.error('AuthService', 'Sign up failed', { error: error.message });
        const appError = errorService.handle(error, { operation: 'signUp' });
        return {
          success: false,
          error: errorService.getUserMessage(appError),
        };
      }

      logger.info('AuthService', 'Sign up successful', { email: params.email });
      return { success: true };
    } catch (error) {
      logger.error('AuthService', 'Unexpected error during sign up', { error });
      const appError = errorService.handle(error, { operation: 'signUp' });
      return {
        success: false,
        error: errorService.getUserMessage(appError),
      };
    }
  }

  /**
   * Sign in an existing user
   */
  async signIn(params: SignInParams): Promise<AuthResult> {
    try {
      logger.info('AuthService', 'Attempting user sign in', { email: params.email });

      const { error } = await supabase.auth.signInWithPassword({
        email: params.email,
        password: params.password,
      });

      if (error) {
        logger.error('AuthService', 'Sign in failed', { error: error.message });
        const appError = errorService.handle(error, { operation: 'signIn' });
        return {
          success: false,
          error: errorService.getUserMessage(appError),
        };
      }

      logger.info('AuthService', 'Sign in successful', { email: params.email });
      return { success: true };
    } catch (error) {
      logger.error('AuthService', 'Unexpected error during sign in', { error });
      const appError = errorService.handle(error, { operation: 'signIn' });
      return {
        success: false,
        error: errorService.getUserMessage(appError),
      };
    }
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<AuthResult> {
    try {
      logger.info('AuthService', 'Attempting user sign out');

      const { error } = await supabase.auth.signOut();

      if (error) {
        logger.error('AuthService', 'Sign out failed', { error: error.message });
        const appError = errorService.handle(error, { operation: 'signOut' });
        return {
          success: false,
          error: errorService.getUserMessage(appError),
        };
      }

      logger.info('AuthService', 'Sign out successful');
      return { success: true };
    } catch (error) {
      logger.error('AuthService', 'Unexpected error during sign out', { error });
      const appError = errorService.handle(error, { operation: 'signOut' });
      return {
        success: false,
        error: errorService.getUserMessage(appError),
      };
    }
  }

  /**
   * Request password reset email
   */
  async resetPassword(email: string): Promise<AuthResult> {
    try {
      logger.info('AuthService', 'Requesting password reset', { email });

      const redirectUrl = `${window.location.origin}/login?type=recovery`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        logger.error('AuthService', 'Password reset request failed', { error: error.message });
        const appError = errorService.handle(error, { operation: 'resetPassword' });
        return {
          success: false,
          error: errorService.getUserMessage(appError),
        };
      }

      logger.info('AuthService', 'Password reset email sent', { email });
      return { success: true };
    } catch (error) {
      logger.error('AuthService', 'Unexpected error during password reset', { error });
      const appError = errorService.handle(error, { operation: 'resetPassword' });
      return {
        success: false,
        error: errorService.getUserMessage(appError),
      };
    }
  }

  /**
   * Get current session
   */
  async getSession() {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        logger.error('AuthService', 'Failed to get session', { error: error.message });
        return { session: null, error };
      }

      return { session: data.session, error: null };
    } catch (error) {
      logger.error('AuthService', 'Unexpected error getting session', { error });
      return { session: null, error };
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
