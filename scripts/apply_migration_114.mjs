import fs from 'fs';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const PROJECT_REF = 'hdeguzxkdvebdrrutbnx';

async function applyMigration() {
  const sql = fs.readFileSync('C:/Users/Heitor/OneDrive/Documentos/Dev/wallet-worktrees/etapa4d1-a-catalogo-nlp/supabase/migrations/113_compras_catalogo_e_validacao_referencias.sql', 'utf8');

  console.log("Aplicando Migration 113 no Supabase...");
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
    throw new Error(`Falha ao aplicar migration 113: ${txt}`);
  }

  const result = await res.json();
  console.log("Migration 113 aplicada com sucesso!", result);

  // Consulta verificação pós-migration
  const checkRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: "SELECT fornecedor_nome, validacao_status, count(*) FROM public.compras_produtos_referencia GROUP BY fornecedor_nome, validacao_status ORDER BY fornecedor_nome, validacao_status;"
    })
  });
  console.log("Status de validação por fornecedor:", await checkRes.json());
}

applyMigration().catch(console.error);
