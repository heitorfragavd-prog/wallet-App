import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Matriz de Severidade e Plano de Prontidão para Produção', () => {
  const reportPath = path.resolve('docs/audit/production-readiness-plan.md');

  // SPECSFY: US-004 FR-004 NFR-004 AC-010
  it('AC-010: deve conter matriz de severidade consolidada para todos os achados', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/production-readiness-plan.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/# Plano de Prontid[aã]o para Produ[cç][aã]o/i);
    expect(content).toMatch(/Matriz Consolidada de Severidade/i);
    expect(content).toMatch(/Cr[ií]tico/i);
    expect(content).toMatch(/Alto/i);
  });

  // SPECSFY: US-004 FR-004 NFR-004 AC-011
  it('AC-011: deve definir critérios bloqueantes de deploy com tolerância zero para falhas críticas', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/production-readiness-plan.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/Crit[eé]rios Bloqueantes de Deploy/i);
    expect(content).toMatch(/Toler[aâ]ncia Zero/i);
  });

  // SPECSFY: US-004 FR-004 NFR-004 AC-012
  it('AC-012: deve estruturar plano de ação faseado com estimativas e ordem lógica de mitigação', () => {
    expect(fs.existsSync(reportPath), 'docs/audit/production-readiness-plan.md deve existir').toBe(true);
    const content = fs.readFileSync(reportPath, 'utf8');
    expect(content).toMatch(/Plano de A[cç][aã]o Corretivo Faseado/i);
    expect(content).toMatch(/Fase 1/i);
  });
});
