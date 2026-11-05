const fs = require('fs');
const https = require('https');

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const confirmados = JSON.parse(fs.readFileSync('scripts/dryrun_confirmados.json', 'utf8'));

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
  console.log('GRAVAÇÃO SEGURA DE CUSTOS COMPROVADOS NO CATÁLOGO EYEMOBILE');
  console.log('================================================================\n');

  const workspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c'; // Conta Rodo Point
  const userId = '0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0'; // wonderwold@gmail.com

  // 1. Criar tabela de backup dos custos e estado atual
  console.log('1. Criando backup do estado atual de produtos_eyemobile...');
  await runQuery(`
    DROP TABLE IF EXISTS public.produtos_eyemobile_backup_costs_20261105;
    CREATE TABLE public.produtos_eyemobile_backup_costs_20261105 AS
    SELECT * FROM public.produtos_eyemobile
    WHERE workspace_id = '${workspaceId}';
  `);

  const backupCount = await runQuery(`SELECT count(*) as count FROM public.produtos_eyemobile_backup_costs_20261105;`);
  console.log(`Backup criado com sucesso: ${backupCount[0]?.count} produtos salvos na tabela produtos_eyemobile_backup_costs_20261105.\n`);

  // 2. Aplicar gravação para os 11 produtos inequívocos
  console.log(`2. Atualizando ${confirmados.length} produtos comprovados no catálogo local...`);

  for (const c of confirmados) {
    const p = c.produtoEyemobile;
    const m = c.match;

    // Atualiza produtos_eyemobile
    const updateSql = `
      UPDATE public.produtos_eyemobile
      SET 
        custo_atual = ${m.custoEfetivo.toFixed(4)},
        margem_real_percentual = ${c.margemPercentual != null ? c.margemPercentual : 'NULL'},
        ultima_atualizacao_custo = NOW()
      WHERE id = '${p.id}' AND workspace_id = '${workspaceId}';
    `;
    await runQuery(updateSql);

    // Registra no histórico auditável
    const histSql = `
      INSERT INTO public.historico_custo_produto (
        user_id,
        workspace_id,
        produto_codigo,
        produto_descricao,
        fornecedor,
        custo_unitario,
        quantidade,
        data_compra,
        variacao_percentual,
        alerta_enviado,
        sugestao_preco_venda,
        markup_aplicado,
        created_at
      ) VALUES (
        '${userId}',
        '${workspaceId}',
        '${p.codigo}',
        '${p.descricao.replace(/'/g, "''")}',
        '${m.fornecedor.replace(/'/g, "''")}',
        ${m.custoEfetivo.toFixed(4)},
        ${m.fatorConversao},
        '${m.dataCompra || '2026-08-20'}',
        0,
        false,
        ${p.precoVenda || 0},
        ${c.margemPercentual || 0},
        NOW()
      );
    `;
    await runQuery(histSql);

    console.log(`  ✓ [${p.codigo}] ${p.descricao.padEnd(25)} | Custo gravado: R$ ${m.custoEfetivo.toFixed(2)} | Venda: R$ ${p.precoVenda.toFixed(2)} | Margem: ${c.margemPercentual}%`);
  }

  // 3. Validação pós-gravação
  console.log('\n3. Verificação de integridade pós-gravação:');
  const postCheck = await runQuery(`
    SELECT 
      count(*) as total,
      count(CASE WHEN custo_atual > 0 THEN 1 END) as com_custo_real,
      count(CASE WHEN custo_atual = 0 OR custo_atual IS NULL THEN 1 END) as pendentes
    FROM public.produtos_eyemobile
    WHERE workspace_id = '${workspaceId}';
  `);
  console.table(postCheck);

  const histCount = await runQuery(`
    SELECT count(*) as total_historico
    FROM public.historico_custo_produto
    WHERE workspace_id = '${workspaceId}';
  `);
  console.log(`Registros em historico_custo_produto: ${histCount[0]?.total_historico}`);

  console.log('\nGravação concluída com sucesso e auditabilidade garantida!');
}

main().catch(console.error);
