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
  const migrations = await runQuery(`
    SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 30;
  `);
  console.log("MIGRATIONS:", JSON.stringify(migrations, null, 2));

  const allTables = await runQuery(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
  `);
  console.log("TABLES IN PUBLIC:", JSON.stringify(allTables.map(t => t.table_name), null, 2));
}

main().catch(console.error);
