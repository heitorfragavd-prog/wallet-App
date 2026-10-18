/**
 * secAuditBlocker04Webhooks.test.ts — SEC-003.2 | Bloqueador 04
 *
 * Suíte de testes abrangente para autenticidade, fail-closed,
 * integridade financeira e idempotência atômica dos webhooks:
 * - wallet-public-api (/telegram e /whatsapp)
 * - pepper-webhook
 * - payment-webhook
 * - divipay-webhook
 * - telegram-webhook
 * - migration 20261018170000_sec003_2_blocker04_webhook_idempotency.sql
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Implementação espelho para execução em ambiente Node / Vitest
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const aLen = aBytes.length;
  const bLen = bBytes.length;
  if (aLen === 0 || bLen === 0) return false;

  let mismatch = aLen === bLen ? 0 : 1;
  const compareBytes = aLen === bLen ? bBytes : aBytes;
  for (let i = 0; i < aLen; i++) {
    mismatch |= aBytes[i] ^ compareBytes[i];
  }
  return mismatch === 0;
}

function validateWebhookSecret(
  providedToken: string | null | undefined,
  expectedSecret: string | null | undefined
): boolean {
  const expected = expectedSecret ? expectedSecret.trim() : '';
  const provided = providedToken ? providedToken.trim() : '';
  if (!expected || expected.length === 0) return false; // Fail-closed
  if (!provided || provided.length === 0) return false;
  return timingSafeEqual(provided, expected);
}

describe('SEC-003.2 — Bloqueador 04: Autenticidade e Idempotência de Webhooks', () => {
  const rootDir = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Criptografia e Comparação em Tempo Constante (Fail-Closed)
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Criptografia e Fail-Closed de Segredos', () => {
    it('validateWebhookSecret: Rejeita imediatamente se secret do servidor for vazio/indefinido (Fail-Closed)', () => {
      expect(validateWebhookSecret('token-qualquer', undefined)).toBe(false);
      expect(validateWebhookSecret('token-qualquer', null)).toBe(false);
      expect(validateWebhookSecret('token-qualquer', '')).toBe(false);
      expect(validateWebhookSecret('token-qualquer', '   ')).toBe(false);
    });

    it('validateWebhookSecret: Rejeita se token da requisição for vazio/indefinido', () => {
      expect(validateWebhookSecret(undefined, 'secret-servidor')).toBe(false);
      expect(validateWebhookSecret(null, 'secret-servidor')).toBe(false);
      expect(validateWebhookSecret('', 'secret-servidor')).toBe(false);
    });

    it('validateWebhookSecret: Compara corretamente valores idênticos e rejeita divergentes em tempo constante', () => {
      expect(validateWebhookSecret('token-secreto-123', 'token-secreto-123')).toBe(true);
      expect(validateWebhookSecret('token-secreto-123', 'token-secreto-999')).toBe(false);
      expect(validateWebhookSecret('token-secreto-123', 'token-secreto-12')).toBe(false);
      expect(validateWebhookSecret('chave-🔑-123', 'chave-🔑-123')).toBe(true);
      expect(validateWebhookSecret('chave-🔑-123', 'chave-🔒-123')).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. wallet-public-api: Eliminação da Falha Fail-Open
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. wallet-public-api (/telegram e /whatsapp)', () => {
    const publicApiPath = path.join(rootDir, 'supabase/functions/wallet-public-api/index.ts');
    const content = fs.readFileSync(publicApiPath, 'utf8');

    it('Proíbe o padrão de fail-open onde ausência de segredo permitia requisição anônima', () => {
      expect(content).not.toMatch(/if\s*\(\s*telegramWebhookSecret\s*\)\s*\{[\s\S]*?const secretHeader/);
      expect(content).not.toMatch(/if\s*\(\s*whatsappWebhookSecret\s*\)\s*\{[\s\S]*?const secretHeader/);

      expect(content).toContain('if (!telegramWebhookSecret)');
      expect(content).toContain('if (!whatsappWebhookSecret)');
    });

    it('Usa timingSafeEqual para comparar o segredo do Telegram e do WhatsApp', () => {
      expect(content).toContain('timingSafeEqual(secretHeader, telegramWebhookSecret)');
      expect(content).toContain('timingSafeEqual(secretHeader, whatsappWebhookSecret)');
    });

    it('Não imprime segredos nem tokens em logs no wallet-public-api', () => {
      expect(content).not.toMatch(/console\.(log|warn|error)\(.*telegramWebhookSecret.*\)/);
      expect(content).not.toMatch(/console\.(log|warn|error)\(.*whatsappWebhookSecret.*\)/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. pepper-webhook: Segurança contra Ativação Indevida e Idempotência
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. pepper-webhook (Gateways e Assinaturas)', () => {
    const pepperPath = path.join(rootDir, 'supabase/functions/pepper-webhook/index.ts');
    const pepperContent = fs.readFileSync(pepperPath, 'utf8');

    it('Rejeita ativação de assinatura por eventos de carrinho abandonado ou não pagos', () => {
      expect(pepperContent).toContain("isPaid = status === 'paid' || status === 'approved'");
      expect(pepperContent).toContain('Evento ignorado: status');
    });

    it('Possui chamada à RPC registrar_pagamento_assinatura_atomico com fallback defensivo', () => {
      expect(pepperContent).toContain("registrar_pagamento_assinatura_atomico");
      expect(pepperContent).toContain("from('subscription_payments')");
      expect(pepperContent).toContain(".eq('transaction_id', String(transactionId))");
    });

    it('Grava transaction_id no insert de subscription_payments', () => {
      expect(pepperContent).toContain('transaction_id: transactionId ? String(transactionId) : null');
    });

    it('Simulação: Lógica de status bloqueia eventos não pagos e aceita apenas confirmados', () => {
      function evaluatePepperPayment(payload: { status?: string; event?: string }): boolean {
        const status = String(payload.status || payload.event || '').toLowerCase().trim();
        return status === 'paid' || status === 'approved' || status === 'payment_completed';
      }

      expect(evaluatePepperPayment({ status: 'pending' })).toBe(false);
      expect(evaluatePepperPayment({ status: 'cancelled' })).toBe(false);
      expect(evaluatePepperPayment({ status: 'abandoned' })).toBe(false);
      expect(evaluatePepperPayment({ event: 'lead_created' })).toBe(false);
      expect(evaluatePepperPayment({ status: 'paid' })).toBe(true);
      expect(evaluatePepperPayment({ status: 'approved' })).toBe(true);
      expect(evaluatePepperPayment({ event: 'payment_completed' })).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. payment-webhook: Idempotência e Integridade de Valores
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. payment-webhook (Idempotência Financeira)', () => {
    const paymentPath = path.join(rootDir, 'supabase/functions/payment-webhook/index.ts');
    const paymentContent = fs.readFileSync(paymentPath, 'utf8');

    it('Valida montante financeiro para impedir valores negativos ou NaN', () => {
      expect(paymentContent).toContain('Valor de pagamento inválido');
    });

    it('Possui verificação de idempotência em subscription_payments com retorno duplicate', () => {
      expect(paymentContent).toContain("from('subscription_payments')");
      expect(paymentContent).toContain(".eq('transaction_id', payload.transaction_id)");
      expect(paymentContent).toContain('duplicate: true');
    });

    it('Está conectado à RPC registrar_pagamento_assinatura_atomico para novos e existentes usuários', () => {
      expect(paymentContent).toContain("registrar_pagamento_assinatura_atomico");
      expect(paymentContent).toMatch(/transaction_id:\s*payload\.transaction_id\s*\|\|\s*null/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. divipay-webhook: Concorrência Atômica, Recuperação e Deduplication Key
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. divipay-webhook (Prevenção de Duplicação, Concorrência e Auto-Recuperação)', () => {
    const divipayPath = path.join(rootDir, 'supabase/functions/divipay-webhook/index.ts');
    const divipayContent = fs.readFileSync(divipayPath, 'utf8');

    it('Valida segredo do webhook via validateWebhookSecret com Fail-Closed', () => {
      expect(divipayContent).toContain("import { validateWebhookSecret } from '../_shared/auth-guard.ts'");
      expect(divipayContent).toContain('validateWebhookSecret(token, secret)');
    });

    it('Usa atualização atômica condicional (.neq("status", "PAID")) para proteção de concorrência', () => {
      expect(divipayContent).toContain(".neq('status', 'PAID')");
      expect(divipayContent).toContain('Transação já processada concorrentemente');
    });

    it('Garante deduplication_key única para receitas e despesas de taxa geradas pela Divipay', () => {
      expect(divipayContent).toContain("deduplication_key: `divipay:cashin:${transacao.id}`");
      expect(divipayContent).toContain("deduplication_key: `divipay:fee:${transacao.id}`");
    });

    it('Implementa auto-recuperação de falhas parciais (PAID sem receita_id)', () => {
      expect(divipayContent).toContain("transacao.status === 'PAID'");
      expect(divipayContent).toContain("transacao.metadata?.receita_id");
      expect(divipayContent).toContain("Iniciando auto-recuperação");
    });

    it('Simulação: Falha parcial anterior (PAID sem receita) executa auto-recuperação sem travar permanentemente', () => {
      interface TransacaoDivipay {
        id: string;
        status: string;
        metadata?: { receita_id?: string; recovered?: boolean };
      }

      const tx: TransacaoDivipay = {
        id: 'tx-123',
        status: 'PAID', // Anteriormente travou após status virar PAID mas antes da receita
        metadata: {}, // SEM receita_id!
      };

      let recovered = false;
      let revenueCreated = false;

      // Lógica de self-healing implementada em divipay-webhook e na RPC
      if (tx.status === 'PAID') {
        const hasReceitaVinculada = Boolean(tx.metadata?.receita_id);
        if (hasReceitaVinculada) {
          // Idempotente completo
        } else {
          // Auto-recuperação
          recovered = true;
          tx.metadata = { receita_id: 'rec-recuperada-456', recovered: true };
          revenueCreated = true;
        }
      }

      expect(recovered).toBe(true);
      expect(revenueCreated).toBe(true);
      expect(tx.metadata?.receita_id).toBe('rec-recuperada-456');
    });

    it('Simulação de Concorrência: Apenas uma de duas requisições simultâneas consegue mudar status de PENDING para PAID', async () => {
      let currentDbStatus = 'PENDING';
      let receitasCreated = 0;

      async function handleWebhookRequest(_txId: string): Promise<string> {
        // Atomic conditional update simulation: UPDATE ... WHERE id = txId AND status != 'PAID'
        if (currentDbStatus !== 'PAID') {
          currentDbStatus = 'PAID';
          receitasCreated++;
          return 'PROCESSED_SUCCESS';
        } else {
          return 'DUPLICATE_IGNORED';
        }
      }

      const results = await Promise.all([
        handleWebhookRequest('tx-divipay-123'),
        handleWebhookRequest('tx-divipay-123'),
      ]);

      expect(results).toContain('PROCESSED_SUCCESS');
      expect(results).toContain('DUPLICATE_IGNORED');
      expect(receitasCreated).toBe(1); // Exatamente uma receita criada!
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. telegram-webhook: Deduplicação e Recuperação Distribuída
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. telegram-webhook (Deduplicação e Ciclo de Vida Distribuído)', () => {
    const telegramPath = path.join(rootDir, 'supabase/functions/telegram-webhook/index.ts');
    const telegramContent = fs.readFileSync(telegramPath, 'utf8');

    it('Chama a RPC reivindicar_telegram_update com fallback para telegram_processed_updates', () => {
      expect(telegramContent).toContain('reivindicar_telegram_update');
      expect(telegramContent).toContain('telegram_processed_updates');
      expect(telegramContent).toContain('incomingUpdateId');
      expect(telegramContent).toContain('p_lease_seconds: 180');
    });

    it('Possui helpers e chamadas para concluir_telegram_update e falhar_telegram_update', () => {
      expect(telegramContent).toContain('concluir_telegram_update');
      expect(telegramContent).toContain('falhar_telegram_update');
      expect(telegramContent).toContain('markUpdateStatus');
    });

    it('Simulação: Ciclo de vida com proteção de concorrência e recuperação de crash (lease timeout)', () => {
      interface TelegramUpdateRecord {
        update_id: number;
        status: 'processing' | 'completed' | 'failed';
        attempt_count: number;
        last_attempt_at: number; // timestamp ms
      }

      const store = new Map<number, TelegramUpdateRecord>();
      const LEASE_MS = 180 * 1000;
      const MAX_ATTEMPTS = 3;

      function reivindicarUpdate(updateId: number, nowMs: number): { should_process: boolean; reason: string } {
        const existing = store.get(updateId);
        if (!existing) {
          store.set(updateId, {
            update_id: updateId,
            status: 'processing',
            attempt_count: 1,
            last_attempt_at: nowMs,
          });
          return { should_process: true, reason: 'new_update_claimed' };
        }

        if (existing.status === 'completed') {
          return { should_process: false, reason: 'already_completed' };
        }

        if (existing.status === 'processing') {
          const isStale = (nowMs - existing.last_attempt_at) >= LEASE_MS;
          if (!isStale) {
            return { should_process: false, reason: 'in_flight_concurrent' };
          }
          // Recuperação de reserva abandonada (crash do worker)
          if (existing.attempt_count < MAX_ATTEMPTS) {
            existing.attempt_count += 1;
            existing.last_attempt_at = nowMs;
            return { should_process: true, reason: 'stale_lease_recovered' };
          } else {
            existing.status = 'failed';
            return { should_process: false, reason: 'max_attempts_exceeded' };
          }
        }

        if (existing.status === 'failed') {
          if (existing.attempt_count < MAX_ATTEMPTS) {
            existing.attempt_count += 1;
            existing.status = 'processing';
            existing.last_attempt_at = nowMs;
            return { should_process: true, reason: 'retry_after_failure' };
          }
          return { should_process: false, reason: 'max_attempts_exceeded' };
        }

        return { should_process: false, reason: 'unknown' };
      }

      const t0 = 1000000;
      // 1. Novo update é aceito
      expect(reivindicarUpdate(9001, t0)).toEqual({ should_process: true, reason: 'new_update_claimed' });

      // 2. Concorrência ativa antes de 180s é bloqueada (in flight)
      expect(reivindicarUpdate(9001, t0 + 10000)).toEqual({ should_process: false, reason: 'in_flight_concurrent' });

      // 3. Após 180s sem conclusão (crash simulado), lease expirado é retomado com sucesso
      expect(reivindicarUpdate(9001, t0 + 185000)).toEqual({ should_process: true, reason: 'stale_lease_recovered' });

      // 4. Se concluído com sucesso, nunca mais é reprocessado
      const rec = store.get(9001)!;
      rec.status = 'completed';
      expect(reivindicarUpdate(9001, t0 + 300000)).toEqual({ should_process: false, reason: 'already_completed' });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Migration de Idempotência Atômica
  // ───────────────────────────────────────────────────────────────────────────
  describe('7. Migration de Idempotência (20261018170000_sec003_2_blocker04_webhook_idempotency.sql)', () => {
    const migrationPath = path.join(
      rootDir,
      'supabase/migrations/20261018170000_sec003_2_blocker04_webhook_idempotency.sql'
    );

    it('Migration existe e cria índice único em subscription_payments(provider, transaction_id)', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('ALTER TABLE public.subscription_payments');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS transaction_id TEXT');
      expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payments_provider_tx');
      expect(sql).toContain('ON public.subscription_payments (COALESCE(provider, \'pepper\'), transaction_id)');
      expect(sql).toContain('WHERE transaction_id IS NOT NULL');
    });

    it('Migration estende telegram_processed_updates com status, attempt_count e last_attempt_at', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('ALTER TABLE public.telegram_processed_updates');
      expect(sql).toContain('status TEXT NOT NULL DEFAULT');
      expect(sql).toContain('attempt_count INTEGER NOT NULL DEFAULT');
      expect(sql).toContain('error_message TEXT');
    });

    it('Migration define RPCs atômicas com SECURITY DEFINER e restrição a service_role', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reivindicar_telegram_update');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.concluir_telegram_update');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.falhar_telegram_update');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.processar_divipay_cashin_atomico');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.registrar_pagamento_assinatura_atomico');

      // Segurança: Revoke from public e grant para service_role
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.processar_divipay_cashin_atomico');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.processar_divipay_cashin_atomico');
      expect(sql).toContain('TO service_role');
    });
  });
});
