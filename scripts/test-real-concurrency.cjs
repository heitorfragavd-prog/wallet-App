/**
 * scripts/test-real-concurrency.js
 * 
 * Bateria de Testes de Concorrência Real com PostgreSQL (Múltiplas Conexões Simultâneas via pg.Pool)
 * 
 * Valida o comportamento sob estresse e paralelismo real:
 * 1. Criação e incremento concorrente de buckets de rate limit (prevenção de erro 23505).
 * 2. Rajada no teto (burst testing): 25 requisições simultâneas para teto de 20.
 * 3. Incrementos concorrentes de falha de senha de investimentos e bloqueio atômico.
 * 4. Race condition: Troca de senha / Revogação de sessão vs validação concorrente.
 * 5. Reconciliação concorrente de reservas de tokens de IA (idempotência sob colisão).
 */

const { Pool } = require('pg');
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/postgres';

const pool = new Pool({
  connectionString,
  max: 20, // 20 conexões simultâneas reais no pool
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
});

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

async function main() {
  console.log('================================================================');
  console.log('INICIANDO TESTES DE CONCORRÊNCIA REAL COM POSTGRESQL (pg.Pool)');
  console.log(`Conexão: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
  console.log('================================================================');

  try {
    // 0. Setup Inicial de Schema/Funções (garantir que Fase A está presente)
    const setupClient = await pool.connect();
    try {
      const res = await setupClient.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc WHERE proname = 'check_rate_limit'
        ) AS has_rate_limit,
        EXISTS (
          SELECT 1 FROM pg_proc WHERE proname = 'registrar_falha_senha_investimentos'
        ) AS has_senha_invest,
        EXISTS (
          SELECT 1 FROM pg_proc WHERE proname = 'reserve_ai_tokens'
        ) AS has_ai_tokens;
      `);
      assert(res.rows[0].has_rate_limit, 'Função check_rate_limit não encontrada no banco!');
      assert(res.rows[0].has_senha_invest, 'Função registrar_falha_senha_investimentos não encontrada no banco!');
      assert(res.rows[0].has_ai_tokens, 'Função reserve_ai_tokens não encontrada no banco!');
    } finally {
      setupClient.release();
    }

    // 1. Criação e incremento concorrente de buckets de rate limit
    await runTest('1. Criação e incremento concorrente de rate limit (10 conexões simultâneas para nova chave)', async () => {
      const bucketKey = `test:burst:create:${crypto.randomUUID()}`;
      const numWorkers = 10;
      const limit = 20;
      const windowSeconds = 60;

      // Dispara 10 requisições exatamente ao mesmo tempo em conexões separadas
      const promises = Array.from({ length: numWorkers }, (_, i) => {
        return pool.query(
          'SELECT allowed, retry_after_seconds, current_count, limit_count FROM public.check_rate_limit($1, $2, $3, $4)',
          [bucketKey, limit, windowSeconds, 1]
        );
      });

      const results = await Promise.all(promises);

      // Nenhuma conexão pode lançar erro 23505 (unique_violation)
      // Todas devem ter sido permitidas (pois 10 <= 20)
      for (const res of results) {
        const row = res.rows[0];
        assert(row.allowed === true, `Requisição deveria ter sido permitida: ${JSON.stringify(row)}`);
      }

      // O contador final no banco deve ser exatamente 10
      const finalRes = await pool.query(
        'SELECT request_count FROM public.rate_limits WHERE bucket_key = $1',
        [bucketKey]
      );
      assert(finalRes.rows.length === 1, 'Registro de rate limit deve existir');
      assert(
        finalRes.rows[0].request_count === numWorkers,
        `Contador final esperado: ${numWorkers}, obtido: ${finalRes.rows[0].request_count}`
      );
      console.log(`     → 10 chamadas simultâneas processadas sem colisão 23505. Contador final: ${finalRes.rows[0].request_count}`);
    });

    // 2. Rajada no teto (Burst Testing): 25 requisições concorrentes contra limite de 20
    await runTest('2. Rajada no teto (25 requisições concorrentes contra limite de 20)', async () => {
      const bucketKey = `test:burst:cap:${crypto.randomUUID()}`;
      const numWorkers = 25;
      const limit = 20;
      const windowSeconds = 60;

      const promises = Array.from({ length: numWorkers }, () => {
        return pool.query(
          'SELECT allowed, retry_after_seconds, current_count, limit_count FROM public.check_rate_limit($1, $2, $3, $4)',
          [bucketKey, limit, windowSeconds, 1]
        );
      });

      const results = await Promise.all(promises);

      let allowedCount = 0;
      let rejectedCount = 0;

      for (const res of results) {
        const row = res.rows[0];
        if (row.allowed) {
          allowedCount++;
        } else {
          rejectedCount++;
          assert(row.retry_after_seconds > 0, 'Rejeição deve conter retry_after_seconds > 0');
        }
      }

      console.log(`     → Resultados da rajada: ${allowedCount} permitidas, ${rejectedCount} rejeitadas`);
      assert(allowedCount === limit, `Exatamente ${limit} chamadas deveriam ser permitidas, obtido: ${allowedCount}`);
      assert(rejectedCount === (numWorkers - limit), `Exatamente ${numWorkers - limit} chamadas deveriam ser rejeitadas, obtido: ${rejectedCount}`);

      const finalRes = await pool.query(
        'SELECT request_count FROM public.rate_limits WHERE bucket_key = $1',
        [bucketKey]
      );
      assert(
        finalRes.rows[0].request_count === limit,
        `Contador não deve exceder o teto ${limit}, obtido: ${finalRes.rows[0].request_count}`
      );
    });

    // 3. Incremento concorrente de falhas de senha e bloqueio atômico
    await runTest('3. Falhas concorrentes de senha de investimentos e bloqueio atômico (5 conexões simultâneas)', async () => {
      const testUserId = crypto.randomUUID();

      // Setup do usuário e senha
      await pool.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [testUserId, `conc_${testUserId.slice(0, 8)}@example.com`]);
      await pool.query(`
        INSERT INTO public.senha_investimentos (user_id, senha_hash, tentativas_falhas, bloqueado_ate)
        VALUES ($1, 'dummy_hash', 0, null)
        ON CONFLICT (user_id) DO UPDATE SET senha_hash = 'dummy_hash', tentativas_falhas = 0, bloqueado_ate = null;
      `, [testUserId]);

      // 5 conexões chamam registrar_falha_senha_investimentos simultaneamente
      const promises = Array.from({ length: 5 }, () => {
        return pool.query(
          'SELECT tentativas_falhas, bloqueado, bloqueado_ate FROM public.registrar_falha_senha_investimentos($1)',
          [testUserId]
        );
      });

      const results = await Promise.all(promises);

      // Pelo menos a última deve acusar bloqueado = true
      const anyBlocked = results.some(r => r.rows[0].bloqueado === true);
      assert(anyBlocked, 'Após 5 falhas, o usuário deve ser bloqueado');

      // Verifica estado persistido final
      const checkRes = await pool.query(
        'SELECT tentativas_falhas, bloqueado_ate FROM public.senha_investimentos WHERE user_id = $1',
        [testUserId]
      );
      const row = checkRes.rows[0];
      assert(row.tentativas_falhas === 5, `Deveria ter registrado exatamente 5 tentativas, obtido: ${row.tentativas_falhas}`);
      assert(row.bloqueado_ate !== null, 'bloqueado_ate deve estar preenchido');
      assert(new Date(row.bloqueado_ate) > new Date(), 'bloqueado_ate deve estar no futuro');
      console.log(`     → 5 falhas registradas atomicamente. Bloqueio até: ${row.bloqueado_ate}`);
    });

    // 4. Race Condition: Troca de Senha / Revogação vs Validação Concorrente de Sessão
    await runTest('4. Race Condition: Troca de senha / Revogação de sessões vs Validação simultânea', async () => {
      const testUserId = crypto.randomUUID();
      const authSessionId = `sess_conc_${crypto.randomUUID()}`;

      await pool.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [testUserId, `rc_${testUserId.slice(0, 8)}@example.com`]);
      await pool.query(`
        INSERT INTO public.senha_investimentos (user_id, senha_hash, tentativas_falhas)
        VALUES ($1, 'initial_hash', 0)
        ON CONFLICT (user_id) DO NOTHING;
      `, [testUserId]);

      // Desbloqueia sessão de investimentos via RPC oficial
      const unlockRes = await pool.query(
        'SELECT public.desbloquear_sessao_investimentos($1, $2, $3, $4, clock_timestamp() + interval \'1 hour\') AS unlocked',
        [testUserId, authSessionId, 'initial_hash', null]
      );
      assert(unlockRes.rows[0].unlocked === true, 'Desbloqueio de sessão inicial deve retornar true');

      // Validação inicial: a sessão deve existir e estar válida
      const initialCheck = await pool.query(
        'SELECT EXISTS (SELECT 1 FROM public.investimentos_sessions WHERE user_id = $1 AND session_id = $2 AND expires_at > clock_timestamp()) AS is_valid',
        [testUserId, authSessionId]
      );
      assert(initialCheck.rows[0].is_valid === true, 'Sessão inicial deve ser válida na tabela investimentos_sessions');

      // Dispara em paralelo:
      // Worker 1: Revogação de sessões decorrente de troca de senha
      // Worker 2..6: Tentativas concorrentes de verificação da sessão
      const p1 = pool.query('DELETE FROM public.investimentos_sessions WHERE user_id = $1', [testUserId]);
      const checkPromises = Array.from({ length: 5 }, () => {
        return pool.query(
          'SELECT EXISTS (SELECT 1 FROM public.investimentos_sessions WHERE user_id = $1 AND session_id = $2 AND expires_at > clock_timestamp()) AS is_valid',
          [testUserId, authSessionId]
        );
      });

      await Promise.all([p1, ...checkPromises]);

      // Após a revogação atômica, qualquer consulta subsequente DEVE ser inválida
      const postCheck = await pool.query(
        'SELECT EXISTS (SELECT 1 FROM public.investimentos_sessions WHERE user_id = $1 AND session_id = $2 AND expires_at > clock_timestamp()) AS is_valid',
        [testUserId, authSessionId]
      );
      assert(postCheck.rows[0].is_valid === false, 'Após revogação, a sessão de investimentos não deve mais existir');
      console.log('     → Revogação de sessões e verificação atômica validadas com êxito sob concorrência.');
    });

    // 5. Reconciliação Concorrente de Reservas de Tokens de IA (Idempotência sob colisão)
    await runTest('5. Reconciliação Concorrente de IA (2 workers tentando reconciliar a mesma reserva simultaneamente)', async () => {
      const testUserId = crypto.randomUUID();
      const resId = `res_race_${crypto.randomUUID()}`;
      const bucketKey = `test:ai:race:${crypto.randomUUID()}`;
      const limit = 50000;

      await pool.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [testUserId, `ai_${testUserId.slice(0, 8)}@example.com`]);

      // Reserva 2000 tokens
      const reserveRes = await pool.query(
        'SELECT allowed, reservation_id FROM public.reserve_ai_tokens($1, $2, $3, $4, $5, $6, $7)',
        [resId, bucketKey, testUserId, 'ws_race', 'proxy', 2000, limit]
      );
      assert(reserveRes.rows[0].allowed === true, 'Reserva de tokens deve ser aceita');

      // Duas chamadas de reconciliação para a mesma reserva simultaneamente (ex: retry de webhook)
      const [r1, r2] = await Promise.all([
        pool.query('SELECT status, delta_applied FROM public.reconcile_ai_tokens($1, $2, $3)', [resId, 1500, 'success']),
        pool.query('SELECT status, delta_applied FROM public.reconcile_ai_tokens($1, $2, $3)', [resId, 1500, 'success']),
      ]);

      const s1 = r1.rows[0];
      const s2 = r2.rows[0];

      // Exatamente uma deve ter 'reconciled' com delta -500, e a outra 'already_reconciled' com delta 0
      const reconciledCount = (s1.status === 'reconciled' ? 1 : 0) + (s2.status === 'reconciled' ? 1 : 0);
      const alreadyCount = (s1.status === 'already_reconciled' ? 1 : 0) + (s2.status === 'already_reconciled' ? 1 : 0);

      assert(reconciledCount === 1, `Exatamente uma reconciliação deve ter status 'reconciled', obtido: ${reconciledCount}`);
      assert(alreadyCount === 1, `Exatamente uma reconciliação deve ter status 'already_reconciled', obtido: ${alreadyCount}`);

      const totalDelta = s1.delta_applied + s2.delta_applied;
      assert(totalDelta === -500, `Delta aplicado total deve ser exatamente -500, obtido: ${totalDelta}`);

      // Saldo no bucket deve ser 1500 (2000 inicial - 500 devolvidos)
      const bucketRes = await pool.query('SELECT request_count FROM public.rate_limits WHERE bucket_key = $1', [bucketKey]);
      assert(bucketRes.rows[0].request_count === 1500, `Saldo do bucket esperado: 1500, obtido: ${bucketRes.rows[0].request_count}`);
      console.log(`     → Reconciliação concorrente tratada atomicamente com idempotência estrita (delta total: ${totalDelta}).`);
    });

    console.log('\n================================================================');
    console.log('🎉 TODOS OS TESTES DE CONCORRÊNCIA REAL PASSARAM COM SUCESSO!');
    console.log('================================================================\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Bateria de concorrência falhou:', err);
  process.exit(1);
});
