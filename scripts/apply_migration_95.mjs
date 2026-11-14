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
  console.log("=== APLICANDO MIGRATION 95: WORKSPACE GMAIL INTEGRATIONS ===");
  const migrationSql = fs.readFileSync('supabase/migrations/95_workspace_gmail_integrations.sql', 'utf8');

  const result = await runQuery(migrationSql);
  console.log("Resultado da execução SQL:", JSON.stringify(result, null, 2));

  // 1. Verificar se as tabelas foram criadas
  const verifyTables = await runQuery(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('workspace_gmail_integrations', 'gmail_mensagens_processadas')
    ORDER BY table_name;
  `);
  console.log("\n--- TABELAS CRIADAS EM PUBLIC ---");
  console.log(JSON.stringify(verifyTables, null, 2));

  // 2. Verificar RLS nas tabelas
  const verifyRls = await runQuery(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('workspace_gmail_integrations', 'gmail_mensagens_processadas');
  `);
  console.log("\n--- STATUS DO RLS ---");
  console.log(JSON.stringify(verifyRls, null, 2));

  // 3. Verificar políticas RLS
  const verifyPolicies = await runQuery(`
    SELECT policyname, tablename, cmd
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('workspace_gmail_integrations', 'gmail_mensagens_processadas')
    ORDER BY tablename, policyname;
  `);
  console.log("\n--- POLÍTICAS RLS ATIVAS ---");
  console.log(JSON.stringify(verifyPolicies, null, 2));
}

main().catch(console.error);
