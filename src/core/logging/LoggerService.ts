/**
 * Logger Service
 * 
 * Provides structured JSON logging with:
 * - Log level filtering based on environment
 * - Sensitive data sanitization
 * - Consistent log format
 */

import { LogLevel, LogEntry } from './types';
import { getConfigInstance } from '@/config/env';

/**
 * Patterns to identify sensitive data that should be masked
 */
const SENSITIVE_PATTERNS = {
  // Password fields
  password: /password|passwd|pwd/i,
  
  // Token and key fields
  token: /token|jwt|auth|bearer|api[_-]?key/i,
  
  // Credit card numbers (basic pattern)
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  
  // Email addresses (for PII protection)
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Phone numbers (basic pattern)
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
};

/**
 * Sanitizes sensitive data from log entries
 */
function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle strings - mask sensitive patterns
  if (typeof data === 'string') {
    let sanitized = data;
    
    // Mask credit card numbers
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.creditCard, '****-****-****-****');
    
    // Mask email addresses
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.email, (email) => {
      const [local, domain] = email.split('@');
      return `${local.substring(0, 2)}***@${domain}`;
    });
    
    // Mask phone numbers
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.phone, '***-***-****');
    
    return sanitized;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Check if key matches sensitive patterns
      const isSensitiveKey = 
        SENSITIVE_PATTERNS.password.test(key) ||
        SENSITIVE_PATTERNS.token.test(key);
      
      if (isSensitiveKey) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = sanitizeData(value);
      }
    }
    
    return sanitized;
  }

  // Return primitives as-is
  return data;
}

/**
 * Logger Service Class
 */
class LoggerService {
  private minLogLevel: LogLevel;

  constructor() {
    // Determine minimum log level based on environment
    const config = getConfigInstance();
    
    if (config.app.environment === 'production') {
      // In production, only log INFO and above (no DEBUG)
      this.minLogLevel = LogLevel.INFO;
    } else if (config.features.enableDebugLogs) {
      // In dev with debug enabled, log everything
      this.minLogLevel = LogLevel.DEBUG;
    } else {
      // In dev without debug, log INFO and above
      this.minLogLevel = LogLevel.INFO;
    }
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
   * Creates and outputs a log entry
   */
  private log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
    // Check if this log level should be output
    if (!this.shouldLog(level)) {
      return;
    }

    // Create structured log entry
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data: data ? sanitizeData(data) as Record<string, unknown> : undefined,
    };

    // Output as JSON
    const jsonLog = JSON.stringify(logEntry);

    // Use appropriate console method based on level
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
  }

  /**
   * Log a debug message (filtered out in production)
   */
  debug(component: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, component, message, data);
  }

  /**
   * Log an informational message
   */
  info(component: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, component, message, data);
  }

  /**
   * Log a warning message
   */
  warn(component: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, component, message, data);
  }

  /**
   * Log an error message
   */
  error(component: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, component, message, data);
  }
}

// Export singleton instance
export const logger = new LoggerService();
