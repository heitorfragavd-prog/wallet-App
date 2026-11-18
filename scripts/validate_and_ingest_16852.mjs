import fs from 'fs';
import path from 'path';

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

export function getCsvPath() {
  const fixturePath = path.resolve('tests/fixtures/atacado_16852_dados_para_antigravity.csv');
  if (fs.existsSync(fixturePath)) return fixturePath;
  const localRepoPath = path.resolve('scripts/backups/atacado_16852_dados_para_antigravity.csv');
  if (fs.existsSync(localRepoPath)) return localRepoPath;
  const downloadsPath = 'C:/Users/Heitor/Downloads/atacado_16852_dados_para_antigravity.csv';
  if (fs.existsSync(downloadsPath)) return downloadsPath;
  return fixturePath;
}

export function loadCsvRows() {
  const p = getCsvPath();
  const content = fs.readFileSync(p, 'utf8');
  return parseCSV(content);
}

// Execução somente quando invocado diretamente via CLI
if (process.argv[1] && process.argv[1].endsWith('validate_and_ingest_16852.mjs')) {
  const rows = loadCsvRows();
  console.log(`Parsed ${rows.length} rows.`);

  const statusMap = new Map();
  const qualidadeMap = new Map();

  rows.forEach((r, idx) => {
    const statusPdv = r[12];
    const qualidade = r[11];
    statusMap.set(statusPdv, (statusMap.get(statusPdv) || 0) + 1);
    qualidadeMap.set(qualidade, (qualidadeMap.get(qualidade) || 0) + 1);
  });

  console.log('--- STATUS PDV BREAKDOWN ---');
  for (const [st, cnt] of statusMap.entries()) {
    console.log(`  ${st}: ${cnt}`);
  }

  console.log('\n--- QUALIDADE BREAKDOWN ---');
  for (const [q, cnt] of qualidadeMap.entries()) {
    console.log(`  ${q}: ${cnt}`);
  }
}
