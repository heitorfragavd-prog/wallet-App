const fs = require('fs');
const https = require('https');

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
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(data);
    req.end();
  });
}

async function main() {
  const tables = await runQuery(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  console.log(`Total public base tables: ${tables.length}`);

  const results = [];
  for (const t of tables) {
    try {
      const res = await runQuery(`SELECT count(*) as c FROM public."${t.table_name}"`);
      const count = Number(res[0]?.c ?? 0);
      if (count > 0) {
        results.push({ table: t.table_name, count });
      }
    } catch (e) {
      // ignore
    }
  }

  results.sort((a, b) => b.count - a.count);
  console.table(results);
}

main().catch(console.error);
