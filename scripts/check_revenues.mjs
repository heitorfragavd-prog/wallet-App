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

async function checkTotalRevenues() {
  const sql = "SELECT id, valor, data, descricao, observacoes, deduplication_key, (itens IS NOT NULL) as has_itens FROM transacoes WHERE workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c' AND tipo = 'receita' AND data >= '2026-11-01' AND data <= '2026-11-07 23:59:59' ORDER BY data ASC;";
  const tx = await runQuery(sql);
  console.log('Total transações receitas brutas:', tx.length);

  const seen = new Set();
  const dedup = [];
  let withItens = 0;
  let withoutItens = 0;
  for (const t of tx) {
    let key = t.deduplication_key;
    if (!key) {
      const m = (t.observacoes || '').match(/Venda:\s*#(\d+)/i) || (t.descricao || '').match(/Venda Eyemobile\s*#(\d+)/i);
      key = m ? m[1] : t.id;
    }
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(t);
      if (t.has_itens) withItens += Number(t.valor);
      else withoutItens += Number(t.valor);
    }
  }

  const total = dedup.reduce((acc, t) => acc + Number(t.valor), 0);
  console.log('Total deduplicado:', total.toFixed(2));
  console.log('Com itens detalhados:', withItens.toFixed(2));
  console.log('Sem itens:', withoutItens.toFixed(2));
}

checkTotalRevenues();
