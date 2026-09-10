/**
 * WALLET APP — Product Identity Fase 7
 * Suíte de Testes em PostgreSQL Real (E2E Multi-Conexão & Integridade Física)
 * Arquivo: supabase/tests/product_identity_phase7_e2e.test.cjs
 *
 * Cobertura FÍSICA no Banco com Migrations Reais:
 * - Aplicação de 20260909110000_produto_equivalencias_foundation.sql
 * - Aplicação de 20260910120000_aplicar_item_nf_estoque_custo.sql
 * - Provas de Constraints Físicas (DB-CONSTRAINT-A a E)
 * - Provas de Integridade Referencial ON DELETE RESTRICT (DB-DELETE-A)
 * - Provas de Triggers Cross-Tenant Reais (DB-TENANT-A e Historico)
 * - Provas de Foreign Keys Estritas (DB-TENANT-B)
 * - Concorrência Real com 2 conexões simultâneas via FOR UPDATE
 * - Idempotência Física (processado e legado atualizado)
 * - Isolamento Multi-Tenant estrito na RPC
 * - Anti-TOCTOU de fator de conversão
 * - Histórico de Custo com UUID Canônico
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function resolvePgHost() {
  if (process.env.PGHOST) return process.env.PGHOST;
  try {
    const wslIp = execSync("wsl -d Ubuntu -e hostname -I", { encoding: "utf8" }).trim().split(" ")[0];
    if (wslIp) return wslIp;
  } catch (_e) {}
  return "127.0.0.1";
}

function isLocalOrLoopback(host) {
  if (!host) return false;
  const h = host.toLowerCase().trim();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  if (/^127\./.test(h) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  return false;
}

const DB_CONFIG = {
  host: resolvePgHost(),
  port: Number(process.env.PGPORT || 54329),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "postgres",
};

async function runRealPgTests() {
  if (process.env.WALLET_ALLOW_DESTRUCTIVE_PG_TESTS !== "1" || process.env.WALLET_TEST_DB_CONFIRMED !== "1") {
    console.error(
      "ERRO DE SEGURANÇA: Este harness executa operações destrutivas. Defina WALLET_ALLOW_DESTRUCTIVE_PG_TESTS=1 E WALLET_TEST_DB_CONFIRMED=1 para prosseguir."
    );
    process.exit(1);
  }

  if (!isLocalOrLoopback(DB_CONFIG.host)) {
    console.error(`ERRO DE SEGURANÇA: Host '${DB_CONFIG.host}' não é loopback/local isolado. Abortando imediatamente.`);
    process.exit(1);
  }

  console.log("=== [FASE 7] INICIANDO SUÍTE FÍSICA EM POSTGRESQL REAL ===");
  const adminClient = new Client(DB_CONFIG);
  await adminClient.connect();

  const serverInfo = (await adminClient.query("SELECT current_database(), version();")).rows[0];
  console.log(`Conectado com sucesso em ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`Database: ${serverInfo.current_database}`);
  console.log(`Versão: ${serverInfo.version}`);

  const userA = "11111111-0000-0000-0000-000000000001";
  const wsA = "11111111-0000-0000-0000-000000000002";
  const userB = "22222222-0000-0000-0000-000000000001";
  const wsB = "22222222-0000-0000-0000-000000000002";

  // -------------------------------------------------------------------------
  // 1. BOOTSTRAP LIMPO COM PRÉ-REQUISITOS MÍNIMOS E MIGRATIONS REAIS
  // -------------------------------------------------------------------------
  console.log("\n[Bootstrap] Aplicando pré-requisitos mínimos e migrations reais das Fases 1 e 4...");

  await adminClient.query(`
    DROP TRIGGER IF EXISTS trg_validar_produto_equivalencia_tenant ON public.produto_equivalencias CASCADE;
    DROP TRIGGER IF EXISTS trg_validar_historico_custo_produto_tenant ON public.historico_custo_produto CASCADE;
    DROP TABLE IF EXISTS public.produto_equivalencias CASCADE;
    DROP TABLE IF EXISTS public.historico_custo_produto CASCADE;
    DROP TABLE IF EXISTS public.nf_itens CASCADE;
    DROP TABLE IF EXISTS public.notas_fiscais_compra CASCADE;
    DROP TABLE IF EXISTS public.produtos_eyemobile CASCADE;
    DROP TABLE IF EXISTS public.workspaces CASCADE;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT
    );

    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID AS $$
    BEGIN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION public.tem_acesso_workspace(ws_id UUID)
    RETURNS BOOLEAN AS $$
    BEGIN
      RETURN true;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE TABLE public.workspaces (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'PF',
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.produtos_eyemobile (
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

    CREATE TABLE public.historico_custo_produto (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      produto_codigo TEXT,
      produto_descricao TEXT,
      fornecedor TEXT,
      custo_unitario DECIMAL(12,4),
      quantidade DECIMAL(10,3),
      nf_id UUID,
      data_compra DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE public.notas_fiscais_compra (
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

    CREATE TABLE public.nf_itens (
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

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
    END $$;

    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
  `);

  // Executa as migrations REAIS do repositório
  const mig1Path = path.resolve(__dirname, "../migrations/20260909110000_produto_equivalencias_foundation.sql");
  const mig1Sql = fs.readFileSync(mig1Path, "utf8");
  await adminClient.query(mig1Sql);

  const mig2Path = path.resolve(__dirname, "../migrations/20260910120000_aplicar_item_nf_estoque_custo.sql");
  const mig2Sql = fs.readFileSync(mig2Path, "utf8");
  await adminClient.query(mig2Sql);

  await adminClient.query(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
  `);

  console.log("  ✓ Migrations reais 20260909110000 e 20260910120000 aplicadas com sucesso!");

  let assertionsPassed = 0;
  let casesPassed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`    ✓ ${message}`);
      assertionsPassed++;
    } else {
      console.error(`    ✗ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Helper para semear tenants base
  await adminClient.query(`
    INSERT INTO auth.users (id, email) VALUES ('${userA}', 'userA@test.com'), ('${userB}', 'userB@test.com') ON CONFLICT DO NOTHING;
    INSERT INTO public.workspaces (id, user_id, nome) VALUES ('${wsA}', '${userA}', 'Workspace A'), ('${wsB}', '${userB}', 'Workspace B') ON CONFLICT DO NOTHING;
  `);

  // -------------------------------------------------------------------------
  // CASO 1: DB-CONSTRAINT-A & B (Fator de Conversão > 0)
  // -------------------------------------------------------------------------
  console.log("\n[Caso 1] DB-CONSTRAINT-A & B: fator_conversao > 0 obrigatório");
  const prodA1 = (await adminClient.query(`
    INSERT INTO public.produtos_eyemobile (user_id, workspace_id, eyemobile_id, codigo, descricao, estoque_atual, custo_atual)
    VALUES ('${userA}', '${wsA}', 'EM-A1', 'COD-A1', 'Produto Teste A1', 10, 5.0)
    RETURNING id;
  `)).rows[0].id;

  let zeroFactorBlocked = false;
  try {
    await adminClient.query(`
      INSERT INTO public.produto_equivalencias (
        user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES ('${userA}', '${wsA}', '12345678000190', 'FORN-ZERO', '${prodA1}', 0, true);
    `);
  } catch (err) {
    zeroFactorBlocked = err.code === "23514" && err.constraint === "chk_produto_equivalencias_fator_positivo";
  }
  assert(zeroFactorBlocked, "DB-CONSTRAINT-A: fator_conversao = 0 rejeitado pela constraint real chk_produto_equivalencias_fator_positivo");

  let negFactorBlocked = false;
  try {
    await adminClient.query(`
      INSERT INTO public.produto_equivalencias (
        user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES ('${userA}', '${wsA}', '12345678000190', 'FORN-NEG', '${prodA1}', -2.5, true);
    `);
  } catch (err) {
    negFactorBlocked = err.code === "23514" && err.constraint === "chk_produto_equivalencias_fator_positivo";
  }
  assert(negFactorBlocked, "DB-CONSTRAINT-B: fator_conversao < 0 rejeitado pela constraint real chk_produto_equivalencias_fator_positivo");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 2: DB-CONSTRAINT-C (CNPJ Apenas Dígitos na Coluna Normalizada)
  // -------------------------------------------------------------------------
  console.log("\n[Caso 2] DB-CONSTRAINT-C: cnpj_fornecedor_normalizado deve conter apenas dígitos");
  let cnpjNonDigitsBlocked = false;
  try {
    await adminClient.query(`
      INSERT INTO public.produto_equivalencias (
        user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES ('${userA}', '${wsA}', '12.345.678/0001-90', 'FORN-CNPJ', '${prodA1}', 1, true);
    `);
  } catch (err) {
    cnpjNonDigitsBlocked = err.code === "23514" && err.constraint === "chk_produto_equivalencias_cnpj_digitos";
  }
  assert(cnpjNonDigitsBlocked, "DB-CONSTRAINT-C: CNPJ com pontuação/letras rejeitado por chk_produto_equivalencias_cnpj_digitos");

  const cnpjCleanRes = await adminClient.query(`
    INSERT INTO public.produto_equivalencias (
      user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
      produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
    ) VALUES ('${userA}', '${wsA}', '12345678000190', 'FORN-OK-1', '${prodA1}', 1, true)
    RETURNING id;
  `);
  assert(cnpjCleanRes.rows.length === 1, "DB-CONSTRAINT-C: CNPJ exclusivamente numérico inserido com sucesso");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 3: DB-CONSTRAINT-D (Código do Fornecedor Não Vazio)
  // -------------------------------------------------------------------------
  console.log("\n[Caso 3] DB-CONSTRAINT-D: codigo_produto_fornecedor não vazio");
  let emptyCodeBlocked = false;
  try {
    await adminClient.query(`
      INSERT INTO public.produto_equivalencias (
        user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES ('${userA}', '${wsA}', '12345678000190', '', '${prodA1}', 1, true);
    `);
  } catch (err) {
    emptyCodeBlocked = err.code === "23514" && err.constraint === "chk_produto_equivalencias_codigo_fornecedor_not_empty";
  }
  assert(emptyCodeBlocked, "DB-CONSTRAINT-D: codigo_produto_fornecedor vazio ('') rejeitado");

  let whitespaceCodeBlocked = false;
  try {
    await adminClient.query(`
      INSERT INTO public.produto_equivalencias (
        user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES ('${userA}', '${wsA}', '12345678000190', '    ', '${prodA1}', 1, true);
    `);
  } catch (err) {
    whitespaceCodeBlocked = err.code === "23514" && err.constraint === "chk_produto_equivalencias_codigo_fornecedor_not_empty";
  }
  assert(whitespaceCodeBlocked, "DB-CONSTRAINT-D: codigo_produto_fornecedor contendo apenas espaços ('   ') rejeitado");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 4: DB-CONSTRAINT-E (Unicidade por Workspace + CNPJ + Código Fornecedor)
  // -------------------------------------------------------------------------
  console.log("\n[Caso 4] DB-CONSTRAINT-E: constraint UNIQUE (workspace_id, cnpj, codigo_produto)");
  let duplicateBlocked = false;
  try {
    await adminClient.query(`
      INSERT INTO public.produto_equivalencias (
        user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES ('${userA}', '${wsA}', '12345678000190', 'FORN-OK-1', '${prodA1}', 2, true);
    `);
  } catch (err) {
    duplicateBlocked = err.code === "23505" && err.constraint === "unq_produto_equivalencia_fornecedor";
  }
  assert(duplicateBlocked, "DB-CONSTRAINT-E: inserção duplicada para mesmo workspace/cnpj/código rejeitada com erro 23505");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 5: DB-TENANT-A & B (Trigger Cross-Tenant e Foreign Key)
  // -------------------------------------------------------------------------
  console.log("\n[Caso 5] DB-TENANT-A & B: trigger validar_produto_equivalencia_tenant e foreign keys");
  let crossTenantEquivBlocked = false;
  try {
    // Tenant B tenta apontar para o produto prodA1 pertencente ao Tenant A
    await adminClient.query(`
      INSERT INTO public.produto_equivalencias (
        user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES ('${userB}', '${wsB}', '99888777000166', 'CROSS-TENANT-SKU', '${prodA1}', 1, true);
    `);
  } catch (err) {
    crossTenantEquivBlocked = err.message.includes("Workspace mismatch") || err.message.includes("User mismatch");
  }
  assert(crossTenantEquivBlocked, "DB-TENANT-A: trigger real validar_produto_equivalencia_tenant rejeita produto de outro tenant");

  let nonExistentProdBlocked = false;
  try {
    const fakeUuid = "00000000-0000-0000-0000-000000000999";
    await adminClient.query(`
      INSERT INTO public.produto_equivalencias (
        user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES ('${userA}', '${wsA}', '99888777000166', 'NON-EXISTENT', '${fakeUuid}', 1, true);
    `);
  } catch (err) {
    nonExistentProdBlocked = err.code === "23503" || err.message.includes("não encontrado em public.produtos_eyemobile");
  }
  assert(nonExistentProdBlocked, "DB-TENANT-B: produto_eyemobile_uuid inexistente rejeitado pelo banco (trigger / FK)");

  let crossTenantHistBlocked = false;
  try {
    // Tentativa de inserir em historico_custo_produto para workspace B com produto de A
    await adminClient.query(`
      INSERT INTO public.historico_custo_produto (
        user_id, workspace_id, produto_eyemobile_uuid, custo_unitario, quantidade
      ) VALUES ('${userB}', '${wsB}', '${prodA1}', 15.0, 10);
    `);
  } catch (err) {
    crossTenantHistBlocked = err.message.includes("Workspace mismatch") || err.message.includes("User mismatch");
  }
  assert(crossTenantHistBlocked, "Trigger real validar_historico_custo_produto_tenant rejeita produto cross-tenant no histórico");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 6: DB-DELETE-A (Integridade Referencial ON DELETE RESTRICT)
  // -------------------------------------------------------------------------
  console.log("\n[Caso 6] DB-DELETE-A: ON DELETE RESTRICT em produtos_eyemobile referenciado");
  let deleteBlocked = false;
  try {
    await adminClient.query(`DELETE FROM public.produtos_eyemobile WHERE id = '${prodA1}';`);
  } catch (err) {
    deleteBlocked = (err.code === "23001" || err.code === "23503") && err.constraint === "produto_equivalencias_produto_eyemobile_uuid_fkey";
  }
  assert(deleteBlocked, "DB-DELETE-A: produto referenciado por produto_equivalencias não pode ser excluído (ON DELETE RESTRICT 23001/23503)");

  const prodCheck = (await adminClient.query(`SELECT id FROM public.produtos_eyemobile WHERE id = '${prodA1}';`)).rows;
  assert(prodCheck.length === 1, "DB-DELETE-A: produto permanece íntegro no banco de dados após tentativa de deleção");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 7: Concorrência Double-Click na RPC (2 Conexões Físicas Simultâneas)
  // -------------------------------------------------------------------------
  console.log("\n[Caso 7] Concorrência Real: Double-Click com 2 conexões simultâneas via FOR UPDATE");
  const prodConc = (await adminClient.query(`
    INSERT INTO public.produtos_eyemobile (user_id, workspace_id, eyemobile_id, codigo, descricao, estoque_atual, custo_atual)
    VALUES ('${userA}', '${wsA}', 'EM-CONC', 'COD-CONC', 'Cerveja Concorrente', 10, 4.0)
    RETURNING id;
  `)).rows[0].id;

  const nfConc = (await adminClient.query(`
    INSERT INTO public.notas_fiscais_compra (user_id, workspace_id, fornecedor, cnpj_fornecedor, status)
    VALUES ('${userA}', '${wsA}', 'Distribuidora Concorrência', '11222333000144', 'pendente')
    RETURNING id;
  `)).rows[0].id;

  const itemConc = (await adminClient.query(`
    INSERT INTO public.nf_itens (nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${nfConc}', 'BEER-CX12', 'Cerveja CX 12', 'CX', 2, 48.0, 'pendente')
    RETURNING id;
  `)).rows[0].id;

  const equivConc = (await adminClient.query(`
    INSERT INTO public.produto_equivalencias (
      user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
      produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario, origem_matching
    ) VALUES ('${userA}', '${wsA}', '11222333000144', 'BEER-CX12', '${prodConc}', 12, true, 'manual')
    RETURNING id;
  `)).rows[0].id;

  const conn1 = new Client(DB_CONFIG);
  const conn2 = new Client(DB_CONFIG);
  await conn1.connect();
  await conn2.connect();

  const rpcCall = `
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemConc}', '${userA}', '${wsA}', '${equivConc}', '${prodConc}',
      24, 2.0, 12
    ) as result;
  `;

  const [resConn1, resConn2] = await Promise.all([conn1.query(rpcCall), conn2.query(rpcCall)]);
  await conn1.end();
  await conn2.end();

  const val1 = resConn1.rows[0].result;
  const val2 = resConn2.rows[0].result;
  const codes = [val1.code, val2.code];

  assert(codes.includes("processed"), "Conexão serializada processou com sucesso ('processed')");
  assert(codes.includes("already_processed"), "Segunda conexão simultânea detectou término via FOR UPDATE ('already_processed')");

  const prodConcFinal = (await adminClient.query(`SELECT estoque_atual, custo_atual FROM public.produtos_eyemobile WHERE id = '${prodConc}';`)).rows[0];
  assert(Number(prodConcFinal.estoque_atual) === 34, "Estoque incrementado exatamente 1 vez (10 + 24 = 34, sem duplicação)");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 8: Idempotência Física (Processado e Legado 'Atualizado')
  // -------------------------------------------------------------------------
  console.log("\n[Caso 8] Idempotência Física: status 'processado' e legado 'atualizado'");
  const reexecRes = (await adminClient.query(rpcCall)).rows[0].result;
  assert(reexecRes.code === "already_processed", "Reexecução de item já 'processado' retorna immediately already_processed");

  const itemLeg = (await adminClient.query(`
    INSERT INTO public.nf_itens (nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${nfConc}', 'LEG-SKU', 'Item Legado', 'UN', 5, 10.0, 'atualizado')
    RETURNING id;
  `)).rows[0].id;

  const resLegado = (await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemLeg}', '${userA}', '${wsA}', '${equivConc}', '${prodConc}',
      5, 10.0, 1
    ) as result;
  `)).rows[0].result;
  assert(resLegado.code === "already_processed", "Status legado 'atualizado' reconhecido como terminal ('already_processed')");

  const prodLegCheck = (await adminClient.query(`SELECT estoque_atual FROM public.produtos_eyemobile WHERE id = '${prodConc}';`)).rows[0];
  assert(Number(prodLegCheck.estoque_atual) === 34, "Estoque permaneceu inalterado (34) nas chamadas idempotentes");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 9: Isolamento Multi-Tenant na RPC
  // -------------------------------------------------------------------------
  console.log("\n[Caso 9] Isolamento Multi-Tenant na RPC: cross-tenant fail-closed");
  const itemTenantA = (await adminClient.query(`
    INSERT INTO public.nf_itens (nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${nfConc}', 'BEER-PENDING-A', 'Cerveja Pendente A', 'CX', 1, 24.0, 'pendente')
    RETURNING id;
  `)).rows[0].id;

  const crossTenantItemCall = (await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemTenantA}', '${userB}', '${wsB}', '${equivConc}', '${prodConc}',
      12, 2.0, 12
    ) as result;
  `)).rows[0].result;
  assert(crossTenantItemCall.success === false && crossTenantItemCall.code === "tenant_mismatch", "Item de outro tenant rejeitado como tenant_mismatch");

  const prodB = (await adminClient.query(`
    INSERT INTO public.produtos_eyemobile (user_id, workspace_id, eyemobile_id, codigo, descricao, estoque_atual, custo_atual)
    VALUES ('${userB}', '${wsB}', 'EM-B1', 'COD-B1', 'Produto B', 0, 1.0)
    RETURNING id;
  `)).rows[0].id;

  const equivB = (await adminClient.query(`
    INSERT INTO public.produto_equivalencias (
      user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
      produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario, origem_matching
    ) VALUES ('${userB}', '${wsB}', '99999999000100', 'SKU-B', '${prodB}', 1, true, 'manual')
    RETURNING id;
  `)).rows[0].id;

  const crossTenantEquivCall = (await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemTenantA}', '${userA}', '${wsA}', '${equivB}', '${prodConc}',
      12, 2.0, 12
    ) as result;
  `)).rows[0].result;
  assert(crossTenantEquivCall.success === false && crossTenantEquivCall.code === "equivalence_not_found", "Equivalência de outro tenant não localizada e rejeitada");

  const prodAStillSafe = (await adminClient.query(`SELECT estoque_atual FROM public.produtos_eyemobile WHERE id = '${prodConc}';`)).rows[0];
  assert(Number(prodAStillSafe.estoque_atual) === 34, "Estoque de Tenant A estritamente inalterado e isolado");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 10: Anti-TOCTOU & Fail-Closed de Parâmetros na RPC
  // -------------------------------------------------------------------------
  console.log("\n[Caso 10] Anti-TOCTOU & Validação Fail-Closed de Parâmetros");
  const itemToctou = (await adminClient.query(`
    INSERT INTO public.nf_itens (nf_id, codigo_produto, descricao, unidade, quantidade, valor_unitario, status_estoque)
    VALUES ('${nfConc}', 'BEER-TOCTOU', 'Cerveja TOCTOU', 'CX', 1, 24.0, 'pendente')
    RETURNING id;
  `)).rows[0].id;

  const toctouRes = (await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemToctou}', '${userA}', '${wsA}', '${equivConc}', '${prodConc}',
      12, 2.0, 6 -- Esperava fator 6, mas equivalência no banco é 12
    ) as result;
  `)).rows[0].result;
  assert(toctouRes.success === false && toctouRes.code === "equivalence_changed", "Divergência entre fator esperado e banco rejeitada como equivalence_changed");

  const negParamRes = (await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${itemToctou}', '${userA}', '${wsA}', '${equivConc}', '${prodConc}',
      -10, 2.0, 12
    ) as result;
  `)).rows[0].result;
  assert(negParamRes.success === false && negParamRes.code === "invalid_parameters", "Quantidade negativa rejeitada imediatamente com invalid_parameters");

  const itemToctouCheck = (await adminClient.query(`SELECT status_estoque FROM public.nf_itens WHERE id = '${itemToctou}';`)).rows[0];
  assert(itemToctouCheck.status_estoque === "pendente", "Item manteve status 'pendente' intacto após erro de validação");
  casesPassed++;

  // -------------------------------------------------------------------------
  // CASO 11: Auditoria de Histórico Canônico por UUID
  // -------------------------------------------------------------------------
  console.log("\n[Caso 11] Auditoria de Histórico Canônico: consulta por produto_eyemobile_uuid");
  const histRow = (await adminClient.query(`
    SELECT produto_eyemobile_uuid, custo_unitario, workspace_id, user_id
    FROM public.historico_custo_produto
    WHERE produto_eyemobile_uuid = '${prodConc}';
  `)).rows[0];
  assert(histRow.produto_eyemobile_uuid === prodConc, "Histórico físico gravou exatamente o produto_eyemobile_uuid canônico");
  assert(histRow.workspace_id === wsA && histRow.user_id === userA, "Histórico devidamente restrito ao tenant proprietário");
  casesPassed++;

  await adminClient.end();

  console.log("\n=======================================================");
  console.log(`=== BATERIA POSTGRESQL REAL CONCLUÍDA COM SUCESSO: ${casesPassed} CASOS, ${assertionsPassed} ASSERTIONS PASSOU ===`);
  console.log("=======================================================\n");
  process.exit(0);
}

runRealPgTests().catch((err) => {
  console.error("FATAL ERROR NA SUÍTE POSTGRESQL REAL:", err);
  process.exit(1);
});
