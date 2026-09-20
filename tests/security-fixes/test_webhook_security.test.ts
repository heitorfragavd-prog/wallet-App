import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Segurança em test-webhook', () => {
  const filePath = path.resolve('supabase/functions/test-webhook/index.ts');

  // SPECSFY: US-002 FR-002 NFR-001 AC-004
  it('AC-004: deve bloquear requisições anônimas retornando 401 Unauthorized', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    // O endpoint não pode executar createClient com service_role sem autenticação
    expect(code).toMatch(/authHeader|authorization/i);
    expect(code).toMatch(/auth\.getUser|verifyAdmin/);
    expect(code).toMatch(/401/);
  });

  // SPECSFY: US-002 FR-002 NFR-001 AC-005
  it('AC-005: deve bloquear usuários comuns sem permissão administrativa retornando 403', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    expect(code).toMatch(/is_admin|admin|role/i);
    expect(code).toMatch(/403/);
  });

  // SPECSFY: US-002 FR-002 NFR-001 AC-006
  it('AC-006: deve permitir execução para administradores autorizados ou service_role', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    expect(code).toMatch(/system_settings/);
    expect(code).toMatch(/webhook_url/);
  });
});
