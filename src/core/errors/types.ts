/**
 * Error Types
 * 
 * Defines the types and interfaces for the error handling system.
 */

/**
 * Categories of errors that can occur in the application
 */
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  NETWORK = 'network',
  SERVER = 'server',
  UNKNOWN = 'unknown',
}

/**
 * Structured application error with context and traceability
 */
export interface AppError {
  /** Unique error code for support and identification */
  code: string;
  
  /** Technical error message (for logging) */
  message: string;
  
  /** Category of the error */
  category: ErrorCategory;

  /** Correlation ID for tracing across system boundaries */
  correlationId?: string;

  /** Operation being performed when the error occurred */
  operation?: string;

  /** High-level source of the error */
  source?: string;

  /** Workspace ID context if available */
  workspaceId?: string;
  
  /** Additional sanitized context about the error */
  context?: Record<string, unknown>;
  
  /** Original error that was wrapped (if any) */
  originalError?: Error;
}

/**
 * Context and options passed to ErrorService.handle()
 */
export interface ErrorHandleOptions {
  correlationId?: string;
  operation?: string;
  source?: string;
  workspaceId?: string;
  componentStack?: string;
  [key: string]: unknown;
}
