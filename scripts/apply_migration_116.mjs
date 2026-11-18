import fs from 'fs';
import path from 'path';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const PROJECT_REF = 'hdeguzxkdvebdrrutbnx';

async function applyMigration() {
  const migrationPath = path.resolve('supabase/migrations/116_compras_cron_09h_brasilia.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log("Aplicando Migration 116 no Supabase...");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao aplicar migration 116: ${txt}`);
  }

  const result = await res.json();
  console.log("Migration 116 aplicada com sucesso!", result);

  // Consulta cron jobs
  const checkRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `SELECT jobid, jobname, schedule, active, command FROM cron.job WHERE jobname = 'compras-automaticas-diarias-09h';`
    })
  });
  console.log("Configuração do Job no pg_cron:", await checkRes.json());
}

applyMigration().catch(console.error);
