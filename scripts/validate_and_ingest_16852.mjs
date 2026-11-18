import fs from 'fs';

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

const csvPath = 'C:/Users/Heitor/Downloads/atacado_16852_dados_para_antigravity.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');
const rows = parseCSV(csvContent);

const statusMap = new Map();
const qualidadeMap = new Map();

rows.forEach((r, idx) => {
  const statusPdv = r[12];
  const qualidade = r[11];
  const prod = r[2];
  const codForn = r[1];
  const pdvNome = r[13];

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
