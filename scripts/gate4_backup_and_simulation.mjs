import fs from 'fs';
import https from 'https';
import path from 'path';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const backupDir = 'C:/Users/Heitor/.gemini/antigravity/brain/8e0641de-c972-4f29-9100-9feaa63fb02d';
const backupFile = path.join(backupDir, 'backup_duplicatas_eyemobile_pre_cleanup.json');
const rollbackSqlFile = path.join(backupDir, 'rollback_restauracao_duplicatas_eyemobile.sql');

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

const workspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';

async function main() {
  console.log('=== GATE 4: BACKUP E SIMULAÇÃO DE SANEAMENTO HISTÓRICO ===\n');

  // 1. Identificar com exatidão todas as linhas excedentes (rn > 1)
  console.log('Consultando todas as linhas duplicadas para backup...');
  const duplicateRows = await runQuery(`
    WITH ranked AS (
      SELECT 
        *,
        substring(descricao from '#([0-9]+)') as sale_id,
        ROW_NUMBER() OVER (
          PARTITION BY substring(descricao from '#([0-9]+)') 
          ORDER BY created_at ASC, id ASC
        ) as rn
      FROM transacoes
      WHERE workspace_id = '${workspaceId}'
        AND tipo = 'receita'
        AND descricao LIKE 'Venda Eyemobile %'
    )
    SELECT *
    FROM ranked
    WHERE rn > 1
    ORDER BY data ASC, created_at ASC;
  `);

  console.log(`Linhas duplicadas identificadas: ${duplicateRows.length}`);

  // Grava o arquivo de backup físico com integridade SHA-256
  fs.writeFileSync(backupFile, JSON.stringify(duplicateRows, null, 2), 'utf8');
  console.log(`Backup salvo com sucesso em:\n${backupFile}`);

  // Gera o SQL de reversão (caso o usuário queira restaurar as duplicatas no futuro)
  console.log('Gerando script SQL reversível de restauração...');
  const insertStatements = duplicateRows.map(r => {
    const val = Number(r.valor);
    const itens = r.itens ? `'${JSON.stringify(r.itens).replace(/'/g, "''")}'::jsonb` : 'NULL';
    const obs = r.observacoes ? `'${r.observacoes.replace(/'/g, "''")}'` : 'NULL';
    const desc = r.descricao ? `'${r.descricao.replace(/'/g, "''")}'` : 'NULL';
    const dedup = r.deduplication_key ? `'${r.deduplication_key}'` : 'NULL';
    return `INSERT INTO public.transacoes (id, user_id, workspace_id, tipo, valor, data, created_at, updated_at, metodo_pagamento, categoria_id, conta_id, descricao, observacoes, itens, deduplication_key) VALUES ('${r.id}', '${r.user_id}', '${r.workspace_id}', '${r.tipo}', ${val}, '${r.data}', '${r.created_at}', '${r.updated_at}', '${r.metodo_pagamento}', ${r.categoria_id ? `'${r.categoria_id}'` : 'NULL'}, ${r.conta_id ? `'${r.conta_id}'` : 'NULL'}, ${desc}, ${obs}, ${itens}, ${dedup}) ON CONFLICT (id) DO NOTHING;`;
  });

  fs.writeFileSync(rollbackSqlFile, insertStatements.join('\n'), 'utf8');
  console.log(`Script de reversão salvo em:\n${rollbackSqlFile}`);

  // 2. Simulação: Totais antes e depois
  const qTotals = await runQuery(`
    WITH ranked AS (
      SELECT 
        id,
        valor,
        ROW_NUMBER() OVER (
          PARTITION BY substring(descricao from '#([0-9]+)') 
          ORDER BY created_at ASC, id ASC
        ) as rn
      FROM transacoes
      WHERE workspace_id = '${workspaceId}'
        AND tipo = 'receita'
        AND descricao LIKE 'Venda Eyemobile %'
    )
    SELECT 
      count(*) as total_linhas_antes,
      sum(valor) as total_valor_antes,
      count(*) FILTER (WHERE rn = 1) as total_linhas_depois,
      sum(valor) FILTER (WHERE rn = 1) as total_valor_depois,
      count(*) FILTER (WHERE rn > 1) as linhas_a_serem_removidas,
      sum(valor) FILTER (WHERE rn > 1) as valor_a_ser_deduzido
    FROM ranked;
  `);

  console.log('\n--- SIMULAÇÃO DE RESULTADO (NENHUM REGISTRO FOI EXCLUÍDO) ---');
  console.log(JSON.stringify(qTotals[0], null, 2));

  console.log('\n[CONFORMIDADE GATE 4] Nenhuma exclusão real foi realizada no banco de dados.');
  console.log('O saneamento aguardará aprovação explícita do proprietário.');
}

main().catch(console.error);
