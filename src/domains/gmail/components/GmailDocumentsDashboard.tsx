import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Receipt,
  FileCheck,
  Search,
  Copy,
  ShieldCheck,
  Building,
  Check,
  X,
  AlertCircle,
  Inbox,
  Power,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { GmailIntegrationService } from '../services/GmailIntegrationService';
import type {
  GmailIntegration,
  GmailProcessedMessage,
  GmailDocumentType,
} from '../types';

interface GmailDocumentsDashboardProps {
  workspaceId: string;
  isExecutiveUser?: boolean;
}

export const GmailDocumentsDashboard: React.FC<GmailDocumentsDashboardProps> = ({
  workspaceId,
  isExecutiveUser = true,
}) => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  const [integration, setIntegration] = useState<GmailIntegration | null>(null);
  const [messages, setMessages] = useState<GmailProcessedMessage[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [integ, msgs] = await Promise.all([
        GmailIntegrationService.getIntegration(workspaceId),
        GmailIntegrationService.listProcessedMessages(workspaceId, 100),
      ]);
      setIntegration(integ);
      setMessages(msgs);
    } catch (err) {
      console.error('[GmailDocumentsDashboard] Erro ao carregar dados:', err);
      toast({
        title: 'Erro ao carregar dados do Gmail',
        description: 'Não foi possível consultar os documentos processados.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Ação: Sincronizar Agora
  const handleSyncNow = async () => {
    if (!workspaceId || syncing) return;
    setSyncing(true);
    try {
      const result = await GmailIntegrationService.syncNow(workspaceId);
      if (result.success) {
        toast({
          title: 'Sincronização concluída com sucesso',
          description: `${result.messagesChecked} e-mails verificados, ${result.newDocumentsFound} novos documentos encontrados e ${result.duplicatesSkipped} duplicatas evitadas.`,
        });
        await loadData();
      } else {
        toast({
          title: 'Aviso na sincronização',
          description: result.error || 'Verifique se a conta rodopointcafe@gmail.com está devidamente autorizada.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Falha na sincronização',
        description: err instanceof Error ? err.message : 'Erro ao comunicar com a Edge Function.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Ação: Conectar / Reconectar OAuth
  const handleConnect = async () => {
    if (!workspaceId || connecting) return;
    setConnecting(true);
    try {
      const auth = await GmailIntegrationService.getAuthUrl(workspaceId);
      if (auth?.authUrl) {
        window.location.href = auth.authUrl;
      } else {
        toast({
          title: 'Erro ao iniciar autenticação',
          description: 'Não foi possível obter a URL oficial de conexão do Google.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Erro de conexão',
        description: err instanceof Error ? err.message : 'Falha ao iniciar OAuth do Gmail.',
        variant: 'destructive',
      });
    } finally {
      setConnecting(false);
    }
  };

  // Ação: Desconectar
  const handleDisconnect = async () => {
    if (!workspaceId || disconnecting) return;
    if (!window.confirm('Deseja realmente desconectar a integração com o Gmail institucional (rodopointcafe@gmail.com)?')) {
      return;
    }
    setDisconnecting(true);
    try {
      const ok = await GmailIntegrationService.disconnect(workspaceId);
      if (ok) {
        toast({
          title: 'Conta desconectada',
          description: 'A sincronização com o Gmail foi desativada.',
        });
        await loadData();
      } else {
        toast({
          title: 'Falha ao desconectar',
          description: 'Não foi possível revogar a integração.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Erro ao desconectar',
        description: err instanceof Error ? err.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  // Ação: Aprovar ou Cancelar Proposta de Ação (Boleto / NF-e)
  const handleProposalDecision = async (
    proposalId: string,
    decision: 'confirm' | 'cancel'
  ) => {
    if (!proposalId || !workspaceId) return;
    setActionInProgressId(proposalId);
    try {
      const { data, error } = await supabase.functions.invoke('wallet-ai-orchestrator', {
        body: {
          action: decision === 'confirm' ? 'confirm_proposal' : 'cancel_proposal',
          workspace_id: workspaceId,
          proposal_id: proposalId,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Falha ao processar proposta.');
      }

      toast({
        title: decision === 'confirm' ? 'Documento Aprovado' : 'Proposta Rejeitada',
        description:
          decision === 'confirm'
            ? 'A conta a pagar foi cadastrada no Wallet com sucesso.'
            : 'A proposta do documento foi descartada.',
      });

      await loadData();
    } catch (err) {
      toast({
        title: 'Erro na decisão',
        description: err instanceof Error ? err.message : 'Falha na validação da proposta.',
        variant: 'destructive',
      });
    } finally {
      setActionInProgressId(null);
    }
  };

  // Copiar código de barras / chave
  const handleCopy = (text: string, label: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast({
      title: 'Copiado para a área de transferência',
      description: text,
    });
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Métricas calculadas
  const metrics = useMemo(() => {
    const total = messages.length;
    const boletos = messages.filter((m) => m.tipo_documento_detectado === 'boleto').length;
    const nfe = messages.filter((m) => m.tipo_documento_detectado === 'nfe').length;
    const pendentes = messages.filter((m) => m.status === 'processado' && Boolean(m.proposal_id)).length;
    const ignorados = messages.filter((m) => m.status === 'ignorado').length;

    return { total, boletos, nfe, pendentes, ignorados };
  }, [messages]);

  // Mensagens filtradas
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      // Filtro de tipo
      if (selectedType !== 'all' && m.tipo_documento_detectado !== selectedType) {
        return false;
      }

      // Filtro de status
      if (selectedStatus === 'pending') {
        if (!m.proposal_id || m.status !== 'processado') return false;
      } else if (selectedStatus === 'processed') {
        if (m.status !== 'processado' || m.proposal_id) return false;
      } else if (selectedStatus === 'ignored') {
        if (m.status !== 'ignorado') return false;
      }

      // Busca por texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const remetenteMatch = m.remetente.toLowerCase().includes(q);
        const assuntoMatch = (m.assunto || '').toLowerCase().includes(q);
        const emitenteMatch = (m.detalhes_extracao?.emitente || '').toLowerCase().includes(q);
        const cnpjMatch = (m.detalhes_extracao?.cnpj || '').includes(q);
        const chaveMatch = (m.detalhes_extracao?.chave_acesso || '').includes(q);
        const linhaMatch = (m.detalhes_extracao?.linha_digitavel || '').includes(q);

        return remetenteMatch || assuntoMatch || emitenteMatch || cnpjMatch || chaveMatch || linhaMatch;
      }

      return true;
    });
  }, [messages, selectedType, selectedStatus, searchQuery]);

  const fmtBrl = (v?: number) => {
    if (v === undefined || v === null || isNaN(v)) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const fmtData = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const getDocTypeBadge = (tipo: GmailDocumentType | null) => {
    switch (tipo) {
      case 'boleto':
        return (
          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 gap-1 font-medium">
            <Receipt className="w-3.5 h-3.5" />
            Boleto Bancário
          </Badge>
        );
      case 'nfe':
        return (
          <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 gap-1 font-medium">
            <FileText className="w-3.5 h-3.5" />
            Nota Fiscal (NF-e)
          </Badge>
        );
      case 'comprovante':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1 font-medium">
            <FileCheck className="w-3.5 h-3.5" />
            Comprovante
          </Badge>
        );
      case 'cobranca':
        return (
          <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/30 gap-1 font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            Cobrança
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1">
            <Mail className="w-3.5 h-3.5" />
            Outro
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header do Card com Status de Conexão */}
      <Card className="border border-border/70 bg-card/60 backdrop-blur-sm shadow-md">
        <CardHeader className="p-5 sm:p-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                    Central de Documentos Fiscais & E-mail (Gmail)
                    <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground border-border/60">
                      Etapa 11
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Captura automatizada, classificação por IA e conciliação de boletos e NF-e via{' '}
                    <strong className="text-foreground font-semibold">rodopointcafe@gmail.com</strong>
                  </CardDescription>
                </div>
              </div>
            </div>

            {/* Status e Ações */}
            <div className="flex flex-wrap items-center gap-2.5">
              {integration?.status === 'conectado' ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 px-2.5 py-1 text-xs gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Conectado: {integration.email_conectado}
                  </Badge>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSyncNow()}
                    disabled={syncing}
                    className="h-8 gap-1.5 text-xs border-border/60 hover:bg-muted/50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${syncing ? 'animate-spin' : ''}`} />
                    <span>{syncing ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
                  </Button>

                  {isExecutiveUser && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDisconnect()}
                      disabled={disconnecting}
                      className="h-8 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      title="Desconectar Gmail"
                    >
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-300 border-amber-500/30 px-2.5 py-1 text-xs gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    {integration?.status === 'erro_autenticacao'
                      ? 'Autenticação Expirada'
                      : 'Não Conectado'}
                  </Badge>

                  {isExecutiveUser && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => void handleConnect()}
                      disabled={connecting}
                      className="h-8 gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-sm"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{connecting ? 'Conectando...' : 'Conectar Gmail Oficial'}</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Timestamp do último sync */}
          {integration?.ultimo_sync_em && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3 text-muted-foreground/70" />
              <span>
                Última sincronização:{' '}
                {new Date(integration.ultimo_sync_em).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* 2. Grid de Contadores & Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border border-border/50 bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">E-mails Analisados</span>
            <Mail className="w-4 h-4 text-orange-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{metrics.total}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Mensagens processadas</div>
        </Card>

        <Card className="border border-border/50 bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Boletos Identificados</span>
            <Receipt className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">{metrics.boletos}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Com código de barras</div>
        </Card>

        <Card className="border border-border/50 bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">NF-e Extraídas</span>
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-400">{metrics.nfe}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">XMLs SEFAZ validados</div>
        </Card>

        <Card className="border border-border/50 bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Aguardando Validação</span>
            <AlertCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">{metrics.pendentes}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Requer autorização humana</div>
        </Card>
      </div>

      {/* 3. Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por fornecedor, CNPJ, assunto ou chave de acesso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-card/50 border-border/60"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="h-9 px-2.5 text-xs bg-card/50 border border-border/60 rounded-md text-foreground focus:outline-none"
          >
            <option value="all">Todos os Tipos</option>
            <option value="boleto">Apenas Boletos</option>
            <option value="nfe">Apenas NF-e</option>
            <option value="comprovante">Comprovantes</option>
            <option value="cobranca">Cobranças</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 px-2.5 text-xs bg-card/50 border border-border/60 rounded-md text-foreground focus:outline-none"
          >
            <option value="all">Todos os Status</option>
            <option value="pending">Aguardando Decisão</option>
            <option value="processed">Concluídos</option>
            <option value="ignored">Ignorados / Sem Anexo</option>
          </select>
        </div>
      </div>

      {/* 4. Lista de Documentos Processados */}
      <Card className="border border-border/70 bg-card/50 shadow-sm overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Inbox className="w-4 h-4 text-orange-400" />
              Documentos Capturados no Gmail ({filteredMessages.length})
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Automação segura com conferência humana obrigatória
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-orange-400" />
              <span>Consultando histórico de documentos do Gmail...</span>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="p-10 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Inbox className="w-8 h-8 text-muted-foreground/40" />
              <span className="font-medium text-foreground">Nenhum documento encontrado</span>
              <span className="max-w-md text-muted-foreground/80">
                {messages.length === 0
                  ? 'Conecte a conta oficial rodopointcafe@gmail.com e clique em "Sincronizar Agora" para iniciar o processamento de boletos e notas fiscais.'
                  : 'Nenhum documento corresponde aos filtros selecionados.'}
              </span>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filteredMessages.map((msg) => {
                const det = msg.detalhes_extracao || {};
                const hasProposal = Boolean(msg.proposal_id);
                const isProcessingThis = actionInProgressId === msg.proposal_id;

                return (
                  <div
                    key={msg.id}
                    className="p-4 sm:p-5 hover:bg-muted/20 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Coluna 1: Informações do Documento & Remetente */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {getDocTypeBadge(msg.tipo_documento_detectado)}

                        {det.emitente && (
                          <span className="text-xs font-semibold text-foreground truncate max-w-xs flex items-center gap-1">
                            <Building className="w-3.5 h-3.5 text-muted-foreground" />
                            {det.emitente}
                          </span>
                        )}

                        {det.cnpj && (
                          <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                            CNPJ: {det.cnpj}
                          </Badge>
                        )}

                        <span className="text-[11px] text-muted-foreground">
                          {fmtData(msg.data_email || msg.created_at)}
                        </span>
                      </div>

                      {/* Assunto e Remetente */}
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-foreground/90 truncate">
                          {msg.assunto || 'E-mail sem assunto'}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          De: {msg.remetente}
                        </div>
                      </div>

                      {/* Identificadores: Chave SEFAZ ou Linha Digitável */}
                      {(det.chave_acesso || det.linha_digitavel) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {det.chave_acesso && (
                            <button
                              type="button"
                              onClick={() => handleCopy(det.chave_acesso!, `chave-${msg.id}`)}
                              className="text-[11px] font-mono bg-muted/40 hover:bg-muted/70 text-muted-foreground px-2 py-0.5 rounded border border-border/40 flex items-center gap-1 transition-colors"
                              title="Clique para copiar chave de acesso"
                            >
                              {copiedKey === `chave-${msg.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>Chave: {det.chave_acesso.slice(0, 8)}...{det.chave_acesso.slice(-8)}</span>
                            </button>
                          )}

                          {det.linha_digitavel && (
                            <button
                              type="button"
                              onClick={() => handleCopy(det.linha_digitavel!, `linha-${msg.id}`)}
                              className="text-[11px] font-mono bg-muted/40 hover:bg-muted/70 text-muted-foreground px-2 py-0.5 rounded border border-border/40 flex items-center gap-1 transition-colors"
                              title="Clique para copiar código de barras"
                            >
                              {copiedKey === `linha-${msg.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>Linha: {det.linha_digitavel.slice(0, 10)}...</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Coluna 2: Valores Financeiros e Vencimento */}
                    <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-1 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/30">
                      <div className="text-sm font-bold text-foreground">
                        {fmtBrl(det.valor)}
                      </div>

                      {det.data_vencimento && (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3 text-orange-400" />
                          <span>Venc: {fmtData(det.data_vencimento)}</span>
                        </div>
                      )}
                    </div>

                    {/* Coluna 3: Ações e Decisão Humana */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0">
                      {hasProposal ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => void handleProposalDecision(msg.proposal_id!, 'confirm')}
                            disabled={isProcessingThis}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isProcessingThis ? 'Aprovando...' : 'Aprovar Conta'}</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleProposalDecision(msg.proposal_id!, 'cancel')}
                            disabled={isProcessingThis}
                            className="h-8 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 gap-1 border-border/60"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Rejeitar</span>
                          </Button>
                        </div>
                      ) : msg.status === 'processado' ? (
                        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1 text-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          Processado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {msg.status === 'ignorado' ? 'Ignorado (Sem Documento)' : 'Sem Ação Pendente'}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
