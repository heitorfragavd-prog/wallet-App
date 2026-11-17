import fs from 'fs';
import https from 'https';
import { mappedProducts } from './backup_and_simulate_16852.mjs';

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
      timeout: 30000
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

const workspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';
const userId = '0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0';

async function main() {
  console.log('--- INICIANDO ATUALIZAÇÃO NO BANCO DE DADOS ---');
  
  const sqlStatements = [];
  sqlStatements.push('BEGIN;');

  for (const item of mappedProducts) {
    const markup = item.preco_venda > 0 
      ? Number(((item.preco_venda - item.custo_unitario) / item.preco_venda * 100).toFixed(2)) 
      : 0;

    // 1. Update produtos_eyemobile
    sqlStatements.push(`
      UPDATE produtos_eyemobile 
      SET custo_atual = ${item.custo_unitario},
          ultima_atualizacao_custo = '2026-11-13 16:04:32+00'
      WHERE workspace_id = '${workspaceId}' 
        AND codigo = '${item.codigo}';
    `);

    // 2. Insert into historico_custo_produto
    // Sanitizar descricao
    const safeDesc = item.descricao.replace(/'/g, "''");
    const safeFornec = item.fornecedor_doc.replace(/'/g, "''");
    
    sqlStatements.push(`
      INSERT INTO historico_custo_produto (
        user_id,
        workspace_id,
        produto_codigo,
        produto_descricao,
        fornecedor,
        custo_unitario,
        quantidade,
        nf_id,
        data_compra,
        variacao_percentual,
        alerta_enviado,
        sugestao_preco_venda,
        markup_aplicado
      ) VALUES (
        '${userId}',
        '${workspaceId}',
        '${item.codigo}',
        '${safeDesc}',
        '${safeFornec}',
        ${item.custo_unitario},
        ${item.qtd_embalagem},
        NULL,
        '2026-11-13',
        0.00,
        false,
        ${item.preco_venda},
        ${markup}
      );
    `);
  }

  sqlStatements.push('COMMIT;');

  const fullSql = sqlStatements.join('\n');
  console.log(`Executando ${mappedProducts.length} atualizações em transação atômica...`);
  
  const res = await runQuery(fullSql);
  console.log('Resultado da execução:', res);

  // Verificação pós-execução
  console.log('\n--- VERIFICAÇÃO PÓS-GRAVAÇÃO ---');
  const verifyPe = await runQuery(`
    SELECT codigo, descricao, custo_atual, preco_venda, ultima_atualizacao_custo 
    FROM produtos_eyemobile 
    WHERE workspace_id = '${workspaceId}' 
      AND codigo IN (${mappedProducts.map(m => `'${m.codigo}'`).join(',')});
  `);
  console.log(`Produtos verificados em produtos_eyemobile (${verifyPe.length}):`);
  verifyPe.forEach(p => {
    console.log(`[${p.codigo}] ${p.descricao} | Custo: R$ ${p.custo_atual} | PV: R$ ${p.preco_venda} | Atualizado: ${p.ultima_atualizacao_custo}`);
  });

  const verifyHist = await runQuery(`
    SELECT produto_codigo, produto_descricao, fornecedor, custo_unitario, data_compra, nf_id, created_at
    FROM historico_custo_produto 
    WHERE workspace_id = '${workspaceId}' 
      AND fornecedor = 'Orçamento Comercial nº 16852 (13/11/2026)'
    ORDER BY created_at DESC;
  `);
  console.log(`\nRegistros criados no historico_custo_produto (${verifyHist.length}):`);
  verifyHist.forEach(h => {
    console.log(`[${h.produto_codigo}] ${h.produto_descricao} | Custo: R$ ${h.custo_unitario} | Data: ${h.data_compra} | Fornec: ${h.fornecedor} | NF: ${h.nf_id}`);
  });
}

main().catch(console.error);
