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
  console.log("=== APLICANDO MIGRATION 97: UNIFICAR GRUPOS DE FECHAMENTO & HARDENING AUTOMACOES ===");
  const migrationSql = fs.readFileSync('supabase/migrations/97_unificar_grupos_fechamento_e_hardening_automacoes.sql', 'utf8');

  const result = await runQuery(migrationSql);
  console.log("Resultado da execução:", JSON.stringify(result, null, 2));

  console.log("\n--- VERIFICAÇÃO 1: GRUPOS ATIVOS EM TELEGRAM_GRUPOS_CONFIG ---");
  const verifyGrupos = await runQuery(`
    SELECT id, nome_grupo, tipo_grupo, chat_id, ativo, created_at
    FROM public.telegram_grupos_config
    WHERE workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c'
    ORDER BY created_at ASC;
  `);
  console.log(JSON.stringify(verifyGrupos, null, 2));

  console.log("\n--- VERIFICAÇÃO 2: FECHAMENTOS_CAIXA VINCULADOS AO GRUPO CANÔNICO ---");
  const verifyFechamentos = await runQuery(`
    SELECT id, chat_id, data_fechamento, grupo_id, status
    FROM public.fechamentos_caixa
    WHERE chat_id = -1004384150943;
  `);
  console.log(JSON.stringify(verifyFechamentos, null, 2));

  console.log("\n--- VERIFICAÇÃO 3: COLUNAS EM ESCALAS_AUTOMACOES_LOG ---");
  const verifyCols = await runQuery(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'escalas_automacoes_log' AND column_name IN ('status_envio', 'telegram_message_id', 'api_response', 'tentativas', 'erro_detalhes');
  `);
  console.log(JSON.stringify(verifyCols, null, 2));

  console.log("\n--- VERIFICAÇÃO 4: JOBS AGENDADOS NO PG_CRON ---");
  const verifyCron = await runQuery(`
    SELECT jobid, schedule, command, active
    FROM cron.job
    WHERE jobname IN ('folguistas-consulta-segunda', 'folguistas-confirmacao-sexta');
  `);
  console.log(JSON.stringify(verifyCron, null, 2));
}

main().catch(console.error);
