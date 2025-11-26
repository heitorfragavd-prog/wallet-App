/**
 * Auth Domain Types
 * 
 * Type definitions for authentication and authorization
 */

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  telefone?: string;
  endereco?: string;
  avatar_url?: string;
  organization_name?: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
}
