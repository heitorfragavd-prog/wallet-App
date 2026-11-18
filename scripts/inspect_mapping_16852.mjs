import fs from 'fs';
import { parseCSV } from './validate_and_ingest_16852.mjs';

const csvPath = 'C:/Users/Heitor/Downloads/atacado_16852_dados_para_antigravity.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');
const rows = parseCSV(csvContent);

const catalogo = JSON.parse(fs.readFileSync('scripts/backups/catalogo_eyemobile.json', 'utf8'));

console.log('--- ANÁLISE DE MAPEAMENTO DAS 54 LINHAS ---');

const relacoes = [];

rows.forEach((r, idx) => {
  const pag = parseInt(r[0]);
  const codForn = r[1];
  const prodForn = r[2];
  const emb = r[3];
  const qtdEmb = parseFloat(r[4]);
  const precoEmb = parseFloat(r[5]);
  const totalItem = parseFloat(r[6]);
  const unEmb = r[7] ? parseFloat(r[7]) : null;
  const custoUn = r[8] ? parseFloat(r[8]) : null;
  const gEmb = r[9] ? parseFloat(r[9]) : null;
  const custoG = r[10] ? parseFloat(r[10]) : null;
  const qualidade = r[11];
  const statusPdv = r[12];
  const pdvNome = r[13];
  const pvRelatorio = r[14] ? parseFloat(r[14]) : null;
  const fonte = r[15];
  const nota = r[16];

  let codPdv = null;
  let prodPdv = null;

  if (pdvNome) {
    // Buscar no catalogo
    const match = catalogo.find(c => c.descricao.trim().toUpperCase() === pdvNome.trim().toUpperCase());
    if (match) {
      codPdv = match.codigo;
      prodPdv = match;
    } else {
      // Busca parcial
      const matchPartial = catalogo.find(c => c.descricao.trim().toUpperCase().includes(pdvNome.trim().toUpperCase()));
      if (matchPartial) {
        codPdv = matchPartial.codigo;
        prodPdv = matchPartial;
      }
    }
  }

  relacoes.push({
    linha: idx + 1,
    pag,
    codForn,
    prodForn,
    emb,
    qtdEmb,
    precoEmb,
    totalItem,
    unEmb,
    custoUn,
    gEmb,
    custoG,
    qualidade,
    statusPdv,
    pdvNome,
    codPdv,
    pvPdv: prodPdv ? parseFloat(prodPdv.preco_venda) : pvRelatorio,
    nota
  });
});

console.log(`Total mapeadas: ${relacoes.length}`);
const vinculadosExatos = relacoes.filter(r => r.statusPdv === 'PDV relacionado — conferir identidade exata');
console.log(`Vinculados exatos: ${vinculadosExatos.length}`);
vinculadosExatos.forEach(v => {
  console.log(`[${v.codForn}] ${v.prodForn} -> PDV: [${v.codPdv}] ${v.pdvNome} | Custo/un: R$ ${v.custoUn?.toFixed(4)} | PV: R$ ${v.pvPdv}`);
});

const revalidarSku = relacoes.filter(r => r.statusPdv === 'PDV relacionado — REVALIDAR sabor/SKU');
console.log(`\nRevalidar sabor/SKU: ${revalidarSku.length}`);
revalidarSku.forEach(v => {
  console.log(`[${v.codForn}] ${v.prodForn} -> PDV: [${v.codPdv}] ${v.pdvNome} | Custo/un: R$ ${v.custoUn?.toFixed(4)} | PV: R$ ${v.pvPdv}`);
});

const pendentes = relacoes.filter(r => r.statusPdv.startsWith('PENDENTE'));
console.log(`\nPendentes (não vinculados ao PDV): ${pendentes.length}`);
pendentes.forEach(v => {
  console.log(`[${v.codForn}] ${v.prodForn} | Custo/un: ${v.custoUn ? 'R$ ' + v.custoUn.toFixed(4) : '—'} | Custo/g: ${v.custoG ? 'R$ ' + v.custoG.toFixed(4) : '—'} | Nota: ${v.nota}`);
});
