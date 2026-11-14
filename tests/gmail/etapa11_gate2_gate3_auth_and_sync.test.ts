import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailIntegrationService } from '../../src/domains/gmail/services/GmailIntegrationService';
import fs from 'node:fs';
import path from 'node:path';

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
