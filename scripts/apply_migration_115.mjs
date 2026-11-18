import fs from 'fs';
import path from 'path';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const PROJECT_REF = 'hdeguzxkdvebdrrutbnx';

async function applyMigration() {
  const migrationPath = path.resolve('supabase/migrations/115_compras_seguranca_pedidos_e_auditoria.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log("Aplicando Migration 115 no Supabase...");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao aplicar migration 115: ${txt}`);
  }

  const result = await res.json();
  console.log("Migration 115 aplicada com sucesso!", result);

  // Consulta verificação pós-migration
  const checkRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        SELECT 
          (SELECT count(*) FROM information_schema.columns WHERE table_name = 'compras_pedidos_itens' AND column_name = 'ajuste_manual') as has_ajuste_manual,
          (SELECT count(*) FROM information_schema.columns WHERE table_name = 'compras_config' AND column_name = 'token_vinculacao_loja') as has_token_loja,
          (SELECT count(*) FROM pg_proc WHERE proname = 'registrar_item_conferencia_estoque') as rpc_exists;
      `
    })
  });
  console.log("Verificação de colunas e RPC 115:", await checkRes.json());
}

applyMigration().catch(console.error);
