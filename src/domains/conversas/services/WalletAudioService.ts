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

export interface AudioCostEstimate {
  durationSeconds: number;
  costUsd: number;
  costBrl: number;
  ratePerMinuteUsd: number;
}

export class WalletAudioService {
  /**
   * Custo oficial da OpenAI para o modelo Whisper: US$ 0.006 por minuto
   */
  public static readonly WHISPER_USD_PER_MINUTE = 0.006;
  public static readonly DEFAULT_USD_TO_BRL = 5.80;

  /**
   * Calcula a estimativa de custo de transcrição Whisper com base na duração do áudio
   */
  public static calculateCostEstimate(
    durationSeconds: number,
    usdBrlRate = WalletAudioService.DEFAULT_USD_TO_BRL
  ): AudioCostEstimate {
    const safeDuration = Math.max(0, durationSeconds);
    const minutes = safeDuration / 60;
    const costUsd = minutes * WalletAudioService.WHISPER_USD_PER_MINUTE;
    const costBrl = costUsd * usdBrlRate;

    return {
      durationSeconds: safeDuration,
      costUsd: Number(costUsd.toFixed(6)),
      costBrl: Number(costBrl.toFixed(4)),
      ratePerMinuteUsd: WalletAudioService.WHISPER_USD_PER_MINUTE,
    };
  }

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
