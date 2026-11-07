import fs from 'fs';
import https from 'https';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      port: 443,
      path: '/v1/projects/hdeguzxkdvebdrrutbnx/database/query',
      method: 'POST',
      family: 4,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function checkDespesasDetails() {
  const sql = "SELECT d.id, d.descricao, d.valor, d.data, d.status, c.nome as categoria_nome FROM despesas d LEFT JOIN categorias c ON c.id = d.categoria_id WHERE d.workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c' AND d.data >= '2026-11-01' AND d.data <= '2026-11-07' ORDER BY d.valor DESC;";
  const desp = await runQuery(sql);
  console.log('Total despesas de novembro 01 a 07:', desp.length);
  for (const d of desp) {
    console.log(d.data, '|', d.status, '| R$', Number(d.valor).toFixed(2), '|', d.categoria_nome, '|', d.descricao);
  }
}

checkDespesasDetails();
