import fs from 'fs';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const PROJECT_REF = 'hdeguzxkdvebdrrutbnx';

async function check() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: "SELECT id, nome_grupo, tipo_grupo, chat_id, ativo, acoes_permitidas, funcionalidades_autorizadas FROM public.telegram_grupos_config;"
    })
  });
  console.log(await res.json());
}

check();
