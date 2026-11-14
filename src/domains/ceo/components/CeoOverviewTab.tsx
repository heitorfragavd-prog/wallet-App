import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  Send,
  RotateCcw,
  User,
  AlertTriangle,
  Bot,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Plus,
  History,
  X,
  MessageSquare,
  Clock,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useWalletAgentChat, type ChatMessage } from '@/domains/ia/hooks/useWalletAgentChat';
import { WalletAiOrchestratorClient } from '@/domains/ia/services/WalletAiOrchestratorClient';
import { CeoExecutiveKpis } from '@/domains/ceo/services/CeoFinancialMetricsService';
import { CeoIntelligenceEngine } from '@/domains/ceo/services/CeoIntelligenceEngine';
import { getCeoPeriodRange } from '@/domains/ceo/utils/ceoDateRanges';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { useAuth } from '@/domains/auth/hooks/useAuth';

export interface CeoOverviewTabProps {
  workspaceId: string;
  kpis: CeoExecutiveKpis;
  onNavigateToPlan?: () => void;
  onSelectTab?: (tab: string) => void;
  onNavigateToBrainCeo?: () => void;
}

interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export const CeoOverviewTab: React.FC<CeoOverviewTabProps> = ({
  workspaceId,
  kpis,
  onNavigateToPlan,
  onSelectTab,
  onNavigateToBrainCeo,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inputPrompt, setInputPrompt] = useState('');
  const [processingProposalId, setProcessingProposalId] = useState<string | null>(null);
  const [confirmedProposals, setConfirmedProposals] = useState<Record<string, 'confirmed' | 'cancelled' | 'executed'>>({});
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Intervalo canônico de análise respeitando timezone America/Sao_Paulo (Gate 4)
  const range = useMemo(() => getCeoPeriodRange('este_mes'), []);

  // Motor analítico do CEO gerando o briefing quantitativo com citações canônicas (Gate 4)
  const briefing = useMemo(
    () => CeoIntelligenceEngine.generateExecutiveBriefing({ kpis, range }),
    [kpis, range]
  );

  // Estados de persistência canônica do chat (Gate 1)
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);



  // Cliente orquestrador canônico para consulta de IA unificada
  const client = useMemo(() => {
    return new WalletAiOrchestratorClient({
      baseUrl: `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/wallet-ai-orchestrator`,
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      },
    });
  }, []);

  // Hook canônico compartilhado com o Cérebro CEO (agentType = 'ceo')
  const { messages, setMessages, isLoading, currentStatus, sendMessage, clearChat } =
    useWalletAgentChat({
      workspaceId,
      client,
      agentType: 'ceo',
      conversationId: conversaId || undefined,
      onError: (err) => {
        toast({
          title: 'Aviso do Wallet CEO',
          description: err.message,
          variant: 'destructive',
        });
      },
    });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  // Carrega mensagens de uma conversa específica sincronizada
  const loadConversationMessages = useCallback(
    async (convId: string) => {
      if (!convId || !workspaceId || !user?.id) return;
      setLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .from('wallet_ai_messages')
          .select('id, role, content, channel, created_at')
          .eq('conversation_id', convId)
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) {
          console.warn('[CeoOverviewTab] Erro ao carregar mensagens:', error);
          return;
        }

        if (data && data.length > 0) {
          setMessages(
            data.map((m) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant' | 'system',
              content: m.content || '',
              channel: (m.channel as 'web' | 'telegram') || 'web',
              createdAt: new Date(m.created_at),
            }))
          );
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error('[CeoOverviewTab] Erro ao recuperar histórico:', err);
      } finally {
        setLoadingHistory(false);
      }
    },
    [workspaceId, user?.id, setMessages]
  );

  // Sincronização em tempo real entre Visão Geral e Cérebro CEO
  useEffect(() => {
    if (!conversaId) return;

    const channel = supabase
      .channel(`wallet_ai_overview_sync_${conversaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wallet_ai_messages',
          filter: `conversation_id=eq.${conversaId}`,
        },
        (payload) => {
          const newMsg = payload.new as {
            id: string;
            role: string;
            content: string;
            channel?: string;
            created_at: string;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [
              ...prev,
              {
                id: newMsg.id,
                role: newMsg.role as 'user' | 'assistant' | 'system',
                content: newMsg.content || '',
                channel: (newMsg.channel as 'web' | 'telegram') || 'web',
                createdAt: new Date(newMsg.created_at),
              },
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversaId, setMessages]);

  // Inicializa a lista de conversas e seleciona a mais recente
  const initConversations = useCallback(async () => {
    if (!workspaceId || !user?.id) return;
    try {
      const { data, error } = await supabase
        .from('wallet_ai_conversations')
        .select('id, title, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .eq('agent_type', 'ceo')
        .eq('is_group', false)
        .eq('is_shared', false)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) {
        console.warn('[CeoOverviewTab] Erro ao buscar conversas:', error);
        return;
      }

      if (data && data.length > 0) {
        setConversations(data);
        const mostRecent = data[0];
        setConversaId(mostRecent.id);
        await loadConversationMessages(mostRecent.id);
      } else {
        // Criar conversa inicial associada ao usuário e workspace
        const { data: newConv, error: createErr } = await supabase
          .from('wallet_ai_conversations')
          .insert({
            workspace_id: workspaceId,
            user_id: user.id,
            title: 'Conversa com CEO',
            agent_type: 'ceo',
          })
          .select('id, title, created_at, updated_at')
          .single();

        if (createErr) {
          console.warn('[CeoOverviewTab] Erro ao inicializar conversa:', createErr);
        } else if (newConv) {
          setConversations([newConv]);
          setConversaId(newConv.id);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('[CeoOverviewTab] Falha ao inicializar conversas:', err);
    }
  }, [workspaceId, user?.id, loadConversationMessages, setMessages]);

  useEffect(() => {
    initConversations();
  }, [initConversations]);

  // Cria uma nova conversa real
  const handleNewConversation = async () => {
    if (!workspaceId || !user?.id) return;
    try {
      const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());

      const { data, error } = await supabase
        .from('wallet_ai_conversations')
        .insert({
          workspace_id: workspaceId,
          user_id: user.id,
          title: `Conversa ${dataFormatada}`,
          agent_type: 'ceo',
        })
        .select('id, title, created_at, updated_at')
        .single();

      if (error) throw error;
      if (data) {
        setConversations((prev) => [data, ...prev]);
        setConversaId(data.id);
        clearChat();
        toast({
          title: 'Nova Conversa',
          description: 'Nova sessão iniciada com seu Diretor Executivo.',
        });
      }
    } catch (err) {
      console.error('[CeoOverviewTab] Erro ao criar nova conversa:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível iniciar uma nova conversa.',
        variant: 'destructive',
      });
    }
  };

  // Alterna para uma conversa anterior
  const handleSelectConversation = async (convId: string) => {
    setConversaId(convId);
    setShowHistoryModal(false);
    await loadConversationMessages(convId);
  };

  const handleSend = () => {
    if (!inputPrompt.trim() || isLoading) return;
    sendMessage(inputPrompt.trim());
    setInputPrompt('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleSelectPill = (prompt: string) => {
    sendMessage(prompt);
  };

  /**
   * Confirmação canônica de proposta de ação por ID canônico (Gate 1 e Gate A).
   * Utiliza exclusivamente o gateway canônico no backend (Edge Function).
   * Sem fallback de atualização direta no frontend para garantir conformidade e RBAC.
   */
  const handleConfirmProposal = async (proposalId: string) => {
    if (!proposalId || !workspaceId || !user?.id || processingProposalId) return;
    setProcessingProposalId(proposalId);

    try {
      const client = new WalletAiOrchestratorClient({
        baseUrl: `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/wallet-ai-orchestrator`,
        getAccessToken: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? null;
        },
      });

      const res = await client.confirmProposal({ workspaceId, proposalId });
      if (res.success) {
        setConfirmedProposals((prev) => ({ ...prev, [proposalId]: 'confirmed' }));
        toast({
          title: 'Ação Autorizada com Sucesso',
          description: 'A proposta foi confirmada de forma canônica no backend (status: confirmado).',
        });
      } else {
        throw new Error(res.error || 'Falha ao autorizar a proposta no backend.');
      }
    } catch (err: unknown) {
      console.error('[CeoOverviewTab] Falha ao processar autorização:', err);
      const msg = err instanceof Error ? err.message : 'Não foi possível confirmar a proposta no momento. Verifique suas permissões.';
      toast({
        title: 'Falha na Autorização',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setProcessingProposalId(null);
    }
  };

  /**
   * Descarte canônico de proposta de ação por ID (Gate 1 e Gate A).
   * Utiliza exclusivamente o gateway canônico no backend com RBAC.
   * Sem fallback de atualização direta no frontend.
   */
  const handleCancelProposal = async (proposalId: string) => {
    if (!proposalId || !workspaceId || !user?.id || processingProposalId) return;
    setProcessingProposalId(proposalId);

    try {
      const client = new WalletAiOrchestratorClient({
        baseUrl: `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/wallet-ai-orchestrator`,
        getAccessToken: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? null;
        },
      });

      const res = await client.cancelProposal({ workspaceId, proposalId });
      if (res.success) {
        setConfirmedProposals((prev) => ({ ...prev, [proposalId]: 'cancelled' }));
        toast({
          title: 'Proposta Descartada',
          description: 'A proposta foi recusada e arquivada sem alterar dados financeiros.',
        });
      } else {
        throw new Error(res.error || 'Falha ao descartar a proposta no backend.');
      }
    } catch (err: unknown) {
      console.error('[CeoOverviewTab] Falha ao descartar proposta:', err);
      const msg = err instanceof Error ? err.message : 'Não foi possível descartar a proposta no momento. Verifique suas permissões.';
      toast({
        title: 'Falha no Descarte',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setProcessingProposalId(null);
    }
  };

  return (
    <div className="space-y-6">
      {kpis.dadosIndisponiveis && (
        <div className="bg-amber-950/40 border border-amber-600/40 text-amber-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Aviso de Observabilidade:</strong> Indicadores consolidados temporariamente indisponíveis para este workspace.
            {kpis.erroMensagem ? ` (${kpis.erroMensagem})` : ''} Exibindo valores confirmados disponíveis.
          </span>
        </div>
      )}

      {/* 1. Hero Card: Saudação Executiva com Resumo Diário */}
      <Card className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-border/60 shadow-lg overflow-hidden">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-border/40">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl md:text-2xl">👑</span>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                  Boa tarde, Heitor!
                </h1>
              </div>
              <p className="text-xs md:text-sm text-slate-400 max-w-2xl leading-relaxed">
                {kpis.faturamentoOntem > 0 ? (
                  <>
                    A Rodo Point faturou{' '}
                    <strong className="text-foreground">
                      R$ {kpis.faturamentoOntem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>{' '}
                    ontem
                    {(kpis.variacaoOntemVsMediaPercent != null || (kpis as unknown as { variacaoOntemVsMedia?: number }).variacaoOntemVsMedia != null) && (
                      <span className={((kpis.variacaoOntemVsMediaPercent ?? (kpis as unknown as { variacaoOntemVsMedia?: number }).variacaoOntemVsMedia ?? 0) >= 0) ? ' text-emerald-400' : ' text-rose-400'}>
                        {' '}({((kpis.variacaoOntemVsMediaPercent ?? (kpis as unknown as { variacaoOntemVsMedia?: number }).variacaoOntemVsMedia ?? 0) >= 0) ? '+' : ''}{kpis.variacaoOntemVsMediaPercent ?? (kpis as unknown as { variacaoOntemVsMedia?: number }).variacaoOntemVsMedia}% vs média das {kpis.diaSemanaOntemNome})
                      </span>
                    )}. Neste mês acumulamos{' '}
                    <strong className="text-foreground">
                      R$ {kpis.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>{' '}
                    em vendas
                    {(kpis.crescimentoMesPercent != null || (kpis as unknown as { crescimentoMes?: number }).crescimentoMes != null) && (
                      <span className={((kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes ?? 0) >= 0) ? ' text-emerald-400' : ' text-rose-400'}>
                        {' '}({((kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes ?? 0) >= 0) ? '+' : ''}{kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes}% vs período anterior)
                      </span>
                    )}.
                  </>
                ) : (
                  <>Aqui está o resumo executivo da sua operação com dados reais disponíveis (apuração preliminar com custos conhecidos).</>
                )}
              </p>
            </div>

            {/* Status Live */}
            {kpis.dadosIndisponiveis ? (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full self-start md:self-auto shrink-0">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs font-semibold text-amber-400">
                  {kpis.erroMensagem || 'Dados temporariamente indisponíveis'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full self-start md:self-auto shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-400">
                  {kpis.statusConfiabilidadeLucro === 'confirmado'
                    ? 'Dados 100% auditados'
                    : 'Dados reais disponíveis (CMV parcial)'}
                </span>
              </div>
            )}
          </div>

          {/* 4 Cards Principais de Indicadores Executivos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-6">
            {/* Card 1: Vendas Brutas PDV (Mês) */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>Vendas Brutas (PDV)</span>
                  <span className="text-[10px] text-sky-400 font-normal px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                    PDV Eyemobile
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
                  R$ {kpis.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="mt-2 text-xs flex items-center gap-1 font-medium">
                {(kpis.crescimentoMesPercent != null || (kpis as unknown as { crescimentoMes?: number }).crescimentoMes != null) ? (
                  <span className={((kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes ?? 0) >= 0) ? 'text-emerald-400 flex items-center gap-0.5' : 'text-rose-400 flex items-center gap-0.5'}>
                    {((kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes ?? 0) >= 0) ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {((kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes ?? 0) >= 0) ? '+' : ''}{kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes}% vs mês anterior
                  </span>
                ) : (
                  <span className="text-slate-500">Deduplicação auditada</span>
                )}
              </div>
            </div>

            {/* Card 2: Pedidos */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors flex flex-col justify-between">
              <div>
                <div className="text-xs text-muted-foreground font-medium">Pedidos Concluídos</div>
                <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">
                  {kpis.pedidosMes.toLocaleString('pt-BR')}
                </div>
              </div>
              <div className="mt-2 text-xs flex items-center gap-1 font-medium">
                {(kpis.crescimentoPedidosPercent != null || (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos != null) ? (
                  <span className={((kpis.crescimentoPedidosPercent ?? (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos ?? 0) >= 0) ? 'text-emerald-400 flex items-center gap-0.5' : 'text-rose-400 flex items-center gap-0.5'}>
                    {((kpis.crescimentoPedidosPercent ?? (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos ?? 0) >= 0) ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {((kpis.crescimentoPedidosPercent ?? (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos ?? 0) >= 0) ? '+' : ''}{kpis.crescimentoPedidosPercent ?? (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos}% vs mês anterior
                  </span>
                ) : (
                  <span className="text-slate-500">Transações PDV reais</span>
                )}
              </div>
            </div>

            {/* Card 3: Ticket Médio */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors flex flex-col justify-between">
              <div>
                <div className="text-xs text-muted-foreground font-medium">Ticket Médio</div>
                <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
                  {kpis.ticketMedioMes !== null
                    ? `R$ ${kpis.ticketMedioMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : 'Aguardando dados'}
                </div>
              </div>
              <div className="mt-2 text-xs flex items-center gap-1 font-medium">
                {(kpis.crescimentoTicketMedioPercent != null || (kpis as unknown as { crescimentoTicket?: number }).crescimentoTicket != null) ? (
                  <span className={((kpis.crescimentoTicketMedioPercent ?? (kpis as unknown as { crescimentoTicket?: number }).crescimentoTicket ?? 0) >= 0) ? 'text-emerald-400 flex items-center gap-0.5' : 'text-rose-400 flex items-center gap-0.5'}>
                    {((kpis.crescimentoTicketMedioPercent ?? (kpis as unknown as { crescimentoTicket?: number }).crescimentoTicket ?? 0) >= 0) ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {((kpis.crescimentoTicketMedioPercent ?? (kpis as unknown as { crescimentoTicket?: number }).crescimentoTicket ?? 0) >= 0) ? '+' : ''}{kpis.crescimentoTicketMedioPercent ?? (kpis as unknown as { crescimentoTicket?: number }).crescimentoTicket}% vs mês anterior
                  </span>
                ) : (
                  <span className="text-slate-500">Média por pedido</span>
                )}
              </div>
            </div>

            {/* Card 4: Lucro Líquido Real / Resultado Preliminar Realizado (Unificado com getRealNetProfit) */}
            <div
              onClick={() => onSelectTab && onSelectTab('analyses')}
              className="bg-slate-900/60 p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>{kpis.statusConfiabilidadeLucro === 'confirmado' ? 'Lucro Líquido Definitivo' : 'Resultado Preliminar Realizado'}</span>
                  <span className={`text-[10px] font-normal px-1.5 py-0.5 rounded border ${
                    kpis.statusConfiabilidadeLucro === 'confirmado'
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : kpis.statusConfiabilidadeLucro === 'dados_insuficientes'
                      ? 'text-slate-400 bg-slate-500/10 border-slate-500/20'
                      : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  }`}>
                    {kpis.statusConfiabilidadeLucro === 'confirmado'
                      ? 'Confirmado (100% NF)'
                      : kpis.statusConfiabilidadeLucro === 'dados_insuficientes'
                      ? 'Insuficiente'
                      : 'Parcial (NF)'}
                  </span>
                </div>
                <div className={`text-xl sm:text-2xl font-bold mt-1 truncate ${
                  (kpis.lucroLiquidoReal ?? 0) >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}>
                  {kpis.despesasMes === 0 && !kpis.despesasTotalCompetencia && kpis.lucroLiquidoReal === null ? (
                    <span className="text-sm font-normal text-slate-400">Não apurado</span>
                  ) : (
                    `R$ ${(kpis.lucroLiquidoReal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  )}
                </div>
              </div>
              <div className="mt-2 text-[11px] space-y-0.5 font-medium text-slate-400">
                {kpis.cmvConfirmado !== null && kpis.cmvConfirmado > 0 ? (
                  <div className="text-[10px] text-emerald-400 font-semibold truncate">
                    CMV Auditado: R$ {kpis.cmvConfirmado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({kpis.coberturaCmvPercent}% cob.)
                  </div>
                ) : null}
                {kpis.margemLiquidaRealPercent !== null && kpis.margemLiquidaRealPercent !== undefined ? (
                  <div className="text-[10px] text-slate-300">
                    Margem Líquida Real: <span className="font-semibold">{kpis.margemLiquidaRealPercent}%</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-400/90 font-medium">
                    Margem em apuração (CMV parcial)
                  </div>
                )}
                {kpis.despesasPagas > 0 ? (
                  <div className="flex flex-col gap-0.5 text-[10px] text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Caixa Hoje:</span>
                      <span className="text-emerald-400 font-medium">
                        R$ {(kpis.diferencaVendasDespesasPagas ?? (kpis.faturamentoMes - kpis.despesasPagas)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>DRE Mês (Competência):</span>
                      <span className={(kpis.lucroLiquidoReal ?? kpis.resultadoPreliminarCompetencia ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        R$ {(kpis.lucroLiquidoReal ?? kpis.resultadoPreliminarCompetencia ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 pt-0.5 border-t border-border/20">
                      <span>Pagas: R$ {kpis.despesasPagas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span>Pend: R$ {kpis.despesasPendentes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-500">DRE por Competência & NF</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 1.1 Briefing Executivo Quantitativo do CEO com Fontes e Metodologia (Gate 4) */}
      <Card className="bg-slate-900/80 border-border/60 shadow-md">
        <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                Briefing Executivo Quantitativo
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {briefing.periodoRotulo}
                </span>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Período: {range.rotulo} (vs. {range.rotuloAnterior}) | Base quantitativa auditada
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateToPlan && (
              <Button
                size="sm"
                variant="outline"
                onClick={onNavigateToPlan}
                className="h-7 text-xs border-amber-500/30 hover:border-amber-500/60 text-amber-400 gap-1 hidden sm:flex"
              >
                Ver Oportunidades
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBriefingExpanded((prev) => !prev)}
              className="h-7 text-xs text-slate-400 hover:text-slate-200"
            >
              {briefingExpanded ? 'Recolher' : 'Expandir'}
            </Button>
          </div>
        </CardHeader>

        {briefingExpanded && (
          <CardContent className="pt-4 space-y-4">
            {/* Resumo Geral do Briefing */}
            <div className="text-xs md:text-sm font-medium text-slate-200 bg-slate-950/50 p-3 rounded-lg border border-border/40">
              📢 {briefing.resumoGeral}
            </div>

            {/* Grid de Seções e Insights Quantitativos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(briefing.secoes || []).map((secao, idx) => {
                const statusColor =
                  secao.status === 'positivo'
                    ? 'text-emerald-400'
                    : secao.status === 'critico'
                    ? 'text-rose-400'
                    : secao.status === 'atencao'
                    ? 'text-amber-400'
                    : 'text-foreground';

                return (
                  <div
                    key={idx}
                    className="bg-slate-950/40 p-3 rounded-lg border border-border/40 space-y-1.5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                        <span>{secao.titulo}</span>
                        <span className={`font-bold ${statusColor}`}>{secao.destaque}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-snug mt-1">
                        {secao.conteudo}
                      </p>
                    </div>
                    <div className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-800/60 space-y-0.5">
                      <div><span className="text-slate-400">Fonte:</span> {secao.fonte}</div>
                      <div><span className="text-slate-400">Critério:</span> {secao.criterioCalculo}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Alertas de Qualidade de Dados */}
            {briefing.alertasQualidadeDados && briefing.alertasQualidadeDados.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {briefing.alertasQualidadeDados.map((alert, idx) => (
                  <div
                    key={idx}
                    className="text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-300 px-3 py-2 rounded-md flex items-center gap-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{alert}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 2. Grid Central: Evolução de Vendas (30 dias) + Converse com seu CEO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Left: Gráfico Real de Evolução de Vendas (30 dias) */}
        <Card className="bg-card/70 border-border/50 flex flex-col min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex flex-wrap items-center justify-between gap-1">
              <span>Evolução de Vendas (30 dias)</span>
              <span className="text-xs font-normal text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Vendas diárias reais
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col justify-center min-w-0 overflow-hidden">
            {kpis.dailySales30Days && kpis.dailySales30Days.some((d) => d.valor > 0) ? (
              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={kpis.dailySales30Days}>
                    <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} interval={4} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Vendas']}
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: '#10b981' }}
                      activeDot={{ r: 5 }}
                      name="Vendas"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 sm:h-64 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-600 mb-1" />
                <span>Nenhuma venda registrada nos últimos 30 dias.</span>
                <span className="text-[11px] text-slate-500 text-center">As vendas sincronizadas pelo Eyemobile ou KDS aparecerão aqui.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Converse com seu CEO (Chat Proeminente Integrado com Histórico Real) */}
        <Card className="bg-card/70 border-border/50 flex flex-col h-[460px] sm:h-[480px] min-w-0 overflow-hidden shadow-lg">
          <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-amber-400 shrink-0">✨</span>
              <CardTitle className="text-xs sm:text-sm font-semibold text-foreground truncate">
                Converse com seu CEO
              </CardTitle>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onNavigateToBrainCeo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNavigateToBrainCeo}
                  className="h-7 text-[11px] sm:text-xs border-amber-500/40 hover:bg-amber-500/10 text-amber-300 gap-1 px-2"
                  title="Abrir o Cérebro CEO completo em tela cheia com todas as ferramentas analíticas"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">Cérebro Completo</span>
                  <span className="sm:hidden">Cérebro</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewConversation}
                className="h-7 text-[11px] sm:text-xs border-border/60 hover:bg-slate-800 text-slate-300 gap-1 px-2"
                title="Criar nova conversa sem apagar o histórico"
              >
                <Plus className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Nova conversa</span>
                <span className="sm:hidden">Nova</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistoryModal(true)}
                className="h-7 text-[11px] sm:text-xs border-border/60 hover:bg-slate-800 text-slate-300 gap-1 px-2"
                title="Selecionar conversa anterior"
              >
                <History className="w-3 h-3 text-sky-400" />
                <span className="hidden sm:inline">Histórico</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="h-7 text-xs text-muted-foreground hover:text-foreground p-1.5"
                title="Limpar tela"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          </CardHeader>

          {/* Área de Mensagens com Scroll */}
          <CardContent className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
            {loadingHistory ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                <Clock className="w-4 h-4 mr-2 animate-spin text-amber-400" />
                Carregando histórico...
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-muted-foreground space-y-2">
                <Bot className="w-8 h-8 text-amber-400/80" />
                <p className="font-medium text-foreground">Olá, Heitor! Sou seu Diretor Executivo Digital.</p>
                <p className="max-w-xs text-[11px] text-slate-400">
                  Pergunte qualquer coisa sobre a Rodo Point. Eu analiso seus dados reais de faturamento, despesas, PDV e canais para ajudar você a tomar decisões.
                </p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 text-xs">
                      👑
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-lg p-3 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-amber-500 text-slate-950 font-medium'
                        : 'bg-slate-900 border border-border/50 text-slate-200'
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.content}</div>

                    {/* Propostas de Ação Canônicas */}
                    {((msg.actionProposals && msg.actionProposals.length > 0) || msg.actionProposal) && (
                      <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                        <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Ação proposta pelo CEO (Requer Confirmação):
                        </div>
                        {(msg.actionProposals || [msg.actionProposal]).filter(Boolean).map((rawProp, pIdx) => {
                          const prop = rawProp as {
                            id: string;
                            actionType?: string;
                            title?: string;
                            description?: string;
                            hypothesis?: string;
                            status?: string;
                          };
                          const proposalStatus = confirmedProposals[prop.id] || prop.status || 'prepared';
                          return (
                            <div key={prop.id || pIdx} className="bg-slate-950/70 p-2.5 rounded border border-amber-500/30 text-xs space-y-1.5">
                              <div className="font-semibold text-slate-200">
                                {prop.title || prop.actionType}
                              </div>
                              <div className="text-slate-400 text-[11px]">
                                {prop.description || prop.hypothesis}
                              </div>
                              <div className="flex gap-2 pt-1">
                                {proposalStatus === 'confirmed' ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Confirmado (Aguardando execução)
                                  </span>
                                ) : proposalStatus === 'executed' ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-sky-400 font-semibold">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Executado
                                  </span>
                                ) : proposalStatus === 'cancelled' ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Descartado
                                  </span>
                                ) : proposalStatus === 'expired' ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 font-semibold">
                                    <Clock className="w-3.5 h-3.5" />
                                    Expirado
                                  </span>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      disabled={processingProposalId === prop.id}
                                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                      onClick={() => handleConfirmProposal(prop.id)}
                                    >
                                      {processingProposalId === prop.id ? 'Autorizando...' : 'Autorizar Ação'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={processingProposalId === prop.id}
                                      className="h-7 text-xs border-slate-700 text-slate-300"
                                      onClick={() => handleCancelProposal(prop.id)}
                                    >
                                      Descartar
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 text-xs">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          {/* Quick Pills Conforme a Imagem de Referência - Flex-wrap responsivo sem barra de rolagem */}
          <div className="px-3 sm:px-4 py-2 border-t border-border/30 bg-slate-950/40 flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleSelectPill('Qual é o lucro líquido real deste mês?')}
              className="text-[11px] bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-700/50 transition-colors font-medium"
            >
              💰 Lucro líquido real
            </button>
            <button
              onClick={() => handleSelectPill('Quais os custos de atacado e CMV confirmado?')}
              className="text-[11px] bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-700/50 transition-colors"
            >
              Custos de atacado (CMV)
            </button>
            <button
              onClick={() => handleSelectPill('Quais os produtos com maiores margens de lucro?')}
              className="text-[11px] bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 px-2.5 py-1 rounded-full border border-amber-700/50 transition-colors"
            >
              Produtos mais lucrativos
            </button>
            <button
              onClick={() => handleSelectPill('Quanto vendemos ontem?')}
              className="text-[11px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700/50 transition-colors"
            >
              Vendas de ontem
            </button>
            <button
              onClick={() => handleSelectPill('Quais foram os 5 produtos mais vendidos neste mês?')}
              className="text-[11px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700/50 transition-colors"
            >
              Top 5 produtos
            </button>
            <button
              onClick={() => handleSelectPill('Como estão as despesas deste mês por categoria?')}
              className="text-[11px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700/50 transition-colors"
            >
              Despesas do mês
            </button>
            <button
              onClick={() => handleSelectPill('Monte um plano de crescimento para aumentar o lucro')}
              className="text-[11px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700/50 transition-colors"
            >
              Plano de crescimento
            </button>
          </div>

          {/* Input de Pergunta com Botão Laranja */}
          <div className="p-2.5 sm:p-3 border-t border-border/40 bg-card/90 flex items-center gap-2">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Pergunte ao seu CEO... (ex: vendas de ontem, produtos mais vendidos)"
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50 min-h-[38px]"
              disabled={isLoading}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!inputPrompt.trim() || isLoading}
              className="h-[38px] w-[38px] p-0 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shrink-0 rounded-lg min-w-[38px] flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>

      {/* Modal Canônico de Histórico de Conversas (Gate 1) */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-900 border-border shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-sky-400" />
                <CardTitle className="text-sm font-bold text-foreground">
                  Histórico de Conversas do CEO
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistoryModal(false)}
                className="h-7 w-7 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  Nenhuma conversa encontrada neste workspace.
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === conversaId;
                  const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(conv.updated_at || conv.created_at));

                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors flex items-center justify-between ${
                        isActive
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                          : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                          {conv.title}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Última interação: {dataFormatada}
                        </div>
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">
                          Ativa
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
export default CeoOverviewTab;
