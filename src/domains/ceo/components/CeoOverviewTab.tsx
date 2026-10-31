import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import {
  TrendingUp,
  ArrowUpRight,
  Send,
  RotateCcw,
  History,
  Bot,
  User,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useWalletIA } from '@/domains/ia/hooks/useWalletIA';
import { CeoExecutiveKpis } from '@/domains/ceo/services/CeoFinancialMetricsService';

interface CeoOverviewTabProps {
  workspaceId: string;
  kpis: CeoExecutiveKpis;
  onNavigateToPlan?: () => void;
}

export const CeoOverviewTab: React.FC<CeoOverviewTabProps> = ({
  workspaceId,
  kpis,
  onNavigateToPlan,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hook central de IA
  const { messages, isLoading, currentStatus, sendMessage, clearChat } = useWalletIA({
    workspaceId,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

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

  // Mini sparkline data for KPIs
  const revenueSparkline = [
    { v: 12 }, { v: 18 }, { v: 15 }, { v: 22 }, { v: 26 }, { v: 31 }, { v: 38 },
  ];
  const profitSparkline = [
    { v: 8 }, { v: 10 }, { v: 14 }, { v: 12 }, { v: 18 }, { v: 20 }, { v: 24 },
  ];
  const expenseSparkline = [
    { v: 14 }, { v: 12 }, { v: 18 }, { v: 16 }, { v: 22 }, { v: 24 }, { v: 28 },
  ];

  // CMV gauge data
  const cmvGaugeData = [
    { name: 'CMV', value: kpis.cmvPercent ?? 32.4, color: '#10b981' },
    { name: 'Margem', value: 100 - (kpis.cmvPercent ?? 32.4), color: '#1e293b' },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Hero Card: CEO Greeting & Daily Actions */}
      <Card className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-border/60 shadow-lg overflow-hidden">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            {/* Left: Avatar + Narrative */}
            <div className="flex items-start gap-5 max-w-2xl">
              {/* Executive Avatar Container */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-amber-500/40 shadow-md bg-slate-800 flex items-center justify-center">
                  <img
                    src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&h=256&q=80"
                    alt="Wallet CEO"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback se imagem offline
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-amber-400 font-bold text-2xl pointer-events-none bg-slate-850">
                    👑
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-emerald-500 border-2 border-slate-950 shadow-sm" title="Online"></div>
              </div>

              {/* Text Narrative */}
              <div className="space-y-2">
                <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                  Bom dia, Heitor!
                </h2>
                <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                  A Rodo Point faturou{' '}
                  <strong className="text-white font-semibold">
                    R$ {kpis.faturamentoOntem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>{' '}
                  ontem,{' '}
                  <span className="text-emerald-400 font-semibold">
                    {kpis.variacaoOntemVsMediaPercent}% acima da média
                  </span>{' '}
                  de {kpis.diaSemanaOntemNome}. Neste mês, estamos com{' '}
                  <strong className="text-white font-semibold">
                    R$ {kpis.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>{' '}
                  em vendas, um crescimento de{' '}
                  <span className="text-emerald-400 font-semibold">
                    {kpis.crescimentoMesPercent}%
                  </span>{' '}
                  em relação ao mês anterior. Tenho 3 oportunidades prioritárias para aumentar o lucro e reduzir despesas.
                </p>
              </div>
            </div>

            {/* Right: Principais Ações de Hoje */}
            <div className="w-full lg:w-auto shrink-0 bg-slate-900/60 p-4 rounded-xl border border-border/40 space-y-3">
              <div className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Principais ações de hoje
              </div>

              <div className="space-y-2">
                {kpis.acoesHoje.map((acao) => (
                  <div key={acao.numero} className="flex items-start gap-2.5 text-xs">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                        acao.numero === 3
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {acao.numero}
                    </span>
                    <span className="text-slate-300 leading-tight">
                      {acao.titulo}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                size="sm"
                onClick={onNavigateToPlan}
                className="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs h-8 gap-1.5 shadow-sm"
              >
                Ver plano completo
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento (Mês) */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Faturamento (Mês)</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ {kpis.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>↑ {kpis.crescimentoMesPercent}%</span>
                <span className="text-muted-foreground font-normal ml-0.5">vs. mês anterior</span>
              </div>
              <div className="w-16 h-7">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueSparkline}>
                    <Bar dataKey="v" fill="#38bdf8" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lucro Estimado */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Lucro Estimado</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ {kpis.lucroEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-xs text-emerald-400 font-semibold">
                {kpis.margemLucroPercent}% de margem
              </div>
              <div className="w-16 h-7">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profitSparkline}>
                    <Line type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CMV */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>CMV</span>
              {kpis.cmvStatus === 'dados_insuficientes' && (
                <span className="text-[10px] text-amber-400 font-medium">Fichas pendentes</span>
              )}
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              {kpis.cmvPercent !== null ? `${kpis.cmvPercent}%` : '32,4%'}
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-xs text-muted-foreground">
                {kpis.cmvStatus === 'dados_insuficientes' ? (
                  <span className="text-amber-400 font-medium">Cadastre fichas técnicas</span>
                ) : (
                  <span className="text-emerald-400 font-medium">Dentro da meta (≤ 38%)</span>
                )}
              </div>
              <div className="w-10 h-10 relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cmvGaugeData}
                      dataKey="value"
                      innerRadius={11}
                      outerRadius={16}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {cmvGaugeData.map((entry, index) => (
                        <Cell key={`gauge-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Despesas */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Despesas</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ {kpis.despesasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-xs text-red-400 font-semibold flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>↑ {kpis.variacaoDespesasPercent}%</span>
                <span className="text-muted-foreground font-normal ml-0.5">vs. mês anterior</span>
              </div>
              <div className="w-16 h-7">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseSparkline}>
                    <Bar dataKey="v" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Conversational Chat: Converse com seu CEO */}
      <Card className="bg-card/70 border-border/50">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-amber-400" />
                <CardTitle className="text-base font-semibold">Converse com seu CEO</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                Pergunte qualquer coisa sobre a Rodo Point. Eu analiso seus dados reais e te ajudo a tomar decisões.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearChat}
                className="h-8 text-xs gap-1.5 bg-card/60"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Nova conversa
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 bg-card/60"
              >
                <History className="w-3.5 h-3.5" />
                Histórico
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 md:p-6 space-y-4">
          {/* Messages Feed */}
          {messages.length > 0 && (
            <div className="max-h-[360px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 text-xs leading-relaxed ${
                    m.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {m.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      👑
                    </div>
                  )}

                  <div
                    className={`p-3.5 rounded-xl max-w-xl ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white font-medium rounded-tr-none'
                        : 'bg-muted/40 border border-border/50 text-foreground rounded-tl-none space-y-2'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>

                    {/* Se houver Proposta de Ação (Action Proposal) no turno */}
                    {m.actionProposal ? (
                      <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Proposta de Ação Preparada (Exige Confirmação)
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Revise os detalhes na interface antes de confirmar. Nenhuma alteração foi efetuada no banco.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {m.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-blue-600/30 text-blue-300 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pl-10">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></div>
                  <span>{currentStatus || 'Wallet CEO está analisando seus dados reais...'}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input Box with Send Button */}
          <div className="flex items-center gap-2 bg-muted/30 border border-border/50 rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-amber-400 transition-all">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Digite sua pergunta... Ex: Como estão minhas vendas dos últimos 30 dias?"
              className="flex-1 bg-transparent px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              disabled={isLoading}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!inputPrompt.trim() || isLoading}
              className="bg-orange-500 hover:bg-orange-600 text-white h-8 px-3 rounded-lg shrink-0 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Prompt Suggestion Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => handleSelectPill('Como estão minhas vendas hoje?')}
              className="text-[11px] bg-muted/40 hover:bg-muted/70 text-slate-300 hover:text-white px-3 py-1 rounded-full border border-border/40 transition-colors"
            >
              Como estão minhas vendas hoje?
            </button>
            <button
              onClick={() => handleSelectPill('Quais produtos vendem mais?')}
              className="text-[11px] bg-muted/40 hover:bg-muted/70 text-slate-300 hover:text-white px-3 py-1 rounded-full border border-border/40 transition-colors"
            >
              Quais produtos vendem mais?
            </button>
            <button
              onClick={() => handleSelectPill('Onde posso economizar?')}
              className="text-[11px] bg-muted/40 hover:bg-muted/70 text-slate-300 hover:text-white px-3 py-1 rounded-full border border-border/40 transition-colors"
            >
              Onde posso economizar?
            </button>
            <button
              onClick={() => handleSelectPill('Monte um plano para aumentar meu lucro em R$ 5.000/mês')}
              className="text-[11px] bg-muted/40 hover:bg-muted/70 text-slate-300 hover:text-white px-3 py-1 rounded-full border border-border/40 transition-colors"
            >
              Monte um plano para aumentar meu lucro em R$ 5.000/mês
            </button>
            <button
              onClick={() => handleSelectPill('Analise minhas despesas')}
              className="text-[11px] bg-muted/40 hover:bg-muted/70 text-slate-300 hover:text-white px-3 py-1 rounded-full border border-border/40 transition-colors"
            >
              Analise minhas despesas
            </button>
            <button
              onClick={() => handleSelectPill('Qual foi meu melhor dia da semana?')}
              className="text-[11px] bg-muted/40 hover:bg-muted/70 text-slate-300 hover:text-white px-3 py-1 rounded-full border border-border/40 transition-colors"
            >
              Qual foi meu melhor dia da semana?
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
