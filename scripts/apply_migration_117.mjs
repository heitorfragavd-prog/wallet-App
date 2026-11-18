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
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    }, res => {
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

const wsId = '2af415b6-76aa-4134-8133-a9b405671c1c';

async function main() {
  console.log("=== APLICANDO MIGRATION 117 (CATÁLOGO DE REFERÊNCIAS DO ORÇAMENTO 16852) ===");
  const sqlPath = 'supabase/migrations/117_referencias_custo_orcamento_atacado.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log("Enviando SQL para o Supabase...");
  const res = await runQuery(sql);
  console.log("Resultado da execução:", res);

  console.log("\n--- VERIFICAÇÃO DE INTEGRIDADE NO BANCO ---");
  // 1. Contagem de itens
  const countRes = await runQuery(`
    SELECT count(*), sum(total_brl) 
    FROM public.referencias_custo_orcamento 
    WHERE workspace_id = '${wsId}' AND numero_orcamento = '16852';
  `);
  console.log("Total de itens inseridos:", countRes[0]?.count);
  console.log("Soma total R$:", countRes[0]?.sum);

  // 2. Subtotais por página
  const subtotaisRes = await runQuery(`
    SELECT pagina, count(*) as itens, sum(total_brl) as subtotal 
    FROM public.referencias_custo_orcamento 
    WHERE workspace_id = '${wsId}' AND numero_orcamento = '16852'
    GROUP BY pagina 
    ORDER BY pagina;
  `);
  console.log("\nSubtotais conferidos por página:");
  subtotaisRes.forEach(s => {
    console.log(`  Página ${s.pagina}: ${s.itens} itens | R$ ${Number(s.subtotal).toFixed(2)}`);
  });

  // 3. Distribuição por status_pdv
  const statusRes = await runQuery(`
    SELECT status_pdv, count(*) as total 
    FROM public.referencias_custo_orcamento 
    WHERE workspace_id = '${wsId}' AND numero_orcamento = '16852'
    GROUP BY status_pdv;
  `);
  console.log("\nDistribuição por status_pdv:");
  statusRes.forEach(st => {
    console.log(`  ${st.status_pdv}: ${st.total}`);
  });

  // 4. Verificação de RLS
  const rlsRes = await runQuery(`
    SELECT rowsecurity 
    FROM pg_tables 
    WHERE tablename = 'referencias_custo_orcamento';
  `);
  console.log("\nRLS habilitado na tabela?", rlsRes[0]?.rowsecurity ? "SIM" : "NÃO");

  const policiesRes = await runQuery(`
    SELECT policyname, permissive, roles, cmd 
    FROM pg_policies 
    WHERE tablename = 'referencias_custo_orcamento';
  `);
  console.log("Políticas ativas:", policiesRes.map(p => p.policyname).join(', '));
}

main().catch(console.error);
