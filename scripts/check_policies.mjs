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
  const policies = await runQuery(`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename IN ('colaboradores', 'colaborador_escalas');
  `);
  console.log("POLICIES ON COLABORADORES:", JSON.stringify(policies, null, 2));

  const funcs = await runQuery(`
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name LIKE '%workspace%';
  `);
  console.log("WORKSPACE FUNCTIONS:", JSON.stringify(funcs, null, 2));
}

main().catch(console.error);
