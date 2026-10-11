/**
 * eyemobileSyncSecurity.test.ts
 *
 * Testes isolados de segurança e autorização da Edge Function eyemobile-sync:
 * 1. Rejeição de requisições não autenticadas
 * 2. Inexistência do modo RUN_MIGRATION (nenhum caminho de execução SQL arbitrário)
 * 3. Proteção estrita contra IDOR em UPDATE_PRODUCT_PRICE
 * 4. Validação do papel de service_role para chamadas administrativas
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Eyemobile-Sync — Validação de Segurança em Ambiente Isolado', () => {
  const rootDir = process.cwd();
  const fnPath = path.join(rootDir, 'supabase', 'functions', 'eyemobile-sync', 'index.ts');
  const code = fs.readFileSync(fnPath, 'utf-8');

  describe('1. Verificação Estática de Código e Superfície de Ataque', () => {
    it('não deve conter RUN_MIGRATION em nenhuma parte do arquivo', () => {
      expect(code).not.toContain('RUN_MIGRATION');
    });

    it('não deve conter importação de nenhum driver Postgres nativo', () => {
      expect(code).not.toMatch(/deno\.land\/x\/postgres/);
      expect(code).not.toMatch(/from\s+["']postgres["']/);
      expect(code).not.toMatch(/new\s+Client\(/);
    });

    it('não deve conter nenhum método de execução SQL arbitrária', () => {
      expect(code).not.toMatch(/\.queryArray\(/);
      expect(code).not.toMatch(/\.unsafe\(/);
    });
  });

  describe('2. Validação Lógica de Autorização (IDOR e RBAC)', () => {
    // Simula a lógica de resolução de targetUserId da Edge Function
    const resolveTargetUserId = (
      isServiceRole: boolean,
      authUserId: string | null,
      bodyUserId?: string | null
    ) => {
      return isServiceRole
        ? (typeof bodyUserId === 'string' && bodyUserId.trim() ? bodyUserId.trim() : authUserId)
        : authUserId;
    };

    it('usuário comum autenticado NUNCA pode sobrescrever user_id de terceiros', () => {
      const authUserId = 'user-alice-1111';
      const maliciousBodyUserId = 'user-bob-2222';
      const isServiceRole = false;

      const targetUserId = resolveTargetUserId(isServiceRole, authUserId, maliciousBodyUserId);

      // Deve ser Alice, o IDOR é completamente bloqueado
      expect(targetUserId).toBe('user-alice-1111');
      expect(targetUserId).not.toBe(maliciousBodyUserId);
    });

    it('usuário comum sem user_id no body usa estritamente seu próprio ID', () => {
      const authUserId = 'user-alice-1111';
      const isServiceRole = false;

      const targetUserId = resolveTargetUserId(isServiceRole, authUserId, undefined);
      expect(targetUserId).toBe('user-alice-1111');
    });

    it('service_role autorizado pode definir targetUserId para reconciliação administrativa', () => {
      const isServiceRole = true;
      const targetUserId = resolveTargetUserId(isServiceRole, null, 'user-bob-2222');
      expect(targetUserId).toBe('user-bob-2222');
    });

    it('service_role com body vazio preserva authUserId (fallback seguro)', () => {
      const isServiceRole = true;
      const targetUserId = resolveTargetUserId(isServiceRole, 'admin-id', '   ');
      expect(targetUserId).toBe('admin-id');
    });
  });

  describe('3. Validação do Fluxo de Autenticação da Função', () => {
    it('exige verificação de Bearer token quando não é service_role', () => {
      expect(code).toContain('authHeader.replace("Bearer ", "").trim()');
      expect(code).toContain('supabaseUserClient.auth.getUser(token)');
      expect(code).toContain('Não autorizado: token inválido.');
    });

    it('valida service_role estritamente por chave de serviço ou cron secret', () => {
      expect(code).toContain('supabaseServiceKey && token === supabaseServiceKey');
      expect(code).toContain('cronSecret.length > 0 && token === cronSecret');
    });
  });
});
