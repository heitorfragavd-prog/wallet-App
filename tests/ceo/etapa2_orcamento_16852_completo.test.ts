import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { parseCSV } from '../../scripts/validate_and_ingest_16852.mjs';

describe('ETAPA 02 — Catálogo de Referência Completo do Orçamento nº 16852 (54 Itens)', () => {
  const csvPath = 'C:/Users/Heitor/Downloads/atacado_16852_dados_para_antigravity.csv';
  const csvExists = fs.existsSync(csvPath);

  it('Gate 1: Ingestão e validação matemática de todos os 54 itens do orçamento', () => {
    expect(csvExists).toBe(true);
    const text = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCSV(text);
    expect(rows).toHaveLength(54);

    let totalGeral = 0;
    const subtotais: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const countPagina: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

    rows.forEach(r => {
      const pag = parseInt(r[0]);
      const qtdEmb = parseFloat(r[4]);
      const precoEmb = parseFloat(r[5]);
      const totalItem = parseFloat(r[6]);

      expect(Math.abs(qtdEmb * precoEmb - totalItem)).toBeLessThan(0.01);
      totalGeral += totalItem;
      subtotais[pag] = (subtotais[pag] || 0) + totalItem;
      countPagina[pag] = (countPagina[pag] || 0) + 1;
    });

    expect(countPagina[1]).toBe(15);
    expect(countPagina[2]).toBe(15);
    expect(countPagina[3]).toBe(15);
    expect(countPagina[4]).toBe(9);

    expect(subtotais[1]).toBeCloseTo(657.62, 2);
    expect(subtotais[2]).toBeCloseTo(2219.20, 2);
    expect(subtotais[3]).toBeCloseTo(512.75, 2);
    expect(subtotais[4]).toBeCloseTo(918.29, 2);

    expect(totalGeral).toBeCloseTo(4307.86, 2);
  });

  it('Gate 2: Separação determinística de custos unitários e custos por grama (sem estimativa precipitada)', () => {
    const text = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCSV(text);

    // Chita 500g: 6.20 / 500g = 0.0124/g determinístico; 100 un é aproximado
    const chita = rows.find(r => r[1] === '6800');
    expect(chita).toBeDefined();
    expect(parseFloat(chita![10])).toBeCloseTo(0.0124, 4);
    expect(chita![11]).toContain('APROX.');
    expect(chita![12]).toContain('PENDENTE');

    // Trident Canela: C/21 explícito -> R$ 36,00 / 21 = R$ 1,7143/un
    const trident = rows.find(r => r[1] === '22863');
    expect(trident).toBeDefined();
    expect(parseFloat(trident![8])).toBeCloseTo(1.7143, 3);
    expect(trident![11]).toContain('EXATA');
    expect(trident![12]).toContain('PDV relacionado');
  });

  it('Gate 3: Preservação de integridade dos 15 produtos vinculados com margem positiva', () => {
    const text = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCSV(text);

    const vinculados = rows.filter(r => r[12] === 'PDV relacionado — conferir identidade exata');
    expect(vinculados).toHaveLength(15);

    vinculados.forEach(v => {
      const custoUn = parseFloat(v[8]);
      const pv = parseFloat(v[14]);
      expect(custoUn).toBeGreaterThan(0);
      expect(pv).toBeGreaterThan(custoUn);
      const margem = ((pv - custoUn) / pv) * 100;
      expect(margem).toBeGreaterThan(25); // Todas as margens são saudáveis
    });
  });

  it('Gate 4: Isolamento das 15 variações de sabor/SKU e 24 itens pendentes de contagem/correspondência', () => {
    const text = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCSV(text);

    const revalidar = rows.filter(r => r[12] === 'PDV relacionado — REVALIDAR sabor/SKU');
    expect(revalidar).toHaveLength(15);

    const pendentes = rows.filter(r => r[12] === 'PENDENTE — não vinculado ao PDV');
    expect(pendentes).toHaveLength(24);

    // Totalizando 15 + 15 + 24 = 54
    expect(vinculadosCount(rows)).toBe(54);
  });
});

function vinculadosCount(rows: string[][]) {
  const c1 = rows.filter(r => r[12] === 'PDV relacionado — conferir identidade exata').length;
  const c2 = rows.filter(r => r[12] === 'PDV relacionado — REVALIDAR sabor/SKU').length;
  const c3 = rows.filter(r => r[12] === 'PENDENTE — não vinculado ao PDV').length;
  return c1 + c2 + c3;
}
