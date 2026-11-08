import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

describe('Blindagem e Exclusão de Backups e Dumps (Gate 0)', () => {
  const gitignorePath = path.resolve('.gitignore');
  const dockerignorePath = path.resolve('.dockerignore');

  it('deve conter regras de exclusão de backups no .gitignore', () => {
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    expect(gitignore).toMatch(/scripts\/backups\//);
    expect(gitignore).toMatch(/\*backup\*\.json/);
    expect(gitignore).toMatch(/\*\.dump/);
    expect(gitignore).toMatch(/\*\.sql\.bak/);
  });

  it('deve conter regras de exclusão de backups no .dockerignore', () => {
    const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');
    expect(dockerignore).toMatch(/scripts\/backups\//);
    expect(dockerignore).toMatch(/\*backup\*\.json/);
  });

  it('não deve possuir nenhum arquivo de backup ou dump rastreado no git index', () => {
    const output = execSync('git ls-files', { encoding: 'utf8' });
    const trackedFiles = output.split('\n').map(f => f.trim()).filter(Boolean);

    const violatingFiles = trackedFiles.filter(file => {
      const lower = file.toLowerCase();
      return (
        lower.startsWith('scripts/backups/') ||
        lower.startsWith('backups/') ||
        (lower.includes('backup') && lower.endsWith('.json')) ||
        lower.endsWith('.dump') ||
        lower.endsWith('.sql.bak')
      );
    });

    expect(violatingFiles).toEqual([]);
  });
});
