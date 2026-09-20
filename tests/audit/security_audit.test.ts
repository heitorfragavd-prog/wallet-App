import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Auditoria de Segurança e Segredos', () => {
  const reportPath = path.resolve('docs/audit/security-findings.md');

  // SPECSFY: US-001 FR-001 NFR-001 AC-001
  it('AC-001: deve gerar relatório de segurança com varredura de credenciais e valores hardcoded', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/security-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/# Relat[oó]rio de Auditoria de Seguran[cç]a e Segredos/i);
    expect(content).toMatch(/Varredura de Chaves e Credenciais/i);
  });

  // SPECSFY: US-001 FR-001 NFR-001 AC-002
  it('AC-002: deve catalogar permissões de edge functions e políticas RLS de migrations', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/security-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/Permiss[oõ]es de Edge Functions e Migrations/i);
    expect(content).toMatch(/Row Level Security|RLS/i);
  });

  // SPECSFY: US-001 FR-001 NFR-001 AC-003
  it('AC-003: deve garantir que segredos reais estejam ofuscados com máscara e não expostos', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/security-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    // Nenhum token de produção deve estar exposto em texto claro
    expect(content).not.toMatch(/sk-proj-[a-zA-Z0-9_-]{20,}/);
    expect(content).not.toMatch(/sbp_[a-zA-Z0-9]{20,}/);
    expect(content).toMatch(/Mascaramento e Classifica[cç][aã]o de Gravidade/i);
  });
});
