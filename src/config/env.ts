/**
 * Environment Configuration Module
 * 
 * This module provides type-safe access to environment variables and validates
 * that all required configuration is present at application startup.
 */

export interface EnvironmentConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  app: {
    name: string;
    url: string;
    environment: 'development' | 'staging' | 'production';
  };
  features: {
    enableAnalytics: boolean;
    enableDebugLogs: boolean;
  };
}

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates the configuration object and returns a list of validation errors
 * @param config - Partial configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
function validateConfig(config: Partial<EnvironmentConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate Supabase configuration
  if (!config.supabase?.url) {
    errors.push({
      field: 'VITE_SUPABASE_URL',
      message: 'Supabase URL is required. Please set VITE_SUPABASE_URL environment variable.'
    });
  }

  if (!config.supabase?.anonKey) {
    errors.push({
      field: 'VITE_SUPABASE_ANON_KEY',
      message: 'Supabase anon key is required. Please set VITE_SUPABASE_ANON_KEY environment variable.'
    });
  }

  // Validate app configuration
  if (!config.app?.name) {
    errors.push({
      field: 'VITE_APP_NAME',
      message: 'App name is required. Please set VITE_APP_NAME environment variable.'
    });
  }

  if (!config.app?.url) {
    errors.push({
      field: 'VITE_APP_URL',
      message: 'App URL is required. Please set VITE_APP_URL environment variable.'
    });
  }

  if (!config.app?.environment) {
    errors.push({
      field: 'VITE_APP_ENVIRONMENT',
      message: 'App environment is required. Please set VITE_APP_ENVIRONMENT environment variable.'
    });
  } else if (!['development', 'staging', 'production'].includes(config.app.environment)) {
    errors.push({
      field: 'VITE_APP_ENVIRONMENT',
      message: 'App environment must be one of: development, staging, production'
    });
  }

  return errors;
}

/**
 * Loads configuration from environment variables
 * @throws Error if required environment variables are missing
 * @returns Validated configuration object
 */
export function getConfig(): EnvironmentConfig {
  // Load configuration from import.meta.env
  const config: Partial<EnvironmentConfig> = {
    supabase: {
      url: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    app: {
      name: import.meta.env.VITE_APP_NAME || 'Wallet',
      url: import.meta.env.VITE_APP_URL || 'http://localhost:5173',
      environment: (import.meta.env.VITE_APP_ENVIRONMENT || 'development') as 'development' | 'staging' | 'production',
    },
    features: {
      enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
      enableDebugLogs: import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true',
    },
  };

  // Validate configuration
  const errors = validateConfig(config);

  if (errors.length > 0) {
    const errorMessages = errors.map(e => `  - ${e.field}: ${e.message}`).join('\n');
    throw new Error(
      `Configuration validation failed. Missing or invalid environment variables:\n${errorMessages}\n\n` +
      `Please check your .env file and ensure all required variables are set. ` +
      `See .env.example for reference.`
    );
  }

  return config as EnvironmentConfig;
}

// Export a singleton instance
let configInstance: EnvironmentConfig | null = null;

/**
 * Gets the cached configuration instance
 * Initializes on first call
 */
export function getConfigInstance(): EnvironmentConfig {
  if (!configInstance) {
    configInstance = getConfig();
  }
  return configInstance;
}
