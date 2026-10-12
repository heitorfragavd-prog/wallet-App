/**
 * sec003CriticalRemediation.test.ts
 *
 * Suíte de testes de segurança estática e de contrato para a SEC-003.1:
 * 1. Eyemobile-Sync:
 *    - Remoção do backdoor RUN_MIGRATION e de clientes de banco arbitrários
 *    - Correção do IDOR em UPDATE_PRODUCT_PRICE com validação estrita de role
 * 2. Migration 20261010210000_sec003_critical_fixes.sql:
 *    - Cenário A: Objetos inexistentes — execução segura via IF EXISTS sem criação indevida
 *    - Cenário B: Objetos existentes — blindagem estrita (security_invoker, revogação e restrição)
 * 3. Neutralização de Scripts Legados (45 e 46):
 *    - Presença de aviso de deprecação e segurança
 *    - Ausência de concessão ativa a authenticated
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
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    it('deve existir o arquivo da migration', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    describe('Cenário A: Objetos Inexistentes (Execução Segura / Sem Criação Órfã)', () => {
      it('deve usar checagem condicional IF EXISTS em pg_class para a view', () => {
        expect(sql).toMatch(/IF\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_class/i);
        expect(sql).toMatch(/c\.relname\s*=\s*'user_profile_complete'/i);
      });

      it('deve usar checagem condicional IF EXISTS em pg_proc para a RPC', () => {
        expect(sql).toMatch(/IF\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_proc/i);
        expect(sql).toMatch(/p\.proname\s*=\s*'get_user_profile_by_phone'/i);
      });

      it('não deve conter instrução de criação incondicional fora de IF EXISTS', () => {
        // Nenhuma criação direta solta fora de bloco condicional
        expect(sql).not.toMatch(/^CREATE\s+VIEW/im);
        expect(sql).not.toMatch(/^CREATE\s+OR\s+REPLACE\s+VIEW/im);
      });
    });

    describe('Cenário B: Objetos Existentes (Aplicação das Restrições de Segurança)', () => {
      it('deve ativar security_invoker na view se existente', () => {
        expect(sql).toMatch(/ALTER\s+VIEW\s+public\.user_profile_complete\s+SET\s*\(\s*security_invoker\s*=\s*true\s*\);/i);
      });

      it('deve revogar acesso da view de PUBLIC, anon e authenticated', () => {
        expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+PUBLIC;/i);
        expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+anon;/i);
        expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+authenticated;/i);
      });

      it('deve conceder acesso à view exclusivamente para service_role', () => {
        expect(sql).toMatch(/GRANT\s+SELECT\s+ON\s+public\.user_profile_complete\s+TO\s+service_role;/i);
      });

      it('deve definir search_path seguro e SECURITY DEFINER na RPC se existente', () => {
        expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_user_profile_by_phone/i);
        expect(sql).toMatch(/SECURITY\s+DEFINER/i);
        expect(sql).toMatch(/SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
      });

      it('deve conter barreira contra IDOR na RPC', () => {
        expect(sql).toMatch(/auth\.role\(\).*authenticated/i);
        expect(sql).toMatch(/user_data\.user_id\s+IS\s+DISTINCT\s+FROM\s+auth\.uid\(\)/i);
      });

      it('deve revogar EXECUTE da RPC para authenticated e restringir para service_role', () => {
        expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*FROM\s+authenticated;/i);
        expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*TO\s+service_role;/i);
      });
    });
  });

  describe('3. Neutralização Segura dos Scripts Legados (40, 45 e 46)', () => {
    it('migration 40 não deve conter definição executável vulnerável de get_user_profile_by_phone', () => {
      const mig40 = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '40.security_fix_functions_search_path.sql'), 'utf-8');
      expect(mig40).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.get_user_profile_by_phone/i);
      expect(mig40).toMatch(/12\.\s+Deprecado:\s+get_user_profile_by_phone/i);
      expect(mig40).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*FROM\s+PUBLIC/i);
    });

    it('migration 45 deve conter aviso de deprecação, security_invoker e revogações explícitas', () => {
      const mig45 = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '45.create_user_profile_complete_view.sql'), 'utf-8');
      expect(mig45).toMatch(/AVISO DE SEGURANÇA E DEPRECAÇÃO/i);
      expect(mig45).toMatch(/security_invoker\s*=\s*true/i);
      expect(mig45).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+PUBLIC/i);
      expect(mig45).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+anon/i);
      expect(mig45).toMatch(/REVOKE\s+ALL\s+ON\s+public\.user_profile_complete\s+FROM\s+authenticated/i);
      expect(mig45).toMatch(/GRANT\s+SELECT\s+ON\s+public\.user_profile_complete\s+TO\s+service_role/i);
      // Não deve ter grant ativo para authenticated
      expect(mig45).not.toMatch(/^GRANT\s+SELECT\s+ON\s+public\.user_profile_complete\s+TO\s+authenticated;/im);
    });

    it('migration 46 deve conter aviso de deprecação, guard clause, revogações de PUBLIC e grant restrito', () => {
      const mig46 = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '46.create_get_user_profile_by_phone.sql'), 'utf-8');
      expect(mig46).toMatch(/AVISO DE SEGURANÇA E DEPRECAÇÃO/i);
      expect(mig46).toMatch(/user_data\.user_id\s+IS\s+DISTINCT\s+FROM\s+auth\.uid\(\)/i);
      expect(mig46).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*FROM\s+PUBLIC/i);
      expect(mig46).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*FROM\s+anon/i);
      expect(mig46).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*FROM\s+authenticated/i);
      expect(mig46).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_user_profile_by_phone.*TO\s+service_role/i);
      // Não deve ter grant ativo para authenticated
      expect(mig46).not.toMatch(/^GRANT\s+EXECUTE\s+ON\s+FUNCTION.*TO\s+authenticated;/im);
    });
  });
});
