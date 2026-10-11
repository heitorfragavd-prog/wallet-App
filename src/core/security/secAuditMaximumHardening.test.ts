import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('SEC-AUDIT: Auditoria de Segurança Máxima e Hardening', () => {
  const rootDir = process.cwd();

  describe('Banco de Dados & RLS (VULN-01 a VULN-04)', () => {
    const migrationPath = path.join(
      rootDir,
      'supabase/migrations/20261011120000_sec_audit_maximum_hardening.sql'
    );

    it('Arquivo de migration de hardening existe', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('VULN-01: Remove USING (true) de notas fiscais, itens, custo, produtos e transcrições', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Drop de policies antigas permissivas
      expect(sql).toContain('DROP POLICY IF EXISTS nf_compra_all ON public.notas_fiscais_compra');
      expect(sql).toContain('DROP POLICY IF EXISTS nf_itens_all ON public.nf_itens');
      expect(sql).toContain('DROP POLICY IF EXISTS historico_custo_all ON public.historico_custo_produto');
      expect(sql).toContain('DROP POLICY IF EXISTS produtos_eyemobile_all ON public.produtos_eyemobile');
      expect(sql).toContain('DROP POLICY IF EXISTS audio_transcricoes_all ON public.audio_transcricoes');

      // Aplicação de isolamento estrito auth.uid() = user_id
      expect(sql).toContain('auth.uid() = user_id');
      expect(sql).toContain('n.user_id = auth.uid()');
      expect(sql).not.toMatch(/CREATE POLICY nf_compra_user_isolation[^;]*USING\s*\(\s*true\s*\)/i);
    });

    it('VULN-02: eyemobile_cache tem RLS ativado e revogado de anon e authenticated', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('ALTER TABLE IF EXISTS public.eyemobile_cache ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('REVOKE ALL ON public.eyemobile_cache FROM anon, authenticated, PUBLIC');
      expect(sql).toContain('GRANT ALL ON public.eyemobile_cache TO service_role');
    });

    it('VULN-03: channel_mappings e ia_leitura_erros restringem acesso explicitamente a service_role', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // channel_mappings
      expect(sql).toContain('ON public.channel_mappings FOR ALL\nTO service_role');
      // ia_leitura_erros
      expect(sql).toContain('ON public.ia_leitura_erros FOR ALL\nTO service_role');
    });

    it('VULN-04: Ativação de RLS e restrição formal em tabelas de infraestrutura', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('ALTER TABLE IF EXISTS public.rate_limits ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE IF EXISTS public.ai_token_reservations ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE IF EXISTS public.investimentos_sessions ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('REVOKE ALL ON public.rate_limits FROM anon, authenticated, PUBLIC');
      expect(sql).toContain('REVOKE ALL ON public.ai_token_reservations FROM anon, authenticated, PUBLIC');
      expect(sql).toContain('REVOKE ALL ON public.investimentos_sessions FROM anon, authenticated, PUBLIC');
    });
  });

  describe('Edge Functions: Autenticação e Prevenção de IDOR (VULN-05 a VULN-10)', () => {
    it('VULN-05 & VULN-06: enviar-push e enviar-telegram possuem guarda anti-IDOR', () => {
      const pushCode = fs.readFileSync(
        path.join(rootDir, 'supabase/functions/enviar-push/index.ts'),
        'utf8'
      );
      const tgCode = fs.readFileSync(
        path.join(rootDir, 'supabase/functions/enviar-telegram/index.ts'),
        'utf8'
      );

      expect(pushCode).toContain('authorizeUserOrService(req, user_id, supabase)');
      expect(pushCode).toContain('authCheck.authorized');

      expect(tgCode).toContain('authorizeUserOrService(req, user_id, supabase)');
      expect(tgCode).toContain('authCheck.authorized');
    });

    it('VULN-07: notificar-whatsapp bloqueia relay anônimo com isAuthorizedCronCaller', () => {
      const waCode = fs.readFileSync(
        path.join(rootDir, 'supabase/functions/notificar-whatsapp/index.ts'),
        'utf8'
      );

      expect(waCode).toContain('isAuthorizedCronCaller(req)');
      expect(waCode).toContain('unauthorizedResponse');
    });

    it('VULN-08 & VULN-09: process-recurring-transactions e process-reminders exigem autorização de serviço', () => {
      const recurringCode = fs.readFileSync(
        path.join(rootDir, 'supabase/functions/process-recurring-transactions/index.ts'),
        'utf8'
      );
      const remindersCode = fs.readFileSync(
        path.join(rootDir, 'supabase/functions/process-reminders/index.ts'),
        'utf8'
      );

      expect(recurringCode).toContain('isAuthorizedCronCaller(req)');
      expect(remindersCode).toContain('isAuthorizedCronCaller(req)');
    });

    it('VULN-10: Rotinas agendadas (cron jobs) implementam validação de chamador autorizado', () => {
      const cronFiles = [
        'supabase/functions/cron-notificacoes/index.ts',
        'supabase/functions/lembrete-precos/index.ts',
        'supabase/functions/notificar-lembretes/index.ts',
        'supabase/functions/processar-lembretes-manutencao/index.ts',
        'supabase/functions/telegram-notificador-cron/index.ts',
        'supabase/functions/atualizar-cotacoes/index.ts',
      ];

      for (const relPath of cronFiles) {
        const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
        expect(content, `Falha em ${relPath}`).toContain('isAuthorizedCronCaller(req)');
        expect(content, `Falha em ${relPath}`).toContain('unauthorizedResponse');
      }
    });
  });

  describe('Criptografia e Proteção de Segredos (VULN-11 e VULN-12)', () => {
    it('VULN-11: payment-webhook gera senhas via CSPRNG e não loga senhas em texto claro', () => {
      const code = fs.readFileSync(
        path.join(rootDir, 'supabase/functions/payment-webhook/index.ts'),
        'utf8'
      );

      // Não usa Math.random() para senhas
      expect(code).not.toContain('Math.random() * chars.length');
      // Usa CSPRNG crypto.getRandomValues
      expect(code).toContain('crypto.getRandomValues(randomBytes)');
      // Não loga senha em texto claro
      expect(code).not.toMatch(/console\.log\(\s*['"]Senha:['"],\s*randomPassword\s*\)/);
    });

    it('VULN-12: wallet-public-api valida secret tokens para Telegram e WhatsApp', () => {
      const code = fs.readFileSync(
        path.join(rootDir, 'supabase/functions/wallet-public-api/index.ts'),
        'utf8'
      );

      expect(code).toContain('telegramWebhookSecret');
      expect(code).toContain('x-telegram-bot-api-secret-token');
      expect(code).toContain('whatsappWebhookSecret');
      expect(code).toContain('Unauthorized webhook caller');
    });
  });

  describe('Unit Tests: Lógica de auth-guard', () => {
    // Implementação espelho para execução em ambiente Node / Vitest
    function testIsAuthorizedCronCaller(
      headers: Record<string, string>,
      env: { serviceRole?: string; cronSecret?: string }
    ): boolean {
      const serviceRoleKey = env.serviceRole?.trim();
      const cronSecret = env.cronSecret?.trim();

      const authHeader = headers['authorization'] || headers['Authorization'];
      const xCronSecret = headers['x-cron-secret']?.trim();

      const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

      if (serviceRoleKey && token && token === serviceRoleKey) {
        return true;
      }

      if (cronSecret && cronSecret.length > 0) {
        if (token && token === cronSecret) {
          return true;
        }
        if (xCronSecret && xCronSecret === cronSecret) {
          return true;
        }
      }

      return false;
    }

    it('Rejeita requisição sem cabeçalhos de autorização', () => {
      const result = testIsAuthorizedCronCaller({}, { serviceRole: 'sr-secret-123', cronSecret: 'cron-abc' });
      expect(result).toBe(false);
    });

    it('Rejeita token inválido ou falsificado', () => {
      const result = testIsAuthorizedCronCaller(
        { authorization: 'Bearer token-falsificado' },
        { serviceRole: 'sr-secret-123', cronSecret: 'cron-abc' }
      );
      expect(result).toBe(false);
    });

    it('Aceita chamada com SUPABASE_SERVICE_ROLE_KEY válida', () => {
      const result = testIsAuthorizedCronCaller(
        { authorization: 'Bearer sr-secret-123' },
        { serviceRole: 'sr-secret-123', cronSecret: 'cron-abc' }
      );
      expect(result).toBe(true);
    });

    it('Aceita chamada com CRON_SECRET válido via Bearer ou x-cron-secret', () => {
      const resultBearer = testIsAuthorizedCronCaller(
        { authorization: 'Bearer cron-abc' },
        { serviceRole: 'sr-secret-123', cronSecret: 'cron-abc' }
      );
      expect(resultBearer).toBe(true);

      const resultHeader = testIsAuthorizedCronCaller(
        { 'x-cron-secret': 'cron-abc' },
        { serviceRole: 'sr-secret-123', cronSecret: 'cron-abc' }
      );
      expect(resultHeader).toBe(true);
    });

    it('Garante isolamento anti-IDOR: Alice não pode disparar para Bob', async () => {
      const mockSupabaseAdmin = {
        auth: {
          getUser: vi.fn().mockImplementation(async (token: string) => {
            if (token === 'alice-valid-token') {
              return { data: { user: { id: 'alice-uuid' } }, error: null };
            }
            return { data: { user: null }, error: new Error('Invalid token') };
          }),
        },
      };

      async function testAuthorizeUserOrService(
        headers: Record<string, string>,
        targetUserId: string,
        supabaseAdmin: { auth: { getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: Error | null }> } },
        env: { serviceRole?: string; cronSecret?: string }
      ) {
        if (testIsAuthorizedCronCaller(headers, env)) {
          return { authorized: true, status: 200 };
        }

        const authHeader = headers['authorization'] || headers['Authorization'];
        const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

        if (!token) {
          return { authorized: false, status: 401, reason: 'Missing Authorization header' };
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) {
          return { authorized: false, status: 401, reason: 'Invalid user token' };
        }

        if (data.user.id !== targetUserId) {
          return { authorized: false, status: 403, reason: 'Forbidden: Cannot dispatch notifications for another user' };
        }

        return { authorized: true, status: 200 };
      }

      // Alice tentando enviar para Alice -> 200 OK
      const aliceSelf = await testAuthorizeUserOrService(
        { authorization: 'Bearer alice-valid-token' },
        'alice-uuid',
        mockSupabaseAdmin,
        { serviceRole: 'sr-key' }
      );
      expect(aliceSelf.authorized).toBe(true);
      expect(aliceSelf.status).toBe(200);

      // Alice tentando enviar para Bob -> 403 Forbidden!
      const aliceToBob = await testAuthorizeUserOrService(
        { authorization: 'Bearer alice-valid-token' },
        'bob-uuid',
        mockSupabaseAdmin,
        { serviceRole: 'sr-key' }
      );
      expect(aliceToBob.authorized).toBe(false);
      expect(aliceToBob.status).toBe(403);
      expect(aliceToBob.reason).toContain('Forbidden');
    });
  });
});
