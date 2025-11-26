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
  UNKNOWN = 'unknown'
}

/**
 * Structured application error with context
 */
export interface AppError {
  /** Unique error code for identification */
  code: string;
  
  /** Technical error message (for logging) */
  message: string;
  
  /** Category of the error */
  category: ErrorCategory;
  
  /** Additional context about the error */
  context?: Record<string, unknown>;
  
  /** Original error that was wrapped (if any) */
  originalError?: Error;
}
