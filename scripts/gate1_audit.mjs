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

async function runAudit() {
  console.log('=== GATE 1: AUDITORIA COMPLETA DE DUPLICIDADES EYEMOBILE ===\n');

  // 1. Totais Globais
  const q1 = await runQuery(`
    WITH extracted AS (
      SELECT 
        id,
        workspace_id,
        valor,
        data,
        created_at,
        substring(descricao from '#([0-9]+)') as sale_id
      FROM transacoes
      WHERE tipo = 'receita' AND descricao LIKE 'Venda Eyemobile %'
    )
    SELECT 
      count(*) as total_linhas,
      count(DISTINCT sale_id) as vendas_unicas,
      count(*) - count(DISTINCT sale_id) as linhas_duplicadas,
      sum(valor) as valor_total_bruto
    FROM extracted;
  `);
  console.log('1. Totais Globais Eyemobile:', JSON.stringify(q1, null, 2));

  // 2. Cálculo exato do valor financeiro duplicado
  const q2 = await runQuery(`
    WITH extracted AS (
      SELECT 
        id,
        workspace_id,
        valor,
        data,
        substring(descricao from '#([0-9]+)') as sale_id,
        ROW_NUMBER() OVER (PARTITION BY substring(descricao from '#([0-9]+)') ORDER BY created_at ASC, id ASC) as rn
      FROM transacoes
      WHERE tipo = 'receita' AND descricao LIKE 'Venda Eyemobile %'
    )
    SELECT 
      count(*) FILTER (WHERE rn = 1) as vendas_originais_preservadas,
      sum(valor) FILTER (WHERE rn = 1) as valor_real_legitimo,
      count(*) FILTER (WHERE rn > 1) as registros_excedentes_duplicados,
      sum(valor) FILTER (WHERE rn > 1) as valor_financeiro_duplicado
    FROM extracted;
  `);
  console.log('\n2. Impacto Financeiro da Duplicação:', JSON.stringify(q2, null, 2));

  // 3. Workspaces afetados
  const q3 = await runQuery(`
    WITH extracted AS (
      SELECT 
        t.workspace_id,
        w.nome as workspace_nome,
        w.tipo as workspace_tipo,
        substring(t.descricao from '#([0-9]+)') as sale_id,
        t.valor,
        ROW_NUMBER() OVER (PARTITION BY substring(t.descricao from '#([0-9]+)') ORDER BY t.created_at ASC, t.id ASC) as rn
      FROM transacoes t
      LEFT JOIN workspaces w ON w.id = t.workspace_id
      WHERE t.tipo = 'receita' AND t.descricao LIKE 'Venda Eyemobile %'
    )
    SELECT 
      workspace_id,
      workspace_nome,
      workspace_tipo,
      count(*) as total_linhas,
      count(*) FILTER (WHERE rn > 1) as linhas_duplicadas,
      sum(valor) FILTER (WHERE rn > 1) as valor_duplicado
    FROM extracted
    GROUP BY workspace_id, workspace_nome, workspace_tipo;
  `);
  console.log('\n3. Workspaces Envolvidos:', JSON.stringify(q3, null, 2));

  // 4. Período afetado
  const q4 = await runQuery(`
    WITH extracted AS (
      SELECT 
        to_char(data, 'YYYY-MM') as mes_ano,
        substring(descricao from '#([0-9]+)') as sale_id,
        valor,
        ROW_NUMBER() OVER (PARTITION BY substring(descricao from '#([0-9]+)') ORDER BY created_at ASC, id ASC) as rn
      FROM transacoes
      WHERE tipo = 'receita' AND descricao LIKE 'Venda Eyemobile %'
    )
    SELECT 
      mes_ano,
      count(*) as total_linhas,
      count(*) FILTER (WHERE rn > 1) as linhas_duplicadas,
      sum(valor) FILTER (WHERE rn > 1) as valor_duplicado
    FROM extracted
    WHERE rn > 1
    GROUP BY mes_ano
    ORDER BY mes_ano DESC;
  `);
  console.log('\n4. Períodos com Duplicatas (Mês a Mês):', JSON.stringify(q4, null, 2));

  // 5. Relacionamentos e Chaves Estrangeiras (verificar se as linhas duplicadas têm FKs apontando para elas)
  const q5 = await runQuery(`
    WITH extracted AS (
      SELECT 
        id,
        substring(descricao from '#([0-9]+)') as sale_id,
        ROW_NUMBER() OVER (PARTITION BY substring(descricao from '#([0-9]+)') ORDER BY created_at ASC, id ASC) as rn
      FROM transacoes
      WHERE tipo = 'receita' AND descricao LIKE 'Venda Eyemobile %'
    )
    SELECT 
      count(a.id) as anexos_em_duplicatas,
      count(r.id) as recorrencias_em_duplicatas
    FROM extracted e
    LEFT JOIN anexos_transacoes a ON a.transacao_id = e.id AND e.rn > 1
    LEFT JOIN transacoes_recorrentes r ON r.transacao_origem_id = e.id AND e.rn > 1
    WHERE e.rn > 1;
  `);
  console.log('\n5. Vínculos e Relacionamentos das Linhas Duplicadas:', JSON.stringify(q5, null, 2));

  // 6. Divergência de valores ou status para o mesmo identificador
  const q6 = await runQuery(`
    WITH sales AS (
      SELECT 
        substring(descricao from '#([0-9]+)') as sale_id,
        count(DISTINCT valor) as distinct_valores,
        count(DISTINCT data) as distinct_datas,
        count(DISTINCT metodo_pagamento) as distinct_metodos,
        count(*) as total_ocorrencias
      FROM transacoes
      WHERE tipo = 'receita' AND descricao LIKE 'Venda Eyemobile %'
      GROUP BY substring(descricao from '#([0-9]+)')
      HAVING count(*) > 1
    )
    SELECT 
      count(*) as total_vendas_duplicadas,
      count(*) FILTER (WHERE distinct_valores > 1) as vendas_com_valores_divergentes,
      count(*) FILTER (WHERE distinct_datas > 1) as vendas_com_datas_divergentes,
      count(*) FILTER (WHERE distinct_metodos > 1) as vendas_com_metodos_divergentes
    FROM sales;
  `);
  console.log('\n6. Consistência Interna entre Duplicatas (Valores / Datas / Métodos):', JSON.stringify(q6, null, 2));

  // 7. Índices e constraints existentes na tabela transacoes
  const q7 = await runQuery(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'transacoes';
  `);
  console.log('\n7. Índices Existentes na Tabela transacoes:\n', q7.map(i => i.indexname + ': ' + i.indexdef).join('\n'));
}

runAudit().catch(console.error);
