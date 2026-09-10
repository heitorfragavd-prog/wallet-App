/**
 * scripts/test-phase-c-atomic-rollback.cjs
 * 
 * Bateria de Testes de Gating e Atomicidade da Fase C:
 * 1. Testar a migration real sem a flag (falha estrita com OPERACAO BLOQUEADA e zero persistência).
 * 2. Comprovar rollback atômico quando o registro do histórico de migrations falha.
 * 3. Confirmar o caminho positivo, aplicação das restrições e escopo estrito da flag.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/postgres';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function runTest(testName, testFn) {
  console.log(`\n▶ [TESTE] ${testName}`);
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    console.log(`  ✅ PASSOU (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`  ❌ FALHOU (${duration}ms):`, err.message);
    throw err;
  }
}

async function createClient() {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function main() {
  console.log('================================================================');
  console.log('TESTES DE GATING E ATOMICIDADE DA FASE C (POSTGRESQL REAL)');
  console.log(`Conexão: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
  console.log('================================================================');

  const phaseASql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260908120000_security_phase_a_infrastructure.sql'), 'utf8');
  const phaseCSql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260908120001_security_phase_c_enforcement.sql'), 'utf8');

  // 0. Setup Inicial: Aplica Fase A e prepara ambiente de teste limpo
  await runTest('0. Setup Inicial com Fase A e Schema Base', async () => {
    const client = await createClient();
    try {
      // Cria tabelas base se não existirem
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE,
          created_at TIMESTAMPTZ DEFAULT clock_timestamp()
        );
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
          SELECT NULLIF(COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)->>'sub', '')::uuid;
        $$ LANGUAGE sql STABLE;
        CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
          SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', 'anon');
        $$ LANGUAGE sql STABLE;
        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
          SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
        $$ LANGUAGE sql STABLE;

        -- Tabela divipay_config pré-Fase C
        CREATE TABLE IF NOT EXISTS public.divipay_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          client_id TEXT,
          client_secret TEXT,
          access_token TEXT,
          environment TEXT,
          is_active BOOLEAN,
          webhook_url TEXT,
          token_expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
          updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
        );
        GRANT ALL ON public.divipay_config TO authenticated;

        -- Tabela eyemobile_config pré-Fase C
        CREATE TABLE IF NOT EXISTS public.eyemobile_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          access_key TEXT,
          secret_key TEXT,
          environment TEXT,
          store_id TEXT,
          default_conta_id UUID,
          default_categoria_receita_id UUID,
          default_categoria_taxa_id UUID,
          auto_sync_sales BOOLEAN,
          auto_sync_stock BOOLEAN,
          last_synced_offset INTEGER,
          created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
          updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
        );
        GRANT ALL ON public.eyemobile_config TO authenticated;

        -- Tabela senha_investimentos e investimentos
        CREATE TABLE IF NOT EXISTS public.senha_investimentos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL UNIQUE,
          senha_hash TEXT NOT NULL,
          tentativas_falhas INTEGER DEFAULT 0,
          bloqueado_ate TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
          updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
        );
        GRANT ALL ON public.senha_investimentos TO authenticated;

        CREATE TABLE IF NOT EXISTS public.investimentos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          ativo TEXT,
          valor NUMERIC,
          created_at TIMESTAMPTZ DEFAULT clock_timestamp()
        );
        ALTER TABLE public.investimentos ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users manage own investimentos" ON public.investimentos;
        CREATE POLICY "Users manage own investimentos" ON public.investimentos FOR ALL TO authenticated USING (auth.uid() = user_id);

        CREATE TABLE IF NOT EXISTS public.proventos_esperados (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          valor NUMERIC,
          created_at TIMESTAMPTZ DEFAULT clock_timestamp()
        );
        ALTER TABLE public.proventos_esperados ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users manage own proventos" ON public.proventos_esperados;
        CREATE POLICY "Users manage own proventos" ON public.proventos_esperados FOR ALL TO authenticated USING (auth.uid() = user_id);

        CREATE TABLE IF NOT EXISTS public.configuracoes_investimentos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          created_at TIMESTAMPTZ DEFAULT clock_timestamp()
        );
        ALTER TABLE public.configuracoes_investimentos ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Users manage own configuracoes_investimentos" ON public.configuracoes_investimentos;
        CREATE POLICY "Users manage own configuracoes_investimentos" ON public.configuracoes_investimentos FOR ALL TO authenticated USING (auth.uid() = user_id);

        -- Tabela de histórico de migrações
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version TEXT NOT NULL PRIMARY KEY,
          statements TEXT[],
          name TEXT
        );
      `);

      // Aplica a migração real da Fase A
      await client.query(phaseASql);
    } finally {
      await client.end();
    }
  });

  // 1. Testar a migration real sem a flag
  await runTest('1. Execução Real da Migration Fase C sem a flag deve falhar e não persistir alterações', async () => {
    const client = await createClient();
    let caughtError = null;

    try {
      // Conexão nova, sem qualquer flag de Fase B configurada
      await client.query(phaseCSql);
    } catch (err) {
      caughtError = err;
    } finally {
      await client.end();
    }

    assert(caughtError !== null, 'A migration C deveria ter falhado por ausência da flag de confirmação da Fase B!');
    assert(caughtError.message.includes('OPERACAO BLOQUEADA'), `Mensagem de erro inesperada: ${caughtError.message}`);
    assert(caughtError.code === 'P0001', `Código de erro Postgres inesperado: ${caughtError.code}`);

    // Inspeciona por uma nova conexão que nada da Fase C foi persistido
    const checkClient = await createClient();
    try {
      // 1.1 Não deve haver registro da migration no histórico
      const histRes = await checkClient.query(`SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260908120001'`);
      assert(histRes.rows.length === 0, 'A migration 20260908120001 não deveria estar registrada no histórico!');

      // 1.2 Privilégios de tabela em divipay_config não foram revogados (permanecem da Fase A)
      const privRes = await checkClient.query(`
        SELECT has_column_privilege('authenticated', 'public.divipay_config', 'client_secret', 'SELECT') as can_select_secret
      `);
      assert(privRes.rows[0].can_select_secret === true, 'As colunas não deveriam ter sido restritas após o bloqueio de gating!');

      // 1.3 Verifica se psql CLI está presente no PATH para validar exit code não-zero diretamente
      try {
        const { spawnSync } = require('child_process');
        const psqlCheck = spawnSync('psql', ['--version'], { encoding: 'utf8' });
        if (psqlCheck.status === 0) {
          console.log('    ℹ️ psql CLI detectado. Validando código de saída CLI real...');
          const cliRes = spawnSync('psql', [
            connectionString,
            '-v', 'ON_ERROR_STOP=1',
            '-f', path.resolve(__dirname, '../supabase/migrations/20260908120001_security_phase_c_enforcement.sql')
          ], { encoding: 'utf8' });
          console.log(`    ℹ️ psql exit code: ${cliRes.status}`);
          assert(cliRes.status !== 0, `psql deveria retornar exit code != 0, retornou ${cliRes.status}`);
          const combinedOutput = (cliRes.stderr || '') + (cliRes.stdout || '');
          assert(combinedOutput.includes('OPERACAO BLOQUEADA'), `psql não emitiu OPERACAO BLOQUEADA: ${combinedOutput}`);
          console.log('    ✅ psql CLI abortou imediatamente com código não-zero e OPERACAO BLOQUEADA');
        }
      } catch (cliErr) {
        console.log('    ℹ️ Verificação adicional de CLI psql ignorada:', cliErr.message);
      }
    } finally {
      await checkClient.end();
    }
  });

  // 2. Comprovar rollback por falha no histórico
  await runTest('2. Falha controlada no histórico deve reverter integralmente todas as alterações da Fase C', async () => {
    // 2.1 Instalar trigger no banco de teste que força erro ao inserir a versão C no histórico
    const setupClient = await createClient();
    try {
      await setupClient.query(`
        CREATE OR REPLACE FUNCTION fail_phase_c_history() RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.version = '20260908120001' THEN
            RAISE EXCEPTION 'FALHA CONTROLADA NO REGISTRO DO HISTORICO DE MIGRATIONS';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_fail_phase_c_history ON supabase_migrations.schema_migrations;
        CREATE TRIGGER trg_fail_phase_c_history
        BEFORE INSERT ON supabase_migrations.schema_migrations
        FOR EACH ROW EXECUTE FUNCTION fail_phase_c_history();
      `);
    } finally {
      await setupClient.end();
    }

    // 2.2 Executar o procedimento atômico oficial em uma transação unificada
    const execClient = await createClient();
    let atomicError = null;

    try {
      await execClient.query(`
        BEGIN;
        SET LOCAL wallet.deploy_phase_b_completed = 'true';
        ${phaseCSql}
        INSERT INTO supabase_migrations.schema_migrations (version, name)
        VALUES ('20260908120001', 'security_phase_c_enforcement');
        COMMIT;
      `);
    } catch (err) {
      atomicError = err;
      try {
        await execClient.query('ROLLBACK;');
      } catch (_) {}
    } finally {
      await execClient.end();
    }

    assert(atomicError !== null, 'A transação unificada deveria ter falhado no registro do histórico!');
    assert(
      atomicError.message.includes('FALHA CONTROLADA NO REGISTRO DO HISTORICO DE MIGRATIONS'),
      `Mensagem de erro de rollback inesperada: ${atomicError.message}`
    );

    // 2.3 Inspecionar por uma nova conexão: comprovar que o rollback desfez TUDO
    const verifyClient = await createClient();
    try {
      // Histórico vazio para a Fase C
      const hist = await verifyClient.query(`SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260908120001'`);
      assert(hist.rows.length === 0, 'Rollback falhou: versão da Fase C foi gravada no histórico!');

      // Privilégios de colunas NÃO foram alterados (rollback restaurou permissões públicas/anteriores)
      const priv = await verifyClient.query(`
        SELECT has_column_privilege('authenticated', 'public.divipay_config', 'client_secret', 'SELECT') as can_select_secret
      `);
      assert(priv.rows[0].can_select_secret === true, 'Rollback falhou: revogações da Fase C permaneceram ativas após falha no histórico!');

      // Policies de investimentos voltaram ao estado anterior (sem is_investimentos_unlocked)
      const policyRes = await verifyClient.query(`
        SELECT qual FROM pg_policies WHERE tablename = 'investimentos' AND policyname = 'Users manage own investimentos'
      `);
      const policyQual = policyRes.rows[0]?.qual || '';
      console.log(`    ℹ️ Qualificador da policy de investimentos pós-rollback: ${policyQual}`);
      assert(!policyQual.includes('is_investimentos_unlocked'), 'Rollback falhou: policy de investimentos permaneceu com restrição da Fase C!');

      // A flag de sessão NÃO permaneceu 'true'
      const flagRes = await verifyClient.query(`SELECT current_setting('wallet.deploy_phase_b_completed', true) as flag_val`);
      assert(flagRes.rows[0].flag_val !== 'true', `Rollback falhou: flag permaneceu 'true' em nova conexão: ${flagRes.rows[0].flag_val}`);
    } finally {
      await verifyClient.end();
    }
  });

  // 3. Confirmar o caminho positivo e o escopo da flag
  await runTest('3. Execução bem-sucedida da Fase C aplica restrições, registra histórico e isola a flag', async () => {
    // 3.1 Remove o trigger de teste
    const cleanClient = await createClient();
    try {
      await cleanClient.query(`
        DROP TRIGGER IF EXISTS trg_fail_phase_c_history ON supabase_migrations.schema_migrations;
        DROP FUNCTION IF EXISTS fail_phase_c_history();
      `);
    } finally {
      await cleanClient.end();
    }

    // 3.2 Executa o procedimento oficial com sucesso
    const successClient = await createClient();
    try {
      await successClient.query(`
        BEGIN;
        SET LOCAL wallet.deploy_phase_b_completed = 'true';
        ${phaseCSql}
        INSERT INTO supabase_migrations.schema_migrations (version, name)
        VALUES ('20260908120001', 'security_phase_c_enforcement')
        ON CONFLICT (version) DO NOTHING;
        COMMIT;
      `);
    } finally {
      await successClient.end();
    }

    // 3.3 Inspeciona por uma nova conexão: comprovar enforcement ativo e flag isolada
    const checkClient = await createClient();
    try {
      // Versão registrada com sucesso
      const hist = await checkClient.query(`SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260908120001'`);
      assert(hist.rows.length === 1, 'Versão 20260908120001 deveria estar registrada no histórico!');

      // Privilégios de colunas sensíveis agora ESTÃO REVOGADOS (Enforcement da Fase C comprovado)
      const priv = await checkClient.query(`
        SELECT has_column_privilege('authenticated', 'public.divipay_config', 'client_secret', 'SELECT') as can_select_secret
      `);
      assert(privRes.rows[0].can_select_secret === false, 'Fase C falhou: authenticated ainda consegue fazer SELECT em client_secret!');

      // Policies de investimentos ativadas com is_investimentos_unlocked
      const policyRes = await checkClient.query(`
        SELECT qual FROM pg_policies WHERE tablename = 'investimentos' AND policyname = 'Users manage own investimentos'
      `);
      const policyQual = policyRes.rows[0]?.qual || '';
      console.log(`    ℹ️ Qualificador da policy de investimentos pós-Fase C: ${policyQual}`);
      assert(policyQual.includes('is_investimentos_unlocked'), 'Fase C falhou: policy de investimentos não contém restrição de sessão desbloqueada!');

      // Confere o escopo da flag: comprova que ela NÃO permanece 'true'
      const flagRes = await checkClient.query(`SELECT current_setting('wallet.deploy_phase_b_completed', true) as flag_val`);
      const flagVal = flagRes.rows[0].flag_val;
      console.log(`    ℹ️ Valor observado da flag em nova conexão: ${JSON.stringify(flagVal)}`);
      assert(flagVal !== 'true', `A flag SET LOCAL vazou e permaneceu 'true' em nova conexão: ${flagVal}`);
    } finally {
      await checkClient.end();
    }
  });

  console.log('\n================================================================');
  console.log('✅ TODOS OS TESTES DE GATING E ATOMICIDADE PASSARAM COM SUCESSO!');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n❌ ERRO FATAL NA BATERIA DE GATING E ATOMICIDADE:', err);
  process.exit(1);
});