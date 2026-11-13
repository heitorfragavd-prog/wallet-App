/**
 * AudioRecorderButton.tsx
 *
 * Componente de Gravação e Transcrição de Voz no Chat (Etapa 10 - Gate 8).
 * Apresenta botão de microfone, estado de gravação em tempo real com cronômetro,
 * cancelamento e envio automático com transcrição Whisper.
 */

import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Mic, Square, Trash2, Loader2 } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { WalletAudioService } from '../services/WalletAudioService';
import { useToast } from '@/shared/hooks/use-toast';

interface AudioRecorderButtonProps {
  onTranscriptionComplete: (text: string) => void;
  disabled?: boolean;
}

export const AudioRecorderButton: React.FC<AudioRecorderButtonProps> = ({
  onTranscriptionComplete,
  disabled = false,
}) => {
  const { toast } = useToast();
  const {
    isRecording,
    formattedDuration,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  const [isTranscribing, setIsTranscribing] = useState(false);

  const handleStart = async () => {
    if (disabled || isRecording || isTranscribing) return;
    const ok = await startRecording();
    if (!ok && recorderError) {
      toast({
        title: 'Microfone Indisponível',
        description: recorderError,
        variant: 'destructive',
      });
    }
  };

  const handleFinishAndTranscribe = async () => {
    if (!isRecording) return;
    setIsTranscribing(true);
    try {
      const audioBlob = await stopRecording();
      if (!audioBlob || audioBlob.size === 0) {
        toast({
          title: 'Gravação Vazia',
          description: 'Nenhum áudio foi capturado.',
          variant: 'destructive',
        });
        return;
      }

      const res = await WalletAudioService.transcribeAudio(audioBlob);
      if (!res.success || !res.text) {
        toast({
          title: 'Falha na Transcrição',
          description: res.error || 'Não foi possível transcrever a mensagem de voz.',
          variant: 'destructive',
        });
        return;
      }

      onTranscriptionComplete(res.text);
      toast({
        title: 'Áudio Transcrito',
        description: `"${res.text.slice(0, 60)}${res.text.length > 60 ? '...' : ''}"`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar áudio.';
      toast({
        title: 'Erro de Áudio',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleCancel = () => {
    cancelRecording();
  };

  if (isTranscribing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs animate-pulse">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
        <span className="font-medium">Transcrevendo áudio...</span>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
        <span className="font-mono font-bold text-red-500">{formattedDuration}</span>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          (Gravando voz...)
        </span>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
          title="Cancelar gravação"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={handleFinishAndTranscribe}
          className="h-7 px-2.5 bg-red-500 hover:bg-red-600 text-white text-[11px] gap-1 font-semibold shadow-sm"
          title="Concluir e transcrever"
        >
          <Square className="w-3 h-3 fill-current" />
          <span>Enviar</span>
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      onClick={handleStart}
      className="h-10 w-10 shrink-0 text-muted-foreground hover:text-orange-400 hover:border-orange-500/30 transition-colors"
      title="Gravar mensagem de voz (Transcrição com Whisper)"
      aria-label="Gravar áudio"
    >
      <Mic className="w-4 h-4" />
    </Button>
  );
};
