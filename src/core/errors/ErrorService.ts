/**
 * Error Service
 * 
 * Provides centralized error handling with:
 * - Error categorization
 * - User-friendly message generation
 * - Context wrapping
 * - Integration with logging service
 */

import { ErrorCategory, AppError } from './types';
import { logger } from '../logging/LoggerService';

/**
 * User-friendly error messages by category
 */
const USER_MESSAGES: Record<ErrorCategory, string> = {
  [ErrorCategory.AUTHENTICATION]: 'Sua sessão expirou. Faça login novamente.',
  [ErrorCategory.VALIDATION]: 'Por favor, verifique os dados informados.',
  [ErrorCategory.NETWORK]: 'Erro de conexão. Verifique sua internet.',
  [ErrorCategory.SERVER]: 'Erro no servidor. Tente novamente em instantes.',
  [ErrorCategory.UNKNOWN]: 'Ocorreu um erro inesperado.',
};

/**
 * Error Service Class
 */
class ErrorService {
  /**
   * Categorizes an error based on its properties
   */
  private categorizeError(error: unknown): ErrorCategory {
    if (!error) {
      return ErrorCategory.UNKNOWN;
    }

    // Check if it's already an AppError
    if (this.isAppError(error)) {
      return error.category;
    }

    // Check if it's a standard Error
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Authentication errors
      if (
        message.includes('auth') ||
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('token') ||
        message.includes('session')
      ) {
        return ErrorCategory.AUTHENTICATION;
      }
      
      // Validation errors
      if (
        message.includes('invalid') ||
        message.includes('validation') ||
        message.includes('required') ||
        message.includes('missing')
      ) {
        return ErrorCategory.VALIDATION;
      }
      
      // Network errors
      if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('connection') ||
        message.includes('timeout')
      ) {
        return ErrorCategory.NETWORK;
      }
      
      // Server errors
      if (
        message.includes('server') ||
        message.includes('500') ||
        message.includes('503') ||
        message.includes('database')
      ) {
        return ErrorCategory.SERVER;
      }
    }

    // Check for HTTP status codes in objects
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      
      if ('status' in errorObj || 'statusCode' in errorObj) {
        const status = (errorObj.status || errorObj.statusCode) as number;
        
        if (status === 401 || status === 403) {
          return ErrorCategory.AUTHENTICATION;
        }
        if (status >= 400 && status < 500) {
          return ErrorCategory.VALIDATION;
        }
        if (status >= 500) {
          return ErrorCategory.SERVER;
        }
      }
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Type guard to check if an error is an AppError
   */
  private isAppError(error: unknown): error is AppError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'category' in error
    );
  }

  /**
   * Generates a unique error code
   */
  private generateErrorCode(category: ErrorCategory): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 7);
    return `${category.toUpperCase()}_${timestamp}_${random}`;
  }

  /**
   * Wraps an error with context and categorization
   */
  handle(error: unknown, context?: Record<string, unknown>): AppError {
    // If it's already an AppError, just add context if provided
    if (this.isAppError(error)) {
      const appError: AppError = {
        ...error,
        context: { ...error.context, ...context },
      };
      this.log(appError);
      return appError;
    }

    // Categorize the error
    const category = this.categorizeError(error);

    // Extract message
    let message = 'An unknown error occurred';
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      if ('message' in errorObj && typeof errorObj.message === 'string') {
        message = errorObj.message;
      }
    }

    // Create AppError
    const appError: AppError = {
      code: this.generateErrorCode(category),
      message,
      category,
      context,
      originalError: error instanceof Error ? error : undefined,
    };

    // Log the error
    this.log(appError);

    return appError;
  }

  /**
   * Gets a user-friendly error message without technical details
   */
  getUserMessage(error: AppError): string {
    return USER_MESSAGES[error.category] || USER_MESSAGES[ErrorCategory.UNKNOWN];
  }

  /**
   * Logs an error using the logging service
   */
  private log(error: AppError): void {
    logger.error('ErrorService', error.message, {
      code: error.code,
      category: error.category,
      context: error.context,
      stack: error.originalError?.stack,
    });
  }
}

// Export singleton instance
export const errorService = new ErrorService();
