/**
 * AgendaVoiceBar.tsx
 *
 * Barra de Comando por Voz da Agenda Inteligente (Etapa 12 - Gate 5 & Gate 9).
 * Permite ao CEO perguntar sobre compromissos ou agendar reuniões por voz.
 */

import React from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles } from 'lucide-react';
import { useAgendaVoiceAssistant } from '../hooks/useAgendaVoiceAssistant';

interface AgendaVoiceBarProps {
  workspaceId?: string;
}

export const AgendaVoiceBar: React.FC<AgendaVoiceBarProps> = ({ workspaceId }) => {
  const {
    state,
    startRecording,
    stopRecording,
    stopSpeaking,
  } = useAgendaVoiceAssistant(workspaceId);

  return (
    <Card className="border-border/60 bg-gradient-to-r from-sky-500/5 via-indigo-500/5 to-purple-500/5">
      <CardContent className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant={state.isRecording ? 'destructive' : 'default'}
            onClick={state.isRecording ? stopRecording : startRecording}
            disabled={state.isTranscribing || state.isProcessing}
            className={`h-9 px-3 gap-2 ${
              state.isRecording
                ? 'animate-pulse bg-red-600 hover:bg-red-700'
                : 'bg-sky-500 hover:bg-sky-600 text-white'
            }`}
          >
            {state.isTranscribing || state.isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : state.isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            <span className="text-xs font-medium">
              {state.isRecording
                ? 'Gravando... Clique para enviar'
                : state.isTranscribing
                ? 'Transcrevendo áudio...'
                : state.isProcessing
                ? 'Consultando agenda...'
                : 'Falar com a Agenda'}
            </span>
          </Button>

          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-sky-400" />
            <span>
              {state.transcription ? (
                <span className="text-foreground italic">"{state.transcription}"</span>
              ) : (
                'Ex: "Wallet, o que tenho agendado para hoje?" ou "Agende reunião amanhã às 15h"'
              )}
            </span>
          </div>
        </div>

        {state.responseMessage && (
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {state.isSpeaking ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={stopSpeaking}
                className="h-7 text-xs text-sky-400 hover:text-sky-500 gap-1"
              >
                <VolumeX className="h-3.5 w-3.5" />
                Silenciar
              </Button>
            ) : (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Volume2 className="h-3.5 w-3.5 text-sky-400" />
                <span>Resposta recebida</span>
              </div>
            )}
          </div>
        )}

        {state.error && (
          <div className="w-full text-xs text-amber-500 bg-amber-500/10 rounded px-2.5 py-1">
            {state.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
