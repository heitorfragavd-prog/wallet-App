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

async function main() {
  console.log("=== APLICANDO MIGRATION 93: GRUPO FOLGUISTAS ===");
  const migrationSql = fs.readFileSync('supabase/migrations/93_folguistas_grupo_central_conversas.sql', 'utf8');

  const result = await runQuery(migrationSql);
  console.log("Resultado da execução:", JSON.stringify(result, null, 2));

  // Verificação pós-aplicação
  const verify = await runQuery(`
    SELECT id, workspace_id, chat_id, nome_grupo, tipo_grupo, ativo, created_at
    FROM public.telegram_grupos_config
    WHERE tipo_grupo = 'folguistas';
  `);
  console.log("\n--- GRUPOS DE FOLGUISTAS CRIADOS ---");
  console.log(JSON.stringify(verify, null, 2));

  const convs = await runQuery(`
    SELECT id, workspace_id, grupo_id, title, agent_type, is_group, channel
    FROM public.wallet_ai_conversations
    WHERE grupo_id IN (SELECT id FROM public.telegram_grupos_config WHERE tipo_grupo = 'folguistas');
  `);
  console.log("\n--- CONVERSAS CRIADAS NA CENTRAL ---");
  console.log(JSON.stringify(convs, null, 2));

  const part = await runQuery(`
    SELECT id, grupo_id, workspace_id, user_id, role_no_grupo, permissoes, ativo
    FROM public.grupo_participantes
    WHERE grupo_id IN (SELECT id FROM public.telegram_grupos_config WHERE tipo_grupo = 'folguistas');
  `);
  console.log("\n--- PARTICIPANTES AUTORIZADOS ---");
  console.log(JSON.stringify(part, null, 2));
}

main().catch(console.error);
