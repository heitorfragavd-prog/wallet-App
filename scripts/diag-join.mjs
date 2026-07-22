import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

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

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function test(label, fn) {
  console.log(`\n=== ${label} ===`);
  const { data, error } = await fn();
  if (error) {
    console.log("ERRO:", error.message, "| code:", error.code);
  } else {
    console.log("OK. rows:", data?.length || 0);
    console.log(JSON.stringify(data?.slice(0, 2), null, 2));
  }
}

await test("JOIN pagamentos_dividas -> dividas", () =>
  supabase
    .from("pagamentos_dividas")
    .select("valor, data_pagamento, dividas (descricao, credor, categoria_id, parcelas)")
    .limit(3)
);

await test("dividas com parcelas_pagas > 0", () =>
  supabase.from("dividas").select("descricao, parcelas_pagas, parcelas").gt("parcelas_pagas", 0).limit(5)
);

await test("despesas like Pagamento dívida", () =>
  supabase.from("despesas").select("descricao, valor").like("descricao", "Pagamento dívida:%").limit(5)
);

await test("schema columns de despesas (limit 1)", () =>
  supabase.from("despesas").select("*").limit(1)
);
