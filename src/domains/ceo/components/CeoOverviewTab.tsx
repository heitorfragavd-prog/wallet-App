import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useWalletIA, type WalletIAMessage } from '@/domains/ia/hooks/useWalletIA';
import { WalletAiOrchestratorClient } from '@/domains/ia/services/WalletAiOrchestratorClient';
import { CeoExecutiveKpis } from '@/domains/ceo/services/CeoFinancialMetricsService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { useAuth } from '@/domains/auth/hooks/useAuth';

interface CeoOverviewTabProps {
  workspaceId: string;
  kpis: CeoExecutiveKpis;
  onNavigateToPlan?: () => void;
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
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inputPrompt, setInputPrompt] = useState('');
  const [processingProposalId, setProcessingProposalId] = useState<string | null>(null);
  const [confirmedProposals, setConfirmedProposals] = useState<Record<string, 'confirmed' | 'cancelled' | 'executed'>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Estados de persistência canônica do chat (Gate 1)
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Hook central de IA com conversaId conectado
  const { messages, isLoading, sendMessage, clearChat, loadHistory } = useWalletIA({
    workspaceId,
    conversaId: conversaId || undefined,
    onMessagePersist: async (msg, targetId) => {
      if (!workspaceId || !user?.id || !targetId) return;
      try {
        if (msg.routeUsed === 'FAST_QUERY' || msg.isError) {
          await supabase.from('wallet_ai_messages').insert({
            conversation_id: targetId,
            workspace_id: workspaceId,
            user_id: user.id,
            role: msg.role,
            content: msg.content,
          });
        }
        await supabase
          .from('wallet_ai_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', targetId)
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id);
      } catch (err) {
        console.warn('[CeoOverviewTab] Falha ao persistir mensagem no histórico:', err);
      }
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

  // Carrega mensagens de uma conversa específica (Gate 1)
  const loadConversationMessages = useCallback(async (convId: string) => {
    if (!convId || !workspaceId || !user?.id) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('wallet_ai_messages')
        .select('id, role, content, created_at, tool_calls')
        .eq('conversation_id', convId)
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[CeoOverviewTab] Erro ao carregar mensagens:', error);
        return;
      }

      if (data && data.length > 0) {
        const loaded: WalletIAMessage[] = data.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content || '',
          createdAt: new Date(m.created_at),
        }));
        loadHistory(loaded);
      } else {
        loadHistory([]);
      }
    } catch (err) {
      console.error('[CeoOverviewTab] Erro ao recuperar histórico:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [workspaceId, user?.id, loadHistory]);

  // Inicializa a lista de conversas e seleciona a mais recente
  const initConversations = useCallback(async () => {
    if (!workspaceId || !user?.id) return;
    try {
      const { data, error } = await supabase
        .from('wallet_ai_conversations')
        .select('id, title, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
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
          })
          .select('id, title, created_at, updated_at')
          .single();

        if (createErr) {
          console.warn('[CeoOverviewTab] Erro ao inicializar conversa:', createErr);
        } else if (newConv) {
          setConversations([newConv]);
          setConversaId(newConv.id);
          loadHistory([]);
        }
      }
    } catch (err) {
      console.error('[CeoOverviewTab] Falha ao inicializar conversas:', err);
    }
  }, [workspaceId, user?.id, loadConversationMessages, loadHistory]);

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

  const isPositiveMargin = kpis.despesasMes === 0 ? true : kpis.resultadoOperacional >= 0;

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
                  <>Aqui está o resumo executivo da sua operação com dados 100% reais apurados.</>
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
                  Dados atualizados com o banco
                </span>
              </div>
            )}
          </div>

          {/* 4 Cards Principais de Indicadores Executivos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
            {/* Card 1: Faturamento (Mês) */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors">
              <div className="text-xs text-muted-foreground font-medium">Faturamento (Mês)</div>
              <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
                R$ {kpis.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mt-2 text-xs flex items-center gap-1 font-medium">
                {(kpis.crescimentoMesPercent != null || (kpis as unknown as { crescimentoMes?: number }).crescimentoMes != null) ? (
                  <span className={((kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes ?? 0) >= 0) ? 'text-emerald-400 flex items-center gap-0.5' : 'text-rose-400 flex items-center gap-0.5'}>
                    {((kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes ?? 0) >= 0) ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {((kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes ?? 0) >= 0) ? '+' : ''}{kpis.crescimentoMesPercent ?? (kpis as unknown as { crescimentoMes?: number }).crescimentoMes}% vs mês anterior
                  </span>
                ) : (
                  <span className="text-slate-500">Sem base comparativa anterior</span>
                )}
              </div>
            </div>

            {/* Card 2: Pedidos */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors">
              <div className="text-xs text-muted-foreground font-medium">Pedidos</div>
              <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
                {kpis.pedidosMes.toLocaleString('pt-BR')}
              </div>
              <div className="mt-2 text-xs flex items-center gap-1 font-medium">
                {(kpis.crescimentoPedidosPercent != null || (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos != null) ? (
                  <span className={((kpis.crescimentoPedidosPercent ?? (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos ?? 0) >= 0) ? 'text-emerald-400 flex items-center gap-0.5' : 'text-rose-400 flex items-center gap-0.5'}>
                    {((kpis.crescimentoPedidosPercent ?? (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos ?? 0) >= 0) ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {((kpis.crescimentoPedidosPercent ?? (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos ?? 0) >= 0) ? '+' : ''}{kpis.crescimentoPedidosPercent ?? (kpis as unknown as { crescimentoPedidos?: number }).crescimentoPedidos}% vs mês anterior
                  </span>
                ) : (
                  <span className="text-slate-500">Período equivalente</span>
                )}
              </div>
            </div>

            {/* Card 3: Ticket Médio */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors">
              <div className="text-xs text-muted-foreground font-medium">Ticket Médio</div>
              <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
                {kpis.ticketMedioMes !== null
                  ? `R$ ${kpis.ticketMedioMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'Aguardando dados'}
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

            {/* Card 4: Resultado Operacional Real (sem Math.max artificial) */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 hover:border-border/80 transition-colors">
              <div className="text-xs text-muted-foreground font-medium">Resultado Operacional</div>
              <div className={`text-xl md:text-2xl font-bold mt-1 ${isPositiveMargin ? 'text-emerald-400' : 'text-rose-400'}`}>
                {kpis.despesasMes === 0 ? (
                  <span className="text-sm font-normal text-slate-400">Não apurado</span>
                ) : (
                  `R$ ${kpis.resultadoOperacional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                )}
              </div>
              <div className="mt-2 text-xs flex items-center gap-1 font-medium">
                {(kpis.margemOperacionalPercent != null || (kpis as unknown as { margemOperacional?: number }).margemOperacional != null) ? (
                  <span className={isPositiveMargin ? 'text-emerald-400' : 'text-rose-400'}>
                    Margem: {kpis.margemOperacionalPercent ?? (kpis as unknown as { margemOperacional?: number }).margemOperacional}%
                  </span>
                ) : kpis.despesasMes === 0 ? (
                  <span className="text-slate-500">Aguardando lançamento de despesas</span>
                ) : (
                  <span className="text-slate-500">Receitas vs Despesas reais</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Grid Central: Evolução de Vendas (30 dias) + Converse com seu CEO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Gráfico Real de Evolução de Vendas (30 dias) */}
        <Card className="bg-card/70 border-border/50 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center justify-between">
              <span>Evolução de Vendas (30 dias)</span>
              <span className="text-xs font-normal text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Vendas diárias reais
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col justify-center">
            {kpis.dailySales30Days && kpis.dailySales30Days.some((d) => d.valor > 0) ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
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
              <div className="h-64 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-600 mb-1" />
                <span>Nenhuma venda registrada nos últimos 30 dias.</span>
                <span className="text-[11px] text-slate-500">As vendas sincronizadas pelo Eyemobile ou KDS aparecerão aqui.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Converse com seu CEO (Chat Proeminente Integrado com Histórico Real) */}
        <Card className="bg-card/70 border-border/50 flex flex-col h-[400px] md:h-[420px]">
          <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-400">✨</span>
              <CardTitle className="text-sm font-semibold text-foreground">
                Converse com seu CEO
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewConversation}
                className="h-7 text-xs border-border/60 hover:bg-slate-800 text-slate-300 gap-1"
                title="Criar nova conversa sem apagar o histórico"
              >
                <Plus className="w-3 h-3 text-amber-400" />
                Nova conversa
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistoryModal(true)}
                className="h-7 text-xs border-border/60 hover:bg-slate-800 text-slate-300 gap-1"
                title="Selecionar conversa anterior"
              >
                <History className="w-3 h-3 text-sky-400" />
                Histórico
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
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
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
                    {msg.actionProposal && (
                      <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                        <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Ação proposta pelo CEO (Requer Confirmação):
                        </div>
                        {(() => {
                          const prop = msg.actionProposal as {
                            id: string;
                            actionType?: string;
                            title?: string;
                            description?: string;
                            hypothesis?: string;
                            status?: string;
                          };
                          const proposalStatus = confirmedProposals[prop.id] || prop.status || 'prepared';
                          return (
                            <div className="bg-slate-950/70 p-2.5 rounded border border-amber-500/30 text-xs space-y-1.5">
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
                        })()}
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

          {/* Quick Pills Conforme a Imagem de Referência */}
          <div className="px-4 py-2 border-t border-border/30 bg-slate-950/40 flex flex-wrap gap-1.5 shrink-0">
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
          <div className="p-3 border-t border-border/40 bg-card/90 flex items-center gap-2">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Digite sua pergunta... Ex: Como estão minhas vendas dos últimos 30 dias?"
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              disabled={isLoading}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!inputPrompt.trim() || isLoading}
              className="h-8 w-8 p-0 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shrink-0 rounded-lg"
            >
              <Send className="w-3.5 h-3.5" />
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
