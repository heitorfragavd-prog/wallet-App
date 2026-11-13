/**
 * WalletAudioService.ts
 *
 * Serviço de Transcrição e Processamento de Áudio do Wallet CEO / Wallet IA (Etapa 10 - Gate 8).
 * Envia o áudio gravado no navegador para o endpoint seguro /transcribe-audio da Edge Function openai-proxy,
 * garantindo autenticação via JWT, tratamento de erros e devolução do texto transcrito.
 */

import { supabase } from '@/integrations/supabase/client';

export interface TranscribeAudioResult {
  success: boolean;
  text?: string;
  durationSeconds?: number;
  error?: string;
}

export class WalletAudioService {
  /**
   * Envia um Blob de áudio gravado para transcrição no Whisper via Edge Function openai-proxy
   */
  public static async transcribeAudio(
    audioBlob: Blob,
    filename = 'gravacao.webm'
  ): Promise<TranscribeAudioResult> {
    if (!audioBlob || audioBlob.size === 0) {
      return { success: false, error: 'Arquivo de áudio vazio ou não fornecido.' };
    }

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        return { success: false, error: 'Usuário não autenticado para transcrição de voz.' };
      }

      const formData = new FormData();
      formData.append('audio', audioBlob, filename);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const endpoint = `${supabaseUrl}/functions/v1/openai-proxy/transcribe-audio`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Falha na transcrição (${response.status}): ${errorText || 'Erro no servidor de áudio.'}`,
        };
      }

      const data = await response.json();
      const transcribedText = typeof data.text === 'string' ? data.text.trim() : '';

      if (!transcribedText) {
        return {
          success: false,
          error: 'Nenhuma fala audível foi detectada na gravação.',
        };
      }

      return {
        success: true,
        text: transcribedText,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao transcrever áudio.';
      return { success: false, error: msg };
    }
  }
}
