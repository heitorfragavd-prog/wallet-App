/**
 * useAgendaVoiceAssistant.ts
 *
 * Hook do Assistente de Voz da Agenda Inteligente (Etapa 12 - Gate 5).
 * Integração com o subsistema de áudio da Etapa 10 (WalletAudioService):
 * - Gravação e transcrição de comandos de voz em linguagem natural
 * - Consulta inteligente de compromissos do dia e Google Calendar
 * - Preparação segura de propostas de agendamento (fail-closed, status 'prepared')
 * - Resposta audível com síntese de voz (TTS) executiva
 */

import { useState, useCallback, useRef } from 'react';
import { WalletAudioService } from '@/domains/conversas/services/WalletAudioService';
import { supabase } from '@/integrations/supabase/client';

export interface AgendaVoiceState {
  isRecording: boolean;
  isTranscribing: boolean;
  isProcessing: boolean;
  transcription: string;
  responseMessage: string;
  isSpeaking: boolean;
  error: string | null;
}

export function useAgendaVoiceAssistant(workspaceId?: string) {
  const [state, setState] = useState<AgendaVoiceState>({
    isRecording: false,
    isTranscribing: false,
    isProcessing: false,
    transcription: '',
    responseMessage: '',
    isSpeaking: false,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  /**
   * Síntese de voz executiva (TTS)
   */
  const speakText = useCallback((textToSpeak: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05; // ritmo executivo
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setState((prev) => ({ ...prev, isSpeaking: true }));
      };
      utterance.onend = () => {
        setState((prev) => ({ ...prev, isSpeaking: false }));
      };
      utterance.onerror = () => {
        setState((prev) => ({ ...prev, isSpeaking: false }));
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      setState((prev) => ({ ...prev, isSpeaking: false }));
    }
  }, []);

  /**
   * Processa o texto transcrito com a inteligência do orquestrador
   */
  const processVoiceCommand = useCallback(
    async (transcribedText: string) => {
      if (!transcribedText.trim()) return;

      setState((prev) => ({
        ...prev,
        isProcessing: true,
        transcription: transcribedText,
        error: null,
      }));

      try {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          throw new Error('Sessão expirada. Por favor, autentique-se novamente.');
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const endpoint = `${supabaseUrl}/functions/v1/wallet-ai-orchestrator`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            prompt: transcribedText,
            workspaceId: workspaceId || session.user.id,
            channel: 'voice_agenda',
            model: 'gemini-2.5-flash',
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Falha no processamento (${response.status}): ${errBody || 'Erro do orquestrador'}`);
        }

        const data = await response.json();
        const reply =
          data.answer ||
          data.text ||
          data.finalMessage?.content ||
          'Comando processado com sucesso pela inteligência do Wallet.';

        setState((prev) => ({
          ...prev,
          isProcessing: false,
          responseMessage: reply,
        }));

        // Limpa marcadores de formatação para falar de forma fluida
        const plainSpeech = reply
          .replace(/[*_#`[\]()]/g, '')
          .replace(/•/g, '')
          .replace(/\n+/g, '. ');

        speakText(plainSpeech);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: msg,
        }));
      }
    },
    [workspaceId, speakText]
  );

  /**
   * Inicia gravação de áudio do microfone
   */
  const startRecording = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, transcription: '', responseMessage: '' }));
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        setState((prev) => ({ ...prev, isRecording: false, isTranscribing: true }));

        const transResult = await WalletAudioService.transcribeAudio(audioBlob);
        if (!transResult.success || !transResult.text) {
          setState((prev) => ({
            ...prev,
            isTranscribing: false,
            error: transResult.error || 'Não foi possível reconhecer a voz. Tente falar novamente.',
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          isTranscribing: false,
          transcription: transResult.text || '',
        }));

        await processVoiceCommand(transResult.text);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setState((prev) => ({ ...prev, isRecording: true }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao acessar o microfone.';
      setState((prev) => ({ ...prev, isRecording: false, error: msg }));
    }
  }, [processVoiceCommand]);

  /**
   * Encerra a gravação de áudio
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  /**
   * Interrompe fala do assistente
   */
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setState((prev) => ({ ...prev, isSpeaking: false }));
    }
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    processVoiceCommand,
    speakText,
    stopSpeaking,
  };
}
