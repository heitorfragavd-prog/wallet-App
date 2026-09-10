const { Client } = require("pg");

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
      "ERRO DE SEGURANÇA: Este harness executa operações destrutivas (DELETE). Defina WALLET_ALLOW_DESTRUCTIVE_PG_TESTS=1 para prosseguir."
    );
    process.exit(1);
  }
  console.log("=== INICIANDO BATERIA DE TESTES EM POSTGRESQL 17 REAL ===");
  const adminClient = new Client(DB_CONFIG);
  await adminClient.connect();

  const userId = "00000000-0000-0000-0000-000000000001";
  const wsId = "00000000-0000-0000-0000-000000000002";

  // Clean and prepare base tenant
  await adminClient.query(`
    DELETE FROM public.historico_custo_produto;
    DELETE FROM public.nf_itens;
    DELETE FROM public.notas_fiscais_compra;
    DELETE FROM public.produto_equivalencias;
    DELETE FROM public.produtos_eyemobile;
    DELETE FROM public.workspaces;

    INSERT INTO public.workspaces (id, user_id, nome)
    VALUES ('${wsId}', '${userId}', 'Workspace Teste')
    ON CONFLICT DO NOTHING;
  `);

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
  console.log("\n[1] Teste de Permissões (P0): anon e authenticated devem ser bloqueados");
  try {
    const dummyId = "00000000-0000-0000-0000-000000000010";
    await adminClient.query("SET ROLE anon;");
    let anonBlocked = false;
    try {
      await adminClient.query(`
        SELECT public.aplicar_item_nf_estoque_custo(
          '${dummyId}', '${userId}', '${wsId}', '${dummyId}', '${dummyId}', 10, 5.0, 1
        );
      `);
    } catch (err) {
      anonBlocked = err.code === "42501"; // permission denied
    }
    assert(anonBlocked, "Role 'anon' tem permissão negada (42501) para executar a RPC");

    await adminClient.query("SET ROLE authenticated;");
    let authBlocked = false;
    try {
      await adminClient.query(`
        SELECT public.aplicar_item_nf_estoque_custo(
          '${dummyId}', '${userId}', '${wsId}', '${dummyId}', '${dummyId}', 10, 5.0, 1
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
          '${dummyId}', '${userId}', '${wsId}', '${dummyId}', '${dummyId}', 10, 5.0, 1
        );
      `);
      serviceAllowed = res.rows.length > 0;
    } catch (err) {
      serviceAllowed = false;
    }
    assert(serviceAllowed, "Role 'service_role' possui permissão de EXECUTE concedida");
  } finally {
    await adminClient.query("RESET ROLE;");
  }

  // Helper para criar cenário base
  async function seedScenario(opts = {}) {
    const prodId = "10000000-0000-0000-0000-000000000001";
    const nfId = "20000000-0000-0000-0000-000000000001";
    const itemId = "30000000-0000-0000-0000-000000000001";
    const equivId = "40000000-0000-0000-0000-000000000001";

    await adminClient.query(`
      DELETE FROM public.historico_custo_produto;
      DELETE FROM public.nf_itens;
      DELETE FROM public.notas_fiscais_compra;
      DELETE FROM public.produto_equivalencias;
      DELETE FROM public.produtos_eyemobile;

      INSERT INTO public.produtos_eyemobile (
        id, user_id, workspace_id, eyemobile_id, codigo, descricao, estoque_atual, custo_atual
      ) VALUES (
        '${prodId}', '${userId}', '${wsId}', 'EYE-999', 'SKU-999', 'Produto Teste',
        ${opts.estoqueInicial !== undefined ? opts.estoqueInicial : 10},
        ${opts.custoInicial !== undefined ? opts.custoInicial : 5.00}
      );

      INSERT INTO public.notas_fiscais_compra (
        id, user_id, workspace_id, fornecedor, cnpj_fornecedor, status
      ) VALUES (
        '${nfId}', '${userId}', '${wsId}', 'Fornecedor Teste', '12345678000190', 'pendente'
      );

      INSERT INTO public.nf_itens (
        id, nf_id, codigo_produto, descricao, quantidade, valor_unitario, status_estoque
      ) VALUES (
        '${itemId}', '${nfId}', 'FORN-999', 'Produto Teste Fornecedor', 2, 48.00,
        '${opts.statusEstoqueItem || "pendente"}'
      );

      INSERT INTO public.produto_equivalencias (
        id, user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
        produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
      ) VALUES (
        '${equivId}', '${userId}', '${wsId}', '12345678000190', 'FORN-999',
        '${prodId}', ${opts.fatorConversao !== undefined ? opts.fatorConversao : 12},
        ${opts.confirmado !== undefined ? opts.confirmado : true}
      );
    `);

    return { prodId, nfId, itemId, equivId };
  }

  // -------------------------------------------------------------------------
  // Teste 2: Validação de Parâmetros NULL e <= 0
  // -------------------------------------------------------------------------
  console.log("\n[2] Teste de Parâmetros Inválidos e NULL (Fail Closed)");
  const s2 = await seedScenario();
  const testCasesInvalid = [
    { qtd: "NULL", custo: "4.00", fator: "12", desc: "quantidade NULL" },
    { qtd: "0", custo: "4.00", fator: "12", desc: "quantidade 0" },
    { qtd: "-5", custo: "4.00", fator: "12", desc: "quantidade negativa" },
    { qtd: "24", custo: "NULL", fator: "12", desc: "custo NULL" },
    { qtd: "24", custo: "0", fator: "12", desc: "custo 0" },
    { qtd: "24", custo: "-1", fator: "12", desc: "custo negativo" },
    { qtd: "24", custo: "4.00", fator: "NULL", desc: "fator esperado NULL" },
    { qtd: "24", custo: "4.00", fator: "0", desc: "fator esperado 0" },
    { qtd: "24", custo: "4.00", fator: "-12", desc: "fator esperado negativo" },
  ];

  for (const tc of testCasesInvalid) {
    const res = await adminClient.query(`
      SELECT public.aplicar_item_nf_estoque_custo(
        '${s2.itemId}', '${userId}', '${wsId}', '${s2.equivId}', '${s2.prodId}',
        ${tc.qtd}, ${tc.custo}, ${tc.fator}
      ) as result;
    `);
    const val = res.rows[0].result;
    assert(val.success === false && val.code === "invalid_parameters", `RPC rejeita ${tc.desc} com invalid_parameters`);
  }

  // -------------------------------------------------------------------------
  // Teste 3: Anti-TOCTOU do Fator de Conversão
  // -------------------------------------------------------------------------
  console.log("\n[3] Teste de Anti-TOCTOU do Fator de Conversão (Preflight 12 -> Banco 6)");
  const s3 = await seedScenario({ fatorConversao: 6 }); // Banco tem 6
  // Mas preflight enviou 12 como fator esperado
  const resToctou = await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${s3.itemId}', '${userId}', '${wsId}', '${s3.equivId}', '${s3.prodId}',
      24, 4.00, 12
    ) as result;
  `);
  const valToctou = resToctou.rows[0].result;
  assert(valToctou.success === false && valToctou.code === "equivalence_changed", "Fator alterado concorrentemente retorna equivalence_changed");

  // Verificar zero mutação
  const prodToctou = (await adminClient.query(`SELECT estoque_atual, custo_atual FROM public.produtos_eyemobile WHERE id = '${s3.prodId}';`)).rows[0];
  assert(Number(prodToctou.estoque_atual) === 10, "Estoque permaneceu inalterado (10) após equivalence_changed");
  assert(Number(prodToctou.custo_atual) === 5.00, "Custo permaneceu inalterado (5.00) após equivalence_changed");
  const histCount = (await adminClient.query("SELECT COUNT(*) FROM public.historico_custo_produto;")).rows[0].count;
  assert(Number(histCount) === 0, "Zero linhas inseridas em historico_custo_produto");

  // -------------------------------------------------------------------------
  // Teste 4: Rollback Atômico Real na Transação PL/pgSQL
  // -------------------------------------------------------------------------
  console.log("\n[4] Teste de Rollback Atômico Real: erro no histórico desfaz update do produto e nf_item");
  const s4 = await seedScenario({ estoqueInicial: 100, custoInicial: 5.00 });

  // Cria um trigger que força falha no INSERT em historico_custo_produto
  await adminClient.query(`
    CREATE OR REPLACE FUNCTION trigger_fail_historico()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Falha forcada no historico de custo para teste de rollback';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_test_fail ON public.historico_custo_produto;
    CREATE TRIGGER trg_test_fail
    BEFORE INSERT ON public.historico_custo_produto
    FOR EACH ROW EXECUTE FUNCTION trigger_fail_historico();
  `);

  let exceptionCaught = false;
  try {
    await adminClient.query(`
      SELECT public.aplicar_item_nf_estoque_custo(
        '${s4.itemId}', '${userId}', '${wsId}', '${s4.equivId}', '${s4.prodId}',
        24, 4.00, 12
      );
    `);
  } catch (err) {
    exceptionCaught = true;
    assert(err.message.includes("Falha forcada no historico de custo"), "Transação capturou exceção real");
  }
  assert(exceptionCaught, "RPC lançou erro e abortou transação");

  // Remove trigger de falha
  await adminClient.query("DROP TRIGGER IF EXISTS trg_test_fail ON public.historico_custo_produto;");

  // Comprovar estado anterior intacto
  const prodRollback = (await adminClient.query(`SELECT estoque_atual, custo_atual FROM public.produtos_eyemobile WHERE id = '${s4.prodId}';`)).rows[0];
  assert(Number(prodRollback.estoque_atual) === 100, "Rollback: estoque_atual retornou ao valor original (100)");
  assert(Number(prodRollback.custo_atual) === 5.00, "Rollback: custo_atual retornou ao valor original (5.00)");

  const itemRollback = (await adminClient.query(`SELECT status_estoque FROM public.nf_itens WHERE id = '${s4.itemId}';`)).rows[0];
  assert(itemRollback.status_estoque === "pendente", "Rollback: status_estoque do item retornou a 'pendente'");

  // -------------------------------------------------------------------------
  // Teste 5: Idempotência de Status Legado 'atualizado'
  // -------------------------------------------------------------------------
  console.log("\n[5] Teste de Idempotência Legada: status_estoque = 'atualizado'");
  const s5 = await seedScenario({ statusEstoqueItem: "atualizado", estoqueInicial: 50 });
  const resLegado = await adminClient.query(`
    SELECT public.aplicar_item_nf_estoque_custo(
      '${s5.itemId}', '${userId}', '${wsId}', '${s5.equivId}', '${s5.prodId}',
      24, 4.00, 12
    ) as result;
  `);
  const valLegado = resLegado.rows[0].result;
  assert(valLegado.success === true && valLegado.code === "already_processed", "Item com status legado 'atualizado' retorna already_processed");
  const prodLegado = (await adminClient.query(`SELECT estoque_atual FROM public.produtos_eyemobile WHERE id = '${s5.prodId}';`)).rows[0];
  assert(Number(prodLegado.estoque_atual) === 50, "Zero mutação de estoque em item legado já atualizado");

  // -------------------------------------------------------------------------
  // Teste 6: Concorrência Real com 2 Conexões Simultâneas
  // -------------------------------------------------------------------------
  console.log("\n[6] Teste de Concorrência Real: 2 conexões simultâneas na RPC");
  const s6 = await seedScenario({ estoqueInicial: 10, custoInicial: 5.00 });

  const client1 = new Client(DB_CONFIG);
  const client2 = new Client(DB_CONFIG);
  await client1.connect();
  await client2.connect();

  const rpcQuery = `
    SELECT public.aplicar_item_nf_estoque_custo(
      '${s6.itemId}', '${userId}', '${wsId}', '${s6.equivId}', '${s6.prodId}',
      24, 4.00, 12
    ) as result;
  `;

  // Dispara simultaneamente pelas 2 conexões
  const [resConn1, resConn2] = await Promise.all([
    client1.query(rpcQuery),
    client2.query(rpcQuery),
  ]);

  await client1.end();
  await client2.end();

  const val1 = resConn1.rows[0].result;
  const val2 = resConn2.rows[0].result;

  const codes = [val1.code, val2.code];
  assert(codes.includes("processed"), "Uma das conexões processou o item ('processed')");
  assert(codes.includes("already_processed"), "A outra conexão foi serializada via FOR UPDATE e retornou 'already_processed'");

  const prodFinal = (await adminClient.query(`SELECT estoque_atual, custo_atual FROM public.produtos_eyemobile WHERE id = '${s6.prodId}';`)).rows[0];
  assert(Number(prodFinal.estoque_atual) === 34, "Estoque incrementou exatamente uma vez (10 + 24 = 34, sem duplicação)");
  assert(Number(prodFinal.custo_atual) === 4.00, "Custo atualizado para 4.00");

  const histFinal = (await adminClient.query(`SELECT COUNT(*) FROM public.historico_custo_produto WHERE produto_eyemobile_uuid = '${s6.prodId}';`)).rows[0];
  assert(Number(histFinal.count) === 1, "Exatamente um registro inserido em historico_custo_produto");

  await adminClient.end();

  console.log(`\n=== RESULTADO: ${testsPassed} PASSOU, ${testsFailed} FALHOU ===`);
  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Erro fatal no teste:", err);
  process.exit(1);
});
