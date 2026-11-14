/**
 * WhatsAppIntegrationCard.tsx
 *
 * Painel de Configuração, Monitoramento e Pareamento do WhatsApp Business (Cloud API).
 * Wallet CEO 3.0 — Etapa 13 (Gates 8 e 9).
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  MessageSquare,
  Copy,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UserPlus,
  ShieldCheck,
  Smartphone,
  Check,
  Lock,
} from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { WhatsAppIntegrationService } from '../services/WhatsAppIntegrationService';

interface WhatsAppIntegrationCardProps {
  workspaceId: string;
}

export const WhatsAppIntegrationCard: React.FC<WhatsAppIntegrationCardProps> = ({ workspaceId }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newRole, setNewRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [showPairForm, setShowPairForm] = useState(false);

  // Consulta de Status da Integração
  const {
    data: integration,
    isLoading: loadingIntegration,
    refetch: refetchIntegration,
  } = useQuery({
    queryKey: ['whatsapp-integration', workspaceId],
    queryFn: () => WhatsAppIntegrationService.getIntegration(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 1000 * 60 * 2,
  });

  // Consulta de Telemetria (Gate 8)
  const {
    data: telemetry,
    isLoading: loadingTelemetry,
    refetch: refetchTelemetry,
  } = useQuery({
    queryKey: ['whatsapp-telemetry', workspaceId],
    queryFn: () => WhatsAppIntegrationService.getIntegrationTelemetry(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 1000 * 30,
  });

  // Consulta de Colaboradores Pareados (Gate 9)
  const {
    data: pairedUsers = [],
    isLoading: loadingUsers,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ['whatsapp-paired-users', workspaceId],
    queryFn: () => WhatsAppIntegrationService.listPairedUsers(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 1000 * 60,
  });

  // Mutação para Parear Novo Número
  const pairMutation = useMutation({
    mutationFn: async () => {
      return await WhatsAppIntegrationService.pairUserPhone({
        workspaceId,
        userId: '00000000-0000-0000-0000-000000000000', // vinculação padrão ao workspace
        phoneNumber: newPhone,
        nomeContato: newContactName,
        roleNoWorkspace: newRole,
      });
    },
    onSuccess: (result) => {
      if (!result.success) {
        toast({
          title: 'Erro no pareamento',
          description: result.error || 'Falha ao parear número.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Número pareado com sucesso!',
        description: `O colaborador ${newContactName || newPhone} agora pode interagir com o Wallet CEO via WhatsApp.`,
      });
      setNewPhone('');
      setNewContactName('');
      setShowPairForm(false);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-paired-users', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-telemetry', workspaceId] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Erro inesperado',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Mutação para Alternar Status de Pareamento
  const togglePairingMutation = useMutation({
    mutationFn: async ({ phone, ativo }: { phone: string; ativo: boolean }) => {
      return await WhatsAppIntegrationService.setPairingStatus(workspaceId, phone, ativo);
    },
    onSuccess: (_, vars) => {
      toast({
        title: vars.ativo ? 'Pareamento ativado' : 'Pareamento desativado',
        description: `O número ${vars.phone} foi ${vars.ativo ? 'reativado' : 'desativado'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-paired-users', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-telemetry', workspaceId] });
    },
  });

  const webhookUrl = 'https://hdeguzxkdvebdrrutbnx.supabase.co/functions/v1/whatsapp-webhook';
  const verifyToken = integration?.webhook_verify_token || 'wallet_whatsapp_verify_token_prod';

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
    toast({
      title: 'Copiado para a área de transferência',
      description: text,
    });
  };

  const isConfigured = Boolean(integration && integration.phone_number_id);

  return (
    <Card className="border border-border/70 bg-card/60 shadow-md">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                WhatsApp Business Cloud API
                {isConfigured ? (
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" /> Pendente de Credenciais
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Comunicação segura e multicanal oficial com Meta Cloud API em paralelo ao Telegram.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchIntegration();
                refetchTelemetry();
                refetchUsers();
              }}
              className="h-8 text-xs"
              disabled={loadingIntegration || loadingTelemetry || loadingUsers}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingTelemetry ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Bloco 1: Telemetria e Monitoramento de Webhooks (Gate 8) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-border/50 bg-background/50">
            <p className="text-xs text-muted-foreground">Mensagens Processadas</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{telemetry?.totalProcessed ?? 0}</p>
          </div>
          <div className="p-3 rounded-lg border border-border/50 bg-background/50">
            <p className="text-xs text-muted-foreground">Colaboradores Pareados</p>
            <p className="text-lg font-bold text-emerald-400 mt-0.5">{telemetry?.pairedUsersCount ?? 0}</p>
          </div>
          <div className="p-3 rounded-lg border border-border/50 bg-background/50">
            <p className="text-xs text-muted-foreground">Não Pareadas / Ignoradas</p>
            <p className="text-lg font-bold text-amber-400 mt-0.5">{telemetry?.totalIgnored ?? 0}</p>
          </div>
          <div className="p-3 rounded-lg border border-border/50 bg-background/50">
            <p className="text-xs text-muted-foreground">Segurança HMAC</p>
            <div className="flex items-center gap-1 mt-1 text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> Fail-Closed
            </div>
          </div>
        </div>

        {/* Bloco 2: Configuração de Webhook na Meta Developers */}
        <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Lock className="w-3.5 h-3.5 text-primary" /> Dados para Cadastro no Meta App (Webhooks)
            </div>
            <span className="text-[11px] text-muted-foreground">Versão da API: v21.0</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <Label className="text-[11px] text-muted-foreground">Callback URL (Webhook)</Label>
              <div className="flex items-center gap-1.5 mt-1">
                <Input readOnly value={webhookUrl} className="h-8 text-xs font-mono bg-background/80" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 shrink-0"
                  onClick={() => copyToClipboard(webhookUrl, 'url')}
                >
                  {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground">Verify Token (hub.verify_token)</Label>
              <div className="flex items-center gap-1.5 mt-1">
                <Input readOnly value={verifyToken} className="h-8 text-xs font-mono bg-background/80" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 shrink-0"
                  onClick={() => copyToClipboard(verifyToken, 'token')}
                >
                  {copiedField === 'token' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Bloco 3: Gerenciamento de Números e Colaboradores Pareados (Gate 9) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Números Pareados Autorizados ({pairedUsers.length})
              </h4>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-dashed border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => setShowPairForm((prev) => !prev)}
            >
              <UserPlus className="w-3 h-3 mr-1" />
              {showPairForm ? 'Fechar Formulário' : 'Parear Novo Número'}
            </Button>
          </div>

          {/* Formulário Inline de Pareamento */}
          {showPairForm && (
            <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
              <h5 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Pareamento com Fail-Closed
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Telefone (E.164 com DDI)</Label>
                  <Input
                    placeholder="+5511999998888"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="h-8 text-xs mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Nome do Colaborador</Label>
                  <Input
                    placeholder="Ex: Carlos (Operador de Caixa)"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="h-8 text-xs mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Perfil de Acesso</Label>
                  <select
                    className="w-full h-8 text-xs rounded-md border border-input bg-background px-2 mt-1 text-foreground"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'owner' | 'admin' | 'member')}
                  >
                    <option value="member">Membro / Operação Loja</option>
                    <option value="admin">Administrador Financeiro</option>
                    <option value="owner">Proprietário / CEO</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setShowPairForm(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!newPhone.trim() || pairMutation.isPending}
                  onClick={() => pairMutation.mutate()}
                >
                  {pairMutation.isPending ? 'Salvando...' : 'Confirmar Pareamento'}
                </Button>
              </div>
            </div>
          )}

          {/* Lista de Colaboradores Pareados */}
          {pairedUsers.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-border/60 text-center text-xs text-muted-foreground">
              Nenhum número pareado ainda. Apenas números cadastrados recebem resposta dos especialistas.
            </div>
          ) : (
            <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden bg-background/40">
              {pairedUsers.map((user) => (
                <div key={user.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full ${user.ativo ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                    <div className="truncate">
                      <p className="font-medium text-foreground truncate">{user.nome_contato || 'Sem nome'}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">{user.phone_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] py-0 h-5">
                      {user.role_no_workspace === 'owner' ? 'CEO' : user.role_no_workspace === 'admin' ? 'Financeiro' : 'Operação'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => togglePairingMutation.mutate({ phone: user.phone_number, ativo: !user.ativo })}
                    >
                      {user.ativo ? 'Desativar' : 'Reativar'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
