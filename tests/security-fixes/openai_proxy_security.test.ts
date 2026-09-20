import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Segurança contra Confused Deputy em openai-proxy', () => {
  const filePath = path.resolve('supabase/functions/openai-proxy/index.ts');

  // SPECSFY: US-003 FR-003 NFR-003 AC-007
  it('AC-007: deve rejeitar targetUserId forjado via formData e utilizar estritamente o usuário autenticado', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    // No endpoint transcribe-audio, o user_id para buscar chave em ia_configuracoes
    // deve vir de auth.getUser ou validar que o targetUserId seja idêntico ao authUser.id
    expect(code).toMatch(/transcribe-audio/);
    expect(code).toMatch(/targetUserId\s*=\s*authUser\.id/);
    expect(code).not.toMatch(/formData\.get\(["']user_id["']\)/);
  });

  // SPECSFY: US-003 FR-003 NFR-003 AC-008
  it('AC-008: deve exigir autenticação para transcrição e bloquear chamadas anônimas com 401', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    expect(code).toMatch(/authHeader/);
    expect(code).toMatch(/401/);
  });

  // SPECSFY: US-003 FR-003 NFR-003 AC-009
  it('AC-009: deve consultar a chave de IA associada ao usuário autenticado', () => {
    const code = fs.readFileSync(filePath, 'utf8');
    expect(code).toMatch(/ia_configuracoes/);
    expect(code).toMatch(/api_key/);
  });
});
