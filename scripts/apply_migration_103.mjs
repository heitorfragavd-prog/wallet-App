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
  console.log("=== APLICANDO MIGRATION 103 NO SUPABASE ===");
  const sql = fs.readFileSync('supabase/migrations/103_rpc_financeira_seguranca_estrita.sql', 'utf8');
  const res = await runQuery(sql);
  console.log("Resultado da execução:", JSON.stringify(res, null, 2));

  const check = await runQuery(`
    SELECT proname, prosecdef, prosrc 
    FROM pg_proc 
    WHERE proname = 'registrar_anexo_fechamento_atomico';
  `);
  const src = check[0]?.prosrc || '';
  console.log("Verificação no banco:");
  console.log("- Possui v_is_service_role?", src.includes('v_is_service_role') ? 'SIM' : 'NÃO');
  console.log("- Possui validação de workspace estrita?", src.includes('is_workspace_executive') ? 'SIM' : 'NÃO');
}

main().catch(console.error);
