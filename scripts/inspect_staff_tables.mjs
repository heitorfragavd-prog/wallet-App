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
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'colaboradores' AND table_schema = 'public'
    ORDER BY ordinal_position;
  `);
  console.log("COLABORADORES COLUMNS:", JSON.stringify(cols, null, 2));

  const escalasCols = await runQuery(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'colaborador_escalas' AND table_schema = 'public'
    ORDER BY ordinal_position;
  `);
  console.log("COLABORADOR_ESCALAS COLUMNS:", JSON.stringify(escalasCols, null, 2));

  const existingDisp = await runQuery(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE '%disponib%';
  `);
  console.log("EXISTING DISPONIBILIDADE TABLES:", JSON.stringify(existingDisp, null, 2));
}

main().catch(console.error);
