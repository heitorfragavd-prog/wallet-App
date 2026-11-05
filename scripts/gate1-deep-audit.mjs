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
  console.log('================================================================');
  console.log('AUDITORIA PROFUNDA - GATE 1 (WALLET APP & EYEMOBILE)');
  console.log('================================================================\n');

  // 1. Auditoria de Fornecedores em notas_fiscais_compra
  console.log('--- 1. FORNECEDORES EM NOTAS_FISCAIS_COMPRA ---');
  const suppliers = await runQuery(`
    SELECT DISTINCT fornecedor, cnpj_fornecedor, count(*) as total_nfs, min(data_emissao) as primeira_nf, max(data_emissao) as ultima_nf
    FROM public.notas_fiscais_compra
    GROUP BY fornecedor, cnpj_fornecedor
    ORDER BY total_nfs DESC;
  `);
  console.table(suppliers);

  // 2. Colunas de notas_fiscais_compra e nf_itens
  console.log('\n--- 2. COLUNAS DE NF_ITENS ---');
  const colsNfItens = await runQuery(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'nf_itens'
    ORDER BY ordinal_position;
  `);
  console.log(colsNfItens.map(c => `${c.column_name} (${c.data_type})`).join(', '));

  // 3. Amostra de itens de compra (especialmente Coca-Cola, Ambev, Bebidas)
  console.log('\n--- 3. AMOSTRA DE ITENS COMPRADOS (COCA / AMBEV / REFRIGERANTES / BEBIDAS) ---');
  const itemsSample = await runQuery(`
    SELECT 
      ni.id,
      nf.fornecedor,
      ni.codigo_produto,
      ni.descricao,
      ni.unidade,
      ni.quantidade,
      ni.valor_unitario,
      ni.valor_total,
      nf.data_emissao,
      ni.ncm,
      ni.cfop
    FROM public.nf_itens ni
    JOIN public.notas_fiscais_compra nf ON nf.id = ni.nota_fiscal_id
    WHERE ni.descricao ILIKE '%coca%' 
       OR ni.descricao ILIKE '%ambev%' 
       OR ni.descricao ILIKE '%guarana%' 
       OR ni.descricao ILIKE '%heineken%'
       OR ni.descricao ILIKE '%red bull%'
       OR ni.descricao ILIKE '%cerveja%'
       OR ni.descricao ILIKE '%agua%'
       OR nf.fornecedor ILIKE '%coca%'
       OR nf.fornecedor ILIKE '%ambev%'
       OR nf.fornecedor ILIKE '%femsa%'
       OR nf.fornecedor ILIKE '%solar%'
       OR nf.fornecedor ILIKE '%spal%'
    ORDER BY nf.data_emissao DESC
    LIMIT 30;
  `);
  console.table(itemsSample);

  // 4. Estrutura e dados de produtos_eyemobile
  console.log('\n--- 4. ESTRUTURA E STATUS DE PRODUTOS_EYEMOBILE ---');
  const colsEyemobile = await runQuery(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'produtos_eyemobile'
    ORDER BY ordinal_position;
  `);
  console.log(colsEyemobile.map(c => `${c.column_name} (${c.data_type})`).join(', '));

  const eyemobileStats = await runQuery(`
    SELECT 
      count(*) as total_produtos,
      count(custo_atual) as com_custo_atual,
      count(CASE WHEN preco_venda IS NOT NULL AND preco_venda > 0 THEN 1 END) as com_preco_venda,
      count(CASE WHEN ativo = true THEN 1 END) as ativos
    FROM public.produtos_eyemobile;
  `);
  console.table(eyemobileStats);

  // 5. Amostra de produtos_eyemobile (bebidas, refrigerantes, salgados)
  console.log('\n--- 5. PRODUTOS EYEMOBILE (BEBIDAS E ITENS PRINCIPAIS) ---');
  const eyeSample = await runQuery(`
    SELECT id, codigo, descricao, preco_venda, custo_atual, categoria, ativo, updated_at
    FROM public.produtos_eyemobile
    WHERE descricao ILIKE '%coca%' 
       OR descricao ILIKE '%guarana%' 
       OR descricao ILIKE '%red bull%' 
       OR descricao ILIKE '%cerveja%' 
       OR descricao ILIKE '%agua%'
       OR descricao ILIKE '%heineken%'
       OR descricao ILIKE '%pao de queijo%'
    ORDER BY descricao ASC
    LIMIT 30;
  `);
  console.table(eyeSample);

  // 6. Estrutura de historico_custo_produto
  console.log('\n--- 6. ESTRUTURA DE HISTORICO_CUSTO_PRODUTO ---');
  const colsHist = await runQuery(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'historico_custo_produto'
    ORDER BY ordinal_position;
  `);
  console.log(colsHist.map(c => `${c.column_name} (${c.data_type})`).join(', '));

  // 7. Checar vendas eyemobile no banco
  console.log('\n--- 7. VENDAS EYEMOBILE NO BANCO ---');
  const salesTables = await runQuery(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name LIKE '%venda%' OR table_name LIKE '%transac%' OR table_name LIKE '%item%' OR table_name LIKE '%pedido%')
    ORDER BY table_name;
  `);
  console.log('Tabelas de vendas encontradas:', salesTables.map(t => t.table_name).join(', '));

  for (const st of salesTables) {
    try {
      const c = await runQuery(`SELECT count(*) as count FROM public."${st.table_name}"`);
      console.log(`- ${st.table_name}: ${c[0]?.count} registros`);
    } catch (e) {
      console.log(`- ${st.table_name}: erro ${e.message}`);
    }
  }
}

main().catch(console.error);
