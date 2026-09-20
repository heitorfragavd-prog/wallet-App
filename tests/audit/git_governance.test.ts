import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Auditoria de Governança Git e Worktrees', () => {
  const reportPath = path.resolve('docs/audit/git-governance-findings.md');

  // SPECSFY: US-003 FR-003 NFR-003 AC-007
  it('AC-007: deve listar e mapear todas as branches locais e remotas ativas', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/git-governance-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/# Auditoria de Governan[cç]a Git e Worktrees/i);
    expect(content).toMatch(/Mapeamento de Branches Locais e Remotas/i);
    expect(content).toMatch(/develop/);
  });

  // SPECSFY: US-003 FR-003 NFR-003 AC-008
  it('AC-008: deve verificar integridade e isolamento estrito do worktree PR #80', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/git-governance-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/Isolamento do Worktree PR #80/i);
    expect(content).toMatch(/62abcca849598abf8c815a11746393cc5e84d5ff/);
  });

  // SPECSFY: US-003 FR-003 NFR-003 AC-009
  it('AC-009: deve auditar divergências de commits e pendências de integração', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/git-governance-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/Diverg[eê]ncias e Commits N[aã]o Integrados/i);
  });
});
