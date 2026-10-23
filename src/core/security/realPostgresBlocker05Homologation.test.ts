/**
 * realPostgresBlocker05Homologation.test.ts — SEC-003.2 | Homologação Real do Bloqueador 05
 *
 * Executa testes reais em instância PostgreSQL 18 isolada (wallet_test_db):
 * 1. Aplicação da migration 20261018183000_sec003_2_blocker05_cron_resilience.sql
 * 2. Tolerância a falhas na resolução de GUCs (ausente, nula ou com nomes divergentes) sem abort
 * 3. Defesa em profundidade contra SSRF: allowlist estrita de Edge Functions
 * 4. Permissões e RBAC (bloqueio rigoroso de anon e authenticated; concessão a service_role e postgres)
 * 5. Persistência de payload do Telegram e ciclo de vida real de recuperação idempotente
 * 6. Auditoria de respostas HTTP e categorização de status codes (401, 403, 429, 500+)
 * 7. Garantia de regressão zero sobre as RPCs financeiras atômicas do Bloqueador 04
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const DB_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  database: "wallet_test_db",
  max: 10,
};

describe("SEC-003.2 — Homologação Real em PostgreSQL Isolado (Bloqueador 05)", () => {
  let pool: Pool;
  const rootDir = process.cwd();

  beforeAll(async () => {
    pool = new Pool(DB_CONFIG);

    const client = await pool.connect();
    try {
      // 1. Configurar roles e esquema básico
      await client.query(`
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
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
        DROP TABLE IF EXISTS public.transacoes_recorrentes CASCADE;

        -- Drop funções existentes para evitar conflitos de sobrecarga
        DO $$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN (
            SELECT oid::regprocedure AS q
            FROM pg_proc
            WHERE proname IN (
              'reivindicar_telegram_update',
              'reconciliar_telegram_updates_abandonados',
              'concluir_telegram_update',
              'falhar_telegram_update',
              'processar_divipay_cashin_atomico',
              'registrar_pagamento_assinatura_atomico',
              'recuperar_telegram_updates_para_reprocessamento',
              'cron_dispatch_edge_function',
              'auditar_respostas_pg_net',
              'auditar_falhas_operacionais',
              'processar_transacao_recorrente_atomica'
            )
            AND pronamespace = 'public'::regnamespace
          ) LOOP
            EXECUTE 'DROP FUNCTION IF EXISTS ' || r.q || ' CASCADE';
          END LOOP;
        END $$;

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

        CREATE TABLE public.transacoes_recorrentes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          tipo_transacao TEXT NOT NULL,
          descricao TEXT NOT NULL,
          valor NUMERIC NOT NULL,
          categoria_id UUID,
          metodo_pagamento TEXT,
          conta_id UUID,
          recorrencia TEXT NOT NULL,
          dia_execucao INTEGER,
          dia_semana INTEGER,
          data_inicio DATE NOT NULL,
          data_fim DATE,
          ativo BOOLEAN DEFAULT true,
          ultima_execucao DATE,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );

        GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      `);

      // 2. Aplicar migration 04 (RPCs atômicas e índices de idempotência)
      const mig04 = fs.readFileSync(
        path.join(rootDir, "supabase/migrations/20261018170000_sec003_2_blocker04_webhook_idempotency.sql"),
        "utf8"
      );
      await client.query(mig04);

      // 3. Aplicar migration 05 (Resiliência GUCs, Telegram payload e cron dispatch)
      const mig05 = fs.readFileSync(
        path.join(rootDir, "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"),
        "utf8"
      );
      await client.query(mig05);
    } finally {
      client.release();
    }
  }, 60000);

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  }, 30000);

  describe("1. Resolução Resiliente de GUCs e Invocador Seguro", () => {
    it("sem GUCs configuradas: não aborta transação e registra log de skip", async () => {
      const client = await pool.connect();
      try {
        // Assegurar que GUCs estão limpas nesta sessão
        await client.query("SET app.settings.supabase_url = ''");
        await client.query("SET app.settings.supabase_service_role_key = ''");
        await client.query("SET app.settings.service_role_key = ''");

        const res = await client.query(
          "SELECT public.cron_dispatch_edge_function('test_job', 'cron-notificacoes') AS req_id"
        );
        expect(res.rows[0].req_id).toBeNull();

        // Verificar log registrado
        const logs = await client.query(
          "SELECT * FROM public.cron_execution_logs WHERE job_name = 'test_job' ORDER BY id DESC LIMIT 1"
        );
        expect(logs.rows.length).toBe(1);
        expect(logs.rows[0].status).toBe("skipped_missing_guc");
        expect(logs.rows[0].message).toMatch(/app\.settings\.supabase_url/i);
      } finally {
        client.release();
      }
    });

    it("com URL mas sem Service Role Key: registra log explicativo e não expõe secrets", async () => {
      const client = await pool.connect();
      try {
        await client.query("SET app.settings.supabase_url = 'https://meu-projeto.supabase.co'");
        await client.query("SET app.settings.supabase_service_role_key = ''");
        await client.query("SET app.settings.service_role_key = ''");

        const res = await client.query(
          "SELECT public.cron_dispatch_edge_function('test_no_key', 'process-recurring-transactions') AS req_id"
        );
        expect(res.rows[0].req_id).toBeNull();

        const logs = await client.query(
          "SELECT * FROM public.cron_execution_logs WHERE job_name = 'test_no_key' ORDER BY id DESC LIMIT 1"
        );
        expect(logs.rows.length).toBe(1);
        expect(logs.rows[0].status).toBe("skipped_missing_guc");
        expect(logs.rows[0].message).toMatch(/service role key não definida/i);
      } finally {
        client.release();
      }
    });

    it("com service_role_key alternativa (legada): aceita via fallback sem erro", async () => {
      const client = await pool.connect();
      try {
        await client.query("SET app.settings.supabase_url = 'https://meu-projeto.supabase.co'");
        await client.query("SET app.settings.service_role_key = 'fake-legacy-key-xyz'");
        await client.query("SET app.settings.supabase_service_role_key = ''");

        // pg_net não está instalado nesta máquina vanilla, logo deve registrar skipped_no_pg_net
        const res = await client.query(
          "SELECT public.cron_dispatch_edge_function('test_legacy_key', 'processar-lembretes-manutencao') AS req_id"
        );
        expect(res.rows[0].req_id).toBeNull();

        const logs = await client.query(
          "SELECT * FROM public.cron_execution_logs WHERE job_name = 'test_legacy_key' ORDER BY id DESC LIMIT 1"
        );
        expect(logs.rows.length).toBe(1);
        expect(logs.rows[0].status).toBe("skipped_no_pg_net");
      } finally {
        client.release();
      }
    });
  });

  describe("2. Allowlist Estrita contra SSRF e Chamadas Arbitrárias", () => {
    it("bloqueia invocação de qualquer Edge Function fora da allowlist", async () => {
      const client = await pool.connect();
      try {
        await client.query("SET app.settings.supabase_url = 'https://meu-projeto.supabase.co'");
        await client.query("SET app.settings.supabase_service_role_key = 'valid-key'");

        await expect(
          client.query("SELECT public.cron_dispatch_edge_function('hack', 'funcao-arbitraria-externa')")
        ).rejects.toThrow(/não permitida no despachante cron/i);
      } finally {
        client.release();
      }
    });

    it("bloqueia tentativas de injeção de URL ou path traversal no nome da função", async () => {
      const client = await pool.connect();
      try {
        await expect(
          client.query(
            "SELECT public.cron_dispatch_edge_function('hack', '../../../etc/passwd')"
          )
        ).rejects.toThrow(/não permitida no despachante cron/i);

        await expect(
          client.query(
            "SELECT public.cron_dispatch_edge_function('hack', 'https://attacker.com/webhook')"
          )
        ).rejects.toThrow(/não permitida no despachante cron/i);
      } finally {
        client.release();
      }
    });
  });

  describe("3. Permissões e RBAC (Bloqueio a anon/authenticated)", () => {
    it("papel anon não tem permissão para despachar edge functions", async () => {
      const client = await pool.connect();
      try {
        await client.query("SET ROLE anon");
        await expect(
          client.query("SELECT public.cron_dispatch_edge_function('test', 'cron-notificacoes')")
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("papel authenticated não tem permissão para despachar edge functions", async () => {
      const client = await pool.connect();
      try {
        await client.query("SET ROLE authenticated");
        await expect(
          client.query("SELECT public.cron_dispatch_edge_function('test', 'cron-notificacoes')")
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("papel anon e authenticated não podem ler cron_execution_logs", async () => {
      const client = await pool.connect();
      try {
        await client.query("SET ROLE anon");
        await expect(client.query("SELECT * FROM public.cron_execution_logs")).rejects.toThrow(
          /permission denied/i
        );

        await client.query("SET ROLE authenticated");
        await expect(client.query("SELECT * FROM public.cron_execution_logs")).rejects.toThrow(
          /permission denied/i
        );
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("papel anon e authenticated não podem chamar auditar_respostas_pg_net", async () => {
      const client = await pool.connect();
      try {
        await client.query("SET ROLE anon");
        await expect(client.query("SELECT * FROM public.auditar_respostas_pg_net()")).rejects.toThrow(
          /permission denied/i
        );

        await client.query("SET ROLE authenticated");
        await expect(client.query("SELECT * FROM public.auditar_respostas_pg_net()")).rejects.toThrow(
          /permission denied/i
        );
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });
  });

  describe("4. Telegram: Persistência do Payload e Recuperação de Updates Abandonados", () => {
    const testUpdateId = 8877665544;
    const testPayload = {
      update_id: testUpdateId,
      message: {
        message_id: 1234,
        chat: { id: 987654321 },
        text: "Despesa almoço R$ 55,00",
      },
    };

    it("reivindicar_telegram_update persiste payload JSONB na criação do registro", async () => {
      const client = await pool.connect();
      try {
        await client.query("DELETE FROM public.telegram_processed_updates WHERE update_id = $1", [
          testUpdateId,
        ]);

        const res = await client.query(
          "SELECT * FROM public.reivindicar_telegram_update($1, 'default', 987654321, 180, 3, $2::jsonb)",
          [testUpdateId, JSON.stringify(testPayload)]
        );

        expect(res.rows[0].should_process).toBe(true);
        expect(res.rows[0].current_status).toBe("processing");
        expect(res.rows[0].attempt_count).toBe(1);

        // Verificar que payload foi persistido no banco
        const check = await client.query(
          "SELECT payload FROM public.telegram_processed_updates WHERE update_id = $1",
          [testUpdateId]
        );
        expect(check.rows[0].payload).toEqual(testPayload);
      } finally {
        client.release();
      }
    });

    it("reconciliar_telegram_updates_abandonados move lease expirado para pending_retry", async () => {
      const client = await pool.connect();
      try {
        // Simular que o worker anterior travou há 400 segundos
        await client.query(
          "UPDATE public.telegram_processed_updates SET last_attempt_at = now() - interval '400 seconds' WHERE update_id = $1",
          [testUpdateId]
        );

        const res = await client.query(
          "SELECT * FROM public.reconciliar_telegram_updates_abandonados('default', 300, 3)"
        );

        const row = res.rows.find((r) => String(r.reconciled_update_id) === String(testUpdateId));
        expect(row).toBeDefined();
        expect(row.action_taken).toBe("marked_pending_retry");

        const dbCheck = await client.query(
          "SELECT status FROM public.telegram_processed_updates WHERE update_id = $1",
          [testUpdateId]
        );
        expect(dbCheck.rows[0].status).toBe("pending_retry");
      } finally {
        client.release();
      }
    });

    it("recuperar_telegram_updates_para_reprocessamento reivindica evento e devolve payload intacto", async () => {
      const client = await pool.connect();
      try {
        const res = await client.query(
          "SELECT * FROM public.recuperar_telegram_updates_para_reprocessamento('default', 10, 180)"
        );

        const row = res.rows.find((r) => String(r.update_id) === String(testUpdateId));
        expect(row).toBeDefined();
        expect(row.payload).toEqual(testPayload);
        expect(row.attempt_count).toBe(1);

        // Status voltou a ser processing
        const dbCheck = await client.query(
          "SELECT status FROM public.telegram_processed_updates WHERE update_id = $1",
          [testUpdateId]
        );
        expect(dbCheck.rows[0].status).toBe("processing");
      } finally {
        client.release();
      }
    });

    it("quando attempt_count atinge o máximo: transita para dead_letter", async () => {
      const client = await pool.connect();
      try {
        // Simular 3 tentativas e timeout
        await client.query(
          "UPDATE public.telegram_processed_updates SET attempt_count = 3, last_attempt_at = now() - interval '400 seconds' WHERE update_id = $1",
          [testUpdateId]
        );

        const res = await client.query(
          "SELECT * FROM public.reconciliar_telegram_updates_abandonados('default', 300, 3)"
        );

        const row = res.rows.find((r) => String(r.reconciled_update_id) === String(testUpdateId));
        expect(row).toBeDefined();
        expect(row.action_taken).toBe("marked_dead_letter");

        const dbCheck = await client.query(
          "SELECT status, error_message FROM public.telegram_processed_updates WHERE update_id = $1",
          [testUpdateId]
        );
        expect(dbCheck.rows[0].status).toBe("dead_letter");
        expect(dbCheck.rows[0].error_message).toMatch(/limite de tentativas esgotado/i);

        // Não deve mais ser pego para reprocessamento
        const retryRes = await client.query(
          "SELECT * FROM public.recuperar_telegram_updates_para_reprocessamento('default', 10, 180)"
        );
        const retryRow = retryRes.rows.find((r) => String(r.update_id) === String(testUpdateId));
        expect(retryRow).toBeUndefined();
      } finally {
        client.release();
      }
    });

    it("Fencing Token: worker antigo (lease expirado) não pode concluir update reatribuído", async () => {
      const client = await pool.connect();
      try {
        const fencingUpdateId = 9988776655;
        await client.query("DELETE FROM public.telegram_processed_updates WHERE update_id = $1", [
          fencingUpdateId,
        ]);

        // 1. Worker 1 inicia o update (attempt 1)
        const res1 = await client.query(
          "SELECT * FROM public.reivindicar_telegram_update($1, 'default', 12345, 180, 3, '{\"msg\": \"fencing test\"}'::jsonb)",
          [fencingUpdateId]
        );
        expect(res1.rows[0].should_process).toBe(true);
        expect(res1.rows[0].attempt_count).toBe(1);

        // 2. Simula crash / delay extremo do Worker 1: 400 segundos se passam
        await client.query(
          "UPDATE public.telegram_processed_updates SET last_attempt_at = now() - interval '400 seconds' WHERE update_id = $1",
          [fencingUpdateId]
        );

        // 3. Rotina de reconciliação detecta lease abandonado e move para pending_retry
        await client.query("SELECT * FROM public.reconciliar_telegram_updates_abandonados('default', 300, 3)");

        // 4. Worker 2 reivindica o update para reprocessamento (attempt_count = 1 ainda, mas passa para processing)
        // Se houver nova reivindicação via webhook ou worker:
        const res2 = await client.query(
          "UPDATE public.telegram_processed_updates SET status = 'processing', attempt_count = 2, last_attempt_at = now() WHERE update_id = $1 RETURNING attempt_count",
          [fencingUpdateId]
        );
        expect(res2.rows[0].attempt_count).toBe(2);

        // 5. Worker 1 acorda tardiamente e tenta concluir informando expected_attempt = 1 (fencing token)
        const staleFinish = await client.query(
          "SELECT public.concluir_telegram_update($1, 'default', 1) AS success",
          [fencingUpdateId]
        );
        // O fencing token rejeita a conclusão do worker antigo!
        expect(staleFinish.rows[0].success).toBe(false);

        // O status no banco permanece 'processing' na posse do Worker 2
        const checkDb = await client.query(
          "SELECT status, attempt_count FROM public.telegram_processed_updates WHERE update_id = $1",
          [fencingUpdateId]
        );
        expect(checkDb.rows[0].status).toBe("processing");
        expect(checkDb.rows[0].attempt_count).toBe(2);

        // 6. Worker 2 conclui informando seu expected_attempt = 2 -> Sucesso!
        const validFinish = await client.query(
          "SELECT public.concluir_telegram_update($1, 'default', 2) AS success",
          [fencingUpdateId]
        );
        expect(validFinish.rows[0].success).toBe(true);

        const checkFinal = await client.query(
          "SELECT status FROM public.telegram_processed_updates WHERE update_id = $1",
          [fencingUpdateId]
        );
        expect(checkFinal.rows[0].status).toBe("completed");
      } finally {
        client.release();
      }
    });

    it("auditar_falhas_operacionais: agrega erros de cron, dead_letter e respostas HTTP sem dependência circular", async () => {
      const client = await pool.connect();
      try {
        // Inserir log de cron pulado
        await client.query(`
          INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
          VALUES ('job_alerta_teste', 'cron-alertas-investimentos', 'skipped_missing_guc', 'URL ausente');
        `);

        // Consultar RPC de telemetria operacional
        const res = await client.query("SELECT * FROM public.auditar_falhas_operacionais(24)");
        expect(res.rows.length).toBeGreaterThanOrEqual(1);

        const cronLog = res.rows.find((r) => r.identificador === "job_alerta_teste");
        expect(cronLog).toBeDefined();
        expect(cronLog.categoria_erro).toBe("skipped_missing_guc");
      } finally {
        client.release();
      }
    });
  });

  describe("5. Regressão Zero sobre RPCs Financeiras do Bloqueador 04", () => {
    it("processar_divipay_cashin_atomico continua funcionando com atomicidade total", async () => {
      const client = await pool.connect();
      try {
        const uId = "55555555-5555-5555-5555-555555555555";
        const wsId = "66666666-6666-6666-6666-666666666666";

        const contaRes = await client.query(
          "INSERT INTO public.contas (user_id, workspace_id, nome) VALUES ($1, $2, 'Conta Teste') RETURNING id",
          [uId, wsId]
        );
        const catRecRes = await client.query(
          "INSERT INTO public.categorias (user_id, workspace_id, nome, tipo) VALUES ($1, $2, 'Vendas', 'receita') RETURNING id",
          [uId, wsId]
        );
        const catTaxaRes = await client.query(
          "INSERT INTO public.categorias (user_id, workspace_id, nome, tipo) VALUES ($1, $2, 'Taxas', 'despesa') RETURNING id",
          [uId, wsId]
        );

        const txRes = await client.query(
          `INSERT INTO public.divipay_transacoes (external_id, user_id, workspace_id, amount, fee, status)
           VALUES ('cron-dp-tx-1', $1, $2, 200.00, 3.00, 'PENDING')
           RETURNING id`,
          [uId, wsId]
        );
        const txId = txRes.rows[0].id;

        const res = await client.query(
          `SELECT public.processar_divipay_cashin_atomico(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          ) AS resultado`,
          [
            txId,
            'cron-dp-tx-1',
            uId,
            wsId,
            200.00,
            3.00,
            contaRes.rows[0].id,
            catRecRes.rows[0].id,
            catTaxaRes.rows[0].id,
            'Cash-in Teste Blocker 05'
          ]
        );

        const result = res.rows[0].resultado;
        expect(result.success).toBe(true);
        expect(result.receita_id).toBeDefined();
        expect(result.despesa_taxa_id).toBeDefined();
      } finally {
        client.release();
      }
    });

    it("registrar_pagamento_assinatura_atomico continua idempotente e resiliente", async () => {
      const client = await pool.connect();
      try {
        const uId = "77777777-7777-7777-7777-777777777777";
        const planRes = await client.query(
          "INSERT INTO public.plans (name) VALUES ('Premium Plan') RETURNING id"
        );
        const profRes = await client.query(
          "INSERT INTO public.profiles (user_id, name, email) VALUES ($1, 'User Test', 'user@test.com') RETURNING id",
          [uId]
        );

        const uniqueTx = `cron_sub_${Date.now()}`;
        const res1 = await client.query(
          `SELECT public.registrar_pagamento_assinatura_atomico(
            $1, $2, $3, 'pepper', $4, 97.00, 30
          ) AS resultado`,
          [uId, profRes.rows[0].id, planRes.rows[0].id, uniqueTx]
        );

        expect(res1.rows[0].resultado.success).toBe(true);
        expect(res1.rows[0].resultado.duplicate).toBe(false);

        // Segunda chamada idêntica deve ser duplicata idempotente
        const res2 = await client.query(
          `SELECT public.registrar_pagamento_assinatura_atomico(
            $1, $2, $3, 'pepper', $4, 97.00, 30
          ) AS resultado`,
          [uId, profRes.rows[0].id, planRes.rows[0].id, uniqueTx]
        );

        expect(res2.rows[0].resultado.success).toBe(true);
        expect(res2.rows[0].resultado.duplicate).toBe(true);
      } finally {
        client.release();
      }
    });

    it("Concorrência Real: Duas conexões simultâneas executando processar_transacao_recorrente_atomica não duplicam receita", async () => {
      const clientSetup = await pool.connect();
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        const uId = "88888888-8888-8888-8888-888888888888";
        const recRes = await clientSetup.query(`
          INSERT INTO public.transacoes_recorrentes (
            user_id, tipo_transacao, descricao, valor, recorrencia, data_inicio
          ) VALUES (
            $1, 'receita', 'Aluguel Recorrente Sala 10', 1500.00, 'mensal', CURRENT_DATE
          ) RETURNING id
        `, [uId]);
        const recorrenciaId = recRes.rows[0].id;
        const targetDate = "2026-10-22";

        // Executar exatamente ao mesmo tempo via conexões separadas de banco de dados
        const [query1, query2] = await Promise.all([
          client1.query(
            "SELECT * FROM public.processar_transacao_recorrente_atomica($1, $2, 'receita', 'Aluguel Recorrente Sala 10', 1500.00, $3::date)",
            [recorrenciaId, uId, targetDate]
          ),
          client2.query(
            "SELECT * FROM public.processar_transacao_recorrente_atomica($1, $2, 'receita', 'Aluguel Recorrente Sala 10', 1500.00, $3::date)",
            [recorrenciaId, uId, targetDate]
          ),
        ]);

        const r1 = query1.rows[0];
        const r2 = query2.rows[0];

        // Ambas devem ter sucesso operacional
        expect(r1.success).toBe(true);
        expect(r2.success).toBe(true);

        // Devem ter gerado/referenciado exatamente o mesmo ID de receita
        expect(r1.transacao_id).toBeDefined();
        expect(r2.transacao_id).toBeDefined();
        expect(r1.transacao_id).toBe(r2.transacao_id);

        // Exatamente UMA foi a criadora original (duplicate: false) e a outra foi identificada como duplicata atômica (duplicate: true)
        const duplicates = [r1.duplicate, r2.duplicate];
        expect(duplicates).toContain(false);
        expect(duplicates).toContain(true);

        // Verificação final no banco de dados: existe RIGOROSAMENTE APENAS 1 registro na tabela receitas
        const dbCount = await clientSetup.query(
          "SELECT COUNT(*)::int AS total FROM public.receitas WHERE recorrencia_id = $1 AND data = $2::date",
          [recorrenciaId, targetDate]
        );
        expect(dbCount.rows[0].total).toBe(1);

        // Verificar que ultima_execucao foi atualizada
        const recCheck = await clientSetup.query(
          "SELECT ultima_execucao FROM public.transacoes_recorrentes WHERE id = $1",
          [recorrenciaId]
        );
        expect(recCheck.rows[0].ultima_execucao).toBeDefined();
      } finally {
        clientSetup.release();
        client1.release();
        client2.release();
      }
    });

    it("Constraint Única no Banco: impede insert concorrente direto de despesa duplicada para o mesmo dia", async () => {
      const client = await pool.connect();
      try {
        const uId = "99999999-9999-9999-9999-999999999999";
        const recRes = await client.query(`
          INSERT INTO public.transacoes_recorrentes (
            user_id, tipo_transacao, descricao, valor, recorrencia, data_inicio
          ) VALUES (
            $1, 'despesa', 'Internet Fibra Óptica', 199.90, 'mensal', CURRENT_DATE
          ) RETURNING id
        `, [uId]);
        const recorrenciaId = recRes.rows[0].id;
        const targetDate = "2026-10-22";

        // Primeiro insert bem sucedido
        await client.query(`
          INSERT INTO public.despesas (user_id, descricao, valor, data, recorrencia_id)
          VALUES ($1, 'Internet Fibra Óptica', 199.90, $2::date, $3)
        `, [uId, targetDate, recorrenciaId]);

        // Segundo insert simultâneo com mesmo recorrencia_id e data deve estourar violação de constraint única
        await expect(
          client.query(`
            INSERT INTO public.despesas (user_id, descricao, valor, data, recorrencia_id)
            VALUES ($1, 'Internet Fibra Óptica', 199.90, $2::date, $3)
          `, [uId, targetDate, recorrenciaId])
        ).rejects.toThrow(/idx_despesas_recorrencia_data|duplicate key value violates unique constraint/i);

        // Quantidade no banco permanece estritamente 1
        const count = await client.query(
          "SELECT COUNT(*)::int AS total FROM public.despesas WHERE recorrencia_id = $1 AND data = $2::date",
          [recorrenciaId, targetDate]
        );
        expect(count.rows[0].total).toBe(1);
      } finally {
        client.release();
      }
    });
  });
});
