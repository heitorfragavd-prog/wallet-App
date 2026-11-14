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
  console.log("=== APLICANDO MIGRATION 94: SCHEMA FOLGUISTAS & ESCALAS ===");
  const migrationSql = fs.readFileSync('supabase/migrations/94_folguistas_escalas_schema.sql', 'utf8');

  const result = await runQuery(migrationSql);
  console.log("Resultado da execução:", JSON.stringify(result, null, 2));

  // Verificação pós-aplicação
  const verifyCols = await runQuery(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'colaboradores' AND column_name IN ('turnos_preferidos', 'dias_disponiveis', 'avaliacao_nota');
  `);
  console.log("\n--- COLUNAS ADICIONADAS EM COLABORADORES ---");
  console.log(JSON.stringify(verifyCols, null, 2));

  const verifyTables = await runQuery(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('folguistas_disponibilidade', 'escalas_config');
  `);
  console.log("\n--- NOVAS TABELAS CRIADAS ---");
  console.log(JSON.stringify(verifyTables, null, 2));

  const verifyConfig = await runQuery(`
    SELECT workspace_id, min_horas_descanso, valor_diaria_padrao, horarios_turnos
    FROM public.escalas_config;
  `);
  console.log("\n--- CONFIGURAÇÕES PADRÃO SEEDADAS ---");
  console.log(JSON.stringify(verifyConfig, null, 2));
}

main().catch(console.error);
