import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Carrega .env manualmente (sem dependências externas)
const env = {};
try {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch (e) {
  console.error("Erro ao ler .env:", e.message);
  process.exit(1);
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontrados no .env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  console.log("USER_ID:", userId || "(nenhum - não logado?)");
  if (!userId) {
    console.log(">> Sem usuário autenticado. O script roda como anon.");
    return;
  }

  // 1. Dívidas com parcelas pagas
  const { data: dividas, error: e1 } = await supabase
    .from("dividas")
    .select("id, descricao, credor, categoria_id, valor_total, parcelas, parcelas_pagas, data_vencimento")
    .eq("user_id", userId);
  console.log("\n=== DIVIDAS (" + (dividas?.length || 0) + ") ===");
  if (e1) console.log("ERRO dividas:", e1.message);
  for (const d of dividas || []) {
    console.log(
      `  [${d.parcelas_pagas}/${d.parcelas}] ${d.descricao} (${d.credor}) | valor=${d.valor_total} | venc=${d.data_vencimento} | cat=${d.categoria_id || "NULL"}`
    );
  }

  // 2. Pagamentos de dívidas
  const { data: pagamentos, error: e2 } = await supabase
    .from("pagamentos_dividas")
    .select("id, divida_id, valor, data_pagamento, metodo_pagamento, conta_id, observacoes")
    .eq("user_id", userId);
  console.log("\n=== PAGAMENTOS_DIVIDAS (" + (pagamentos?.length || 0) + ") ===");
  if (e2) console.log("ERRO pagamentos:", e2.message);
  for (const p of pagamentos || []) {
    console.log(`  R$ ${p.valor} | ${p.data_pagamento} | divida=${p.divida_id} | metodo=${p.metodo_pagamento || "NULL"}`);
  }

  // 3. Despesas cuja descrição sugere pagamento de dívida
  const { data: despesas, error: e3 } = await supabase
    .from("despesas")
    .select("id, descricao, valor, data, categoria_id")
    .eq("user_id", userId)
    .like("descricao", "Pagamento dívida:%");
  console.log("\n=== DESPESAS 'Pagamento dívida:%' (" + (despesas?.length || 0) + ") ===");
  if (e3) console.log("ERRO despesas:", e3.message);
  for (const d of despesas || []) {
    console.log(`  R$ ${d.valor} | ${d.data} | ${d.descricao} | cat=${d.categoria_id || "NULL"}`);
  }

  // 4. Teste do JOIN que a sync faz
  const { data: joinTest, error: e4 } = await supabase
    .from("pagamentos_dividas")
    .select("valor, data_pagamento, dividas (descricao, credor, categoria_id, parcelas)")
    .eq("user_id", userId)
    .limit(3);
  console.log("\n=== TESTE JOIN pagamentos->dividas (primeiros 3) ===");
  if (e4) console.log("ERRO JOIN:", e4.message);
  else console.log(JSON.stringify(joinTest, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
