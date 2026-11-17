import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailIntegrationService } from '../../src/domains/gmail/services/GmailIntegrationService';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

describe('👑 WALLET CEO 3.0 — Etapa 11 (Gates 1, 2 e 3): Conexão Gmail e Sincronização Incremental', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Conexão Segura e Menor Privilégio (Gate 2)', () => {
    it('garante que a conta alvo oficial seja estritamente rodopointcafe@gmail.com', () => {
      expect(GmailIntegrationService.TARGET_EMAIL).toBe('rodopointcafe@gmail.com');
    });

    it('requisita auth-url para o endpoint seguro /gmail-sync/auth-url com Bearer Token', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'fake-jwt-token' } as unknown as import('@supabase/supabase-js').Session },
        error: null,
      });

      const fakeResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/gmail.readonly...',
          state: 'base64-state-payload',
        }),
      };
      global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

      const res = await GmailIntegrationService.getAuthUrl('workspace-123');

      expect(res).not.toBeNull();
      expect(res?.authUrl).toContain('gmail.readonly');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/gmail-sync/auth-url'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer fake-jwt-token',
          }),
        })
      );
    });

    it('retorna isConfigurationPending=true quando o backend responde status 503 (credenciais ausentes)', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'fake-jwt-token' } as unknown as import('@supabase/supabase-js').Session },
        error: null,
      });

      const fakeResponse = {
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue({
          error: 'Credenciais Google OAuth não configuradas no Supabase Vault (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET ausentes).',
        }),
        text: vi.fn().mockResolvedValue(''),
      };
      global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

      const res = await GmailIntegrationService.getAuthUrl('workspace-123');

      expect(res?.authUrl).toBeUndefined();
      expect(res?.isConfigurationPending).toBe(true);
      expect(res?.error).toContain('Vault');
    });

    it('valida que o dashboard do Gmail possui a definição correta de isConnected e banner de configuração', () => {
      const componentPath = path.resolve(
        process.cwd(),
        'src/domains/gmail/components/GmailDocumentsDashboard.tsx'
      );
      const code = fs.readFileSync(componentPath, 'utf-8');
      expect(code).toContain("const isConnected = integration?.status === 'conectado';");
      expect(code).toContain('configPending && !isConnected');
      expect(code).toContain('Integração Gmail aguardando configuração do Google Cloud.');
    });

    describe('Processamento de Callback OAuth (oauth-callback)', () => {
      it('processa callback com sucesso e retorna success=true', async () => {
        const { supabase } = await import('../../src/integrations/supabase/client');
        vi.mocked(supabase.auth.getSession).mockResolvedValue({
          data: { session: { access_token: 'valid-jwt' } as unknown as import('@supabase/supabase-js').Session },
          error: null,
        });

        const fakeResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            success: true,
            email: 'rodopointcafe@gmail.com',
            status: 'conectado',
          }),
        };
        global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

        const statePayload = Buffer.from(JSON.stringify({ workspaceId: 'ws-123', userId: 'user-123' })).toString('base64');
        const res = await GmailIntegrationService.handleOAuthCallback('mock-code-123', statePayload, 'https://wallet.wonderwold.com.br/dividas');

        expect(res.success).toBe(true);
        expect(res.error).toBeUndefined();
      });

      it('trata código expirado ou já utilizado (invalid_grant) com mensagem amigável', async () => {
        const { supabase } = await import('../../src/integrations/supabase/client');
        vi.mocked(supabase.auth.getSession).mockResolvedValue({
          data: { session: { access_token: 'valid-jwt' } as unknown as import('@supabase/supabase-js').Session },
          error: null,
        });

        const fakeResponse = {
          ok: false,
          status: 400,
          json: vi.fn().mockResolvedValue({
            error: 'Código de autorização expirado ou já utilizado. Por favor, tente conectar novamente.',
            code: 'invalid_grant',
          }),
        };
        global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

        const statePayload = Buffer.from(JSON.stringify({ workspaceId: 'ws-123', userId: 'user-123' })).toString('base64');
        const res = await GmailIntegrationService.handleOAuthCallback('expired-code', statePayload);

        expect(res.success).toBe(false);
        expect(res.error).toContain('expirado ou já utilizado');
      });

      it('trata state inválido ou corrompido com mensagem de erro descritiva', async () => {
        const { supabase } = await import('../../src/integrations/supabase/client');
        vi.mocked(supabase.auth.getSession).mockResolvedValue({
          data: { session: { access_token: 'valid-jwt' } as unknown as import('@supabase/supabase-js').Session },
          error: null,
        });

        const fakeResponse = {
          ok: false,
          status: 400,
          json: vi.fn().mockResolvedValue({
            error: 'State inválido ou corrompido.',
          }),
        };
        global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

        const res = await GmailIntegrationService.handleOAuthCallback('mock-code', 'corrupted-state!!!');

        expect(res.success).toBe(false);
        expect(res.error).toContain('State inválido');
      });

      it('trata falha de persistência no banco (HTTP 500) sem vazar dados sensíveis', async () => {
        const { supabase } = await import('../../src/integrations/supabase/client');
        vi.mocked(supabase.auth.getSession).mockResolvedValue({
          data: { session: { access_token: 'valid-jwt' } as unknown as import('@supabase/supabase-js').Session },
          error: null,
        });

        const fakeResponse = {
          ok: false,
          status: 500,
          json: vi.fn().mockResolvedValue({
            error: 'Falha ao gravar credenciais de integração no banco de dados.',
          }),
        };
        global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

        const statePayload = Buffer.from(JSON.stringify({ workspaceId: 'ws-123', userId: 'user-123' })).toString('base64');
        const res = await GmailIntegrationService.handleOAuthCallback('mock-code', statePayload);

        expect(res.success).toBe(false);
        expect(res.error).toContain('Falha ao gravar credenciais');
        expect(res.error).not.toContain('secret');
        expect(res.error).not.toContain('token');
      });

      it('trata usuário sem permissão no workspace (HTTP 403)', async () => {
        const { supabase } = await import('../../src/integrations/supabase/client');
        vi.mocked(supabase.auth.getSession).mockResolvedValue({
          data: { session: { access_token: 'unauthorized-jwt' } as unknown as import('@supabase/supabase-js').Session },
          error: null,
        });

        const fakeResponse = {
          ok: false,
          status: 403,
          json: vi.fn().mockResolvedValue({
            error: 'Usuário sem permissão administrativa neste workspace.',
          }),
        };
        global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

        const statePayload = Buffer.from(JSON.stringify({ workspaceId: 'ws-unauthorized', userId: 'user-456' })).toString('base64');
        const res = await GmailIntegrationService.handleOAuthCallback('mock-code', statePayload);

        expect(res.success).toBe(false);
        expect(res.error).toContain('sem permissão');
      });

      it('valida que a Edge Function gmail-sync implementa dupla verificação de perfil e proteção de refresh token', () => {
        const fnPath = path.resolve(
          process.cwd(),
          'supabase/functions/gmail-sync/index.ts'
        );
        const code = fs.readFileSync(fnPath, 'utf-8');
        expect(code).toContain('gmail.googleapis.com/gmail/v1/users/me/profile');
        expect(code).toContain('userinfo.email');
        expect(code).toContain('refreshTokenToSave');
        expect(code).toContain('invalid_grant');
        expect(code).toContain('TARGET_GMAIL_ACCOUNT');
      });
    });

    it('executa desconexão segura via endpoint /gmail-sync/disconnect', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'valid-jwt' } as unknown as import('@supabase/supabase-js').Session },
        error: null,
      });

      const fakeResponse = { ok: true };
      global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

      const ok = await GmailIntegrationService.disconnect('workspace-123');

      expect(ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/gmail-sync/disconnect'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('Monitoramento Incremental (Gate 3)', () => {
    it('executa syncNow e retorna resumo da sincronização incremental', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'valid-jwt' } as unknown as import('@supabase/supabase-js').Session },
        error: null,
      });

      const mockSummary = {
        success: true,
        messagesChecked: 12,
        newDocumentsFound: 3,
        duplicatesSkipped: 9,
        errorsCount: 0,
        lastSyncTimestamp: '2026-11-14T11:00:00Z',
      };

      const fakeResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockSummary),
      };
      global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

      const summary = await GmailIntegrationService.syncNow('workspace-123');

      expect(summary.success).toBe(true);
      expect(summary.messagesChecked).toBe(12);
      expect(summary.newDocumentsFound).toBe(3);
      expect(summary.duplicatesSkipped).toBe(9);
    });

    it('trata erro de sincronização caso o usuário não esteja autenticado', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const summary = await GmailIntegrationService.syncNow('workspace-123');

      expect(summary.success).toBe(false);
      expect(summary.error).toContain('não autenticado');
    });
  });

  describe('Auditoria da Migration 95 (Gate 1 e Gate 2)', () => {
    it('comprova a criação das tabelas com RLS e restrições seguras', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/95_workspace_gmail_integrations.sql'
      );
      const sql = fs.readFileSync(migrationPath, 'utf-8');

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.workspace_gmail_integrations');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.gmail_mensagens_processadas');
      expect(sql).toContain('ALTER TABLE public.workspace_gmail_integrations ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE public.gmail_mensagens_processadas ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('wm.role IN (\'owner\', \'admin\')');
      expect(sql).toContain('CONSTRAINT uq_workspace_gmail_email UNIQUE');
      expect(sql).toContain('CONSTRAINT uq_gmail_workspace_message UNIQUE');
    });

    it('comprova a existência da migration de rollback correspondente', () => {
      const rollbackPath = path.resolve(
        process.cwd(),
        'supabase/migrations/rollback/95_workspace_gmail_integrations.down.sql'
      );
      expect(fs.existsSync(rollbackPath)).toBe(true);
      const sql = fs.readFileSync(rollbackPath, 'utf-8');
      expect(sql).toContain('DROP TABLE IF EXISTS public.gmail_mensagens_processadas');
      expect(sql).toContain('DROP TABLE IF EXISTS public.workspace_gmail_integrations');
    });
  });
});
