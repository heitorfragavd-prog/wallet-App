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
      }
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

async function main() {
  console.log("=== APLICANDO MIGRATION 98: FECHAMENTOS INTEGRADOS DOS FOLGUISTAS ===");
  const sql = fs.readFileSync('supabase/migrations/98_fechamentos_integrados_folguistas.sql', 'utf8');
  const res = await runQuery(sql);
  console.log("Resultado da execução:", JSON.stringify(res, null, 2));

  console.log("\n--- VERIFICAÇÃO 1: COLUNAS EM COLABORADORES ---");
  const colsColab = await runQuery(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'colaboradores' AND column_name IN ('telegram_user_id', 'telegram_username');
  `);
  console.log(JSON.stringify(colsColab, null, 2));

  console.log("\n--- VERIFICAÇÃO 2: COLUNAS EM FECHAMENTOS_CAIXA ---");
  const colsFech = await runQuery(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'fechamentos_caixa' AND column_name IN ('colaborador_id', 'escala_id', 'turno', 'origem_grupo_id', 'chave_operacional', 'anexos', 'divergencias', 'espelhado_em');
  `);
  console.log(JSON.stringify(colsFech, null, 2));
}

main().catch(console.error);
