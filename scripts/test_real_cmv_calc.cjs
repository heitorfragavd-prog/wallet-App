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
  console.log('=== TESTE DE CÁLCULO DE CMV E LUCRO BRUTO REAL NO BANCO ===\n');

  const workspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';

  // 1. Busca produtos com custo confirmado
  const prodsWithCost = await runQuery(`
    SELECT codigo, descricao, preco_venda, custo_atual, margem_real_percentual
    FROM public.produtos_eyemobile
    WHERE workspace_id = '${workspaceId}' AND custo_atual > 0;
  `);

  console.log(`Produtos com custo cadastrado: ${prodsWithCost.length}`);
  console.table(prodsWithCost);

  // 2. Consulta vendas deduplicadas dos itens no período recente (últimos 30 dias / mês de outubro/novembro 2026)
  const salesItems = await runQuery(`
    WITH unnested AS (
      SELECT 
        t.id as transacao_id,
        t.data as data_venda,
        (elem->>'product_id') as product_id,
        (elem->>'product_name') as product_name,
        (elem->>'price')::numeric as price,
        (elem->>'quantity')::numeric as quantity,
        (elem->>'total')::numeric as total
      FROM public.transacoes t,
      jsonb_array_elements(t.itens) elem
      WHERE t.workspace_id = '${workspaceId}'
        AND t.tipo = 'receita'
        AND t.itens IS NOT NULL
        AND jsonb_typeof(t.itens) = 'array'
        AND t.data >= '2026-10-01'
    )
    SELECT 
      product_id,
      product_name,
      sum(quantity) as total_qtd,
      sum(total) as faturamento_total,
      mode() WITHIN GROUP (ORDER BY price) as preco_venda_medio
    FROM unnested
    WHERE product_id IS NOT NULL
    GROUP BY product_id, product_name;
  `);

  console.log(`\nItens vendidos desde 2026-10-01: ${salesItems.length} produtos.`);

  const costMap = new Map();
  for (const p of prodsWithCost) {
    costMap.set(String(p.codigo), Number(p.custo_atual));
  }

  let receitaTotal = 0;
  let receitaComCusto = 0;
  let receitaSemCusto = 0;
  let cmvTotal = 0;

  const rentabilidade = [];

  for (const s of salesItems) {
    const fat = Number(s.faturamento_total || 0);
    const qtd = Number(s.total_qtd || 0);
    receitaTotal += fat;

    const custoUnit = costMap.get(String(s.product_id));
    if (custoUnit && custoUnit > 0) {
      const cmvItem = custoUnit * qtd;
      const lucroItem = fat - cmvItem;
      const margemItem = fat > 0 ? (lucroItem / fat) * 100 : 0;
      receitaComCusto += fat;
      cmvTotal += cmvItem;

      rentabilidade.push({
        id: s.product_id,
        produto: s.product_name,
        qtdVendida: qtd,
        faturamento: fat,
        custoUnit: Number(custoUnit.toFixed(2)),
        cmvTotal: Number(cmvItem.toFixed(2)),
        lucroBruto: Number(lucroItem.toFixed(2)),
        margemPercentual: Number(margemItem.toFixed(1))
      });
    } else {
      receitaSemCusto += fat;
    }
  }

  const lucroBrutoTotal = receitaComCusto - cmvTotal;
  const margemBrutaGeral = receitaComCusto > 0 ? (lucroBrutoTotal / receitaComCusto) * 100 : 0;
  const coberturaReceita = receitaTotal > 0 ? (receitaComCusto / receitaTotal) * 100 : 0;

  rentabilidade.sort((a, b) => b.lucroBruto - a.lucroBruto);

  console.log('\n--- RESULTADO DE RENTABILIDADE COMPROVADA ---');
  console.log(`Receita Total no Período: R$ ${receitaTotal.toFixed(2)}`);
  console.log(`Receita com Custo Comprovado: R$ ${receitaComCusto.toFixed(2)} (${coberturaReceita.toFixed(1)}% do faturamento)`);
  console.log(`Receita com Custo Pendente: R$ ${receitaSemCusto.toFixed(2)} (${(100 - coberturaReceita).toFixed(1)}%)`);
  console.log(`CMV das Vendas com Custo: R$ ${cmvTotal.toFixed(2)} (${(cmvTotal / receitaComCusto * 100).toFixed(1)}% da receita apurada)`);
  console.log(`Lucro Bruto Comprovado: R$ ${lucroBrutoTotal.toFixed(2)}`);
  console.log(`Margem Bruta Média: ${margemBrutaGeral.toFixed(1)}%\n`);

  console.table(rentabilidade);
}

main().catch(console.error);
