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
  console.log('=== GATE 1: AUDITORIA SOMENTE LEITURA DE CUSTOS E PRODUTOS ===\n');

  // 1. Listar tabelas relevantes
  const tables = await runQuery(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  
  const relevantKeywords = ['custo', 'produto', 'eyemobile', 'nf', 'forneced', 'compra', 'preco', 'coca', 'ambev', 'catalogo', 'pedido', 'estoque', 'equivalen'];
  const matchedTables = tables.filter(t => relevantKeywords.some(k => t.table_name.toLowerCase().includes(k)));
  
  console.log('--- TABELAS RELEVANTES ENCONTRADAS ---');
  console.log(matchedTables.map(t => t.table_name).join(', '));
  console.log('\n');

  // 2. Contagens de registros
  for (const t of matchedTables) {
    try {
      const countRes = await runQuery(`SELECT count(*) as count FROM public."${t.table_name}"`);
      console.log(`Tabela: ${t.table_name.padEnd(35)} | Registros: ${countRes[0]?.count ?? 'N/A'}`);
    } catch (e) {
      console.log(`Tabela: ${t.table_name.padEnd(35)} | Erro: ${e.message}`);
    }
  }
}

main().catch(console.error);
