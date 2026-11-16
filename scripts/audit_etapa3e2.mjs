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

async function audit() {
  console.log("=== AUDITORIA GATE 1: OBJETOS NO SUPABASE ===");

  console.log("\n1. Colunas em colaborador_escalas:");
  const colsEscala = await runQuery(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'colaborador_escalas'
    ORDER BY ordinal_position;
  `);
  console.log(JSON.stringify(colsEscala, null, 2));

  console.log("\n2. Definição da RPC registrar_anexo_fechamento_atomico:");
  const rpcDef = await runQuery(`
    SELECT proname, prosecdef, prosrc
    FROM pg_proc
    WHERE proname = 'registrar_anexo_fechamento_atomico';
  `);
  console.log("Definição RPC:", JSON.stringify(rpcDef, null, 2));

  console.log("\n3. Grants na RPC registrar_anexo_fechamento_atomico:");
  const rpcGrants = await runQuery(`
    SELECT routine_schema, routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_name = 'registrar_anexo_fechamento_atomico';
  `);
  console.log("Grants RPC:", JSON.stringify(rpcGrants, null, 2));

  console.log("\n4. Cron Jobs Ativos:");
  const cronJobs = await runQuery(`
    SELECT jobid, jobname, schedule, command, active
    FROM cron.job
    WHERE jobname LIKE 'folguistas-%';
  `);
  console.log("Cron Jobs:", JSON.stringify(cronJobs, null, 2));

  console.log("\n5. Colunas de escalas_config:");
  const configs = await runQuery(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'escalas_config';
  `);
  console.log("Colunas escalas_config:", JSON.stringify(configs.map(c => c.column_name), null, 2));

  const rows = await runQuery(`SELECT * FROM escalas_config LIMIT 1;`);
  console.log("Row escalas_config:", JSON.stringify(rows, null, 2));
}

audit().catch(console.error);
