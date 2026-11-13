import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletAudioService } from '../../src/domains/conversas/services/WalletAudioService';

vi.mock('../../src/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe('ETAPA 10 — GATE 8: Gravação e Transcrição de Áudio no Aplicativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WalletAudioService.transcribeAudio', () => {
    it('rejeita blob vazio ou nulo com erro explicativo', async () => {
      // @ts-expect-error testando entrada nula
      const resNull = await WalletAudioService.transcribeAudio(null);
      expect(resNull.success).toBe(false);
      expect(resNull.error).toContain('Arquivo de áudio vazio');

      const emptyBlob = new Blob([], { type: 'audio/webm' });
      const resEmpty = await WalletAudioService.transcribeAudio(emptyBlob);
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.error).toContain('Arquivo de áudio vazio');
    });

    it('rejeita requisição quando usuário não está autenticado', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const audioBlob = new Blob(['dummy audio content'], { type: 'audio/webm' });
      const res = await WalletAudioService.transcribeAudio(audioBlob);

      expect(res.success).toBe(false);
      expect(res.error).toContain('não autenticado');
    });

    it('chama endpoint /transcribe-audio com FormData e retorna texto transcrito com sucesso', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'fake-jwt-token-123' } as unknown as import('@supabase/supabase-js').Session },
        error: null,
      });

      const fakeResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: 'Quanto faturamos ontem e quais contas vencem hoje?' }),
      };
      global.fetch = vi.fn().mockResolvedValue(fakeResponse as unknown as Response);

      const audioBlob = new Blob(['audio-bytes'], { type: 'audio/webm' });
      const res = await WalletAudioService.transcribeAudio(audioBlob, 'pergunta.webm');

      expect(res.success).toBe(true);
      expect(res.text).toBe('Quanto faturamos ontem e quais contas vencem hoje?');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/openai-proxy/transcribe-audio'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer fake-jwt-token-123',
          },
          body: expect.any(FormData),
        })
      );
    });

    it('trata erro retornado pelo servidor de áudio (ex: 500 ou cota excedida)', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'valid-token' } as unknown as import('@supabase/supabase-js').Session },
        error: null,
      });

      const errorResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('OpenAI API Key não configurada'),
      };
      global.fetch = vi.fn().mockResolvedValue(errorResponse as unknown as Response);

      const audioBlob = new Blob(['audio-bytes'], { type: 'audio/webm' });
      const res = await WalletAudioService.transcribeAudio(audioBlob);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Falha na transcrição (500)');
    });

    it('informa quando nenhuma fala audível foi detectada', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'valid-token' } as unknown as import('@supabase/supabase-js').Session },
        error: null,
      });

      const silentResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: '   ' }),
      };
      global.fetch = vi.fn().mockResolvedValue(silentResponse as unknown as Response);

      const audioBlob = new Blob(['audio-silence'], { type: 'audio/webm' });
      const res = await WalletAudioService.transcribeAudio(audioBlob);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Nenhuma fala audível');
    });
  });
});
