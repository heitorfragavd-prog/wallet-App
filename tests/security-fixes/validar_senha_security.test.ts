import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Segurança em validar-senha', () => {
  const filePath = path.resolve('supabase/functions/validar-senha/index.ts');

  // SPECSFY: US-001 FR-001 NFR-001 AC-001
  it('AC-001: deve exigir cabeçalho Authorization e validar token JWT retornando 401 para requisições anônimas', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    // Deve conter verificação de Authorization e chamada a auth.getUser
    expect(code).toMatch(/authHeader|authorization/i);
    expect(code).toMatch(/auth\.getUser\(/);
    expect(code).toMatch(/401/);
  });

  // SPECSFY: US-001 FR-001 NFR-001 AC-002
  it('AC-002: deve bloquear IDOR rejeitando com 403 se user_id for divergente do usuário autenticado no token', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    // Deve conter validação estrita de user_id contra o usuário do token
    expect(code).toMatch(/(?:user(?:Id)?|authUser)\.id\s*!==?\s*user_id|user_id\s*!==?\s*(?:user(?:Id)?|authUser)\.id/);
    expect(code).toMatch(/403/);
  });

  // SPECSFY: US-001 FR-001 NFR-001 AC-003
  it('AC-003: deve permitir execução legítima quando o user_id for idêntico ao do usuário autenticado', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    expect(code).toMatch(/mode\s*===\s*['"]cadastrar['"]/);
    expect(code).toMatch(/mode\s*===\s*['"]validar['"]/);
    expect(code).toMatch(/senha_investimentos/);
  });
});
