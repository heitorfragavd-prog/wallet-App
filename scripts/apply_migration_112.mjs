import fs from 'fs';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const PROJECT_REF = 'hdeguzxkdvebdrrutbnx';

async function applyMigration() {
  const sql = fs.readFileSync('C:/Users/Heitor/OneDrive/Documentos/Dev/wallet-worktrees/etapa4d-b-telegram-compras/supabase/migrations/112_compras_produtos_referencia_oficiais.sql', 'utf8');

  console.log("Aplicando Migration 112 no Supabase...");
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
    throw new Error(`Falha ao aplicar migration 112: ${txt}`);
  }

  const result = await res.json();
  console.log("Migration 112 aplicada com sucesso!", result);

  // Consulta para verificar quantos produtos de referência foram inseridos
  const checkRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: "SELECT fornecedor_nome, count(*) FROM public.compras_produtos_referencia GROUP BY fornecedor_nome ORDER BY fornecedor_nome;" })
  });
  const checkData = await checkRes.json();
  console.log("Produtos de referência cadastrados por fornecedor:", checkData);
}

applyMigration().catch(console.error);
