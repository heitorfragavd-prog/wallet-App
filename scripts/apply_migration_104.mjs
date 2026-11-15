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
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
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
  console.log("=== APLICANDO MIGRATION 104 NO SUPABASE ===");
  const sql = fs.readFileSync('supabase/migrations/104_fechamentos_consolidacao_atomica.sql', 'utf8');
  const res = await runQuery(sql);
  console.log("Resultado da execução:", JSON.stringify(res, null, 2));

  const check = await runQuery(`
    SELECT proname, prosecdef, prosrc 
    FROM pg_proc 
    WHERE proname = 'consolidar_fechamento_caixa_atomico';
  `);
  console.log("Verificação no banco:");
  console.log("- RPC criada com sucesso?", check[0]?.proname === 'consolidar_fechamento_caixa_atomico' ? 'SIM' : 'NÃO');
  console.log("- SECURITY DEFINER?", check[0]?.prosecdef ? 'SIM' : 'NÃO');
}

main().catch(console.error);
