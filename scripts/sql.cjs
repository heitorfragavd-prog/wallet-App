const fs = require('fs');
const https = require('https');

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const query = process.argv.slice(2).join(' ') || fs.readFileSync(0, 'utf8');

const data = JSON.stringify({ query });
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
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) {
        console.table(parsed.slice(0, 50));
        console.log(`Total rows: ${parsed.length}`);
      } else {
        console.log(JSON.stringify(parsed, null, 2));
      }
    } catch {
      console.log(body);
    }
  });
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
