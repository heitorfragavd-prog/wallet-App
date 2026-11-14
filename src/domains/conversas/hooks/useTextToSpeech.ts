/**
 * useTextToSpeech.ts
 *
 * Hook para reprodução de respostas em áudio sintetizado (TTS - Etapa 10 Gate 11).
 * Utiliza a Web Speech API nativa do navegador com voz em português do Brasil (pt-BR).
 * Remove formatações Markdown e tags antes da síntese para fala natural e fluida.
 * PRIVACIDADE: Nunca reproduz áudio automaticamente. Requer ação explícita do usuário.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Remove sintaxe Markdown, tags HTML e caracteres especiais para fala fluida
 */
export function cleanMarkdownForSpeech(text: string): string {
  if (!text) return '';

  return (
    text
      // Remove blocos de código
      .replace(/```[\s\S]*?```/g, '')
      // Remove código inline
      .replace(/`([^`]+)`/g, '$1')
      // Remove tags HTML
      .replace(/<[^>]+>/g, '')
      // Remove links markdown mantendo apenas o texto [texto](link)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove cabeçalhos #
      .replace(/^#{1,6}\s+/gm, '')
      // Remove negrito e itálico (* e _)
      .replace(/[*_]{1,3}(.*?)[*_]{1,3}/g, '$1')
      // Remove marcadores de lista
      .replace(/^[\s*-+]+(?=\S)/gm, '')
      // Remove tabelas markdown (linhas com pipes |)
      .replace(/^\|.*\|$/gm, '')
      // Normaliza quebras de linha múltiplas para pausas naturais
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      // Remove espaços extras
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

export interface UseTextToSpeechReturn {
  isSupported: boolean;
  isSpeaking: boolean;
  currentMessageId: string | null;
  speak: (messageId: string, rawText: string) => void;
  stop: () => void;
  toggle: (messageId: string, rawText: string) => void;
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setIsSupported(true);
    }
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setCurrentMessageId(null);
    utteranceRef.current = null;
  }, []);

  const speak = useCallback(
    (messageId: string, rawText: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }

      // Cancela qualquer reprodução em andamento
      window.speechSynthesis.cancel();

      const cleanText = cleanMarkdownForSpeech(rawText);
      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05; // Leve aceleração para ritmo conversacional ágil
      utterance.pitch = 1.0;

      // Seleciona preferencialmente voz brasileira
      const voices = window.speechSynthesis.getVoices();
      const ptBrVoice = voices.find(
        (v) => v.lang === 'pt-BR' || v.lang === 'pt_BR' || (v.lang.startsWith('pt') && v.name.toLowerCase().includes('brazil'))
      ) || voices.find((v) => v.lang.startsWith('pt'));

      if (ptBrVoice) {
        utterance.voice = ptBrVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setCurrentMessageId(messageId);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setCurrentMessageId(null);
        utteranceRef.current = null;
      };

      utterance.onerror = (e) => {
        // Erro por cancelamento manual intencional não deve logar como erro
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('[useTextToSpeech] Erro na síntese de voz:', e.error);
        }
        setIsSpeaking(false);
        setCurrentMessageId(null);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    []
  );

  const toggle = useCallback(
    (messageId: string, rawText: string) => {
      if (isSpeaking && currentMessageId === messageId) {
        stop();
      } else {
        speak(messageId, rawText);
      }
    },
    [isSpeaking, currentMessageId, speak, stop]
  );

  // Cancela áudio caso o componente seja desmontado
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    isSupported,
    isSpeaking,
    currentMessageId,
    speak,
    stop,
    toggle,
  };
}
