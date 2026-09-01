/**
 * Logger Service
 * 
 * Provides structured JSON logging with:
 * - Log level filtering based on environment
 * - Comprehensive sensitive data sanitization
 * - Correlation ID & operation context support
 * - Pluggable listeners for external observability tools (Sentry/OTel)
 * - Consistent structured JSON format
 */

import { LogLevel, LogEntry, LogOptions, LogListener } from './types';
import { sanitizeData } from './sanitizer';
import { ensureCorrelationId } from './correlationId';
import { getConfigInstance } from '@/config/env';

/**
 * Logger Service Class
 */
export class LoggerService {
  private minLogLevel: LogLevel;
  private listeners: Set<LogListener> = new Set();

  constructor() {
    this.minLogLevel = this.resolveMinLogLevel();
  }

  /**
   * Determine minimum log level based on environment configuration
   */
  private resolveMinLogLevel(): LogLevel {
    try {
      const config = getConfigInstance();
      if (config.app.environment === 'production') {
        return LogLevel.INFO;
      }
      if (config.features.enableDebugLogs) {
        return LogLevel.DEBUG;
      }
      return LogLevel.INFO;
    } catch {
      // Fallback safe default
      return LogLevel.INFO;
    }
  }

  /**
   * Sets minimum log level dynamically (useful in tests/diagnostics)
   */
  setLevel(level: LogLevel): void {
    this.minLogLevel = level;
  }

  /**
   * Registers an external log listener (e.g. Sentry / monitoring agent)
   */
  addListener(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Removes all listeners (useful for tests)
   */
  clearListeners(): void {
    this.listeners.clear();
  }

  /**
   * Checks if a log level should be output based on current configuration
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.minLogLevel);
    const requestedLevelIndex = levels.indexOf(level);
    
    return requestedLevelIndex >= currentLevelIndex;
  }

  /**
   * Normalizes log options and extracts top-level structured fields
   */
  private extractLogPayload(
    level: LogLevel,
    component: string,
    message: string,
    dataOrOptions?: LogOptions | Record<string, unknown>
  ): LogEntry {
    const timestamp = new Date().toISOString();

    if (!dataOrOptions || typeof dataOrOptions !== 'object') {
      return {
        timestamp,
        level,
        component,
        message,
      };
    }

    const {
      source,
      operation,
      correlationId,
      errorCode,
      workspaceId,
      data,
      ...rest
    } = dataOrOptions as LogOptions;

    // Combine explicit `data` property with remaining extra properties
    const combinedData: Record<string, unknown> = {
      ...(data && typeof data === 'object' ? data : {}),
      ...rest,
    };

    const hasData = Object.keys(combinedData).length > 0;

    const entry: LogEntry = {
      timestamp,
      level,
      component,
      message,
      source: typeof source === 'string' ? source : undefined,
      operation: typeof operation === 'string' ? operation : undefined,
      correlationId: correlationId ? ensureCorrelationId(correlationId) : undefined,
      errorCode: typeof errorCode === 'string' ? errorCode : undefined,
      workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined,
      data: hasData ? (sanitizeData(combinedData) as Record<string, unknown>) : undefined,
    };

    return entry;
  }

  /**
   * Creates, sanitizes and outputs a log entry
   */
  private log(
    level: LogLevel,
    component: string,
    message: string,
    dataOrOptions?: LogOptions | Record<string, unknown>
  ): LogEntry | null {
    if (!this.shouldLog(level)) {
      return null;
    }

    const logEntry = this.extractLogPayload(level, component, message, dataOrOptions);
    const jsonLog = JSON.stringify(logEntry);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(jsonLog);
        break;
      case LogLevel.INFO:
        console.info(jsonLog);
        break;
      case LogLevel.WARN:
        console.warn(jsonLog);
        break;
      case LogLevel.ERROR:
        console.error(jsonLog);
        break;
    }

    // Notify external listeners safely
    if (this.listeners.size > 0) {
      this.listeners.forEach((listener) => {
        try {
          listener(logEntry);
        } catch {
          // Swallow listener errors to prevent breaking the application
        }
      });
    }

    return logEntry;
  }

  /**
   * Log a debug message (filtered out in production unless debug logs enabled)
   */
  debug(component: string, message: string, dataOrOptions?: LogOptions | Record<string, unknown>): LogEntry | null {
    return this.log(LogLevel.DEBUG, component, message, dataOrOptions);
  }

  /**
   * Log an informational message
   */
  info(component: string, message: string, dataOrOptions?: LogOptions | Record<string, unknown>): LogEntry | null {
    return this.log(LogLevel.INFO, component, message, dataOrOptions);
  }

  /**
   * Log a warning message
   */
  warn(component: string, message: string, dataOrOptions?: LogOptions | Record<string, unknown>): LogEntry | null {
    return this.log(LogLevel.WARN, component, message, dataOrOptions);
  }

  /**
   * Log an error message
   */
  error(component: string, message: string, dataOrOptions?: LogOptions | Record<string, unknown>): LogEntry | null {
    return this.log(LogLevel.ERROR, component, message, dataOrOptions);
  }
}

// Export singleton instance
export const logger = new LoggerService();
export default logger;
