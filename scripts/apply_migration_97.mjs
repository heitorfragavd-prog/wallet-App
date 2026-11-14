import fs from 'fs';
import path from 'path';

const projectRef = 'hdeguzxkdvebdrrutbnx';
const mcpTokenPath = 'C:\\Users\\Heitor\\.supabase\\mcp-token.txt';

if (!fs.existsSync(mcpTokenPath)) {
  console.error('Token MCP não encontrado em:', mcpTokenPath);
  process.exit(1);
}

const token = fs.readFileSync(mcpTokenPath, 'utf8').trim();

const migrationPath = path.resolve('supabase/migrations/97_workspace_whatsapp_integrations.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('Aplicando Migration 97 no projeto Supabase:', projectRef);

async function run() {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Erro ao executar migration 97:', res.status, errorText);
    process.exit(1);
  }

  const data = await res.json();
  console.log('Migration 97 aplicada com sucesso!', data);

  // Verificação da existência das tabelas criadas
  const verifyRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('workspace_whatsapp_integrations', 'whatsapp_usuarios_pareados', 'whatsapp_mensagens_processadas');`
    })
  });

  const verifyData = await verifyRes.json();
  console.log('Tabelas verificadas no Supabase:', verifyData);
}

run().catch((err) => {
  console.error('Falha geral:', err);
  process.exit(1);
});
