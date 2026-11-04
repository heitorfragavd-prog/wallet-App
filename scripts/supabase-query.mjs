import fs from 'fs';
import https from 'https';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const query = process.argv[2];

if (!query) {
  console.error('Please provide a SQL query as argument.');
  process.exit(1);
}

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
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await runQuery(query);
      console.log(JSON.stringify(result, null, 2));
      return;
    } catch (err) {
      if (attempt === 3) {
        console.error('Query error after 3 attempts:', err);
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

main();
