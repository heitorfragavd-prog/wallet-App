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
  const cols = await runQuery(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'colaborador_escalas' 
    ORDER BY ordinal_position;
  `);
  console.log("COLABORADOR_ESCALAS COLUNAS:\n", JSON.stringify(cols, null, 2));

  const sample = await runQuery(`
    SELECT ce.*, c.nome
    FROM public.colaborador_escalas ce
    JOIN public.colaboradores c ON c.id = ce.colaborador_id
    WHERE ce.workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c'
    ORDER BY ce.data DESC
    LIMIT 10;
  `);
  console.log("COLABORADOR_ESCALAS AMOSTRA:\n", JSON.stringify(sample, null, 2));
}

main().catch(console.error);
