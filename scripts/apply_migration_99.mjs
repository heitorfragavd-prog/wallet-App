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
  console.log("=== APLICANDO MIGRATION 99: INTEGRIDADE FINANCEIRA E SEGURANÇA (ETAPA 3D.1) ===");
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '99_fechamentos_integridade_e_seguranca.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const res = await runQuery(sql);
  console.log("Resultado da execução:", JSON.stringify(res, null, 2));

  console.log("\n--- VERIFICAÇÃO 1: COLUNAS EM FECHAMENTOS_CAIXA ---");
  const colsFech = await runQuery(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'fechamentos_caixa' AND column_name IN ('identidade_pendente', 'status_espelhamento', 'erro_espelhamento', 'tipo_conferencia');
  `);
  console.log(JSON.stringify(colsFech, null, 2));

  console.log("\n--- VERIFICAÇÃO 2: ÍNDICE ÚNICO DE CHAVE OPERACIONAL ---");
  const idxUniq = await runQuery(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'fechamentos_caixa' AND indexname = 'idx_fechamentos_caixa_chave_operacional_uniq';
  `);
  console.log(JSON.stringify(idxUniq, null, 2));

  console.log("\n--- VERIFICAÇÃO 3: POLÍTICAS RLS ---");
  const rls = await runQuery(`
    SELECT policyname, qual
    FROM pg_policies
    WHERE tablename = 'fechamentos_caixa';
  `);
  console.log(JSON.stringify(rls, null, 2));
}

main().catch(console.error);
