/**
 * useAudioRecorder.ts
 *
 * Hook para controle de gravação de áudio no navegador via Web Audio / MediaRecorder API (Etapa 10 - Gate 8).
 * Gerencia permissões de microfone, timer de duração, limite máximo de segurança (120s) e
 * geração de Blob de áudio otimizado para transcrição Whisper.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  recordingDuration: number;
  error: string | null;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  formattedDuration: string;
}

const MAX_RECORDING_DURATION_SECONDS = 120; // 2 minutos máximo

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const resolveStopPromiseRef = useRef<((blob: Blob | null) => void) | null>(null);

  // Formata duração em mm:ss
  const formattedDuration = `${String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:${String(
    recordingDuration % 60
  ).padStart(2, '0')}`;

  const cleanUpStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {
        // Ignora erro no cancelamento forçado
      }
    }
    cleanUpStream();
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
    setError(null);
    if (resolveStopPromiseRef.current) {
      resolveStopPromiseRef.current(null);
      resolveStopPromiseRef.current = null;
    }
  }, [cleanUpStream]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        cleanUpStream();
        setIsRecording(false);
        resolve(null);
        return;
      }

      resolveStopPromiseRef.current = resolve;
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        cleanUpStream();
        setIsRecording(false);
        setError(err instanceof Error ? err.message : 'Erro ao parar gravação.');
        resolve(null);
      }
    });
  }, [cleanUpStream]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    audioChunksRef.current = [];
    setRecordingDuration(0);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Seu navegador não suporta gravação de áudio.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Seleciona melhor formato suportado
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = '';
        }
      }

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        cleanUpStream();
        setIsRecording(false);

        const currentChunks = audioChunksRef.current;
        if (currentChunks.length === 0) {
          if (resolveStopPromiseRef.current) {
            resolveStopPromiseRef.current(null);
            resolveStopPromiseRef.current = null;
          }
          return;
        }

        const audioBlob = new Blob(currentChunks, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });
        audioChunksRef.current = [];

        if (resolveStopPromiseRef.current) {
          resolveStopPromiseRef.current(audioBlob);
          resolveStopPromiseRef.current = null;
        }
      };

      mediaRecorder.start(250); // Coleta fatias a cada 250ms
      setIsRecording(true);

      // Inicia timer de contagem
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev + 1 >= MAX_RECORDING_DURATION_SECONDS) {
            // Atingiu duração máxima -> para automaticamente
            void stopRecording();
            return MAX_RECORDING_DURATION_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);

      return true;
    } catch (err) {
      cleanUpStream();
      setIsRecording(false);
      const isNotAllowed =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      const msg = isNotAllowed
        ? 'Permissão de acesso ao microfone negada. Conceda permissão no navegador.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível acessar o microfone.';
      setError(msg);
      return false;
    }
  }, [cleanUpStream, stopRecording]);

  useEffect(() => {
    return () => {
      cleanUpStream();
    };
  }, [cleanUpStream]);

  return {
    isRecording,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    formattedDuration,
  };
}
