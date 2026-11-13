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
  console.log("=== GATE 1: AUDITORIA REAL DA CENTRAL DE CONVERSAS E GRUPOS ===");

  // 1. Grupos cadastrados em telegram_grupos_config
  const grupos = await runQuery(`
    SELECT id, workspace_id, chat_id, nome_grupo, descricao, tipo_grupo, ativo, config, created_at, updated_at
    FROM public.telegram_grupos_config
    ORDER BY created_at ASC;
  `);
  console.log("\n--- TELEGRAM GRUPOS CONFIG ---");
  console.log(JSON.stringify(grupos, null, 2));

  // 2. Participantes por grupo
  const participantes = await runQuery(`
    SELECT gp.id, gp.grupo_id, gc.nome_grupo, gp.user_id, gp.role_no_grupo, gp.permissoes, gp.ativo, p.email, p.name
    FROM public.grupo_participantes gp
    JOIN public.telegram_grupos_config gc ON gc.id = gp.grupo_id
    LEFT JOIN public.profiles p ON p.id = gp.user_id
    ORDER BY gc.nome_grupo, gp.role_no_grupo;
  `);
  console.log("\n--- PARTICIPANTES POR GRUPO ---");
  console.log(JSON.stringify(participantes, null, 2));

  // 3. Conversas associadas aos grupos em wallet_ai_conversations
  const conversas = await runQuery(`
    SELECT c.id, c.workspace_id, c.grupo_id, gc.nome_grupo, c.title, c.is_group, c.is_shared, c.channel, c.external_chat_id, c.created_at,
           (SELECT count(*) FROM public.wallet_ai_messages cm WHERE cm.conversation_id = c.id) as total_mensagens
    FROM public.wallet_ai_conversations c
    LEFT JOIN public.telegram_grupos_config gc ON gc.id = c.grupo_id
    WHERE c.is_group = true OR c.grupo_id IS NOT NULL
    ORDER BY c.created_at ASC;
  `);
  console.log("\n--- CONVERSAS VINCULADAS ---");
  console.log(JSON.stringify(conversas, null, 2));

  // 4. Fechamentos de caixa existentes
  const fechamentos = await runQuery(`
    SELECT fc.id, fc.workspace_id, fc.grupo_id, gc.nome_grupo, fc.conversation_id, fc.data_fechamento, fc.status, fc.created_at, fc.observacao
    FROM public.fechamentos_caixa fc
    LEFT JOIN public.telegram_grupos_config gc ON gc.id = fc.grupo_id
    ORDER BY fc.created_at DESC
    LIMIT 20;
  `);
  console.log("\n--- FECHAMENTOS DE CAIXA ---");
  console.log(JSON.stringify(fechamentos, null, 2));

  // 5. Colaboradores existentes
  const colaboradores = await runQuery(`
    SELECT id, workspace_id, nome, cargo, status, tipo_contrato, data_admissao, created_at
    FROM public.colaboradores
    ORDER BY nome ASC;
  `);
  console.log("\n--- COLABORADORES ---");
  console.log(JSON.stringify(colaboradores, null, 2));

  // 6. Colaborador Escalas existentes
  const escalas = await runQuery(`
    SELECT *
    FROM public.colaborador_escalas
    LIMIT 20;
  `);
  console.log("\n--- COLABORADOR ESCALAS (AMOSTRA) ---");
  console.log(JSON.stringify(escalas, null, 2));
}

main().catch(console.error);

async function auditColaboradores() {
  const cols = await runQuery(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'colaboradores' 
    ORDER BY ordinal_position;
  `);
  console.log("\n--- COLABORADORES COLUNAS ---");
  console.log(JSON.stringify(cols, null, 2));

  const rows = await runQuery(`
    SELECT * FROM public.colaboradores LIMIT 10;
  `);
  console.log("\n--- COLABORADORES LINHAS ---");
  console.log(JSON.stringify(rows, null, 2));
}

auditColaboradores().catch(console.error);
