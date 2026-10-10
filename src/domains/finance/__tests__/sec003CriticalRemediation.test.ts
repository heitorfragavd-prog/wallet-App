/**
 * sec003CriticalRemediation.test.ts
 *
 * Suíte de testes de segurança estática e de contrato para a SEC-003.1:
 * 1. Eyemobile-Sync:
 *    - Remoção do backdoor RUN_MIGRATION e de clientes de banco arbitrários
 *    - Correção do IDOR em UPDATE_PRODUCT_PRICE com validação estrita de role
 * 2. View user_profile_complete:
 *    - Blindagem com security_invoker = true
 *    - Revogação de acesso direto para authenticated e anon
 * 3. RPC get_user_profile_by_phone:
 *    - search_path seguro
 *    - Defesa contra IDOR/enumeração de perfis de terceiros
 *    - Restrição de execução para service_role
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('SEC-003.1 — Validação de Segurança Crítica', () => {
  const rootDir = process.cwd();

  describe('1. Edge Function eyemobile-sync', () => {
    const fnPath = path.join(rootDir, 'supabase', 'functions', 'eyemobile-sync', 'index.ts');

    it('deve existir o arquivo eyemobile-sync/index.ts', () => {
      expect(fs.existsSync(fnPath)).toBe(true);
    });

    it('NÃO deve conter o backdoor RUN_MIGRATION', () => {
      const code = fs.readFileSync(fnPath, 'utf-8');
      expect(code).not.toContain('RUN_MIGRATION');
      expect(code).not.toContain('execute arbitrary sql');
    });

    it('NÃO deve importar driver PostgreSQL externo para execução arbitrária', () => {
      const code = fs.readFileSync(fnPath, 'utf-8');
      expect(code).not.toMatch(/deno\.land\/x\/postgres/i);
      expect(code).not.toMatch(/new\s+Client\s*\(/i);
    });

    it('deve proteger UPDATE_PRODUCT_PRICE contra IDOR', () => {
      const code = fs.readFileSync(fnPath, 'utf-8');
      expect(code).toContain('UPDATE_PRODUCT_PRICE');

      // Garante que se !isServiceRole, targetUserId usa exclusivamente user_id do token
      const idorProtectionRegex = /const targetUserId\s*=\s*isServiceRole\s*\?\s*\(.*\)\s*:\s*user_id;/s;
      expect(code).toMatch(idorProtectionRegex);
    });
  });

  describe('2. Migration 20261010210000_sec003_critical_fixes.sql', () => {
    const migrationPath = path.join(
      rootDir,
      'supabase',
      'migrations',
      '20261010210000_sec003_critical_fixes.sql'
    );

    it('deve existir o arquivo da migration', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('deve ativar security_invoker na view user_profile_complete', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/ALTER\s+VIEW\s+public\.user_profile_complete\s+SET\s*\(\s*security_invoker\s*=\s*true\s*\);/i);
    });

    it('deve revogar SELECT de user_profile_complete para PUBLIC, anon e authenticated', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+PUBLIC;/i);
      expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+anon;/i);
      expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+authenticated;/i);
    });

    it('deve conceder SELECT em user_profile_complete apenas para service_role', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/GRANT\s+SELECT\s+ON\s+public\.user_profile_complete\s+TO\s+service_role;/i);
    });

    it('deve definir search_path seguro e SECURITY DEFINER na RPC get_user_profile_by_phone', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_user_profile_by_phone/i);
      expect(sql).toMatch(/SECURITY\s+DEFINER/i);
      expect(sql).toMatch(/SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    });

    it('deve conter barreira contra IDOR na RPC get_user_profile_by_phone', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/auth\.role\(\).*authenticated/i);
      expect(sql).toMatch(/user_data\.user_id\s+IS\s+DISTINCT\s+FROM\s+auth\.uid\(\)/i);
    });

    it('deve revogar EXECUTE de get_user_profile_by_phone de authenticated e restringir para service_role', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*FROM\s+authenticated;/i);
      expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*TO\s+service_role;/i);
    });
  });
});
