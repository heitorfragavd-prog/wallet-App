/**
 * Logging Types
 * 
 * Defines the types and interfaces for the structured logging system.
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Structured log entry that will be output as JSON
 */
export interface LogEntry {
  /** ISO 8601 timestamp of when the log was created */
  timestamp: string;
  
  /** Severity level of the log */
  level: LogLevel;
  
  /** Component or module that generated the log */
  component: string;
  
  /** Human-readable log message */
  message: string;
  
  /** Optional additional data (will be sanitized before logging) */
  data?: Record<string, unknown>;
}
