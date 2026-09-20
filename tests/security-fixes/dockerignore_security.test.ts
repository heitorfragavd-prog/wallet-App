import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Blindagem do .dockerignore', () => {
  const filePath = path.resolve('.dockerignore');

  // SPECSFY: US-004 FR-004 NFR-002 NFR-004 AC-010
  it('AC-010: deve conter a regra abrangente **/.env* para ignorar qualquer arquivo de variáveis de ambiente', () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/\*\*\/\.env\*|\.env\*/);
  });

  // SPECSFY: US-004 FR-004 NFR-002 NFR-004 AC-011
  it('AC-011: deve garantir que arquivos sensíveis (.env, .env.local, .env.production) sejam bloqueados', () => {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim());
    const hasEnvWildcard = lines.some(l => l === '**/.env*' || l === '.env*' || l === '.env');
    expect(hasEnvWildcard).toBe(true);
  });

  // SPECSFY: US-004 FR-004 NFR-002 NFR-004 AC-012
  it('AC-012: deve preservar a integridade das regras essenciais de exclusão', () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/node_modules/);
    expect(content).toMatch(/dist/);
    expect(content).toMatch(/\.git/);
  });
});
