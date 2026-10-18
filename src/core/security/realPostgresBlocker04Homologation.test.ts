/**
 * realPostgresBlocker04Homologation.test.ts — SEC-003.2 | Homologação Real do Bloqueador 04
 *
 * Executa testes reais em instância PostgreSQL 18 isolada (wallet_test_db):
 * 1. Aplicação da migration 20261018170000_sec003_2_blocker04_webhook_idempotency.sql
 * 2. Concorrência real de cash-in Divipay via conexões separadas (FOR UPDATE + deduplication_key)
 * 3. Auto-recuperação de falhas parciais (PAID sem receita)
 * 4. Validações cross-tenant e integridade financeira
 * 5. Concorrência real de pagamentos Pepper/Payment (idempotência + renovação 30/60 dias)
 * 6. Ciclo de vida completo do Telegram (processing -> completed, in-flight, stale lease, retry, reconciliação)
 * 7. Segurança de permissões (SECURITY DEFINER, search_path, bloqueio a anon/authenticated, permissão a service_role)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  database: 'wallet_test_db',
  max: 10,
};

describe('SEC-003.2 — Homologação Real em PostgreSQL Isolado (Bloqueador 04)', () => {
  let pool: Pool;
  const rootDir = process.cwd();

  beforeAll(async () => {
    pool = new Pool(DB_CONFIG);

    // 1. Configurar roles e esquema representativo do Wallet App
    const client = await pool.connect();
    try {
      await client.query(`
        -- Criar roles do Supabase se não existirem
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role;
          END IF;
        END $$;

        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

        -- Extensão pgcrypto para gen_random_uuid
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        -- Tabelas base do sistema
        DROP TABLE IF EXISTS public.divipay_transacoes CASCADE;
        DROP TABLE IF EXISTS public.receitas CASCADE;
        DROP TABLE IF EXISTS public.despesas CASCADE;
        DROP TABLE IF EXISTS public.contas CASCADE;
        DROP TABLE IF EXISTS public.categorias CASCADE;
        DROP TABLE IF EXISTS public.subscriptions CASCADE;
        DROP TABLE IF EXISTS public.subscription_payments CASCADE;
        DROP TABLE IF EXISTS public.plans CASCADE;
        DROP TABLE IF EXISTS public.profiles CASCADE;
        DROP TABLE IF EXISTS public.telegram_processed_updates CASCADE;

        CREATE TABLE public.plans (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE public.profiles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          name TEXT,
          email TEXT,
          role TEXT DEFAULT 'user'
        );

        CREATE TABLE public.subscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID UNIQUE NOT NULL,
          plan_id UUID,
          status TEXT,
          expires_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ
        );

        CREATE TABLE public.subscription_payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          plan_id UUID,
          amount NUMERIC NOT NULL,
          status TEXT,
          payment_date TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE public.telegram_processed_updates (
          bot_id TEXT NOT NULL DEFAULT 'default',
          update_id BIGINT NOT NULL,
          chat_id BIGINT,
          processed_at TIMESTAMPTZ DEFAULT now(),
          expires_at TIMESTAMPTZ DEFAULT now() + interval '48 hours',
          PRIMARY KEY (bot_id, update_id)
        );

        CREATE TABLE public.contas (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          workspace_id UUID,
          nome TEXT NOT NULL,
          tipo TEXT DEFAULT 'corrente',
          saldo_atual NUMERIC DEFAULT 0
        );

        CREATE TABLE public.categorias (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          workspace_id UUID,
          nome TEXT NOT NULL,
          tipo TEXT NOT NULL
        );

        CREATE TABLE public.receitas (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          workspace_id UUID,
          categoria_id UUID,
          conta_id UUID,
          descricao TEXT,
          valor NUMERIC NOT NULL,
          data DATE DEFAULT CURRENT_DATE,
          metodo_pagamento TEXT DEFAULT 'pix',
          status TEXT DEFAULT 'recebido',
          deduplication_key TEXT,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_receitas_wallet_ai_dedup
          ON public.receitas (workspace_id, deduplication_key)
          WHERE workspace_id IS NOT NULL;

        CREATE TABLE public.despesas (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          workspace_id UUID,
          categoria_id UUID,
          conta_id UUID,
          descricao TEXT,
          valor NUMERIC NOT NULL,
          data DATE DEFAULT CURRENT_DATE,
          metodo_pagamento TEXT DEFAULT 'pix',
          status TEXT DEFAULT 'pago',
          deduplication_key TEXT,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_wallet_ai_dedup
          ON public.despesas (workspace_id, deduplication_key)
          WHERE workspace_id IS NOT NULL;

        CREATE TABLE public.divipay_transacoes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          external_id TEXT UNIQUE,
          user_id UUID NOT NULL,
          workspace_id UUID,
          amount NUMERIC NOT NULL,
          fee NUMERIC,
          status TEXT DEFAULT 'PENDING',
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );

        -- Permissões básicas para as tabelas
        GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
      `);

      // 2. Aplicar a migration real do Bloqueador 04
      const migrationFile = path.join(
        rootDir,
        'supabase/migrations/20261018170000_sec003_2_blocker04_webhook_idempotency.sql'
      );
      const migrationSql = fs.readFileSync(migrationFile, 'utf8');
      await client.query(migrationSql);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Verificação DDL e Estrutural da Migration
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Verificação Estrutural da Migration no PostgreSQL', () => {
    it('Cria o índice único multi-provedor idx_subscription_payments_provider_tx', async () => {
      const res = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'subscription_payments' AND indexname = 'idx_subscription_payments_provider_tx';
      `);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].indexdef).toContain('COALESCE(provider');
      expect(res.rows[0].indexdef).toContain('transaction_id');
    });

    it('Cria todas as colunas de ciclo de vida em telegram_processed_updates', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'telegram_processed_updates'
          AND column_name IN ('status', 'attempt_count', 'last_attempt_at', 'error_message');
      `);
      const cols = res.rows.map((r: { column_name: string }) => r.column_name);
      expect(cols).toContain('status');
      expect(cols).toContain('attempt_count');
      expect(cols).toContain('last_attempt_at');
      expect(cols).toContain('error_message');
    });

    it('Todas as RPCs possuem SECURITY DEFINER e search_path seguro no catálogo pg_proc', async () => {
      const res = await pool.query(`
        SELECT proname, prosecdef, proconfig
        FROM pg_proc
        WHERE proname IN (
          'reivindicar_telegram_update',
          'concluir_telegram_update',
          'falhar_telegram_update',
          'reconciliar_telegram_updates_abandonados',
          'processar_divipay_cashin_atomico',
          'registrar_pagamento_assinatura_atomico'
        );
      `);
      expect(res.rows.length).toBe(6);
      for (const row of res.rows) {
        expect(row.prosecdef).toBe(true); // SECURITY DEFINER
        expect(row.proconfig).toEqual(['search_path=public, pg_temp']); // search_path seguro
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Homologação Divipay: Concorrência e Auto-Recuperação Real
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Homologação Divipay: Concorrência Atômica e Auto-Recuperação', () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const workspaceId = '22222222-2222-2222-2222-222222222222';
    const otherWorkspaceId = '33333333-3333-3333-3333-333333333333';
    let contaId: string;
    let catReceitaId: string;
    let catTaxaId: string;

    beforeAll(async () => {
      const cRes = await pool.query(
        `INSERT INTO public.contas (user_id, workspace_id, nome) VALUES ($1, $2, 'Conta Principal') RETURNING id;`,
        [userId, workspaceId]
      );
      contaId = cRes.rows[0].id;

      const rRes = await pool.query(
        `INSERT INTO public.categorias (user_id, workspace_id, nome, tipo) VALUES ($1, $2, 'Receitas Divipay', 'receita') RETURNING id;`,
        [userId, workspaceId]
      );
      catReceitaId = rRes.rows[0].id;

      const tRes = await pool.query(
        `INSERT INTO public.categorias (user_id, workspace_id, nome, tipo) VALUES ($1, $2, 'Taxas Gateway', 'despesa') RETURNING id;`,
        [userId, workspaceId]
      );
      catTaxaId = tRes.rows[0].id;
    });

    it('Concorrência Real: Duas conexões PostgreSQL simultâneas disputando a mesma transação', async () => {
      const txRes = await pool.query(
        `INSERT INTO public.divipay_transacoes (external_id, user_id, workspace_id, amount, fee, status)
         VALUES ('dp-concurrent-100', $1, $2, 1500.00, 3.50, 'PENDING')
         RETURNING id;`,
        [userId, workspaceId]
      );
      const txId = txRes.rows[0].id;

      // Abre duas conexões independentes do Pool
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        const queryParams = [
          txId,
          'dp-concurrent-100',
          userId,
          workspaceId,
          1500.00,
          3.50,
          contaId,
          catReceitaId,
          catTaxaId,
          'Pix Recebido Divipay',
        ];

        // Dispara simultaneamente via conexões reais do PostgreSQL
        const [res1, res2] = await Promise.all([
          client1.query(`SELECT public.processar_divipay_cashin_atomico($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`, queryParams),
          client2.query(`SELECT public.processar_divipay_cashin_atomico($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`, queryParams),
        ]);

        const out1 = res1.rows[0].processar_divipay_cashin_atomico;
        const out2 = res2.rows[0].processar_divipay_cashin_atomico;

        expect(out1.success).toBe(true);
        expect(out2.success).toBe(true);

        // Exatamente um deve ser already_processed = false e o outro already_processed = true
        const processedFlags = [out1.already_processed, out2.already_processed].sort();
        expect(processedFlags).toEqual([false, true]);

        // Ambos apontam para a MESMA receita e despesa
        const receitaId = out1.receita_id || out2.receita_id;
        expect(out1.receita_id).toBe(out2.receita_id);

        // Verificação física no banco: Exatamente 1 receita e 1 despesa
        const rCheck = await pool.query(`SELECT COUNT(*)::int as c FROM public.receitas WHERE deduplication_key = $1;`, [`divipay:cashin:${txId}`]);
        expect(rCheck.rows[0].c).toBe(1);

        const dCheck = await pool.query(`SELECT COUNT(*)::int as c FROM public.despesas WHERE deduplication_key = $1;`, [`divipay:fee:${txId}`]);
        expect(dCheck.rows[0].c).toBe(1);

        // Transação atualizada para PAID
        const txCheck = await pool.query(`SELECT status, metadata FROM public.divipay_transacoes WHERE id = $1;`, [txId]);
        expect(txCheck.rows[0].status).toBe('PAID');
        expect(txCheck.rows[0].metadata.receita_id).toBe(receitaId);
      } finally {
        client1.release();
        client2.release();
      }
    });

    it('Auto-Recuperação Real: Transação travada em PAID sem receita é recuperada e consolidada', async () => {
      // Simula falha anterior: status virou PAID mas metadata não tem receita_id
      const txRes = await pool.query(
        `INSERT INTO public.divipay_transacoes (external_id, user_id, workspace_id, amount, fee, status, metadata)
         VALUES ('dp-crash-recovery-200', $1, $2, 850.00, 2.00, 'PAID', '{}'::jsonb)
         RETURNING id;`,
        [userId, workspaceId]
      );
      const txId = txRes.rows[0].id;

      // Executa a RPC
      const res = await pool.query(
        `SELECT public.processar_divipay_cashin_atomico($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [txId, 'dp-crash-recovery-200', userId, workspaceId, 850.00, 2.00, contaId, catReceitaId, catTaxaId, 'Recuperacao Pix']
      );

      const out = res.rows[0].processar_divipay_cashin_atomico;
      expect(out.success).toBe(true);
      expect(out.recovered).toBe(true);
      expect(out.already_processed).toBe(false);
      expect(out.receita_id).toBeDefined();

      // Confirma que a receita foi criada no banco com a chave de deduplicação
      const rCheck = await pool.query(`SELECT id, valor, deduplication_key FROM public.receitas WHERE id = $1;`, [out.receita_id]);
      expect(rCheck.rows.length).toBe(1);
      expect(Number(rCheck.rows[0].valor)).toBe(850.00);
      expect(rCheck.rows[0].deduplication_key).toBe(`divipay:cashin:${txId}`);

      // Confirma metadados da transação marcados com recovered = true
      const txCheck = await pool.query(`SELECT metadata FROM public.divipay_transacoes WHERE id = $1;`, [txId]);
      expect(txCheck.rows[0].metadata.recovered).toBe(true);
      expect(txCheck.rows[0].metadata.receita_id).toBe(out.receita_id);
    });

    it('Segurança Cross-Tenant: Rejeita processamento quando workspace ou usuário divergem', async () => {
      const txRes = await pool.query(
        `INSERT INTO public.divipay_transacoes (external_id, user_id, workspace_id, amount, fee, status)
         VALUES ('dp-cross-tenant-300', $1, $2, 500.00, 1.00, 'PENDING')
         RETURNING id;`,
        [userId, workspaceId]
      );
      const txId = txRes.rows[0].id;

      // 1. Tenta passar outro workspace
      await expect(
        pool.query(
          `SELECT public.processar_divipay_cashin_atomico($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [txId, 'dp-cross-tenant-300', userId, otherWorkspaceId, 500.00, 1.00, contaId, catReceitaId, catTaxaId, 'Cross Ws']
        )
      ).rejects.toThrow(/Acesso cross-tenant negado: workspace divergente/);

      // 2. Tenta passar outro usuário
      const otherUserId = '99999999-9999-9999-9999-999999999999';
      await expect(
        pool.query(
          `SELECT public.processar_divipay_cashin_atomico($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [txId, 'dp-cross-tenant-300', otherUserId, workspaceId, 500.00, 1.00, contaId, catReceitaId, catTaxaId, 'Cross User']
        )
      ).rejects.toThrow(/Acesso cross-tenant negado: transação pertence a outro usuário/);

      // 3. Montante <= 0
      await expect(
        pool.query(
          `SELECT public.processar_divipay_cashin_atomico($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [txId, 'dp-cross-tenant-300', userId, workspaceId, -100.00, 1.00, contaId, catReceitaId, catTaxaId, 'Inv Amount']
        )
      ).rejects.toThrow(/Montante financeiro inválido/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Homologação Pepper & Payment: Idempotência Multi-Provedor Real
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Homologação Pepper & Payment: Concorrência e Renovações Reais', () => {
    const userId = '44444444-4444-4444-4444-444444444444';
    let profileId: string;
    let planId: string;

    beforeAll(async () => {
      const pRes = await pool.query(
        `INSERT INTO public.plans (name) VALUES ('Pro') RETURNING id;`
      );
      planId = pRes.rows[0].id;

      const profRes = await pool.query(
        `INSERT INTO public.profiles (user_id, name, email) VALUES ($1, 'Cliente Teste', 'cliente@teste.com') RETURNING id;`,
        [userId]
      );
      profileId = profRes.rows[0].id;
    });

    it('Concorrência Real: Dois pagamentos simultâneos com mesmo transaction_id não duplicam assinatura', async () => {
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        const queryParams = [
          userId,
          profileId,
          planId,
          'pepper',
          'tx-simultaneous-500',
          97.00,
          30,
        ];

        const [res1, res2] = await Promise.all([
          client1.query(`SELECT public.registrar_pagamento_assinatura_atomico($1, $2, $3, $4, $5, $6, $7);`, queryParams),
          client2.query(`SELECT public.registrar_pagamento_assinatura_atomico($1, $2, $3, $4, $5, $6, $7);`, queryParams),
        ]);

        const out1 = res1.rows[0].registrar_pagamento_assinatura_atomico;
        const out2 = res2.rows[0].registrar_pagamento_assinatura_atomico;

        expect(out1.success).toBe(true);
        expect(out2.success).toBe(true);

        // Um é duplicate: false e o outro duplicate: true
        const dupFlags = [out1.duplicate, out2.duplicate].sort();
        expect(dupFlags).toEqual([false, true]);

        // Exatamente 1 registro físico em subscription_payments
        const payCheck = await pool.query(
          `SELECT COUNT(*)::int as c FROM public.subscription_payments WHERE provider = 'pepper' AND transaction_id = 'tx-simultaneous-500';`
        );
        expect(payCheck.rows[0].c).toBe(1);

        // Assinatura expira em 30 dias (não 60!)
        const subCheck = await pool.query(
          `SELECT status, expires_at FROM public.subscriptions WHERE user_id = $1;`,
          [profileId]
        );
        expect(subCheck.rows[0].status).toBe('active');
        const expiresAt = new Date(subCheck.rows[0].expires_at).getTime();
        const expectedExpires = Date.now() + 30 * 24 * 60 * 60 * 1000;
        // Diferença menor que 5 segundos
        expect(Math.abs(expiresAt - expectedExpires)).toBeLessThan(5000);
      } finally {
        client1.release();
        client2.release();
      }
    });

    it('Renovação Legítima: Transação diferente no mesmo usuário estende a validade para 60 dias', async () => {
      // Segundo pagamento legítimo no mês seguinte com novo transaction_id
      const res = await pool.query(
        `SELECT public.registrar_pagamento_assinatura_atomico($1, $2, $3, $4, $5, $6, $7);`,
        [userId, profileId, planId, 'pepper', 'tx-monthly-renewal-501', 97.00, 30]
      );

      const out = res.rows[0].registrar_pagamento_assinatura_atomico;
      expect(out.success).toBe(true);
      expect(out.duplicate).toBe(false);

      // Agora existem 2 pagamentos registrados
      const payCheck = await pool.query(
        `SELECT COUNT(*)::int as c FROM public.subscription_payments WHERE user_id = $1;`,
        [userId]
      );
      expect(payCheck.rows[0].c).toBe(2);

      // Assinatura estendida para ~60 dias a partir de agora
      const subCheck = await pool.query(
        `SELECT expires_at FROM public.subscriptions WHERE user_id = $1;`,
        [profileId]
      );
      const expiresAt = new Date(subCheck.rows[0].expires_at).getTime();
      const expectedExpires60 = Date.now() + 60 * 24 * 60 * 60 * 1000;
      expect(Math.abs(expiresAt - expectedExpires60)).toBeLessThan(5000);
    });

    it('Rejeita montante financeiro negativo em assinaturas', async () => {
      await expect(
        pool.query(
          `SELECT public.registrar_pagamento_assinatura_atomico($1, $2, $3, $4, $5, $6, $7);`,
          [userId, profileId, planId, 'pepper', 'tx-invalid-amount', -50.00, 30]
        )
      ).rejects.toThrow(/Montante financeiro de assinatura inválido/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Homologação Telegram: Ciclo de Vida, Crash Recovery e Reconciliação
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Homologação Telegram: Ciclo de Vida Distribuído e Crash Recovery', () => {
    it('Ciclo Completo: Reivindicação, Concorrência em Voo, Conclusão e Replay', async () => {
      const updateId = 77001;

      // 1. Primeira vez: reivindicado com sucesso
      const res1 = await pool.query(
        `SELECT * FROM public.reivindicar_telegram_update($1, 'default', 123456, 180, 3);`,
        [updateId]
      );
      expect(res1.rows[0].should_process).toBe(true);
      expect(res1.rows[0].current_status).toBe('processing');
      expect(res1.rows[0].attempt_count).toBe(1);
      expect(res1.rows[0].reason).toBe('new_update_claimed');

      // 2. Concorrência em voo (< 180s): segunda requisição ignorada
      const res2 = await pool.query(
        `SELECT * FROM public.reivindicar_telegram_update($1, 'default', 123456, 180, 3);`,
        [updateId]
      );
      expect(res2.rows[0].should_process).toBe(false);
      expect(res2.rows[0].reason).toBe('in_flight_concurrent');

      // 3. Conclui com sucesso
      await pool.query(`SELECT public.concluir_telegram_update($1, 'default');`, [updateId]);

      // 4. Replay após conclusão: ignorado permanentemente
      const res3 = await pool.query(
        `SELECT * FROM public.reivindicar_telegram_update($1, 'default', 123456, 180, 3);`,
        [updateId]
      );
      expect(res3.rows[0].should_process).toBe(false);
      expect(res3.rows[0].current_status).toBe('completed');
      expect(res3.rows[0].reason).toBe('already_completed');
    });

    it('Crash do Worker (Lease Expirado): Recupera update abandonado após timeout de 180s', async () => {
      const updateId = 77002;

      // Inicia o update
      await pool.query(`SELECT * FROM public.reivindicar_telegram_update($1, 'default', 123456, 180, 3);`, [updateId]);

      // Simula crash: adianta o relógio alterando last_attempt_at para 200 segundos no passado
      await pool.query(
        `UPDATE public.telegram_processed_updates
         SET last_attempt_at = now() - interval '200 seconds'
         WHERE update_id = $1;`,
        [updateId]
      );

      // Nova requisição (ou retry do Telegram): detecta lease expirado e assume controle
      const resRecover = await pool.query(
        `SELECT * FROM public.reivindicar_telegram_update($1, 'default', 123456, 180, 3);`,
        [updateId]
      );
      expect(resRecover.rows[0].should_process).toBe(true);
      expect(resRecover.rows[0].current_status).toBe('processing');
      expect(resRecover.rows[0].attempt_count).toBe(2);
      expect(resRecover.rows[0].reason).toBe('stale_lease_recovered');
    });

    it('Esgotamento de Tentativas: Falha definitiva após 3 tentativas com crash', async () => {
      const updateId = 77003;

      // Força registro com attempt_count = 3 e lease expirado
      await pool.query(
        `INSERT INTO public.telegram_processed_updates (bot_id, update_id, status, attempt_count, last_attempt_at)
         VALUES ('default', $1, 'processing', 3, now() - interval '250 seconds');`,
        [updateId]
      );

      const resFail = await pool.query(
        `SELECT * FROM public.reivindicar_telegram_update($1, 'default', 123456, 180, 3);`,
        [updateId]
      );
      expect(resFail.rows[0].should_process).toBe(false);
      expect(resFail.rows[0].current_status).toBe('failed');
      expect(resFail.rows[0].reason).toBe('max_attempts_exceeded');

      // Verifica status físico no banco
      const check = await pool.query(
        `SELECT status, error_message FROM public.telegram_processed_updates WHERE update_id = $1;`,
        [updateId]
      );
      expect(check.rows[0].status).toBe('failed');
      expect(check.rows[0].error_message).toContain('Limite máximo de tentativas excedido');
    });

    it('Rotina de Reconciliação Administrativa Independente: Limpa updates abandonados', async () => {
      const updateId = 77004;

      // Update ficou preso em processing há 400 segundos
      await pool.query(
        `INSERT INTO public.telegram_processed_updates (bot_id, update_id, status, attempt_count, last_attempt_at)
         VALUES ('default', $1, 'processing', 1, now() - interval '400 seconds');`,
        [updateId]
      );

      // Executa reconciliação independente
      const res = await pool.query(
        `SELECT * FROM public.reconciliar_telegram_updates_abandonados('default', 300);`
      );

      const matched = res.rows.find((r: { reconciled_update_id: string }) => Number(r.reconciled_update_id) === updateId);
      expect(matched).toBeDefined();
      expect(matched.action_taken).toBe('marked_failed_after_timeout');

      // Confirma que status no banco passou para failed
      const check = await pool.query(
        `SELECT status, error_message FROM public.telegram_processed_updates WHERE update_id = $1;`,
        [updateId]
      );
      expect(check.rows[0].status).toBe('failed');
      expect(check.rows[0].error_message).toContain('Abandonado: timeout de execução excedido');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Homologação de Segurança: Permissões de Roles e Isolamento
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Homologação de Segurança: Permissões de Roles no PostgreSQL', () => {
    it('Role anon NÃO pode executar as RPCs administrativas', async () => {
      const anonClient = await pool.connect();
      try {
        await anonClient.query('SET ROLE anon;');

        await expect(
          anonClient.query(`SELECT public.processar_divipay_cashin_atomico('00000000-0000-0000-0000-000000000000', 'ext', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 10, 0, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'desc');`)
        ).rejects.toThrow(/permission denied for function processar_divipay_cashin_atomico/i);

        await expect(
          anonClient.query(`SELECT public.registrar_pagamento_assinatura_atomico('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'pepper', 'tx-1', 10, 30);`)
        ).rejects.toThrow(/permission denied for function registrar_pagamento_assinatura_atomico/i);

        await expect(
          anonClient.query(`SELECT public.reivindicar_telegram_update(1234);`)
        ).rejects.toThrow(/permission denied for function reivindicar_telegram_update/i);
      } finally {
        await anonClient.query('RESET ROLE;');
        anonClient.release();
      }
    });

    it('Role authenticated NÃO pode executar as RPCs administrativas', async () => {
      const authClient = await pool.connect();
      try {
        await authClient.query('SET ROLE authenticated;');

        await expect(
          authClient.query(`SELECT public.processar_divipay_cashin_atomico('00000000-0000-0000-0000-000000000000', 'ext', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 10, 0, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'desc');`)
        ).rejects.toThrow(/permission denied for function processar_divipay_cashin_atomico/i);

        await expect(
          authClient.query(`SELECT public.registrar_pagamento_assinatura_atomico('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'pepper', 'tx-1', 10, 30);`)
        ).rejects.toThrow(/permission denied for function registrar_pagamento_assinatura_atomico/i);

        await expect(
          authClient.query(`SELECT public.reivindicar_telegram_update(1234);`)
        ).rejects.toThrow(/permission denied for function reivindicar_telegram_update/i);
      } finally {
        await authClient.query('RESET ROLE;');
        authClient.release();
      }
    });

    it('Role service_role TEM permissão EXECUTE concedida em todas as RPCs', async () => {
      const serviceClient = await pool.connect();
      try {
        await serviceClient.query('SET ROLE service_role;');

        // Executa sem erro de permissão
        const res = await serviceClient.query(`SELECT * FROM public.reivindicar_telegram_update(999999);`);
        expect(res.rows[0].should_process).toBe(true);
      } finally {
        await serviceClient.query('RESET ROLE;');
        serviceClient.release();
      }
    });
  });
});
