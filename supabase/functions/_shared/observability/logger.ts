/**
 * Edge Functions Backend Logger (Deno & TypeScript compatible)
 * 
 * Provides structured JSON logging with:
 * - ISO timestamp
 * - Severity levels (debug, info, warn, error)
 * - Source and operation tagging
 * - Correlation ID distributed tracing
 * - Automatic sensitive data sanitization (redaction of tokens, keys, credentials)
 */

import { sanitizeBackendData } from './sanitizer.ts';

export type BackendLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BackendLogEntry {
  timestamp: string;
  level: BackendLogLevel;
  source: string;
  operation?: string;
  correlation_id?: string;
  error_code?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface BackendLogOptions {
  operation?: string;
  correlationId?: string;
  errorCode?: string;
  workspaceId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export class BackendLogger {
  private source: string;

  constructor(source = 'edge-function') {
    this.source = source;
  }

  private write(
    level: BackendLogLevel,
    message: string,
    options?: BackendLogOptions
  ): BackendLogEntry {
    const timestamp = new Date().toISOString();
    const {
      operation,
      correlationId,
      errorCode,
      workspaceId,
      userId,
      metadata,
      ...extra
    } = options || {};

    const rawMeta: Record<string, unknown> = {
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      ...extra,
    };

    const hasMeta = Object.keys(rawMeta).length > 0;
    const sanitizedMeta = hasMeta
      ? (sanitizeBackendData(rawMeta) as Record<string, unknown>)
      : undefined;

    const entry: BackendLogEntry = {
      timestamp,
      level,
      source: this.source,
      operation: typeof operation === 'string' ? operation : undefined,
      correlation_id: typeof correlationId === 'string' ? correlationId : undefined,
      error_code: typeof errorCode === 'string' ? errorCode : undefined,
      message,
      ...(sanitizedMeta ? { metadata: sanitizedMeta } : {}),
    };

    const serialized = JSON.stringify(entry);

    switch (level) {
      case 'debug':
        console.debug(serialized);
        break;
      case 'info':
        console.info(serialized);
        break;
      case 'warn':
        console.warn(serialized);
        break;
      case 'error':
        console.error(serialized);
        break;
    }

    return entry;
  }

  debug(message: string, options?: BackendLogOptions): BackendLogEntry {
    return this.write('debug', message, options);
  }

  info(message: string, options?: BackendLogOptions): BackendLogEntry {
    return this.write('info', message, options);
  }

  warn(message: string, options?: BackendLogOptions): BackendLogEntry {
    return this.write('warn', message, options);
  }

  error(message: string, options?: BackendLogOptions): BackendLogEntry {
    return this.write('error', message, options);
  }
}

/**
 * Creates a scoped backend logger instance for a given function or service
 */
export function createBackendLogger(source: string): BackendLogger {
  return new BackendLogger(source);
}
