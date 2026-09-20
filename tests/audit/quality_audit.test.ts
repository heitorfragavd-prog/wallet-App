import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Diagnóstico de Qualidade Técnica, Testes e Build', () => {
  const reportPath = path.resolve('docs/audit/quality-findings.md');

  // SPECSFY: US-002 FR-002 NFR-002 AC-004
  it('AC-004: deve conter diagnóstico do compilador TypeScript com contagem consolidada de erros', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/quality-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/# Diagn[oó]stico de Qualidade T[eé]cnica/i);
    expect(content).toMatch(/Checagem Est[aá]tica TypeScript/i);
    expect(content).toMatch(/Total de erros de tipagem/i);
  });

  // SPECSFY: US-002 FR-002 NFR-002 AC-005
  it('AC-005: deve conter diagnóstico e inventário de falhas da suíte de testes Vitest', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/quality-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/Diagn[oó]stico da Su[ií]te Vitest/i);
    expect(content).toMatch(/Testes aprovados/i);
  });

  // SPECSFY: US-002 FR-002 NFR-002 AC-006
  it('AC-006: deve conter verificação de empacotamento de produção com Vite', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/quality-findings.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/Verifica[cç][aã]o de Build de Produ[cç][aã]o/i);
  });
});
