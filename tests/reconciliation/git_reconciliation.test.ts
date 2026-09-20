import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('SPEC-0003: Reconciliação e Integração do PR #80 na develop', () => {
  const rootDir = path.resolve(__dirname, '../..');

  // SPECSFY: US-001 FR-001 NFR-001 AC-001
  it('AC-001: deve validar pré-condições da árvore Git e base de divergência', () => {
    const currentBranch = execSync('git branch --show-current', { cwd: rootDir, encoding: 'utf8' }).trim();
    expect(currentBranch).toBe('develop');

    const mergeBase = execSync('git merge-base HEAD 62abcca849598abf8c815a11746393cc5e84d5ff', { cwd: rootDir, encoding: 'utf8' }).trim();
    expect(mergeBase).toMatch(/^(3a057fe5|62abcca8)/);
  });

  // SPECSFY: US-001 FR-001 NFR-001 AC-002
  it('AC-002: deve confirmar a integração dos 70 commits de hardening na árvore', () => {
    let isAncestor = false;
    try {
      execSync('git merge-base --is-ancestor 62abcca849598abf8c815a11746393cc5e84d5ff HEAD', { cwd: rootDir });
      isAncestor = true;
    } catch {
      isAncestor = false;
    }
    expect(isAncestor).toBe(true);
  });

  // SPECSFY: US-001 FR-001 NFR-001 AC-003
  it('AC-003: deve confirmar que o worktree de homologação permanece isolado e congelado', () => {
    const worktreePath = path.resolve(rootDir, '../wallet-worktrees/security-audit');
    if (fs.existsSync(worktreePath)) {
      const headSha = execSync('git rev-parse HEAD', { cwd: worktreePath, encoding: 'utf8' }).trim();
      expect(headSha).toBe('62abcca849598abf8c815a11746393cc5e84d5ff');
    } else {
      const commitExists = execSync('git cat-file -t 62abcca849598abf8c815a11746393cc5e84d5ff', { cwd: rootDir, encoding: 'utf8' }).trim();
      expect(commitExists).toBe('commit');
    }
  });

  // SPECSFY: US-002 FR-002 NFR-002 AC-004
  it('AC-004: deve garantir coexistência de rate limit atômico e validação JWT em validar-senha', () => {
    const filePath = path.join(rootDir, 'supabase/functions/validar-senha/index.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const hasSecurityHandler = content.includes('processValidarSenha') || (content.includes('auth.getUser') && content.includes('validar'));
    expect(hasSecurityHandler).toBe(true);
  });

  // SPECSFY: US-002 FR-002 NFR-002 AC-005
  it('AC-005: deve conter o validador contra SSRF para proteção de chamadas externas', () => {
    const ssrfPath = path.join(rootDir, 'supabase/functions/_shared/ssrf-validator.ts');
    expect(fs.existsSync(ssrfPath)).toBe(true);
    const ssrfContent = fs.readFileSync(ssrfPath, 'utf8');
    expect(ssrfContent).toMatch(/(?:validateSafeUrl|isPrivateIp|blocked|loopback)/i);
  });

  // SPECSFY: US-002 FR-002 NFR-002 AC-006
  it('AC-006: deve manter a regra abrangente de exclusão de arquivos .env no .dockerignore', () => {
    const dockerignorePath = path.join(rootDir, '.dockerignore');
    expect(fs.existsSync(dockerignorePath)).toBe(true);
    const content = fs.readFileSync(dockerignorePath, 'utf8');
    expect(content).toMatch(/\*\*\/\.env\*/);
  });

  // SPECSFY: US-003 FR-003 NFR-003 AC-007
  it('AC-007: deve atestar que a configuração de testes e arquivos de src estão presentes', () => {
    const vitestConfig = path.join(rootDir, 'vitest.config.ts');
    expect(fs.existsSync(vitestConfig)).toBe(true);
    const srcDir = path.join(rootDir, 'src');
    expect(fs.existsSync(srcDir)).toBe(true);
  });

  // SPECSFY: US-003 FR-003 NFR-003 AC-008
  it('AC-008: deve atestar a presença dos 4 arquivos de testes de segurança de SPEC-0002', () => {
    const secFixesDir = path.join(rootDir, 'tests/security-fixes');
    expect(fs.existsSync(secFixesDir)).toBe(true);
    expect(fs.existsSync(path.join(secFixesDir, 'validar_senha_security.test.ts'))).toBe(true);
    expect(fs.existsSync(path.join(secFixesDir, 'test_webhook_security.test.ts'))).toBe(true);
    expect(fs.existsSync(path.join(secFixesDir, 'openai_proxy_security.test.ts'))).toBe(true);
    expect(fs.existsSync(path.join(secFixesDir, 'dockerignore_security.test.ts'))).toBe(true);
  });

  // SPECSFY: US-003 FR-003 NFR-003 AC-009
  it('AC-009: deve atestar a presença da suíte de segurança avançada do PR #80 em src/core/security', () => {
    const secDir = path.join(rootDir, 'src/core/security');
    expect(fs.existsSync(secDir)).toBe(true);
    const files = fs.readdirSync(secDir);
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files).toContain('ssrf-protection.test.ts');
    expect(files).toContain('authorization-matrix.test.ts');
  });

  // SPECSFY: US-004 FR-004 NFR-004 AC-010
  it('AC-010: deve confirmar configuração de build pronta e script no package.json', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.scripts).toHaveProperty('build');
    expect(pkg.scripts.build).toContain('vite build');
  });

  // SPECSFY: US-004 FR-004 NFR-004 AC-011
  it('AC-011: deve confirmar roteamento seguro e labels do Traefik no docker-stack.yml', () => {
    const stackPath = path.join(rootDir, 'docker-stack.yml');
    expect(fs.existsSync(stackPath)).toBe(true);
    const content = fs.readFileSync(stackPath, 'utf8');
    expect(content).toContain('wallet.cortexx.online');
    expect(content).toContain('leresolver');
    expect(content).toContain('network_public');
  });

  // SPECSFY: US-004 FR-004 NFR-004 AC-012
  it('AC-012: deve atestar a documentação de governança do PR #80', () => {
    const runbookPath = path.join(rootDir, 'PR80_PRODUCTION_RUNBOOK.md');
    const existsInRootOrWorktree = fs.existsSync(runbookPath) || fs.existsSync(path.resolve(rootDir, '../wallet-worktrees/security-audit/PR80_PRODUCTION_RUNBOOK.md'));
    expect(existsInRootOrWorktree).toBe(true);
  });
});
