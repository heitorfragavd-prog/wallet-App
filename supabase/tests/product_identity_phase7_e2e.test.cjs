/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * WALLET APP — Product Identity Fase 7
 * Suíte de Testes em PostgreSQL Real (E2E Multi-Conexão)
 * Arquivo: supabase/tests/product_identity_phase7_e2e.test.cjs
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DB_CONFIG = {
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 54329),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "postgres",
};

async function runTests() {
  if (process.env.WALLET_ALLOW_DESTRUCTIVE_PG_TESTS !== "1") {
    console.error(
      "ERRO DE SEGURANÇA: Este harness executa operações destrutivas. Defina WALLET_ALLOW_DESTRUCTIVE_PG_TESTS=1 para prosseguir."
    );
    process.exit(1);
  }
  console.log("=== [FASE 7] INICIANDO BATERIA DE TESTES EM POSTGRESQL REAL ===");
  console.log(`Conectando em ${DB_CONFIG.host}:${DB_CONFIG.port} como ${DB_CONFIG.user}...`);

  const adminClient = new Client(DB_CONFIG);
  await adminClient.connect();

  const userA = "11111111-0000-0000-0000-000000000001";
  const wsA = "11111111-0000-0000-0000-000000000002";
  const userB = "22222222-0000-0000-0000-000000000001";
  const wsB = "22222222-0000-0000-0000-000000000002";

  // 1. Setup base schema & RPC
  await adminClient.query(`
    CREATE TABLE IF NOT EXISTS public.workspaces (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'PF',
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.produtos_eyemobile (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      eyemobile_id TEXT,
      codigo TEXT,
      descricao TEXT,
      preco_venda DECIMAL(12,2),
      custo_atual DECIMAL(12,4),
      estoque_atual DECIMAL(10,3),
      ultima_atualizacao_custo TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.historico_custo_produto (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      produto_eyemobile_uuid UUID REFERENCES public.produtos_eyemobile(id) ON DELETE CASCADE,
      produto_codigo TEXT,
      produto_descricao TEXT,
      fornecedor TEXT,
      custo_unitario DECIMAL(12,4),
      quantidade DECIMAL(10,3),
      nf_id UUID,
      data_compra DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.notas_fiscais_compra (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      fornecedor TEXT,
      cnpj_fornecedor TEXT,
      status TEXT DEFAULT 'pendente',
      data_emissao DATE,
      data_entrada DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.nf_itens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nf_id UUID NOT NULL REFERENCES public.notas_fiscais_compra(id) ON DELETE CASCADE,
      codigo_produto TEXT,
      descricao TEXT,
      unidade TEXT,
      quantidade NUMERIC,
      valor_unitario NUMERIC,
      status_estoque TEXT DEFAULT 'pendente',
      produto_eyemobile_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.produto_equivalencias (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      cnpj_fornecedor_normalizado TEXT,
      codigo_produto_fornecedor TEXT,
      produto_eyemobile_uuid UUID REFERENCES public.produtos_eyemobile(id) ON DELETE CASCADE,
      fator_conversao NUMERIC,
      confirmado_por_usuario BOOLEAN DEFAULT false,
      origem_matching TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);

  const rpcPath = path.resolve(__dirname, "../migrations/20260910120000_aplicar_item_nf_estoque_custo.sql");
  if (fs.existsSync(rpcPath)) {
    const rpcSql = fs.readFileSync(rpcPath, "utf8");
    await adminClient.query(rpcSql);
  }

  async function cleanAndSeed() {
    await adminClient.query(`
      DELETE FROM public.historico_custo_produto;
      DELETE FROM public.nf_itens;
      DELETE FROM public.notas_fiscais_compra;
      DELETE FROM public.produto_equivalencias;
      DELETE FROM public.produtos_eyemobile;
      DELETE FROM public.workspaces;

      INSERT INTO public.workspaces (id, user_id, nome)
      VALUES 
        ('${wsA}', '${userA}', 'Workspace Tenant A'),
        ('${wsB}', '${userB}', 'Workspace Tenant B')
      ON CONFLICT DO NOTHING;
    `);
  }

  await cleanAndSeed();

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      testsFailed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Teste 1: Permissões de EXECUTE (P0)
  // -------------------------------------------------------------------------
  console.log("\n[1] Permissões P0: anon e authenticated bloqueados, service_role permitido");
  try {
    const dummyId = "00000000-0000-0000-0000-000000000010";
    await adminClient.query("SET ROLE anon;");
    let anonBlocked = false;
    try {
      await adminClient.query(`
        SELECT public.aplicar_item_nf_estoque_custo(
          '${dummyId}', '${userA}', '${wsA}', '${dummyId}', '${dummyId}', 10, 5.0, 1
        );
      `);
    } catch (err) {
      anonBlocked = err.code === "42501";
    }
    assert(anonBlocked, "Role 'anon' tem permissão negada (42501) para executar a RPC");

    await adminClient.query("SET ROLE authenticated;");
    let authBlocked = false;
    try {
      await adminClient.query(`
        SELECT public.aplicar_item_nf_estoque_custo(
          '${dummyId}', '${userA}', '${wsA}', '${dummyId}', '${dummyId}', 10, 5.0, 1
        );
      `);
    } catch (err) {
      authBlocked = err.code === "42501";
    }
    assert(authBlocked, "Role 'authenticated' tem permissão negada (42501) para executar a RPC");

    await adminClient.query("SET ROLE service_role;");
    let serviceAllowed = false;
    try {
      const res = await adminClient.query(`
        SELECT public.aplicar_item_nf_estoque_custo(
          '${dummyId}', '${userA}', '${wsA}', '${dummyId}', '${dummyId}', 10, 5.0, 1
        );
      `);
      serviceAllowed = res.rows.length > 0;
    } catch (_err) {
      serviceAllowed = false;
    }
    assert(serviceAllowed, "Role 'service_role' possui permissão de EXECUTE concedida");
  } finally {
    await adminClient.query("RESET ROLE;");
  }

  // -------------------------------------------------------------------------
  // Teste 2: Concorrência Real com 2 Conexões Simultâneas (Double Click Locking)
  // -------------------------------------------------------------------------
  console.log("\n[2] Concorrência Real: 2 conexões simultâneas via FOR UPDATE");
  await cleanAndSeed();

  const prodId = "aaaaaaaa-1111-0000-0000-000000000001";
  const nfId = "bbbbbbbb-1111-0000-0000-000000000001";
  const itemId = "cccccccc-1111-0000-0000-000000000001";
  const equivId = "dddddddd-1111-0000-0000-000000000001";

  await adminClient.query(`
    INSERT INTO public.produtos_eyemobile (id, user_id, workspace_id, eyemobile_id, codigo, descricao, estoque_atual, custo_atual)
    VALUES ('${prodId}', '${userA}', '${wsA}', 'EM-PROD-100', 'REF-100', 'Refrigerante Cola 350ml', 10.000, 3.50);

    INSERT INTO public.notas_fiscais_compra (id, user_id, workspace_id, fornecedor, cnpj_fornecedor, status)
    VALUES ('${nfId}', '${userA}', '${wsA}', 'Distribuidora Bebidas SA', '12.345.678/0001-90', 'pendente');

    INSERT INTO public.nf_itens (id, nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${itemId}', '${nfId}', 'FORN-COLA', 'Refrigerante Cola Caixa', 'CX', 5, 24.00, 'pendente');

    INSERT INTO public.produto_equivalencias (id, user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor, produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario, origem_matching)
    VALUES ('${equivId}', '${userA}', '${wsA}', '12345678000190', 'FORN-COLA', '${prodId}', 12.0, true, 'manual');
  `);

  const client1 = new Client(DB_CONFIG);
  const client2 = new Client(DB_CONFIG);
  await client1.connect();
  await client2.connect();
  await client1.query("SET ROLE service_role;");
  await client2.query("SET ROLE service_role;");

  const rpcQuery = `
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemId}', '${userA}', '${wsA}', '${equivId}', '${prodId}', 60, 2.00, 12.0
    ) as result;
  `;

  const [res1, res2] = await Promise.all([
    client1.query(rpcQuery),
    client2.query(rpcQuery),
  ]);

  await client1.end();
  await client2.end();

  const r1 = res1.rows[0].result;
  const r2 = res2.rows[0].result;

  const oneProcessed = (r1.code === "processed" && r2.code === "already_processed") ||
                       (r2.code === "processed" && r1.code === "already_processed");
  assert(oneProcessed, "Exatamente uma conexão processou e a outra recebeu already_processed");

  const prodCheck = (await adminClient.query(`SELECT estoque_atual, custo_atual FROM public.produtos_eyemobile WHERE id = '${prodId}'`)).rows[0];
  assert(Number(prodCheck.estoque_atual) === 70, `Estoque final é 70.000 (10 + 60, sem duplicação). Atual: ${prodCheck.estoque_atual}`);
  assert(Number(prodCheck.custo_atual) === 2.00, `Custo unitário convertido atualizado para 2.00`);

  const histCheck = (await adminClient.query(`SELECT COUNT(*)::int as count FROM public.historico_custo_produto WHERE nf_id = '${nfId}'`)).rows[0];
  assert(histCheck.count === 1, "Exatamente um registro gravado em historico_custo_produto");

  // -------------------------------------------------------------------------
  // Teste 3: Idempotência com status legado 'atualizado'
  // -------------------------------------------------------------------------
  console.log("\n[3] Idempotência Física com status legado 'atualizado'");
  const legacyItemId = "cccccccc-2222-0000-0000-000000000002";
  await adminClient.query(`
    INSERT INTO public.nf_itens (id, nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${legacyItemId}', '${nfId}', 'FORN-COLA', 'Refrigerante Cola Caixa', 'CX', 5, 24.00, 'atualizado');
  `);

  const legacyRes = await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${legacyItemId}', '${userA}', '${wsA}', '${equivId}', '${prodId}', 60, 2.00, 12.0
    ) as result;
  `);
  assert(legacyRes.rows[0].result.code === "already_processed", "Status legado 'atualizado' é tratado como already_processed sem mutação");

  const prodCheckLegacy = (await adminClient.query(`SELECT estoque_atual FROM public.produtos_eyemobile WHERE id = '${prodId}'`)).rows[0];
  assert(Number(prodCheckLegacy.estoque_atual) === 70, "Estoque permaneceu em 70 (zero incremento em chamada repetida)");

  // -------------------------------------------------------------------------
  // Teste 4: Isolamento Multi-Tenant Estrito
  // -------------------------------------------------------------------------
  const itemTenantA = "cccccccc-9999-0000-0000-000000000009";
  await adminClient.query(`
    INSERT INTO public.nf_itens (id, nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${itemTenantA}', '${nfId}', 'FORN-COLA', 'Item Tenant A', 'CX', 1, 10.00, 'pendente');
  `);

  const crossRes = await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemTenantA}', '${userB}', '${wsB}', '${equivId}', '${prodId}', 60, 2.00, 12.0
    ) as result;
  `);
  assert(crossRes.rows[0].result.code === "tenant_mismatch", "Cross-tenant em item_id rejeitado como tenant_mismatch");

  const prodB = "bbbbbbbb-2222-0000-0000-000000000002";
  const nfB = "bbbbbbbb-2222-0000-0000-000000000003";
  const itemB = "bbbbbbbb-2222-0000-0000-000000000004";

  await adminClient.query(`
    INSERT INTO public.produtos_eyemobile (id, user_id, workspace_id, eyemobile_id, codigo, descricao, estoque_atual, custo_atual)
    VALUES ('${prodB}', '${userB}', '${wsB}', 'EM-PROD-B', 'REF-B', 'Produto Tenant B', 5.0, 10.0);

    INSERT INTO public.notas_fiscais_compra (id, user_id, workspace_id, fornecedor, cnpj_fornecedor, status)
    VALUES ('${nfB}', '${userB}', '${wsB}', 'Distribuidora Bebidas SA', '12.345.678/0001-90', 'pendente');

    INSERT INTO public.nf_itens (id, nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${itemB}', '${nfB}', 'FORN-COLA', 'Item Tenant B', 'CX', 1, 10.00, 'pendente');
  `);

  const crossEquivRes = await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemB}', '${userB}', '${wsB}', '${equivId}', '${prodB}', 12, 10.00, 12.0
    ) as result;
  `);
  assert(crossEquivRes.rows[0].result.code === "equivalence_not_found", "Equivalência de outro tenant não é encontrada e falha fechado");

  const prodACheck = (await adminClient.query(`SELECT estoque_atual FROM public.produtos_eyemobile WHERE id = '${prodId}'`)).rows[0];
  assert(Number(prodACheck.estoque_atual) === 70, "Estoque de Tenant A permanece estritamente isolado e inalterado");

  // -------------------------------------------------------------------------
  // Teste 5: Anti-TOCTOU — Mudança Concorrente de Fator
  // -------------------------------------------------------------------------
  console.log("\n[5] Anti-TOCTOU: Mudança concorrente de fator na equivalência");
  const itemTOCTOU = "cccccccc-3333-0000-0000-000000000003";
  await adminClient.query(`
    INSERT INTO public.nf_itens (id, nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${itemTOCTOU}', '${nfId}', 'FORN-COLA', 'Item TOCTOU', 'CX', 2, 24.00, 'pendente');
  `);

  const toctouRes = await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemTOCTOU}', '${userA}', '${wsA}', '${equivId}', '${prodId}', 24, 1.00, 24.0
    ) as result;
  `);
  assert(toctouRes.rows[0].result.code === "equivalence_changed", "Divergência entre fator esperado e fator real em banco rejeitada como equivalence_changed");

  // -------------------------------------------------------------------------
  // Teste 6: Rollback & Atomicidade sob Parâmetros Inválidos
  // -------------------------------------------------------------------------
  console.log("\n[6] Atomicidade e Rollback: Quantidade negativa ou nula rejeita sem mutações parciais");
  const itemInvalid = "cccccccc-4444-0000-0000-000000000004";
  await adminClient.query(`
    INSERT INTO public.nf_itens (id, nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${itemInvalid}', '${nfId}', 'FORN-COLA', 'Item Invalido', 'CX', 1, 24.00, 'pendente');
  `);

  const invalidRes = await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemInvalid}', '${userA}', '${wsA}', '${equivId}', '${prodId}', -10, 2.00, 12.0
    ) as result;
  `);
  assert(invalidRes.rows[0].result.code === "invalid_parameters", "Quantidade negativa rejeitada imediatamente");

  const itemCheck = (await adminClient.query(`SELECT status_estoque FROM public.nf_itens WHERE id = '${itemInvalid}'`)).rows[0];
  assert(itemCheck.status_estoque === "pendente", "Item da NF manteve status 'pendente' intacto após erro");

  // -------------------------------------------------------------------------
  // Teste 7: Histórico Canônico Vinculado por UUID
  // -------------------------------------------------------------------------
  console.log("\n[7] Auditoria de Histórico: consulta por produto_eyemobile_uuid");
  const historyQuery = await adminClient.query(`
    SELECT produto_eyemobile_uuid, custo_unitario, fornecedor, workspace_id
    FROM public.historico_custo_produto
    WHERE produto_eyemobile_uuid = '${prodId}'
      AND workspace_id = '${wsA}'
  `);
  assert(historyQuery.rows.length === 1, "Histórico encontrado via produto_eyemobile_uuid");
  assert(historyQuery.rows[0].produto_eyemobile_uuid === prodId, "UUID canônico gravado no histórico é idêntico ao produto canônico");
  assert(historyQuery.rows[0].workspace_id === wsA, "Histórico devidamente restrito ao tenant correto");

  await adminClient.end();

  console.log(`\n=== SUÍTE POSTGRESQL REAL CONCLUÍDA COM SUCESSO: ${testsPassed} PASSOU, ${testsFailed} FALHOU ===\n`);
  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR NA SUÍTE POSTGRESQL REAL:", err);
  process.exit(1);
});
