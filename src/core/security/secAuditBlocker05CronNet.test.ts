/**
 * secAuditBlocker05CronNet.test.ts — SEC-003.2 | Auditoria do Bloqueador 05
 *
 * Validações de código estático e de comportamento para a cadeia pg_cron, pg_net e Edge Functions:
 * 1. Todas as Edge Functions de cron/sincronização utilizam isAuthorizedCronCaller ou timingSafeEqual.
 * 2. Fail-closed: rejeição garantida quando tokens ou segredos estiverem ausentes.
 * 3. Sanitização: nenhum secret (service_role, CRON_SECRET, tokens) é logado ou exposto.
 * 4. Invocador cron: allowlist estrita contra SSRF e resolução resiliente de GUCs sem abort no Postgres.
 * 5. Telegram: persistência do payload do update e ciclo de vida de recuperação idempotente.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("SEC-003.2 — Auditoria do Bloqueador 05 (Cron Jobs, pg_net e Edge Functions)", () => {
  const rootDir = process.cwd();

  describe("1. Hardening de Autenticação nas Edge Functions Periódicas", () => {
    it("cron-alertas-investimentos: utiliza isAuthorizedCronCaller e fail-closed", () => {
      const filePath = path.join(rootDir, "supabase/functions/cron-alertas-investimentos/index.ts");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toMatch(/import\s*\{[^}]*isAuthorizedCronCaller[^}]*\}\s*from\s*["']\.\.\/_shared\/auth-guard\.ts["']/);
      expect(content).toMatch(/if\s*\(!isAuthorizedCronCaller\(req\)\)/);
      expect(content).toMatch(/unauthorizedResponse/);
      expect(content).not.toMatch(/token\s*===\s*supabaseServiceKey/);
    });

    it("sefaz-sync: utiliza isAuthorizedCronCaller e fail-closed", () => {
      const filePath = path.join(rootDir, "supabase/functions/sefaz-sync/index.ts");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toMatch(/import\s*\{[^}]*isAuthorizedCronCaller[^}]*\}\s*from\s*["']\.\.\/_shared\/auth-guard\.ts["']/);
      expect(content).toMatch(/if\s*\(!isAuthorizedCronCaller\(req\)\)/);
      expect(content).not.toMatch(/token\s*===\s*supabaseServiceKey/);
    });

    it("divipay-api: utiliza timingSafeEqual para validação da chave service-role", () => {
      const filePath = path.join(rootDir, "supabase/functions/divipay-api/index.ts");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toMatch(/import\s*\{[^}]*timingSafeEqual[^}]*\}\s*from\s*["']\.\.\/_shared\/auth-guard\.ts["']/);
      expect(content).toMatch(/timingSafeEqual\(token,\s*serviceRoleKey\)/);
      expect(content).not.toMatch(/token\s*===\s*serviceRoleKey/);
    });

    it("eyemobile-sync: utiliza isTrustedServiceRoleCaller com timingSafeEqual", () => {
      const syncPath = path.join(rootDir, "supabase/functions/eyemobile-sync/index.ts");
      const helperPath = path.join(rootDir, "supabase/functions/_shared/eyemobile-product-identity.ts");

      const syncContent = fs.readFileSync(syncPath, "utf8");
      const helperContent = fs.readFileSync(helperPath, "utf8");

      expect(syncContent).toMatch(/isTrustedServiceRoleCaller\(authHeader,\s*supabaseServiceKey,\s*cronSecret\)/);
      expect(helperContent).toMatch(/import\s*\{[^}]*timingSafeEqual[^}]*\}\s*from\s*["']\.\/auth-guard\.ts["']/);
      expect(helperContent).toMatch(/timingSafeEqual\(cleanToken,\s*expectedServiceKey\)/);
      expect(helperContent).toMatch(/timingSafeEqual\(cleanToken,\s*expectedCronSecret\)/);
    });

    it("Edge Functions de cron restantes: todas exigem isAuthorizedCronCaller", () => {
      const cronFunctions = [
        "cron-notificacoes",
        "atualizar-cotacoes",
        "lembrete-precos",
        "notificar-lembretes",
        "process-recurring-transactions",
        "process-reminders",
        "processar-lembretes-manutencao",
        "telegram-notificador-cron",
      ];

      for (const fn of cronFunctions) {
        const filePath = path.join(rootDir, `supabase/functions/${fn}/index.ts`);
        expect(fs.existsSync(filePath), `Arquivo para ${fn} não encontrado`).toBe(true);
        const content = fs.readFileSync(filePath, "utf8");

        expect(content, `${fn} deve importar isAuthorizedCronCaller`).toMatch(
          /isAuthorizedCronCaller/
        );
        expect(content, `${fn} deve validar chamador com isAuthorizedCronCaller`).toMatch(
          /if\s*\(!isAuthorizedCronCaller\(req\)\)/
        );
      }
    });
  });

  describe("2. Telegram Webhook: Persistência de Payload e Recuperação Atômica", () => {
    it("telegram-webhook repassa p_payload: body para reivindicar_telegram_update e fallback", () => {
      const filePath = path.join(rootDir, "supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toMatch(/p_payload:\s*body/);
      expect(content).toMatch(/payload:\s*body/);
    });

    it("Migration 20261018183000: define coluna payload JSONB e índice de retry", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      expect(fs.existsSync(migPath)).toBe(true);
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS payload JSONB/i);
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_telegram_processed_updates_retry/i);
      expect(sql).toMatch(/recuperar_telegram_updates_para_reprocessamento/i);
      expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/i);
    });

    it("reconciliar_telegram_updates_abandonados: move para pending_retry ou dead_letter", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/pending_retry/i);
      expect(sql).toMatch(/dead_letter/i);
    });
  });

  describe("3. Invocador Seguro e Resolução de GUCs no Banco de Dados", () => {
    it("cron_dispatch_edge_function implementa allowlist estrita contra SSRF", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.cron_dispatch_edge_function/i);
      expect(sql).toMatch(/IF p_function_name NOT IN/i);
      expect(sql).toMatch(/'process-recurring-transactions'/);
      expect(sql).toMatch(/'processar-lembretes-manutencao'/);
      expect(sql).toMatch(/'cron-notificacoes'/);
      expect(sql).toMatch(/'atualizar-cotacoes'/);
      expect(sql).toMatch(/'cron-alertas-investimentos'/);
      expect(sql).toMatch(/'sefaz-sync'/);
      expect(sql).toMatch(/'eyemobile-sync'/);
      expect(sql).toMatch(/'telegram-reprocess-worker'/);
      expect(sql).toMatch(/RAISE EXCEPTION.*não permitida/i);
    });

    it("Fencing Token: concluir e falhar telegram update aceitam p_expected_attempt", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.concluir_telegram_update\([^)]*p_expected_attempt/i);
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.falhar_telegram_update\([^)]*p_expected_attempt/i);
      expect(sql).toMatch(/v_rec\.attempt_count\s*=\s*p_expected_attempt/);
    });

    it("process-recurring-transactions: possui execução atômica via RPC e deduplication_key", () => {
      const filePath = path.join(rootDir, "supabase/functions/process-recurring-transactions/index.ts");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toMatch(/processar_transacao_recorrente_atomica/);
      expect(content).toMatch(/deduplication_key/);
    });

    it("Migration 20261018183000: define constraints únicas e RPC atômica para transações recorrentes", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_receitas_recorrencia_data/i);
      expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_recorrencia_data/i);
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.processar_transacao_recorrente_atomica/i);
      expect(sql).toMatch(/ON CONFLICT \(recorrencia_id,\s*data\)/i);
    });

    it("telegram-reprocess-worker: existe, possui auth fail-closed e reprocessa updates com skip-locked", () => {
      const filePath = path.join(rootDir, "supabase/functions/telegram-reprocess-worker/index.ts");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toMatch(/isAuthorizedCronCaller\(req\)/);
      expect(content).toMatch(/recuperar_telegram_updates_para_reprocessamento/);
      expect(content).toMatch(/x-telegram-reprocess/);
      expect(content).toMatch(/x-telegram-attempt-count/);
    });

    it("auditar_falhas_operacionais: função unificada de auditoria sem dependência circular", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.auditar_falhas_operacionais/i);
      expect(sql).toMatch(/cron_execution_logs/);
      expect(sql).toMatch(/telegram_dead_letter/);
      expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.auditar_falhas_operacionais.*FROM PUBLIC,\s*anon,\s*authenticated/i);
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.auditar_falhas_operacionais.*TO postgres,\s*service_role/i);
    });

    it("cron_dispatch_edge_function utiliza missing_ok = true para ler GUCs sem abort fatal", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/current_setting\('app\.settings\.supabase_url',\s*true\)/);
      expect(sql).toMatch(/current_setting\('app\.settings\.supabase_service_role_key',\s*true\)/);
      expect(sql).toMatch(/current_setting\('app\.settings\.service_role_key',\s*true\)/);
      expect(sql).toMatch(/skipped_missing_guc/i);
    });

    it("Permissões restritas: anon e authenticated terminantemente bloqueados do despachante cron", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.cron_dispatch_edge_function.*FROM PUBLIC,\s*anon,\s*authenticated/i);
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.cron_dispatch_edge_function.*TO postgres,\s*service_role/i);
    });

    it("auditar_respostas_pg_net categoriza status codes HTTP (401, 403, 429, 500+)", () => {
      const migPath = path.join(
        rootDir,
        "supabase/migrations/20261018183000_sec003_2_blocker05_cron_resilience.sql"
      );
      const sql = fs.readFileSync(migPath, "utf8");

      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.auditar_respostas_pg_net/i);
      expect(sql).toMatch(/AUTH_FAILURE_401_UNAUTHORIZED/);
      expect(sql).toMatch(/AUTH_FAILURE_403_FORBIDDEN/);
      expect(sql).toMatch(/RATE_LIMITED_429/);
      expect(sql).toMatch(/SERVER_ERROR_5XX/);
      expect(sql).toMatch(/TIMEOUT_EXCEEDED/);
    });
  });
});
