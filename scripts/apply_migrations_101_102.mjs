import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  console.log("=== APLICANDO MIGRATION 101: RPC ATOMICA E SEGURANCA ===");
  const path101 = path.join(__dirname, '..', 'supabase', 'migrations', '101_fechamentos_rpc_atomica_e_seguranca.sql');
  const sql101 = fs.readFileSync(path101, 'utf8');
  const res101 = await runQuery(sql101);
  console.log("Resultado Migration 101:", JSON.stringify(res101, null, 2));

  console.log("\n=== APLICANDO MIGRATION 102: ESCALAS MENSAIS E HORARIOS CRON ===");
  const path102 = path.join(__dirname, '..', 'supabase', 'migrations', '102_escalas_mensais_e_horarios_cron.sql');
  const sql102 = fs.readFileSync(path102, 'utf8');
  const res102 = await runQuery(sql102);
  console.log("Resultado Migration 102:", JSON.stringify(res102, null, 2));

  console.log("\n--- VERIFICAÇÃO 1: RPC REGISTRAR_ANEXO_FECHAMENTO_ATOMICO ---");
  const checkRpc = await runQuery(`
    SELECT proname, prosecdef, prosrc 
    FROM pg_proc 
    WHERE proname = 'registrar_anexo_fechamento_atomico';
  `);
  console.log("RPC Info:", JSON.stringify(checkRpc.map(r => ({ proname: r.proname, prosecdef: r.prosecdef })), null, 2));

  console.log("\n--- VERIFICAÇÃO 2: COLUNAS EM ESCALAS_CONFIG ---");
  const checkCols = await runQuery(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'escalas_config' 
      AND column_name IN ('ativo_mensal', 'escala_mensal_dia', 'escala_mensal_horario');
  `);
  console.log("Colunas escalas_config:", JSON.stringify(checkCols, null, 2));

  console.log("\n--- VERIFICAÇÃO 3: CRON JOBS CADASTRADOS ---");
  const checkCron = await runQuery(`
    SELECT jobid, jobname, schedule, command, active
    FROM cron.job
    WHERE jobname LIKE 'folguistas-%';
  `);
  console.log("Cron jobs:", JSON.stringify(checkCron, null, 2));
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
