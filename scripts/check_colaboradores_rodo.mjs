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
      timeout: 60000
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

async function main() {
  const rodoPointColabs = await runQuery(`
    SELECT id, nome, tipo, cargo, status, telefone, valor_diaria, created_at 
    FROM public.colaboradores 
    WHERE workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c'
    ORDER BY tipo, nome;
  `);
  console.log("COLABORADORES RODO POINT:\n", JSON.stringify(rodoPointColabs, null, 2));
}

main().catch(console.error);
