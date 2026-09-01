/**
 * Error Service
 * 
 * Provides centralized error handling with:
 * - Automatic error categorization
 * - Safe, user-friendly message generation without leaking technical stacks
 * - Tracing via correlation IDs & structured error codes
 * - Direct integration with structured LoggerService
 */

import { ErrorCategory, AppError, ErrorHandleOptions } from './types';
import { logger } from '../logging/LoggerService';
import { ensureCorrelationId } from '../logging/correlationId';

/**
 * User-friendly error messages by category (safe for end users)
 */
const USER_MESSAGES: Record<ErrorCategory, string> = {
  [ErrorCategory.AUTHENTICATION]: 'Sua sessÃ£o expirou ou nÃ£o foi autorizada. FaÃ§a login novamente.',
  [ErrorCategory.VALIDATION]: 'Por favor, verifique as informaÃ§Ãµes inseridas.',
  [ErrorCategory.NETWORK]: 'Falha na conexÃ£o de rede. Verifique sua internet.',
  [ErrorCategory.SERVER]: 'ServiÃ§o temporariamente indisponÃ­vel. Tente novamente em instantes.',
  [ErrorCategory.UNKNOWN]: 'Ocorreu um erro inesperado.',
};

/**
 * Error Service Class
 */
export class ErrorService {
  /**
   * Categorizes an error based on its properties and message
   */
  private categorizeError(error: unknown): ErrorCategory {
    if (!error) {
      return ErrorCategory.UNKNOWN;
    }

    if (this.isAppError(error)) {
      return error.category;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (
        message.includes('auth') ||
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('jwt') ||
        message.includes('token') ||
        message.includes('session')
      ) {
        return ErrorCategory.AUTHENTICATION;
      }
      
      if (
        message.includes('invalid') ||
        message.includes('validation') ||
        message.includes('required') ||
        message.includes('missing') ||
        message.includes('bad request')
      ) {
        return ErrorCategory.VALIDATION;
      }
      
      if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('offline')
      ) {
        return ErrorCategory.NETWORK;
      }
      
      if (
        message.includes('server') ||
        message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('database') ||
        message.includes('internal error')
      ) {
        return ErrorCategory.SERVER;
      }
    }

    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      
      if ('status' in errorObj || 'statusCode' in errorObj) {
        const status = Number(errorObj.status ?? errorObj.statusCode);
        
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
  public isAppError(error: unknown): error is AppError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'category' in error
    );
  }

  /**
   * Generates a unique support and tracking error code
   */
  private generateErrorCode(category: ErrorCategory): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ERR_${category.substring(0, 4).toUpperCase()}_${timestamp}_${random}`;
  }

  /**
   * Wraps and processes an error with categorization, correlation ID and structured logging
   */
  handle(error: unknown, contextOrOptions?: ErrorHandleOptions | Record<string, unknown>): AppError {
    const options = (contextOrOptions ?? {}) as ErrorHandleOptions;
    const correlationId = ensureCorrelationId(options.correlationId);

    // If it's already an AppError, enrich and log
    if (this.isAppError(error)) {
      const appError: AppError = {
        ...error,
        correlationId: error.correlationId || correlationId,
        operation: options.operation || error.operation,
        source: options.source || error.source,
        workspaceId: options.workspaceId || error.workspaceId,
        context: { ...error.context, ...options },
      };
      this.log(appError);
      return appError;
    }

    const category = this.categorizeError(error);

    let message = 'An unknown error occurred';
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      if (typeof errorObj.message === 'string') {
        message = errorObj.message;
      } else if (typeof errorObj.error === 'string') {
        message = errorObj.error;
      }
    }

    const appError: AppError = {
      code: this.generateErrorCode(category),
      message,
      category,
      correlationId,
      operation: options.operation,
      source: options.source,
      workspaceId: options.workspaceId,
      context: options,
      originalError: error instanceof Error ? error : undefined,
    };

    this.log(appError);

    return appError;
  }

  /**
   * Returns a user-friendly, safe error message without technical internals
   */
  getUserMessage(error: AppError | unknown): string {
    if (this.isAppError(error)) {
      return USER_MESSAGES[error.category] || USER_MESSAGES[ErrorCategory.UNKNOWN];
    }
    const category = this.categorizeError(error);
    return USER_MESSAGES[category] || USER_MESSAGES[ErrorCategory.UNKNOWN];
  }

  /**
   * Logs structured error via LoggerService
   */
  private log(error: AppError): void {
    logger.error('ErrorService', error.message, {
      source: error.source || 'frontend',
      operation: error.operation,
      correlationId: error.correlationId,
      errorCode: error.code,
      workspaceId: error.workspaceId,
      data: {
        category: error.category,
        stack: error.originalError?.stack,
        context: error.context,
      },
    });
  }
}

// Export singleton instance
export const errorService = new ErrorService();
export default errorService;
