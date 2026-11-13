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

const workspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';

async function main() {
  const rows = await runQuery(`
    WITH extracted AS (
      SELECT 
        data,
        valor,
        substring(descricao from '#([0-9]+)') as sale_id,
        ROW_NUMBER() OVER (PARTITION BY substring(descricao from '#([0-9]+)') ORDER BY created_at ASC, id ASC) as rn
      FROM transacoes
      WHERE workspace_id = '${workspaceId}'
        AND tipo = 'receita'
        AND descricao LIKE 'Venda Eyemobile %'
        AND data >= '2026-11-01' AND data <= '2026-11-30'
    )
    SELECT 
      data,
      count(*) as total_bruto_linhas,
      sum(valor) as total_bruto_valor,
      count(*) FILTER (WHERE rn = 1) as vendas_reais,
      sum(valor) FILTER (WHERE rn = 1) as faturamento_real,
      count(*) FILTER (WHERE rn > 1) as linhas_duplicadas,
      sum(valor) FILTER (WHERE rn > 1) as valor_duplicado
    FROM extracted
    GROUP BY data
    ORDER BY data ASC;
  `);
  console.log(JSON.stringify(rows, null, 2));

  const totalBruto = rows.reduce((acc, r) => acc + Number(r.total_bruto_valor || 0), 0);
  const totalReal = rows.reduce((acc, r) => acc + Number(r.faturamento_real || 0), 0);
  const totalDup = rows.reduce((acc, r) => acc + Number(r.valor_duplicado || 0), 0);
  console.log('\n--- TOTAIS DE NOVEMBRO/2026 ---');
  console.log('Faturamento Bruto no Banco: R$', totalBruto.toFixed(2));
  console.log('Faturamento Real Legítimo  : R$', totalReal.toFixed(2));
  console.log('Diferença Inflada (Duplicadas): R$', totalDup.toFixed(2));
}

main().catch(console.error);
