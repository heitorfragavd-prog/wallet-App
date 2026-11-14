/**
 * GoogleCalendarIntegrationCard.tsx
 *
 * Painel de Status e Gerenciamento da Conexão com Google Calendar (Etapa 12 - Gate 9).
 * Permite autenticar via OAuth 2.0 (escopo isolado de calendar), sincronizar eventos
 * e visualizar status de conexão por workspace.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { CalendarDays, RefreshCw, Unlink, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CalendarIntegrationService } from '../services/CalendarIntegrationService';

interface GoogleCalendarIntegrationCardProps {
  workspaceId: string;
  onSyncCompleted?: () => void;
}

export const GoogleCalendarIntegrationCard: React.FC<GoogleCalendarIntegrationCardProps> = ({
  workspaceId,
  onSyncCompleted,
}) => {
  const queryClient = useQueryClient();
  const [authError, setAuthError] = useState<string | null>(null);

  const { data: integration, isLoading, refetch } = useQuery({
    queryKey: ['calendar-integration', workspaceId],
    queryFn: () => CalendarIntegrationService.getIntegration(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 1000 * 60 * 2,
  });

  const syncMutation = useMutation({
    mutationFn: () => CalendarIntegrationService.syncEvents(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['calendar-integration', workspaceId] });
      if (onSyncCompleted) onSyncCompleted();
    },
    onError: (err: Error) => {
      setAuthError(err.message);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => CalendarIntegrationService.disconnect(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integration', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events', workspaceId] });
      refetch();
    },
    onError: (err: Error) => {
      setAuthError(err.message);
    },
  });

  const handleConnect = async () => {
    setAuthError(null);
    try {
      const redirectUri = `${window.location.origin}/agenda`;
      const authResult = await CalendarIntegrationService.getAuthUrl(workspaceId, redirectUri);
      if (authResult.authUrl) {
        window.location.href = authResult.authUrl;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao iniciar autenticação Google.';
      setAuthError(msg);
    }
  };

  const isConnected = Boolean(integration && integration.status === 'active');

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
      <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Google Calendar</h4>
              {isLoading ? (
                <Badge variant="outline" className="text-xs">Verificando...</Badge>
              ) : isConnected ? (
                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Conectado
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs text-muted-foreground">
                  Não conectado
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isConnected && integration?.google_account_email
                ? `Conta sincronizada: ${integration.google_account_email}`
                : 'Sincronize reuniões e eventos externos com a sua agenda executiva.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="h-8 text-xs gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm('Deseja realmente desconectar o Google Calendar deste workspace?')) {
                    disconnectMutation.mutate();
                  }
                }}
                disabled={disconnectMutation.isPending}
                className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Conectar Google Calendar
            </Button>
          )}
        </div>

        {authError && (
          <div className="w-full text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md p-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
