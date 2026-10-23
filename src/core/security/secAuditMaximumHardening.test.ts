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

    it('BLOQUEADOR 01: audio_transcricoes não referencia workspace_id e isola por auth.uid() = user_id', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Extrai o bloco de audio_transcricoes
      const audioSection = sql.split('-- 4. TRANSCRIÇÕES DE ÁUDIO')[1]?.split('-- 5. EYEMOBILE CACHE')[0] || '';
      expect(audioSection.length).toBeGreaterThan(0);

      // Não referencia workspace_id em audio_transcricoes
      expect(audioSection).not.toContain('workspace_id');
      expect(audioSection).not.toContain('tem_acesso_workspace');

      // Aplica auth.uid() = user_id nas políticas de SELECT, INSERT, UPDATE e DELETE
      expect(audioSection).toContain('CREATE POLICY audio_transcricoes_select');
      expect(audioSection).toContain('CREATE POLICY audio_transcricoes_insert');
      expect(audioSection).toContain('CREATE POLICY audio_transcricoes_update');
      expect(audioSection).toContain('CREATE POLICY audio_transcricoes_delete');
      expect(audioSection).toMatch(/USING\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/);
      expect(audioSection).toMatch(/WITH\s+CHECK\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/);
    });

    it('BLOQUEADOR 02: Permite colaboradores com acesso ao workspace e mantém isolamento pessoal', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // tem_acesso_workspace definida e blindada
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.tem_acesso_workspace');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain('SET search_path = public, pg_temp');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.tem_acesso_workspace(uuid) FROM PUBLIC');

      // notas_fiscais_compra
      expect(sql).toContain('public.tem_acesso_workspace(workspace_id)');
      expect(sql).toContain('CREATE POLICY nf_compra_select ON public.notas_fiscais_compra');
      expect(sql).toContain('CREATE POLICY nf_compra_insert ON public.notas_fiscais_compra');
      expect(sql).toContain('CREATE POLICY nf_compra_update ON public.notas_fiscais_compra');
      expect(sql).toContain('CREATE POLICY nf_compra_delete ON public.notas_fiscais_compra');

      // nf_itens
      expect(sql).toContain('CREATE POLICY nf_itens_select ON public.nf_itens');
      expect(sql).toContain('CREATE POLICY nf_itens_insert ON public.nf_itens');
      expect(sql).toContain('CREATE POLICY nf_itens_update ON public.nf_itens');
      expect(sql).toContain('CREATE POLICY nf_itens_delete ON public.nf_itens');

      // historico_custo_produto
      expect(sql).toContain('CREATE POLICY historico_custo_select ON public.historico_custo_produto');
      expect(sql).toContain('CREATE POLICY historico_custo_insert ON public.historico_custo_produto');

      // produtos_eyemobile
      expect(sql).toContain('CREATE POLICY produtos_eyemobile_select ON public.produtos_eyemobile');
      expect(sql).toContain('CREATE POLICY produtos_eyemobile_insert ON public.produtos_eyemobile');

      // Imutabilidade de workspace_id, user_id e nf_id
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.impedir_alteracao_tenant_e_owner');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.impedir_alteracao_nf_item_parent');
      expect(sql).toContain('CREATE TRIGGER trg_nf_compra_tenant_immutable');
      expect(sql).toContain('CREATE TRIGGER trg_nf_itens_parent_immutable');
      expect(sql).toContain('CREATE TRIGGER trg_historico_custo_tenant_immutable');
      expect(sql).toContain('CREATE TRIGGER trg_produtos_eyemobile_tenant_immutable');
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

  describe('Unit Tests: Lógica de auth-guard e Bloqueador 03', () => {
    // Implementação espelho para execução em ambiente Node / Vitest
    function timingSafeEqual(a: string, b: string): boolean {
      if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
      }
      const encoder = new TextEncoder();
      const aBytes = encoder.encode(a);
      const bBytes = encoder.encode(b);
      const aLen = aBytes.length;
      const bLen = bBytes.length;

      if (aLen === 0 || bLen === 0) {
        return false;
      }

      let mismatch = aLen === bLen ? 0 : 1;
      const compareBytes = aLen === bLen ? bBytes : aBytes;

      for (let i = 0; i < aLen; i++) {
        mismatch |= aBytes[i] ^ compareBytes[i];
      }

      return mismatch === 0;
    }

    async function timingSafeEqualHash(a: string, b: string): Promise<boolean> {
      if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
        return false;
      }
      const encoder = new TextEncoder();
      const aBuf = await crypto.subtle.digest('SHA-256', encoder.encode(a));
      const bBuf = await crypto.subtle.digest('SHA-256', encoder.encode(b));
      const aBytes = new Uint8Array(aBuf);
      const bBytes = new Uint8Array(bBuf);

      let diff = 0;
      for (let i = 0; i < 32; i++) {
        diff |= aBytes[i] ^ bBytes[i];
      }
      return diff === 0;
    }

    function testIsAuthorizedCronCaller(
      headers: Record<string, string>,
      env: { serviceRole?: string; cronSecret?: string }
    ): boolean {
      const serviceRoleKey = env.serviceRole?.trim();
      const cronSecret = env.cronSecret?.trim();

      const authHeader = headers['authorization'] || headers['Authorization'];
      const xCronSecret = headers['x-cron-secret']?.trim();

      const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

      if (serviceRoleKey && token && timingSafeEqual(token, serviceRoleKey)) {
        return true;
      }

      if (cronSecret && cronSecret.length > 0) {
        if (token && timingSafeEqual(token, cronSecret)) {
          return true;
        }
        if (xCronSecret && timingSafeEqual(xCronSecret, cronSecret)) {
          return true;
        }
      }

      return false;
    }

    async function testAuthorizeUserOrService(
      headers: Record<string, string>,
      targetUserId: string | undefined,
      supabaseAdmin: {
        auth: { getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: Error | null }> };
        from: (table: string) => {
          select: (fields: string) => {
            eq: (field: string, val: unknown) => {
              eq?: (field: string, val: unknown) => Promise<{ data: Array<{ workspace_id: string }> }>;
              in?: (col: string, vals: string[]) => { limit: (n: number) => Promise<{ data: Array<{ workspace_id: string }> }> };
            } & Promise<{ data: Array<{ id: string }> }>;
          };
        };
      },
      env: { serviceRole?: string; cronSecret?: string },
      options: { allowOwnerDispatch?: boolean } = { allowOwnerDispatch: true }
    ) {
      if (testIsAuthorizedCronCaller(headers, env)) {
        return { authorized: true, status: 200, isServiceRole: true, userId: targetUserId };
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

      const callerUserId = data.user.id;
      const resolvedTargetId = targetUserId || callerUserId;

      if (resolvedTargetId === callerUserId) {
        return { authorized: true, status: 200, isServiceRole: false, userId: callerUserId };
      }

      if (options.allowOwnerDispatch) {
        try {
          const { data: ownedWorkspaces } = await supabaseAdmin
            .from('workspaces')
            .select('id')
            .eq('user_id', callerUserId);

          const ownedWsIds: string[] = (ownedWorkspaces || []).map((w: { id: string }) => w.id);
          if (ownedWsIds.length > 0) {
            const { data: targetInOwned } = await supabaseAdmin
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', resolvedTargetId)
              .eq('ativo', true)
              .in('workspace_id', ownedWsIds)
              .limit(1);

            if (targetInOwned && targetInOwned.length > 0) {
              return { authorized: true, status: 200, isServiceRole: false, userId: resolvedTargetId };
            }
          }
        } catch (_wsErr) {
          // Fail-safe
        }
      }

      return {
        authorized: false,
        status: 403,
        reason: 'Forbidden: Colaboradores não possuem permissão para disparar notificações para terceiros',
      };
    }

    describe('timingSafeEqual: Comparação em tempo constante', () => {
      it('Retorna true para strings idênticas de qualquer tamanho (ASCII e Unicode)', () => {
        expect(timingSafeEqual('segredo-123', 'segredo-123')).toBe(true);
        expect(timingSafeEqual('a', 'a')).toBe(true);
        expect(timingSafeEqual('chave-🔑-segura-çãõ', 'chave-🔑-segura-çãõ')).toBe(true);
        expect(timingSafeEqual('long-token-uuid-v4-abc-def-ghi-jkl', 'long-token-uuid-v4-abc-def-ghi-jkl')).toBe(true);
      });

      it('Retorna false para strings de tamanhos diferentes sem vazar comprimento', () => {
        expect(timingSafeEqual('segredo-123', 'segredo-12')).toBe(false);
        expect(timingSafeEqual('segredo', 'segredo-longo')).toBe(false);
      });

      it('Retorna false para strings de mesmo tamanho com diferença em qualquer posição', () => {
        expect(timingSafeEqual('xegredo', 'segredo')).toBe(false); // início
        expect(timingSafeEqual('segxedo', 'segredo')).toBe(false); // meio
        expect(timingSafeEqual('segredx', 'segredo')).toBe(false); // fim
        expect(timingSafeEqual('chave-🔑-123', 'chave-🔒-123')).toBe(false); // diferença em emoji/Unicode
      });

      it('Retorna false para strings vazias ou valores nulos/indefinidos', () => {
        expect(timingSafeEqual('', '')).toBe(false);
        expect(timingSafeEqual('abc', '')).toBe(false);
        expect(timingSafeEqual('', 'abc')).toBe(false);
        expect(timingSafeEqual(null as unknown as string, 'abc')).toBe(false);
        expect(timingSafeEqual('abc', undefined as unknown as string)).toBe(false);
      });

      it('timingSafeEqualHash: Compara com sucesso usando digests SHA-256', async () => {
        expect(await timingSafeEqualHash('segredo-hash-123', 'segredo-hash-123')).toBe(true);
        expect(await timingSafeEqualHash('segredo-hash-123', 'outro-segredo')).toBe(false);
        expect(await timingSafeEqualHash('', 'segredo')).toBe(false);
      });
    });

    describe('isAuthorizedCronCaller: Autenticação de rotinas de backend', () => {
      it('Rejeita requisição sem cabeçalhos de autorização (anônimo)', () => {
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

      it('Aceita chamada com SUPABASE_SERVICE_ROLE_KEY válida no header Bearer', () => {
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

      it('Rejeita CRON_SECRET incorreto mesmo com x-cron-secret presente', () => {
        const result = testIsAuthorizedCronCaller(
          { 'x-cron-secret': 'cron-incorreto' },
          { serviceRole: 'sr-secret-123', cronSecret: 'cron-abc' }
        );
        expect(result).toBe(false);
      });
    });

    describe('authorizeUserOrService: Anti-IDOR e Autorização Granular por Papel', () => {
      function createMockAdmin(opts?: {
        callerWs?: string[];
        targetWs?: string[];
        ownedWs?: string[];
      }) {
        return {
          auth: {
            getUser: vi.fn().mockImplementation(async (token: string) => {
              if (token === 'alice-valid-token') {
                return { data: { user: { id: 'alice-uuid' } }, error: null };
              }
              if (token === 'bob-valid-token') {
                return { data: { user: { id: 'bob-uuid' } }, error: null };
              }
              if (token === 'charlie-valid-token') {
                return { data: { user: { id: 'charlie-uuid' } }, error: null };
              }
              return { data: { user: null }, error: new Error('Invalid token') };
            }),
          },
          from: vi.fn().mockImplementation((table: string) => {
            if (table === 'workspace_members') {
              return {
                select: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation((field: string, val: unknown) => {
                    if (field === 'user_id' && val === 'bob-uuid') {
                      return {
                        eq: vi.fn().mockReturnValue({
                          in: vi.fn().mockImplementation((_col: string, allowedWs: string[]) => ({
                            limit: vi.fn().mockResolvedValue({
                              data: (opts?.targetWs || []).filter((w) => allowedWs.includes(w)).map((id) => ({ workspace_id: id })),
                            }),
                          })),
                        }),
                      };
                    }
                    return { eq: vi.fn().mockResolvedValue({ data: [] }) };
                  }),
                }),
              };
            }
            if (table === 'workspaces') {
              return {
                select: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation((field: string, val: unknown) => {
                    if (field === 'user_id' && val === 'alice-uuid') {
                      return Promise.resolve({
                        data: (opts?.ownedWs || []).map((id) => ({ id })),
                      });
                    }
                    return Promise.resolve({ data: [] });
                  }),
                }),
              };
            }
            return { select: vi.fn().mockResolvedValue({ data: [] }) };
          }),
        };
      }

      it('Service role tem permissão total independente do destinatário', async () => {
        const mockAdmin = createMockAdmin();
        const res = await testAuthorizeUserOrService(
          { authorization: 'Bearer sr-key' },
          'any-user-uuid',
          mockAdmin,
          { serviceRole: 'sr-key' }
        );
        expect(res.authorized).toBe(true);
        expect(res.isServiceRole).toBe(true);
      });

      it('Rejeita chamador anônimo sem header Authorization com 401', async () => {
        const mockAdmin = createMockAdmin();
        const res = await testAuthorizeUserOrService(
          {},
          'alice-uuid',
          mockAdmin,
          { serviceRole: 'sr-key' }
        );
        expect(res.authorized).toBe(false);
        expect(res.status).toBe(401);
      });

      it('Rejeita JWT inválido ou expirado com 401', async () => {
        const mockAdmin = createMockAdmin();
        const res = await testAuthorizeUserOrService(
          { authorization: 'Bearer token-invalido' },
          'alice-uuid',
          mockAdmin,
          { serviceRole: 'sr-key' }
        );
        expect(res.authorized).toBe(false);
        expect(res.status).toBe(401);
      });

      it('Permite usuário legítimo enviar notificação para si mesmo (targetUserId === callerUserId)', async () => {
        const mockAdmin = createMockAdmin();
        const res = await testAuthorizeUserOrService(
          { authorization: 'Bearer alice-valid-token' },
          'alice-uuid',
          mockAdmin,
          { serviceRole: 'sr-key' }
        );
        expect(res.authorized).toBe(true);
        expect(res.status).toBe(200);
        expect(res.userId).toBe('alice-uuid');
      });

      it('Se targetUserId for omitido, resolve automaticamente para a identidade do chamador', async () => {
        const mockAdmin = createMockAdmin();
        const res = await testAuthorizeUserOrService(
          { authorization: 'Bearer alice-valid-token' },
          undefined,
          mockAdmin,
          { serviceRole: 'sr-key' }
        );
        expect(res.authorized).toBe(true);
        expect(res.status).toBe(200);
        expect(res.userId).toBe('alice-uuid');
      });

      it('PROPRIETÁRIO: Permite que o dono do workspace notifique colaborador gerenciado em seu workspace', async () => {
        const mockAdmin = createMockAdmin({
          ownedWs: ['ws-alice-owner'],
          targetWs: ['ws-alice-owner'],
        });
        const res = await testAuthorizeUserOrService(
          { authorization: 'Bearer alice-valid-token' },
          'bob-uuid',
          mockAdmin,
          { serviceRole: 'sr-key' }
        );
        expect(res.authorized).toBe(true);
        expect(res.status).toBe(200);
        expect(res.userId).toBe('bob-uuid');
      });

      it('COLABORADOR: Bloqueia com 403 colaborador tentando disparar notificação para outro membro do mesmo workspace', async () => {
        // Charlie é colaborador (não-proprietário) no workspace de Bob
        const mockAdmin = createMockAdmin({
          ownedWs: [], // Charlie não é dono de nenhum workspace
          targetWs: ['ws-shared-100'],
        });
        const res = await testAuthorizeUserOrService(
          { authorization: 'Bearer charlie-valid-token' },
          'bob-uuid',
          mockAdmin,
          { serviceRole: 'sr-key' }
        );
        expect(res.authorized).toBe(false);
        expect(res.status).toBe(403);
        expect(res.reason).toContain('Colaboradores não possuem permissão');
      });

      it('USUÁRIO EXTERNO: Bloqueia com 403 envio para usuário fora de qualquer workspace sob gestão', async () => {
        const mockAdmin = createMockAdmin({
          ownedWs: ['ws-alice-exclusive'],
          targetWs: ['ws-bob-other'],
        });
        const res = await testAuthorizeUserOrService(
          { authorization: 'Bearer alice-valid-token' },
          'bob-uuid',
          mockAdmin,
          { serviceRole: 'sr-key' }
        );
        expect(res.authorized).toBe(false);
        expect(res.status).toBe(403);
        expect(res.reason).toContain('Colaboradores não possuem permissão');
      });
    });

    describe('Segurança do Frontend: ConfiguracoesNotificacoes.tsx', () => {
      it('Não invoca a Edge Function cron-notificacoes a partir do navegador', () => {
        const uiCode = fs.readFileSync(
          path.join(rootDir, 'src/pages/ConfiguracoesNotificacoes.tsx'),
          'utf8'
        );

        expect(uiCode).not.toContain('supabase.functions.invoke("cron-notificacoes")');
        expect(uiCode).not.toContain("supabase.functions.invoke('cron-notificacoes')");
        expect(uiCode).toContain('push.testarPush');
      });
    });
  });
});
