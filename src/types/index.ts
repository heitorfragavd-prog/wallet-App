/**
 * Centralized Type Exports
 * 
 * This file re-exports all domain types for easy importing.
 * Import from here instead of individual domain type files.
 */

// Auth Domain Types
export type {
  AuthUser,
  UserProfile,
  AuthState,
} from '../domains/auth/types';

// Finance Domain Types
export type {
  Transaction,
  Category,
  Receita,
  Despesa,
  Divida,
  Meta,
  Orcamento,
} from '../domains/finance/types';

// Vehicles Domain Types
export type {
  Veiculo,
  TipoManutencao,
  Manutencao,
  ManutencaoPendente,
} from '../domains/vehicles/types';

// Market Domain Types
export type {
  ItemMercado,
  CategoriaMercado,
} from '../domains/market/types';

// Admin Domain Types
export type {
  Plan,
  PlanLimits,
  Subscription,
  AuditLog,
} from '../domains/admin/types';

// Core Types
export type {
  LogLevel,
  LogEntry,
} from '../core/logging/types';

export type {
  ErrorCategory,
  AppError,
} from '../core/errors/types';

export type {
  EnvironmentConfig,
} from '../config/env';
