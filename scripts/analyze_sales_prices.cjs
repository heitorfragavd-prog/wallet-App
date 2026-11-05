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
      timeout: 60000
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
  console.log("Consultando preços de venda praticados nas transações Eyemobile...");
  
  // Extrai o preço unitário praticado por product_id e product_name
  const salesPrices = await runQuery(`
    WITH unnested AS (
      SELECT 
        (elem->>'product_id') as product_id,
        (elem->>'product_name') as product_name,
        (elem->>'price')::numeric as price,
        (elem->>'quantity')::numeric as quantity,
        (elem->>'time')::timestamptz as sale_time
      FROM public.transacoes t,
      jsonb_array_elements(t.itens) elem
      WHERE t.itens IS NOT NULL AND jsonb_typeof(t.itens) = 'array'
    )
    SELECT 
      product_id,
      product_name,
      mode() WITHIN GROUP (ORDER BY price) as preco_moda,
      max(price) as preco_max,
      min(price) as preco_min,
      round(avg(price), 2) as preco_medio,
      sum(quantity) as total_vendido,
      max(sale_time) as ultima_venda
    FROM unnested
    WHERE product_id IS NOT NULL AND price > 0
    GROUP BY product_id, product_name
    ORDER BY total_vendido DESC;
  `);

  console.log(`Encontrados ${salesPrices.length} produtos distintos vendidos com preço registrado!`);
  fs.writeFileSync('scripts/eyemobile_sales_prices.json', JSON.stringify(salesPrices, null, 2));

  console.log('\nTop 25 produtos mais vendidos com preços de venda:');
  console.table(salesPrices.slice(0, 25).map(p => ({
    ID: p.product_id,
    Nome: p.product_name,
    'Preço Praticado': `R$ ${Number(p.preco_moda).toFixed(2)}`,
    'Qtd Vendida': p.total_vendido,
    'Última Venda': p.ultima_venda?.slice(0, 10)
  })));
}

main().catch(console.error);
