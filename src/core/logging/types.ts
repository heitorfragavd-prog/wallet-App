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
  ERROR = 'error',
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

  /** High-level source (e.g. 'frontend', 'react-query', 'auth', 'pluggy') */
  source?: string;

  /** Specific operation being performed (e.g. 'import_invoice', 'sync_account') */
  operation?: string;

  /** Correlation / Request ID for tracing across boundaries */
  correlationId?: string;

  /** Machine-readable error code if applicable */
  errorCode?: string;

  /** Workspace ID context when safe and available */
  workspaceId?: string;
  
  /** Optional additional data (will be sanitized before logging) */
  data?: Record<string, unknown>;
}

/**
 * Options accepted by logger methods, supporting both legacy record payloads
 * and explicit structured options.
 */
export interface LogOptions {
  source?: string;
  operation?: string;
  correlationId?: string;
  errorCode?: string;
  workspaceId?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Pluggable listener for forwarding logs to external observability backends
 * (e.g. Sentry, OpenTelemetry) without changing client code.
 */
export type LogListener = (entry: LogEntry) => void;
